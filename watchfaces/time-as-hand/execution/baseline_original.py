#!/usr/bin/env python3
"""Save a pre-change digest of the original 12-hour pixel cycle."""
import hashlib
from preview import ROOT,load_renderer,frame
lib=load_renderer();digest=hashlib.sha256()
for total in range(720): digest.update(frame(lib,*divmod(total,60)))
path=ROOT/'.tmp/original-baseline.sha256'
if path.exists(): raise SystemExit('Baseline exists; refusing overwrite')
path.write_text(digest.hexdigest()+'\n')
print(digest.hexdigest())
