#!/usr/bin/env python3
"""Apply the user's ten-character watchface display-name limit."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
replacements={
 'execution/build_editions.py': [('G&A Meridian','Meridian'),('Time as Hand: Two Hands','Two Hands')],
 'execution/generate_settings.py': [('G&A Meridian: Hemisphere','Meridian'),('Time as Hand: Two Hands','Two Hands'),('Time as Hand: Original','Original')],
 'index.html': [('01 / Original digital hand','Original'),('02 / Two numbered hands','Two Hands'),('03 / G&amp;A Meridian · Hemisphere','Meridian')],
 'src/app.js': [('Download G&A Meridian for Pebble','Download Meridian for Pebble')],
 'RELEASE_NOTES.md': [('# G&A Meridian — Hemisphere','# Meridian')],
 'README.md': [('G&A Meridian — Hemisphere','Meridian')],
 'PUBLISH.md': [('**Time as Hand** and **Time as Hand: Two Hands**','**Original**, **Two Hands**, and **Meridian**'),('G&A Meridian — Hemisphere','Meridian'),('`G&A Meridian`','`Meridian`')]
}
def main():
    for name,pairs in replacements.items():
        path=ROOT/name;text=path.read_text()
        for old,new in pairs:text=text.replace(old,new)
        path.write_text(text)
    path=ROOT/'watchface/package.json';data=json.loads(path.read_text())
    data['pebble']['displayName']='Original';path.write_text(json.dumps(data,indent=2)+'\n')
    from generate_settings import main as generate
    generate()
    print('Display names: Original (8), Two Hands (9), Meridian (8).')
if __name__=='__main__':main()
