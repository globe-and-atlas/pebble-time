#!/usr/bin/env python3
"""Copy verified emulator captures into durable, edition-specific store assets."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    report=json.loads((ROOT/'.tmp/calendar-emulator-verification.json').read_text())
    passed={r['case'] for r in report if r['different_pixels']==0}
    for edition,name in [(0,'original'),(1,'two-hands')]:
        out=ROOT/'assets/store'/name;out.mkdir(parents=True,exist_ok=True)
        cases=[(f'native-calendar-{edition}-1200-top','emery_cardinal.png'),(f'native-calendar-{edition}-'+('1159' if edition==0 else '0330')+'-bottom','emery_calendar.png'),(f'native-styled-{edition}','emery_custom_style.png')]
        for case,destination in cases:
            assert case in passed,case
            data=(ROOT/'.tmp'/f'{case}.png').read_bytes()
            assert int.from_bytes(data[16:20],'big')==200 and int.from_bytes(data[20:24],'big')==228
            (out/destination).write_bytes(data)
    print('Prepared 3 verified 200×228 emulator screenshots per edition in assets/store/.')
if __name__=='__main__':main()
