#!/usr/bin/env python3
"""Compare a saved native frame across clock offsets and separate sky mismatches."""
from datetime import datetime
from PIL import Image
from preview import ROOT,PALETTE,load_renderer,frame,png

path=ROOT/'.tmp/native-hemisphere-world.png'
d=datetime.fromtimestamp(path.stat().st_mtime).astimezone()
actual=list(Image.open(path).convert('RGB').get_flattened_data())
lib=load_renderer();rank=[]
for h in range(24):
    pixels=frame(lib,h,d.minute,2,font=0,color=4,minute_color=3,width=3,minute_width=2,utc=d.timestamp())
    rank.append((sum(a!=PALETTE[b] for a,b in zip(actual,pixels)),h,pixels))
best=min(rank,key=lambda row:row[0])
print('Capture local',d.isoformat(),'best hour',best[:2])
(ROOT/'.tmp/hemisphere-expected.png').write_bytes(png(best[2]))
print('Background-only differences',sum(a!=PALETTE[b] for a,b in zip(actual,best[2]) if a in (PALETTE[0],PALETTE[7],PALETTE[9]) and b in (0,7,9)))
