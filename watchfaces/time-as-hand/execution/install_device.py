#!/usr/bin/env python3
"""Enable native logs before Dev Connect installation so startup is captured."""
import argparse
import os
from pathlib import Path
import signal
import subprocess

ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seconds',type=int,default=35)
    parser.add_argument('--launch-only',action='store_true')
    args=parser.parse_args()
    bundle=ROOT/'dist/meridian-hemisphere.pbw'
    code='from pebble_tool.util.logs import PebbleLogPrinter\nfrom pebble_tool.commands.install import ToolAppInstaller\n'
    code+='logger=PebbleLogPrinter(pebble,force_colour=False)\n'
    if args.launch_only:
        code+='from uuid import UUID\nfrom libpebble2.protocol.apps import AppRunState,AppRunStateStart\n'
        code+="pebble.send_packet(AppRunState(data=AppRunStateStart(uuid=UUID('bf118b38-aaf3-438d-8c91-0e92c4f757e3'))))\nprint('LAUNCH_REQUEST_SENT')\n"
    else:
        code+=f'ToolAppInstaller(pebble,{str(bundle)!r}).install()\n'
    code+='logger.wait()\n'
    log=ROOT/'.tmp/device-startup.log'
    with log.open('w') as output:
        process=subprocess.Popen(['pebble','repl','--cloudpebble'],cwd=ROOT/'watchface',stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,text=True,env={**os.environ,'PYTHONUNBUFFERED':'1'})
        process.stdin.write(code);process.stdin.close()
        try:process.wait(timeout=args.seconds)
        except subprocess.TimeoutExpired:
            process.send_signal(signal.SIGINT)
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.terminate();process.wait(timeout=5)
    result=log.read_text()
    # Other installed faces can log precise location; keep their output local.
    for line in result.splitlines():
        if 'watchface.c:' in line or 'Meridian' in line or 'App fault!' in line or 'LAUNCH_REQUEST_SENT' in line or 'App install succeeded.' in line:
            print(line)
    acknowledged='LAUNCH_REQUEST_SENT' in result if args.launch_only else 'App install succeeded.' in result
    if not acknowledged:
        print('No acknowledgement before diagnostic deadline; inspect .tmp/device-startup.log')
        raise SystemExit(1)
if __name__=='__main__':main()
