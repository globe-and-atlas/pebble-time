#!/usr/bin/env python3
"""Verify restored distributable follows the actual local clock in emulator."""
from datetime import datetime
import json
import subprocess
from PIL import Image
from preview import ROOT,load_renderer,frame
before=datetime.now()
path=ROOT/'.tmp/emulator-live.png'
subprocess.run(['pebble','screenshot','--emulator','emery','--no-open','--no-correction',str(path)],cwd=ROOT/'watchface',check=True,capture_output=True)
after=datetime.now()
actual=list(Image.open(path).convert('RGB').get_flattened_data())
palette=[(255,255,255),(0,0,0),(255,170,0)]
lib=load_renderer()
assert any(actual==[palette[p] for p in frame(lib,t.hour,t.minute)] for t in (before,after)), 'Production clock does not match current local time'
result={'status':'pass','local_time_before':before.isoformat(),'local_time_after':after.isoformat(),'production_clock':'live','fixed_time_override':False}
(ROOT/'.tmp/live-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
