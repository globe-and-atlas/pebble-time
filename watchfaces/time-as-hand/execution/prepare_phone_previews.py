#!/usr/bin/env python3
"""Generate current default-style listing thumbnails from the shared renderer."""
from datetime import datetime, timezone
from PIL import Image
from preview import ROOT, load_renderer, frame, png

def main():
    lib=load_renderer()
    instant=datetime(2026,9,23,10,10,tzinfo=timezone.utc)
    for edition,slug in enumerate(('original','two-hands','meridian','four-points','clear')):
        folder=ROOT/'assets/phone-previews'/slug
        folder.mkdir(parents=True,exist_ok=True)
        target=folder/'emery_preview.png'
        pixels=frame(lib,10,10,edition,calendar=instant.date(),utc=instant.timestamp())
        target.write_bytes(png(pixels))
        with Image.open(target) as im:
            assert im.size==(200,228)
            assert im.tobytes()==pixels
        print(target)
if __name__=='__main__':main()
