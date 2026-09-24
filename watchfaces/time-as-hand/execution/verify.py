#!/usr/bin/env python3
"""Exhaustive minute-state, orientation, pixel boundary and output checks."""
import ctypes
import json
from pathlib import Path
from preview import load_renderer,frame,png,W,H,ROOT

def verify():
    lib=load_renderer()
    results=[]
    special=[]
    for t in range(1440):
        h,m=divmod(t,60)
        label=ctypes.create_string_buffer(6);lib.face_label(h,m,label)
        expected=str(h%12 or 12) if m==0 and h%3==0 else f'{h%12 or 12}:{m:02}'
        assert label.value.decode()==expected,(h,m,label.value)
        assert lib.face_angle(h,m)==(h%12)*60+m
        # Guard bytes independently check writes outside the framebuffer.
        buf=(ctypes.c_uint8*(W*H+32))(*([197]*(W*H+32)))
        ptr=ctypes.cast(ctypes.byref(buf,16),ctypes.POINTER(ctypes.c_uint8))
        lib.face_render(h,m,ptr)
        assert bytes(buf[:16])==bytes([197])*16
        assert bytes(buf[-16:])==bytes([197])*16
        pixels=bytes(buf[16:-16]);assert set(pixels)<={0,1,2}
        assert any(pixels)
        # A six-pixel clear margin prevents clipped text/tips.
        assert not any(pixels[:W*6]+pixels[-W*6:])
        assert all(not any(pixels[y*W:y*W+6]+pixels[y*W+W-6:(y+1)*W]) for y in range(H))
        if lib.face_special(h,m):
            special.append(t);assert 2 not in pixels
            assert pixels[114*W+100]==0
    assert special==[0,180,360,540,720,900,1080,1260]
    assert lib.face_angle(3,30)==210 # 105 degrees
    assert frame(lib,0,0)==frame(lib,12,0)
    # Confirm position of numeral ink, independently of model angle.
    for h,quadrant in [(3,'right'),(6,'bottom'),(9,'left'),(12,'top')]:
        p=frame(lib,h,0);xy=[(i%W,i//W) for i,c in enumerate(p) if c]
        x=sum(v[0] for v in xy)/len(xy);y=sum(v[1] for v in xy)/len(xy)
        assert {'right':x>150,'bottom':y>170,'left':x<50,'top':y<60}[quadrant]
    for h,m in [(2,59),(3,0),(3,1),(3,30),(6,0),(6,15),(9,0),(12,0),(12,1),(11,59)]:
        (ROOT/'.tmp'/f'face-{h:02}-{m:02}.png').write_bytes(png(frame(lib,h,m)))
    assert (ROOT/'watchface/build/watchface.pbw').is_file()
    report={'status':'pass','minutes_verified':1440,'special_minutes':special,'framebuffer':'200x228','guard_bytes':'pass','clear_margin_pixels':6,'physical_watch':'not tested'}
    (ROOT/'.tmp/verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':verify()
