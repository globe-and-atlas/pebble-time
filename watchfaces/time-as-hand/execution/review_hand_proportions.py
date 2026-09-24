#!/usr/bin/env python3
"""Render current and48px hour-track candidates at representative times."""
import ctypes
import io
import subprocess
from PIL import Image, ImageDraw
from preview import ROOT, load_renderer, frame, png

def main():
    lib=load_renderer()
    folder=ROOT/'.tmp/proportions';folder.mkdir(exist_ok=True)
    source=(ROOT/'watchface/src/c/face.c').read_text().replace('hour_radius=edition==4 ? 48 : 40','hour_radius=48').replace('split_layout_radius(h,m,labels,40)','split_layout_radius(h,m,labels,48)')
    (folder/'face.c').write_text(source)
    subprocess.run(['cc','-O2','-shared','-fPIC','-I',str(ROOT/'watchface/src/c'),str(folder/'face.c'),'-o',str(folder/'candidate.dylib')],check=True)
    candidate=ctypes.CDLL(str(folder/'candidate.dylib'))
    candidate.face_render_custom.argtypes=lib.face_render_custom.argtypes
    candidate.face_globe_overlay.argtypes=lib.face_globe_overlay.argtypes
    canvas=Image.new('RGB',(1200,5*270),'#dddddd');draw=ImageDraw.Draw(canvas)
    for edition,name in enumerate(['Original','Two Hands','Meridian','4 Points','Clear']):
        for col,(hour,minute) in enumerate([(10,10),(3,30),(11,55)]):
            for variant,renderer in enumerate([lib,candidate]):
                x=(col*2+variant)*200;y=edition*270
                draw.text((x+5,y+5),f'{name} {hour}:{minute:02} '+('current' if variant==0 else '48px'),fill='black')
                canvas.paste(Image.open(io.BytesIO(png(frame(renderer,hour,minute,edition,utc=1790208000)))),(x,y+30))
    canvas.save(folder/'review.png')
if __name__=='__main__':main()
