#!/usr/bin/env python3
"""Compare live-clock native editions to their shared renderer."""
from datetime import datetime
import json
import subprocess
import time
from PIL import Image
from preview import ROOT, PALETTE, frame, load_renderer

def main():
    lib=load_renderer()
    reports=[]
    for edition, slug in ((3,'four-points'),(4,'clear')):
        def run(args):
            result=subprocess.run(['pebble',*args],cwd=ROOT/'watchface',capture_output=True,text=True,timeout=60)
            with (ROOT/'.tmp/clear-points-native.log').open('a') as log:
                log.write(result.stdout+result.stderr)
            result.check_returncode()
        run(['install','--emulator','emery',str(ROOT/'dist'/f'{slug}.pbw')])
        path=ROOT/'.tmp'/f'{slug}-native.png'
        deadline=time.monotonic()+20
        while True:
            before=datetime.now()
            run(['screenshot','--emulator','emery','--no-open','--no-correction',str(path)])
            after=datetime.now()
            actual=list(Image.open(path).convert('RGB').get_flattened_data())
            differences=[]
            for moment in (before,after):
                expected=frame(lib,moment.hour,moment.minute,edition,0,0,moment.date())
                differences.append(sum(a!=PALETTE[b] for a,b in zip(actual,expected)))
            if min(differences)==0: break
            assert time.monotonic()<deadline,(slug,differences)
            time.sleep(.5)
        reports.append({'edition':slug,'different_pixels':0})
        print(reports[-1],flush=True)
    (ROOT/'.tmp/clear-points-native.json').write_text(json.dumps(reports,indent=2)+'\n')
if __name__=='__main__':main()
