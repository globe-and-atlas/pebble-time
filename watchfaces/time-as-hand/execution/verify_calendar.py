#!/usr/bin/env python3
"""Verify date formatting, dial separation, original preservation and boundaries."""
import ctypes
from datetime import date,timedelta
import hashlib
import json
from preview import ROOT,W,H,load_renderer,frame,png

def main():
    lib=load_renderer(); digest=hashlib.sha256(); min_y=H;max_y=0
    sample=date(2026,9,23)
    for edition in (0,1):
        for t in range(720):
            pixels=frame(lib,t//60,t%60,edition)
            if edition==0: digest.update(pixels)
            rows=[y for y in range(H) if any(pixels[y*W:(y+1)*W])]
            min_y=min(min_y,min(rows));max_y=max(max_y,max(rows))
            assert not any(pixels[:20*W]), (edition,t,'top collision')
            assert not any(pixels[208*W:]), (edition,t,'bottom collision')
    assert digest.hexdigest()==(ROOT/'.tmp/original-baseline.sha256').read_text().strip()
    # Independent calendar text oracle across leap year, month and year boundaries.
    checked=0
    for offset in range(370):
        d=date(2027,12,29)+timedelta(days=offset)
        parts=[d.strftime('%a').upper(),f'{d.day:02}',d.strftime('%b').upper(),str(d.year)]
        for mask in range(16):
            text=ctypes.create_string_buffer(32)
            lib.face_date_text(d.year,d.month,d.day,(d.weekday()+1)%7,mask,text)
            expected=' '.join(p for i,p in enumerate(parts) if mask&(1<<i))
            assert text.value.decode()==expected,(d,mask,text.value,expected)
            checked+=1
    for edition in (0,1):
        baseline=frame(lib,3,30,edition)
        for mask in range(16):
            top=frame(lib,3,30,edition,mask,0,sample)
            bottom=frame(lib,3,30,edition,mask,1,sample)
            assert top[18*W:]==baseline[18*W:]
            assert bottom[:210*W]==baseline[:210*W]
            assert top[4*W:18*W]==bottom[210*W:224*W]
            assert not any(top[:4*W]) and not any(bottom[224*W:])
            assert any(top[4*W:18*W])==bool(mask)
            assert all(not any(top[y*W:y*W+4]) and not any(top[y*W+196:(y+1)*W]) for y in range(4,18))
        for position in (0,1):
            (ROOT/'.tmp'/f'calendar-{edition}-{position}.png').write_bytes(png(frame(lib,3,30,edition,15,position,sample)))
    # Maximum-width text and writes are within the pixel buffer.
    guard=(ctypes.c_uint8*(W*H+32))(*([199]*(W*H+32)))
    ptr=ctypes.cast(ctypes.byref(guard,16),ctypes.POINTER(ctypes.c_uint8))
    for pos in (0,1):
        lib.face_render_config(23,59,1,9999,12,31,5,15,pos,ptr)
        assert list(guard[:16])==[199]*16 and list(guard[-16:])==[199]*16
    result={'status':'pass','calendar_text_cases':checked,'dial_minutes':1440,'combinations':16,'positions':2,'editions':2,'dial_y_bounds':[min_y,max_y],'date_y_bands':[[4,17],[210,223]],'original_digest':digest.hexdigest(),'buffer_guards':'pass'}
    (ROOT/'.tmp/calendar-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
