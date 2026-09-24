#!/usr/bin/env python3
"""Stop the current emulator application before changing watchface UUIDs."""
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def stop():
    code='from libpebble2.protocol.apps import AppRunState,AppRunStateStop,AppRunStateRequest\n'
    code+='current=pebble.send_and_read(AppRunState(data=AppRunStateRequest()),AppRunState).data.uuid\n'
    code+="print('STOPPING',current)\npebble.send_packet(AppRunState(data=AppRunStateStop(uuid=current)))\n"
    r=subprocess.run(['pebble','repl','--emulator','emery'],cwd=ROOT/'watchface',input=code,capture_output=True,text=True,timeout=20)
    r.check_returncode();print(r.stdout)
if __name__=='__main__':stop()
