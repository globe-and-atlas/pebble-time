#!/usr/bin/env python3
"""Record the completed prototype milestone and preserve pending physical trial."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
front='---\ngenerated_by: "OpenAI Codex (GPT-6)"\ntimestamp: "2026-09-23"\n---\n'
for name in ('task.md','directives/build_watchface.md'):
    p=ROOT/name;p.write_text(p.read_text().replace('- [ ]','- [x]'))
with (ROOT/'task.md').open('a') as f:
    f.write('\n## Prototype milestone\nPassed: exhaustive minute checks, 8 native fixed-time comparisons, restored live-clock check, independent review.\n\n## Next physical trial\n- [ ] Install on user\'s Pebble Time 2.\n- [ ] Record wrist readability observations.\n- [ ] Record battery observations.\n- [ ] Revise article from actual wearer evidence.\n')
with (ROOT/'knowledge/procedural/run_prototype.md').open('a') as f:
    f.write('\n2026-09-23 verification: 1,440 host minute checks passed; 8 native fixed-time emulator states matched pixel-exactly; restored live build matched local time. Independent verifier approved final build and download identity. The source-based browser was manually inspected.\n')
with (ROOT/'article/field-notes.md').open('a') as f:
    f.write('\n## 2026-09-23 observed results\n- 1,440 host minute states passed label, angle, buffer and margin checks.\n- Eight explicit fixed-time native emulator builds matched the host renderer with zero differing pixels.\n- Final restored live emulator screenshot matched local time at 07:47.\n- Independent verifier approved the final implementation and matched preview download to build SHA-256.\n- Physical watch has not been installed or worn in this session.\n')
with (ROOT/'knowledge/ERRORS.md').open('a') as f:
    f.write('\n- Preview tab opened by an earlier tool was not present in CUA inventory; created a new visible local preview tab and marked it deliverable.\n- Health checker reports INDEX.md has no entries despite populated Markdown-link rows; zero health failures, one format-detection warning.\n')
# Provenance for untouched template markdown created by the scaffold this session.
for p in ROOT.rglob('*.md'):
    if '.git' in p.parts or '.tmp' in p.parts or 'build' in p.parts: continue
    text=p.read_text()
    if not text.startswith('---\n'): p.write_text(front+text)
(ROOT/'knowledge/SESSION.md').write_text(front+'''# Last Known State
Agent: OpenAI Codex
Handoff-from: none
Handoff-type: new-project
Goal: build a native watchface prototype with article evidence.
Status: Prototype milestone verified; physical trial pending.

Project: /Users/danielbally/Git/time-as-hand
Preview: http://127.0.0.1:4286 (execution/preview.py)
Build: watchface/build/watchface.pbw (Emery, normal local clock)
Evidence: .tmp/verification.json, .tmp/emulator-verification.json, .tmp/live-verification.json
Article: article/draft.md, article/field-notes.md
Independent verifier: approved renderer, browser behavior, final PBW and evidence boundaries.
Next: user enables Dev Connect and installs on paired Pebble Time 2. Capture readability and battery observations before completing article.
Closing audit: the prototype answers the requested behavior. Physical usefulness remains unproven; the article explicitly preserves that gap.
''')
with (ROOT/'knowledge/REFLECTIONS.jsonl').open('a') as f:
    f.write(json.dumps({'date':'2026-09-23','project':'time-as-hand','effort':'extended','what_constrained':'Precise behavioral interpretation and Emery clock injection','what_worked':'Shared C renderer, exhaustive minute checks and explicit native fixtures','what_differently':'Inspect SDK template filenames before patching; use known Emery clock limitation earlier'})+'\n')
with (ROOT/'.tmp/runlog.md').open('a') as f:f.write('\n- Prototype and article draft delivered. Tests and independent review passed. Physical installation pending.\n')
print('Prototype documentation checkpoint saved.')
