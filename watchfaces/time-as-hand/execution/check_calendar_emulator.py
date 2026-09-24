#!/usr/bin/env python3
"""Test calendar messages, native rendering and persistence in Emery.

Fixed-time builds are emulator fixtures only. Finally rebuild distributables
without overrides and install the production Two Hands edition.
"""
from datetime import datetime
import json
import os
import subprocess
import time
from PIL import Image
from preview import ROOT,W,H,load_renderer,frame,PALETTE
from build_editions import build_editions,SPLIT_UUID
from stop_emulator_app import stop

def main():
    lib=load_renderer(); reports=[];manifest=ROOT/'watchface/package.json'
    original=manifest.read_text();base=json.loads(original);original_uuid=base['pebble']['uuid']
    env=os.environ.copy();env.pop('TAH_TEST_MINUTE',None);env.pop('TAH_EDITION',None)
    def run(args,build_env=None):
        r=subprocess.run(args,cwd=ROOT/'watchface',env=build_env or env,capture_output=True,text=True,timeout=60)
        with (ROOT/'.tmp/calendar-emulator.log').open('a') as f:f.write(r.stdout+r.stderr)
        r.check_returncode();return r
    def settings(uuid,mask,pos):
        keys=json.loads((ROOT/'watchface/build/js/message_keys.json').read_text())
        pairs=[f'{keys[name]}={(mask>>i)&1}' for i,name in enumerate(['ShowWeekday','ShowDay','ShowMonth','ShowYear'])]
        pairs.append(f'{keys["DatePosition"]}={pos}')
        run(['pebble','send-app-message','--emulator','emery','--app-uuid',uuid,'--int',*pairs])
    def install(path=None):
        stop()
        run(['pebble','install','--emulator','emery']+([str(path)] if path else []))
    def launch(uuid):
        # Installation acknowledges transfer before the new app has started.
        # Observe readiness; sending a second Start during launch races firmware.
        code='import time\nfrom libpebble2.protocol.apps import AppRunState,AppRunStateRequest\n'
        code+='deadline=time.monotonic()+15\ncurrent=None\nwhile time.monotonic()<deadline:\n'
        code+='    current=pebble.send_and_read(AppRunState(data=AppRunStateRequest()),AppRunState).data.uuid\n'
        code+=f"    if str(current)=='{uuid}': break\n"
        code+="    time.sleep(0.2)\n\nprint('RUNNING',current)\n"
        r=subprocess.run(['pebble','repl','--emulator','emery'],cwd=ROOT/'watchface',env=env,input=code,capture_output=True,text=True,timeout=30)
        with (ROOT/'.tmp/calendar-emulator.log').open('a') as f:f.write(r.stdout+r.stderr)
        r.check_returncode()
        assert 'RUNNING '+uuid in r.stdout,(r.stdout,r.stderr)
    def styles(uuid,values):
        keys=json.loads((ROOT/'watchface/build/js/message_keys.json').read_text())
        names=['TimeFont','HandColor','MinuteColor','HandWidth','MinuteWidth']
        run(['pebble','send-app-message','--emulator','emery','--app-uuid',uuid,'--int',*[f'{keys[k]}={v}' for k,v in zip(names,values)]])
    def check(name,edition,mask,pos,h=None,m=None,style=(0,-1,-1,0,0)):
        path=ROOT/'.tmp'/f'{name}.png';deadline=time.monotonic()+8
        while True:
            before=datetime.now()
            run(['pebble','screenshot','--emulator','emery','--no-open','--no-correction',str(path)])
            after=datetime.now();im=Image.open(path).convert('RGB');assert im.size==(W,H)
            actual=list(im.get_flattened_data());palette=PALETTE;diffs=[]
            for t in (before,after):
                pixels=frame(lib,t.hour if h is None else h,t.minute if m is None else m,edition,mask,pos,t.date(),*style)
                diffs.append(sum(a!=palette[b] for a,b in zip(actual,pixels)))
            if min(diffs)==0 or time.monotonic()>deadline:break
            time.sleep(0.2)
        report={'case':name,'edition':edition,'mask':mask,'position':pos,'style':style,'different_pixels':min(diffs),'clock':'live' if h is None else f'{h:02}:{m:02} fixture'}
        reports.append(report);print(json.dumps(report),flush=True)
        assert min(diffs)==0, report
    try:
        for edition,cases in [(0,[(12,0),(11,59)]),(1,[(12,0),(3,30)])]:
            run(['pebble','kill'])
            data=json.loads(original);uuid=SPLIT_UUID if edition else original_uuid
            data['pebble']['uuid']=uuid;manifest.write_text(json.dumps(data,indent=2)+'\n')
            for h,m in cases:
                run(['pebble','build'],{**env,'TAH_EDITION':str(edition),'TAH_TEST_MINUTE':str(h*60+m)})
                install()
                launch(uuid);styles(uuid,(0,-1,-1,0,0))
                settings(uuid,15,0);check(f'native-calendar-{edition}-{h:02}{m:02}-top',edition,15,0,h,m)
                settings(uuid,5,1);check(f'native-calendar-{edition}-{h:02}{m:02}-bottom',edition,5,1,h,m)
            # Reinstall restarts app but preserves persistent data for the UUID.
            install()
            launch(uuid)
            check(f'native-calendar-{edition}-persisted',edition,5,1,h,m)
            settings(uuid,0,0);check(f'native-calendar-{edition}-hidden',edition,0,0,h,m)
            chosen=(10,4,3,5,4)
            styles(uuid,chosen);settings(uuid,15,1)
            check(f'native-styled-{edition}',edition,15,1,h,m,chosen)
            install();launch(uuid)
            check(f'native-styled-{edition}-persisted',edition,15,1,h,m,chosen)
            styles(uuid,(0,-1,-1,0,0));settings(uuid,0,0)
    finally:
        manifest.write_text(original)
        build_editions()
        install(ROOT/'dist/time-as-hand-two-hands.pbw')
        launch(SPLIT_UUID)
    settings(SPLIT_UUID,15,1);check('native-calendar-production-live',1,15,1)
    (ROOT/'.tmp/calendar-emulator-verification.json').write_text(json.dumps(reports,indent=2)+'\n')
if __name__=='__main__':main()
