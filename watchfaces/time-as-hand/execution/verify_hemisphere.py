#!/usr/bin/env python3
"""Check astronomical landmarks, DST separation, glyph clearance and globe bounds."""
import ctypes
from datetime import datetime, timezone, date
from zoneinfo import ZoneInfo
import hashlib
import json
import math
import numpy as np
from preview import ROOT,W,H,load_renderer,frame,png

def main():
    lib=load_renderer()
    lib.face_sun.argtypes=[ctypes.c_int]*3+[ctypes.POINTER(ctypes.c_float)]*2
    def sun(d):
        dec=ctypes.c_float();lon=ctypes.c_float()
        lib.face_sun(d.year,d.timetuple().tm_yday,d.hour*60+d.minute,ctypes.byref(dec),ctypes.byref(lon))
        return math.degrees(dec.value),math.degrees(lon.value)
    summer=datetime(2026,6,21,12,tzinfo=timezone.utc)
    winter=datetime(2026,12,21,12,tzinfo=timezone.utc)
    assert 23<sun(summer)[0]<24
    assert -24<sun(winter)[0]<-23
    equinox=datetime(2026,3,20,12,tzinfo=timezone.utc)
    assert abs(sun(equinox)[0])<1
    assert abs(sun(equinox)[1])<3
    assert abs(abs(sun(equinox.replace(hour=0))[1])-180)<3
    # The repeated local hour at the autumn DST transition is two real instants.
    zone=ZoneInfo('America/Chicago')
    first=datetime(2026,11,1,1,30,tzinfo=zone,fold=0)
    second=first.replace(fold=1)
    assert second.timestamp()-first.timestamp()==3600
    a=frame(lib,1,30,2,utc=first.timestamp(),lat=41.9,lon=-87.6)
    b=frame(lib,1,30,2,utc=second.timestamp(),lat=41.9,lon=-87.6)
    assert a!=b,'Repeated wall time must not freeze solar time'
    # Global shading is identical across civil-clock offsets away from the hands.
    timestamp=summer.timestamp(); background=[]
    for hour in (3,4):
        pixels=(ctypes.c_uint8*(W*H))()
        lib.face_globe_overlay(hour,30,2026,172,720,0,0,0,pixels)
        background.append(bytes(pixels))
    base1=frame(lib,3,30,1);base2=frame(lib,4,30,1)
    # Fixed patch distant from either label or hands.
    for y in range(55,85):
        assert background[0][y*W+60:y*W+90]==background[1][y*W+60:y*W+90]
    signatures=set()
    for lat,lon in [(0,0),(51.5,-.1),(41.9,-87.6),(35.7,139.7),(-33.9,151.2),(90,180),(-90,-180)]:
        pix=frame(lib,3,30,2,utc=timestamp,lat=lat,lon=lon,marker=1)
        signatures.add(hashlib.sha256(pix).hexdigest())
        assert set(pix)<=set(range(10))
    assert len(signatures)==7
    # Globe cannot touch date bands; labels are cleared by a glyph-shaped halo.
    class Number(ctypes.Structure):
        _fields_=[('x',ctypes.c_int),('y',ctypes.c_int),('width',ctypes.c_int),('height',ctypes.c_int),('scale',ctypes.c_int),('text',ctypes.c_char*3)]
    labels=(Number*2)();outside_halo_globe=0;stack=[]
    for t in range(720):
        h,m=divmod(t,60)
        pix=frame(lib,h,m,2,15,1,date(2026,6,21),font=t%12,width=5,minute_width=5,utc=timestamp,lat=51.5,lon=-.1,marker=1)
        split=frame(lib,h,m,1,15,1,date(2026,6,21),font=t%12,width=5,minute_width=5)
        assert pix[:20*W]==split[:20*W] and pix[208*W:]==split[208*W:]
        lib.face_split_layout(h,m,labels)
        # Hands and numerals are never overpainted by the globe.
        assert all(a==b for a,b in zip(pix,split) if b),(h,m)
        # Independently derive the halo: disc of radius = numeral scale around each stroke.
        halo=set();boxes=[]
        for n in labels:
            r=n.scale;ink=[(x,y) for y in range(n.y,n.y+n.height) for x in range(n.x,n.x+n.width) if split[y*W+x]==1]
            boxes.append((n,r))
            for x,y in ink:
                for dy in range(-r,r+1):
                    for dx in range(-r,r+1):
                        if dx*dx+dy*dy<=r*r+1:halo.add((x+dx,y+dy))
        for x,y in halo:
            if 23<=x<=177 and 37<=y<=191: assert pix[y*W+x]==split[y*W+x],('halo pixel drawn',h,m,x,y)
        # Keep what the globe drew: outside ink/hands/halo the globe is time-independent here.
        mask=np.zeros((H,W),bool)
        for x,y in halo:
            if 0<=x<W and 0<=y<H:mask[y,x]=True
        stack.append((np.frombuffer(pix,np.uint8).reshape(H,W),np.frombuffer(split,np.uint8).reshape(H,W)==0,mask))
        # The clearance is not a rectangle: some in-box pixels outside the halo show the globe.
        for n,r in boxes:
            for y in range(n.y,n.y+n.height):
                for x in range(n.x,n.x+n.width):
                    if (x,y) not in halo and pix[y*W+x]!=split[y*W+x]:outside_halo_globe+=1
    assert outside_halo_globe>0,'Halo must be glyph-shaped, not a solid block'
    # Over-clearing: the same pixel must show the same globe value in every frame where it is
    # neither ink, hand nor derived halo (fixed UTC and location, so the globe cannot vary).
    pixels=np.stack([a for a,_,_ in stack]);free=np.stack([b&~c for _,b,c in stack])
    high=np.where(free,pixels,0).max(0);low=np.where(free,pixels,255).min(0)
    seen=free.any(0);inconsistent=int((seen&(high!=low)).sum())
    assert inconsistent==0,f'{inconsistent} pixels cleared beyond the derived halo (halo too large or not glyph-shaped)'
    for name,d,lat,lon in [('summer',summer,51.5,-.1),('winter',winter,51.5,-.1),('world',equinox,0,0)]:
        (ROOT/'.tmp'/f'hemisphere-{name}.png').write_bytes(png(frame(lib,3,30,2,15,1,d.date(),utc=d.timestamp(),lat=lat,lon=lon,marker=int(name!='world'))))
    report={'status':'pass','time_states':720,'locations':7,'summer_declination':sun(summer)[0],'winter_declination':sun(winter)[0],'dst_repeated_hour':'different sunlight at same local time','label_clearance':'glyph-shaped halo (radius = numeral scale); hands and ink never overpainted','date_bands':'preserved'}
    (ROOT/'.tmp/hemisphere-verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
