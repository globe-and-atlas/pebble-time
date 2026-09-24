#!/usr/bin/env python3
"""Independent whole-frame oracle for Clear and 4 Points host rendering."""
import ctypes
from datetime import date
import json
import subprocess

from preview import ROOT, W, H, PALETTE, frame, load_renderer
from generate_settings import configuration
from build_editions import FOUR_POINTS_UUID, CLEAR_UUID, SPLIT_UUID, MERIDIAN_UUID
from verify_editions import Number


def main():
    lib = load_renderer()
    lib.face_split_layout.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.POINTER(Number)]
    # Independent fixed geometry oracle: the established Two Hands algorithm,
    # with its literal hour radius changed to48, without edition dispatch.
    source = (ROOT / 'watchface/src/c/face.c').read_text()
    source = source.replace('static void split_layout_radius(int h,int m,FaceNumber *labels,int radius)',
                            'void face_split_layout(int h,int m,FaceNumber *labels)')
    source = source.replace('int radii[2]={radius,82};', 'int radii[2]={48,82};')
    source = source.replace('void face_split_layout(int h,int m,FaceNumber *labels) {\n split_layout_radius(h,m,labels,48);\n}', '')
    source = source.replace('split_layout_radius(h,m,labels,hour_radius)', 'face_split_layout(h,m,labels)')
    source = source.replace('i==0 ? hour_radius : 82', 'i==0 ? 48 : 82')
    folder = ROOT / '.tmp/clear-fixed-oracle'
    folder.mkdir(exist_ok=True)
    (folder / 'face.c').write_text(source)
    subprocess.run(['cc', '-O2', '-shared', '-fPIC', '-I', str(ROOT / 'watchface/src/c'),
                    str(folder / 'face.c'), '-o', str(folder / 'face.dylib')], check=True)
    oracle = ctypes.CDLL(str(folder / 'face.dylib'))
    oracle.face_render_custom.argtypes = lib.face_render_custom.argtypes
    oracle.face_split_layout.argtypes = lib.face_split_layout.argtypes
    calendar = date(2026, 9, 23)
    # Cardinal regions are a reviewed visual contract, independent of C helpers.
    regions = [(99, 19, 102, 22), (197, 113, 200, 116),
               (99, 206, 102, 209), (0, 113, 3, 116)]
    markers = {y * W + x for left, top, right, bottom in regions
               for y in range(top, bottom) for x in range(left, right)}
    assert len(markers) == 36
    assert PALETTE[46] == (170, 85, 0)
    counts = {'cycle_frames': 0, 'override_frames': 0, 'date_frames': 0}
    glyphs = {}
    minimum_gap = 999

    def compare(hour, minute, edition, font, style, mask=0, position=0, defaults=False):
        nonlocal minimum_gap
        options = dict(mask=mask, position=position, calendar=calendar, font=font)
        reference = oracle
        baseline = frame(reference, hour, minute, 1, **options, **style)
        if edition == 2:
            # Check Meridian's hand layer separately; verify_hemisphere covers
            # its globe/halo overlay using the same exported numeral layout.
            s = dict(font=font, color=-1, minute_color=-1, width=0, minute_width=0)
            if not defaults:
                s.update(style)
            pixels = (ctypes.c_uint8 * (W * H))()
            lib.face_render_custom(hour, minute, edition, calendar.year, calendar.month, calendar.day,
                (calendar.weekday()+1)%7, mask, position, *s.values(), pixels)
            actual = bytes(pixels)
        else:
            actual = frame(lib, hour, minute, edition, **options, **({} if defaults else style))
        # Marks must occupy previously empty pixels, never replacing time/date ink.
        assert all(baseline[i] == 0 for i in markers), (edition, font, hour, minute, 'marker collision')
        expected = bytearray(baseline)
        if edition in (3, 4):
            for i in markers:
                expected[i] = 1
        assert actual == expected, (edition, font, hour, minute, mask, position, 'whole-frame mismatch')
        labels = (Number * 2)()
        reference.face_split_layout(hour, minute, labels)
        exported = (Number * 2)()
        lib.face_split_layout(hour, minute, exported)
        assert bytes(exported) == bytes(labels), 'exported globe halo layout differs from48px oracle'
        assert [n.text.decode() for n in labels] == [str(hour % 12 or 12), f'{minute:02}']
        a, b = labels
        gap = max(b.x-a.x-a.width, a.x-b.x-b.width, b.y-a.y-a.height, a.y-b.y-b.height)
        assert gap >= 4, (hour, minute, edition, 'label clearance', gap)
        minimum_gap = min(minimum_gap, gap)
        if mask == 0:
            assert not any(actual[:18 * W] + actual[210 * W:]), 'time ink enters date bands'
        for n in labels:
            assert not any(y * W + x in markers
                           for y in range(n.y - 2, n.y + n.height + 2)
                           for x in range(n.x - 2, n.x + n.width + 2)), 'marker touches label clearance'
            crop = b''.join(actual[y * W + n.x:y * W + n.x + n.width]
                            for y in range(n.y, n.y + n.height))
            key = (font, bytes(n.text), n.scale)
            assert 1 in crop and set(crop) <= {0, 1}, 'colored hand crosses numeral'
            if key in glyphs:
                assert crop == glyphs[key], (key, hour, minute, 'upright glyph changed or overlapped')
            else:
                glyphs[key] = crop
        return actual

    for edition, colors, widths in [(1, (1, 2), (0, 0)), (2, (1, 2), (0, 0)),
                                    (3, (1, 1), (1, 1)), (4, (1, 46), (4, 2))]:
        style = dict(color=colors[0], minute_color=colors[1], width=widths[0], minute_width=widths[1])
        for font in range(12):
            for minute in range(720):
                compare(minute // 60, minute % 60, edition, font, style, defaults=True)
                counts['cycle_frames'] += 1
            # Every calendar subset, at both positions, for every numeral font.
            for mask in range(16):
                for position in (0, 1):
                    compare(12, 0, edition, font, style, mask, position, defaults=True)
                    counts['date_frames'] += 1
            # Max-width colored hands test clearance independently of black defaults.
            override = dict(color=26, minute_color=63, width=5, minute_width=5)
            for minute in range(720):
                compare(minute // 60, minute % 60, edition, font, override)
                counts['override_frames'] += 1
        for width in range(1, 6):
            for color in range(10, 74):
                override = dict(color=color, minute_color=73 - color + 10, width=width, minute_width=6-width)
                compare(3, 40, edition, 0, override, 15, 1)
                counts['override_frames'] += 1
        guard = (ctypes.c_uint8 * (W * H + 32))(*([199] * (W * H + 32)))
        lib.face_render_custom(23, 59, edition, 2026, 12, 31, 4, 15, 1, 11, 73, 63, 5, 5,
                               ctypes.cast(ctypes.byref(guard, 16), ctypes.POINTER(ctypes.c_uint8)))
        assert bytes(guard[:16]) + bytes(guard[-16:]) == bytes([199]) * 32

    original = json.loads((ROOT / 'watchface/package.json').read_text())['pebble']['uuid']
    assert len({original, SPLIT_UUID, MERIDIAN_UUID, FOUR_POINTS_UUID, CLEAR_UUID}) == 5
    for edition, name, minute_rgb in [(3, '4 Points', '000000'), (4, 'Clear', 'AA5500')]:
        config = configuration(edition)
        assert config[0]['defaultValue'] == name
        fields = {item['messageKey']: item for section in config
                  for item in section.get('items', []) if 'messageKey' in item}
        required = {'TimeFont', 'HandColorRGB', 'HandWidth', 'MinuteColorRGB', 'MinuteWidth',
                    'ShowWeekday', 'ShowDay', 'ShowMonth', 'ShowYear', 'DatePosition'}
        assert set(fields) == required
        assert fields['HandColorRGB']['defaultValue'] == '000000'
        assert fields['MinuteColorRGB']['defaultValue'] == minute_rgb
        assert len(fields['TimeFont']['options']) == 12
    report = dict(status='pass', **counts, cardinal_pixels=36, fonts=12, unique_uuids=5, dual_hand_hour_radius=48,
                  minimum_label_gap=minimum_gap, upright_glyph_crops=len(glyphs),
                  boundary='Host oracle only; native bundles and device interaction require separate checks.')
    (ROOT / '.tmp/clear-points-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
