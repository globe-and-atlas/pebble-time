#!/usr/bin/env python3
"""Host palette/render checks and actual native inbox tests using narrow SDK stubs."""
import ctypes
from datetime import date
import json
import subprocess
from preview import ROOT, PALETTE, frame, load_renderer


def main():
    lib = load_renderer()
    palette = (ctypes.c_uint8 * (74 * 3)).in_dll(lib, 'face_palette')
    expected = [(r, g, b) for r in range(0, 256, 85) for g in range(0, 256, 85) for b in range(0, 256, 85)]
    assert list(palette)[30:] == [c for rgb in expected for c in rgb]
    assert PALETTE[10:] == expected
    states = 0
    for edition in range(3):
        args = dict(edition=edition, mask=15, calendar=date(2026, 9, 23), utc=1790164800)
        base = frame(lib, 3, 40, color=3, minute_color=4, **args)
        for index in range(10, 74):
            # Whole-frame equality protects date/numerals, geometry and halo.
            actual = frame(lib, 3, 40, color=index, minute_color=index, **args)
            assert actual == bytes(index if p in (3, 4) else p for p in base), (edition, index)
            assert index in actual, (edition, index, 'missing hand')
            states += 1
    # Compile the actual entire inbox function, replacing only SDK effects.
    native = (ROOT / 'watchface/src/c/watchface.c').read_text()
    inbox = native[native.index('static void inbox('):native.index('\nint main(void)')]
    names = json.loads((ROOT / 'watchface/package.json').read_text())['pebble']['messageKeys']
    definitions = '\n'.join(f'#define MESSAGE_KEY_{key} {i}' for i, key in enumerate(names))
    harness = '''#include <stdint.h>
#include <stdbool.h>
enum {TUPLE_INT=1,TUPLE_UINT=2,PERSIST_DATE_MASK=100,PERSIST_DATE_POSITION=101};
typedef union {int32_t int32;uint32_t uint32;} Value;
typedef struct {int type;Value *value;} Tuple;
typedef int DictionaryIterator;
static int style[5],date_mask,date_position,latitude,longitude,location_valid,saved[256];
static Tuple tuples[256];static bool present[256];
static Tuple *dict_find(DictionaryIterator *i,int key){(void)i;return present[key]?&tuples[key]:0;}
static void persist_write_int(int key,int value){saved[key]=value;}
static void request_render(void){}
'''+definitions+'\n'+inbox+'''
int test_color(int rgb,int type,int second) {
 Value value={.int32=rgb};
 for(int i=0;i<256;i++)present[i]=false;
 int key=second?MESSAGE_KEY_MinuteColorRGB:MESSAGE_KEY_HandColorRGB;
 style[1+second]=6;saved[111+second]=6;
 tuples[key]=(Tuple){type,&value};present[key]=true;inbox(0,0);
 return style[1+second]==saved[111+second]?style[1+second]:-999;
}
'''
    folder = ROOT / '.tmp' / 'colors-verification'
    folder.mkdir(parents=True, exist_ok=True)
    source, output = folder / 'inbox.c', folder / 'inbox.dylib'
    source.write_text(harness)
    subprocess.run(['cc', '-shared', '-fPIC', str(source), '-o', str(output)], check=True)
    inbox_lib = ctypes.CDLL(str(output))
    inbox_lib.test_color.argtypes = [ctypes.c_int] * 3
    checks = 0
    for second in (0, 1):
        for index, (r, g, b) in enumerate(expected):
            for kind in (1, 2):
                assert inbox_lib.test_color((r << 16) | (g << 8) | b, kind, second) == index + 10
                checks += 1
        # Boundary rounding: byte 42 rounds down, 43 rounds up.
        for value in range(256):
            assert inbox_lib.test_color(value * 0x010101, 1, second) == 10 + round(value / 85) * 21
        for value, kind in [(-1, 1), (0x1000000, 2), (0xffffff, 3), (-2147483648, 2)]:
            assert inbox_lib.test_color(value, kind, second) == 6, (value, kind)
    report = {'status':'pass','full_palette_render_states':states,'native_exact_rgb_checks':checks,
              'native_gray_rounding_checks':512,'native_invalid_checks':8,'boundary':'Host SDK stubs; device persistence/relaunch remains a native check.'}
    (folder / 'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
