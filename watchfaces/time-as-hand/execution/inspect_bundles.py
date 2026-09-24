#!/usr/bin/env python3
"""Validate manifest and embedded native identity for both distributables."""
import json
import hashlib
from pathlib import Path
from zipfile import ZipFile
from urllib.request import urlopen
from libpebble2.util.bundle import PebbleBundle
from libpebble2.util.hardware import PebbleHardware
ROOT=Path(__file__).resolve().parents[1]
for name in ('original','two-hands','meridian','four-points','clear'):
    path=ROOT/'dist'/('meridian-hemisphere.pbw' if name=='meridian' else f'{name}.pbw' if name in ('four-points','clear') else f'time-as-hand-{name}.pbw')
    with ZipFile(path) as z:
        info=json.loads(z.read('appinfo.json'))
    bundle=PebbleBundle(str(path),hardware=PebbleHardware.OBELIX_PVT)
    metadata=bundle.get_app_metadata()
    assert 0 < len(metadata['app_name']) <= 10, 'Watchface display names must fit ten characters'
    print(name,info['uuid'],metadata)
    assert info['uuid'].lower()==str(metadata['uuid'])
    assert 'configurable' in info['capabilities']
    route={'original':'watchface.pbw','two-hands':'two-hands.pbw','meridian':'meridian.pbw','four-points':'four-points.pbw','clear':'clear.pbw'}[name]
    with urlopen('http://127.0.0.1:4286/'+route,timeout=5) as r:download=r.read()
    assert hashlib.sha256(download).digest()==hashlib.sha256(path.read_bytes()).digest()
    print('Preview download matches bundle:',route)
