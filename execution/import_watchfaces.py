#!/usr/bin/env python3
"""Import current watchface working files, excluding local state."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('/Users/danielbally/Git/time-as-hand')
DEST=ROOT/'watchfaces/time-as-hand'
EXCLUDE={'.git','.claude','.codex','.agents','.agent','.tmp','.venv','node_modules','node_modules_bad','dist','build','__pycache__'}
def main():
    names=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=SOURCE).decode().split('\0')
    report=[]
    for name in sorted(set(names)-{''}):
        relative=Path(name)
        if set(relative.parts)&EXCLUDE or relative.name=='.env' or relative.name.startswith('.env.') and relative.name!='.env.example':continue
        source=SOURCE/relative
        if not source.is_file() or source.is_symlink():continue
        target=DEST/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
        digest=hashlib.sha256(source.read_bytes()).hexdigest()
        assert hashlib.sha256(target.read_bytes()).hexdigest()==digest,name
        report.append({'path':name,'sha256':digest})
    out=ROOT/'.tmp';out.mkdir(exist_ok=True)
    (out/'import-verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'Imported and hash-verified {len(report)} files')
if __name__=='__main__':main()
