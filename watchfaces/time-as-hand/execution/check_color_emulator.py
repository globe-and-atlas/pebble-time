#!/usr/bin/env python3
"""Verify RGB delivery and restart persistence against actual native pixels."""
from datetime import datetime
import json
import os
import subprocess
import time
from PIL import Image
from preview import ROOT, PALETTE, frame, load_renderer
from build_editions import MERIDIAN_UUID

def main():
    os.environ['TZ']='UTC';time.tzset()
    lib=load_renderer();reports=[]
    keys=json.loads((ROOT/'watchface/build/js/message_keys.json').read_text())
    def run(args):
        result=subprocess.run(['pebble',*args],cwd=ROOT/'watchface',capture_output=True,text=True,timeout=60)
        with (ROOT/'.tmp/color-emulator.log').open('a') as f:f.write(result.stdout+result.stderr)
        result.check_returncode()
    def install():run(['install','--emulator','emery',str(ROOT/'dist/meridian-hemisphere.pbw')])
    def check(name,hour_index,minute_index):
        path=ROOT/'.tmp'/f'color-{name}.png'
        deadline=time.monotonic()+15
        while True:
            before=datetime.now();run(['screenshot','--emulator','emery','--no-open','--no-correction',str(path)]);after=datetime.now()
            actual=list(Image.open(path).convert('RGB').get_flattened_data())
            differences=[]
            for moment in (before,after):
                expected=frame(lib,moment.hour,moment.minute,2,0,0,moment.date(),color=hour_index,minute_color=minute_index,utc=moment.timestamp())
                differences.append(sum(a!=PALETTE[b] for a,b in zip(actual,expected)))
            if min(differences)==0:break
            if time.monotonic()>deadline:raise AssertionError((name,min(differences)))
            time.sleep(.2)
        reports.append({'case':name,'different_pixels':0});print(reports[-1],flush=True)
    install()
    settings={'HandColorRGB':0x55aaff,'MinuteColorRGB':0xffffff,'TimeFont':0,'HandWidth':0,'MinuteWidth':0,'ShowWeekday':0,'ShowDay':0,'ShowMonth':0,'ShowYear':0,'Latitude':0,'Longitude':0,'LocationValid':0}
    run(['send-app-message','--emulator','emery','--app-uuid',MERIDIAN_UUID,'--int',*[f'{keys[k]}={v}' for k,v in settings.items()]])
    check('rgb',37,73)
    run(['kill'])
    install();check('restart',37,73)
    (ROOT/'.tmp/color-emulator-verification.json').write_text(json.dumps(reports,indent=2)+'\n')
if __name__=='__main__':main()
