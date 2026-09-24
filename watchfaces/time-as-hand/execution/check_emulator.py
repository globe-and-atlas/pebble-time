#!/usr/bin/env python3
"""Capture selected native states and compare them with the shared renderer."""
import json
import os
import subprocess
from preview import ROOT,load_renderer,frame,W,H
try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit('Run with Pebble tool environment Python (Pillow is bundled there).') from exc

def main():
    lib=load_renderer();reports=[]
    palette=[(255,255,255),(0,0,0),(255,170,0)]
    base=os.environ.copy();base.pop('TAH_TEST_MINUTE',None)
    def run(args,env=base):
        result=subprocess.run(args,cwd=ROOT/'watchface',env=env,check=True,capture_output=True,text=True)
        with (ROOT/'.tmp/emulator-builds.log').open('a') as log: log.write(result.stdout+result.stderr)
    try:
        for h,m in [(3,0),(3,1),(3,30),(6,0),(6,15),(9,0),(12,0),(12,1)]:
            path=ROOT/'.tmp'/f'emulator-{h:02}{m:02}.png'
            env={**base,'TAH_TEST_MINUTE':str(h*60+m)}
            run(['pebble','build'],env)
            run(['pebble','install','--emulator','emery'])
            run(['pebble','screenshot','--emulator','emery','--no-open','--no-correction',str(path)])
            image=Image.open(path).convert('RGB');assert image.size==(W,H)
            actual=list(image.get_flattened_data());expected=[palette[p] for p in frame(lib,h,m)]
            diff=sum(a!=b for a,b in zip(actual,expected))
            reports.append({'time':f'{h:02}:{m:02}','different_pixels':diff,'mode':'fixed-time test build'})
            print(reports[-1],flush=True)
            assert diff==0,reports[-1]
    finally:
        run(['pebble','build'])
        run(['pebble','install','--emulator','emery'])
    (ROOT/'.tmp/emulator-verification.json').write_text(json.dumps(reports,indent=2)+'\n')
    print(json.dumps(reports,indent=2))
if __name__=='__main__': main()
