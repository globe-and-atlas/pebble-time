#!/usr/bin/env python3
"""Exercise distinct fonts, style bounds, color separation and stroke widths."""
import ctypes
import hashlib
import json
from datetime import date
from preview import ROOT,W,H,PALETTE,load_renderer,frame,png
from generate_fonts import FONTS

def main():
    lib=load_renderer();d=date(2026,9,23);signatures=[]
    palette=(ctypes.c_uint8*(len(PALETTE)*3)).in_dll(lib,'face_palette')
    assert list(palette)==[c for rgb in PALETTE for c in rgb]
    for font in range(12):
        sig=hashlib.sha256()
        for edition in (0,1):
            for minute in range(720):
                # Widest hands, all time angles, each font and edition.
                pix=frame(lib,minute//60,minute%60,edition,0,0,d,font,4,3,5,5)
                assert not any(pix[:20*W]) and not any(pix[208*W:]),(font,edition,minute,'date band collision')
                assert not any(pix[0::W]) and not any(pix[199::W]),(font,edition,minute,'edge clipping')
                sig.update(pix)
            for pos in (0,1):
                pix=frame(lib,3,30,edition,15,pos,d,font,4,3,5,5)
                base=frame(lib,3,30,edition,15,pos,d,0,4,3,5,5)
                band=slice(4*W,18*W) if pos==0 else slice(210*W,224*W)
                assert pix[band]==base[band], 'Font must not alter date'
        signatures.append(sig.hexdigest())
        (ROOT/'.tmp'/f'font-{font:02}.png').write_bytes(png(frame(lib,10,8,0,15,1,d,font,4,3,2,2)))
    assert len(set(signatures))==12,'Fonts must be visibly distinct across the cycle'
    # Recoloring the original line must preserve every black numeral pixel.
    baseline=frame(lib,3,30,0,0,0,d,0,2)
    for color in range(1,9):
        pix=frame(lib,3,30,0,0,0,d,0,color)
        assert pix==bytes(color if c==2 else c for c in baseline)
    split=frame(lib,3,30,1,0,0,d,0,4,3,3,1)
    assert 4 in split and 3 in split and 1 in split
    widths={}
    for edition in (0,1):
        counts=[]
        for width in range(1,6):
            p=frame(lib,3,0 if edition else 30,edition,0,0,d,0,4,3,width,width)
            counts.append((p.count(4),p.count(3)))
        assert all(b[0]>a[0] for a,b in zip(counts,counts[1:])),counts
        if edition:assert all(b[1]>a[1] for a,b in zip(counts,counts[1:])),counts
        widths[str(edition)]=counts
    for font in range(12):
        g=(ctypes.c_uint8*(W*H+32))(*([199]*(W*H+32)))
        ptr=ctypes.cast(ctypes.byref(g,16),ctypes.POINTER(ctypes.c_uint8))
        lib.face_render_custom(23,59,1,9999,12,31,5,15,1,font,8,3,5,5,ptr)
        assert list(g[:16])==[199]*16 and list(g[-16:])==[199]*16
    result={'status':'pass','fonts':12,'font_minute_states':12*2*720,'distinct_cycle_digests':len(set(signatures)),'width_ink_counts':widths,'palette_colors':8,'date_font_unchanged':True,'buffer_guards':'pass'}
    (ROOT/'.tmp/styles-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
