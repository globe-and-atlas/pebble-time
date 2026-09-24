#!/usr/bin/env python3
"""Preview server status codes, run against a copy of the tree with no dist/."""
from pathlib import Path
import tempfile
import threading
import time
import urllib.error
import urllib.request
import preview

def status(port,path):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}',timeout=5) as r:return r.status
    except urllib.error.HTTPError as e:return e.code
    except urllib.error.URLError:return None # server still compiling the renderer

def verify(port=4299):
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp)
        (root/'watchface').symlink_to(preview.ROOT/'watchface')
        (root/'index.html').write_text('<html></html>')
        real=preview.ROOT;preview.ROOT=root
        try:
            threading.Thread(target=preview.serve,args=(port,),daemon=True).start()
            for _ in range(200):
                if status(port,'/')==200:break
                time.sleep(0.1)
            cases={'/':200,'/face.png?h=3&m=30':200,'/face.png?h=99&m=0':400,'/face.png?h=3&m=30&lat=999':400,
                   '/watchface.pbw':404,'/meridian.pbw':404,'/style.css':404,'/nope':404}
            for path,expected in cases.items():
                assert status(port,path)==expected,(path,status(port,path),expected)
        finally:preview.ROOT=real
    print('PASS: preview status codes',cases)
if __name__=='__main__':verify()
