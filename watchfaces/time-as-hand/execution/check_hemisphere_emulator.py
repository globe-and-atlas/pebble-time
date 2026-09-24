#!/usr/bin/env python3
"""Install production Meridian and compare live native screenshots to the renderer."""
from datetime import datetime
import json
import argparse
import os
import subprocess
import time
from pathlib import Path
from PIL import Image
from preview import ROOT,W,H,PALETTE,frame,load_renderer
from build_editions import MERIDIAN_UUID,SPLIT_UUID
from stop_emulator_app import stop

def main(resume=False,legacy_smoke=False):
    # Emery's RTC and protocol time sync can disagree in non-UTC zones.
    # Use an explicit UTC test environment; host tests cover civil DST cases.
    os.environ['TZ']='UTC';time.tzset()
    lib=load_renderer();reports=[]
    keys=json.loads((ROOT/'watchface/build/js/message_keys.json').read_text())
    def run(args):
        result=subprocess.run(args,cwd=ROOT/'watchface',capture_output=True,text=True,timeout=60)
        with (ROOT/'.tmp/hemisphere-emulator.log').open('a') as log:log.write(result.stdout+result.stderr)
        result.check_returncode();return result
    def install(bundle='meridian-hemisphere.pbw',uuid=MERIDIAN_UUID):
        stop();run(['pebble','install','--emulator','emery',str(ROOT/'dist'/bundle)])
        code='import time\nfrom uuid import UUID\nfrom libpebble2.protocol.apps import AppRunState,AppRunStateRequest,AppRunStateStart\n'
        code+='deadline=time.monotonic()+15\ncurrent=None\nwhile time.monotonic()<deadline:\n'
        code+='    current=pebble.send_and_read(AppRunState(data=AppRunStateRequest()),AppRunState).data.uuid\n'
        code+=f"    if str(current)=='{uuid}': break\n"
        code+="    time.sleep(0.2)\n\n"
        code+=f"if str(current)!='{uuid}':\n    pebble.send_packet(AppRunState(data=AppRunStateStart(uuid=UUID('{uuid}'))))\n\n"
        code+='deadline=time.monotonic()+10\nwhile time.monotonic()<deadline:\n'
        code+='    current=pebble.send_and_read(AppRunState(data=AppRunStateRequest()),AppRunState).data.uuid\n'
        code+=f"    if str(current)=='{uuid}': break\n"
        code+="    time.sleep(0.2)\n\nprint('RUNNING',current)\n"
        result=subprocess.run(['pebble','repl','--emulator','emery'],cwd=ROOT/'watchface',input=code,capture_output=True,text=True,timeout=30)
        assert 'RUNNING '+uuid in result.stdout,result.stdout
    def send(values,uuid=MERIDIAN_UUID):
        run(['pebble','send-app-message','--emulator','emery','--app-uuid',uuid,'--int',*[f'{keys[k]}={v}' for k,v in values.items()]])
    def check(name,lat,lon,valid,mask=0,font=0,edition=2):
        path=ROOT/'.tmp'/f'native-hemisphere-{name}.png';deadline=time.monotonic()+12
        while True:
            before=datetime.now().astimezone()
            run(['pebble','screenshot','--emulator','emery','--no-open','--no-correction',str(path)])
            after=datetime.now().astimezone()
            im=Image.open(path).convert('RGB');assert im.size==(W,H)
            actual=list(im.get_flattened_data());diffs=[]
            for d in (before,after):
                pixels=frame(lib,d.hour,d.minute,edition,mask,1,d.date(),font,4,3,3,2,utc=d.timestamp(),lat=lat,lon=lon,marker=valid)
                diffs.append(sum(a!=PALETTE[b] for a,b in zip(actual,pixels)))
            if min(diffs)==0 or time.monotonic()>deadline:break
            time.sleep(.2)
        report={'case':name,'different_pixels':min(diffs),'clock':'production live','emulator_timezone':'UTC'}
        reports.append(report);print(json.dumps(report),flush=True)
        assert min(diffs)==0,report
        (ROOT/'.tmp/hemisphere-emulator-verification.json').write_text(json.dumps(reports,indent=2)+'\n')
    if resume:
        reports=json.loads((ROOT/'.tmp/hemisphere-emulator-verification.json').read_text())
        assert {r['case'] for r in reports}=={'world','london','remembered','sydney','after-minute-tick'}
    else:
        install()
        send({'TimeFont':0,'HandColor':4,'MinuteColor':3,'HandWidth':3,'MinuteWidth':2,'ShowWeekday':0,'ShowDay':0,'ShowMonth':0,'ShowYear':0,'DatePosition':1,'Latitude':0,'Longitude':0,'LocationValid':0})
        check('world',0,0,0)
        send({'Latitude':5150,'Longitude':-10,'LocationValid':1,'ShowWeekday':1,'ShowDay':1,'ShowMonth':1,'ShowYear':1,'TimeFont':3})
        check('london',51.5,-.1,1,15,3)
        install();check('remembered',51.5,-.1,1,15,3)
        send({'Latitude':-3390,'Longitude':15120,'LocationValid':1})
        check('sydney',-33.9,151.2,1,15,3)
        minute=datetime.now().minute
        deadline=time.monotonic()+65
        print('Waiting for a real minute tick to verify local clock after UTC rendering',flush=True)
        while datetime.now().minute==minute and time.monotonic()<deadline:time.sleep(.2)
        check('after-minute-tick',-33.9,151.2,1,15,3)
    if legacy_smoke:
        for edition,name,uuid in [(0,'original','8d9227ba-dc65-4c72-a54e-71e917d6194a'),(1,'two-hands',SPLIT_UUID)]:
            run(['pebble','kill'])
            install(f'time-as-hand-{name}.pbw',uuid)
            send({'TimeFont':0,'HandColor':4,'MinuteColor':3,'HandWidth':3,'MinuteWidth':2,'ShowWeekday':0,'ShowDay':0,'ShowMonth':0,'ShowYear':0,'DatePosition':1},uuid)
            check(name,0,0,0,edition=edition)
        install();check('final-production',-33.9,151.2,1,15,3)
    (ROOT/'.tmp/hemisphere-emulator-verification.json').write_text(json.dumps(reports,indent=2)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--resume-regressions',action='store_true');parser.add_argument('--legacy-smoke',action='store_true')
    args=parser.parse_args();main(args.resume_regressions,args.legacy_smoke)
