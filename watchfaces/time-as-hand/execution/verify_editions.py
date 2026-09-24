#!/usr/bin/env python3
"""Check preservation, labels, separation, upright glyphs and display bounds."""
import ctypes
import hashlib
import json
from preview import ROOT,load_renderer,frame,png,W,H

class Number(ctypes.Structure):
    _fields_=[('x',ctypes.c_int),('y',ctypes.c_int),('width',ctypes.c_int),('height',ctypes.c_int),('scale',ctypes.c_int),('text',ctypes.c_char*3)]

def verify():
    lib=load_renderer();lib.face_split_layout.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.POINTER(Number)]
    original=hashlib.sha256();glyphs={};min_gap=999
    for total in range(720):
        h,m=divmod(total,60);original.update(frame(lib,h,m))
        labels=(Number*2)();lib.face_split_layout(h,m,labels)
        assert labels[0].text.decode()==str(h or 12)
        assert labels[1].text.decode()==f'{m:02}'
        assert lib.face_angle(h,m)==h*60+m
        assert lib.face_minute_angle(m)==m*12
        p=frame(lib,h,m,1)
        assert p==frame(lib,h+12,m,1)
        assert set(p)=={0,1,2} or (h==0 and m==0 and set(p)<={0,1,2})
        assert not any(p[:W*3]+p[-W*3:])
        assert all(not any(p[y*W:y*W+3]+p[y*W+W-3:(y+1)*W]) for y in range(H))
        a,b=labels
        gap=max(b.x-a.x-a.width,a.x-b.x-b.width,b.y-a.y-a.height,a.y-b.y-b.height)
        min_gap=min(min_gap,gap);assert gap>=4,(h,m,gap)
        for n in labels:
            assert 0<=n.x-2<n.x+n.width+2<=W
            assert 0<=n.y-2<n.y+n.height+2<=H
            crop=b''.join(p[y*W+n.x:y*W+n.x+n.width] for y in range(n.y,n.y+n.height))
            assert 1 in crop and 2 not in crop
            key=(n.text,n.scale)
            if key in glyphs:assert glyphs[key]==crop,(h,m,n.text,'label rotation or occlusion')
            else:glyphs[key]=crop
        guard=(ctypes.c_uint8*(W*H+32))(*([197]*(W*H+32)))
        lib.face_render_split(h,m,ctypes.cast(ctypes.byref(guard,16),ctypes.POINTER(ctypes.c_uint8)))
        assert bytes(guard[:16]+guard[-16:])==bytes([197])*32
    assert original.hexdigest()==(ROOT/'.tmp/original-baseline.sha256').read_text().strip()
    assert lib.face_angle(3,30)==210
    assert lib.face_minute_angle(30)==360
    for h,m in [(12,0),(1,5),(3,0),(3,30),(6,30),(9,45),(11,59)]:
        (ROOT/'.tmp'/f'two-hands-{h:02}{m:02}.png').write_bytes(png(frame(lib,h,m,1)))
    report={'status':'pass','minutes_per_edition':720,'original_digest':original.hexdigest(),'minimum_label_box_gap':min_gap,'upright_glyph_crops':len(glyphs),'edge_margin_pixels':3,'buffer_guards':'pass'}
    (ROOT/'.tmp/editions-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':verify()
