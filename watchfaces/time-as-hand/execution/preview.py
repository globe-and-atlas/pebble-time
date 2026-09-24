#!/usr/bin/env python3
"""Allowlisted local preview using the native watch's C renderer."""
from __future__ import annotations
import argparse
import ctypes
from datetime import date, datetime, timezone
import math
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import struct
import subprocess
from urllib.parse import parse_qs, urlparse
import zlib
ROOT=Path(__file__).resolve().parents[1]
W,H=200,228
PALETTE=[(255,255,255),(0,0,0),(255,170,0),(170,0,0),(0,0,170),(0,85,0),(85,0,170),(85,85,85),(0,85,85),(170,170,170)]
PALETTE += [(r,g,b) for r in (0,85,170,255) for g in (0,85,170,255) for b in (0,85,170,255)]
def load_renderer():
    out=ROOT/'.tmp'/'face.dylib';out.parent.mkdir(exist_ok=True)
    subprocess.run(['cc','-O2','-shared','-fPIC',str(ROOT/'watchface/src/c/face.c'),'-o',str(out)],check=True)
    lib=ctypes.CDLL(str(out))
    lib.face_render.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.POINTER(ctypes.c_uint8)]
    lib.face_render_split.argtypes=lib.face_render.argtypes
    lib.face_label.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.c_char_p]
    lib.face_date_text.argtypes=[ctypes.c_int]*5+[ctypes.c_char_p]
    lib.face_render_config.argtypes=[ctypes.c_int]*9+[ctypes.POINTER(ctypes.c_uint8)]
    lib.face_render_custom.argtypes=[ctypes.c_int]*14+[ctypes.POINTER(ctypes.c_uint8)]
    lib.face_globe_overlay.argtypes=[ctypes.c_int]*8+[ctypes.POINTER(ctypes.c_uint8)]
    return lib
def frame(lib,h:int,m:int,edition:int=0,mask:int=0,position:int=0,calendar:date|None=None,font:int=0,color:int=-1,minute_color:int=-1,width:int=0,minute_width:int=0,utc:float|None=None,lat:float=0,lon:float=0,marker:int=0)->bytes:
    if not 0<=h<24 or not 0<=m<60: raise ValueError('Invalid time')
    if edition not in (0,1,2,3,4): raise ValueError('Invalid edition')
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90<=lat<=90 or not -180<=lon<=180 or marker not in (0,1): raise ValueError('Invalid location')
    if not 0<=mask<=15 or position not in (0,1): raise ValueError('Invalid calendar settings')
    if not 0<=font<12 or color not in [-1,*range(1,9),*range(10,74)] or minute_color not in [-1,*range(1,9),*range(10,74)] or not 0<=width<=5 or not 0<=minute_width<=5: raise ValueError('Invalid style')
    d=calendar or date.today()
    pixels=(ctypes.c_uint8*(W*H))()
    lib.face_render_custom(h,m,edition,d.year,d.month,d.day,(d.weekday()+1)%7,mask,position,font,color,minute_color,width,minute_width,pixels)
    if edition==2:
        instant=datetime.fromtimestamp(utc,timezone.utc) if utc is not None else datetime.now(timezone.utc)
        lib.face_globe_overlay(h,m,instant.year,instant.timetuple().tm_yday,instant.hour*60+instant.minute,round(lat*100),round(lon*100),marker,pixels)
    return bytes(pixels)
def png(pixels:bytes)->bytes:
    def chunk(kind,data):
        return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data))
    palette=bytes(c for rgb in PALETTE for c in rgb)
    raw=b''.join(b'\0'+pixels[y*W:(y+1)*W] for y in range(H))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',W,H,8,3,0,0,0))+chunk(b'PLTE',palette)+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
def serve(port:int):
    lib=load_renderer()
    files={'/':('index.html','text/html'),'/style.css':('style.css','text/css'),'/src/app.js':('src/app.js','text/javascript'),'/src/settings.js':('src/settings.js','text/javascript'),'/src/fonts.json':('src/fonts.json','application/json')}
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            url=urlparse(self.path)
            try:
                if url.path=='/face.png':
                    q=parse_qs(url.query)
                    style={key:int(q.get(key,[str(default)])[0]) for key,default in [('font',0),('color',-1),('minute_color',-1),('width',0),('minute_width',0)]}
                    style.update({key:float(q[key][0]) for key in ('utc','lat','lon') if key in q})
                    style['marker']=int(q.get('marker',['0'])[0])
                    body=png(frame(lib,int(q.get('h',['3'])[0]),int(q.get('m',['30'])[0]),int(q.get('edition',['0'])[0]),int(q.get('mask',['0'])[0]),int(q.get('position',['0'])[0]),date.fromisoformat(q['date'][0]) if 'date' in q else None,**style));mime='image/png'
                elif url.path in files:
                    name,mime=files[url.path];body=(ROOT/name).read_bytes()
                elif url.path in ('/watchface.pbw','/two-hands.pbw','/meridian.pbw','/four-points.pbw','/clear.pbw'):
                    name={'/watchface.pbw':'time-as-hand-original.pbw','/two-hands.pbw':'time-as-hand-two-hands.pbw','/meridian.pbw':'meridian-hemisphere.pbw','/four-points.pbw':'four-points.pbw','/clear.pbw':'clear.pbw'}[url.path]
                    body=(ROOT/'dist'/name).read_bytes();mime='application/octet-stream'
                else: self.send_error(404);return
                self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            except FileNotFoundError: self.send_error(404)
            except (ValueError,IndexError,OverflowError,OSError): self.send_error(400,'Invalid time or location')
        def log_message(self,fmt,*args): pass
    print(f'Time as Hand: http://127.0.0.1:{port}',flush=True)
    HTTPServer(('127.0.0.1',port),Handler).serve_forever()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=4286);serve(p.parse_args().port)
