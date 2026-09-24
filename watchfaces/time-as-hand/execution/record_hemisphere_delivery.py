#!/usr/bin/env python3
"""Record verified Hemisphere evidence after independent approval."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
HEADER='---\ngenerated_by: "OpenAI Codex (GPT-6)"\ntimestamp: "2026-09-23"\n---\n'

def main():
    report=json.loads((ROOT/'.tmp/hemisphere-emulator-verification.json').read_text())
    required={'world','london','remembered','sydney','after-minute-tick'}
    assert {r['case'] for r in report}==required
    assert all(r['different_pixels']==0 for r in report)
    for case in ('world','london','sydney'):
        target=ROOT/'assets/store/meridian'/f'{case}.png';target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes((ROOT/'.tmp'/f'native-hemisphere-{case}.png').read_bytes())
    p=ROOT/'task.md';s=p.read_text();s=s.replace('## Hemisphere edition — in progress','## Hemisphere edition — verified prototype')
    for label in ('Implement the third renderer.','Add location controls.','Verify solar geometry.','Verify native bundle.','Inspect browser behavior.','Receive fresh verifier approval.'):
        s=s.replace('- [ ] '+label,'- [x] '+label)
    p.write_text(s)
    (ROOT/'knowledge/procedural/verify_hemisphere.md').write_text(HEADER+'''# Verify Hemisphere

Run `python3 execution/build_editions.py`, `python3 execution/verify_hemisphere.py`, and `node execution/verify_location.js` from the project root. Existing renderer/calendar/style checks remain relevant. Reproduce native evidence with `/Users/danielbally/.local/share/uv/tools/pebble-tool/bin/python3 execution/check_hemisphere_emulator.py`; launch a fresh emulator (run `pebble kill` first). This script uses an explicit process TZ=UTC because Emery RTC/protocol synchronization was unreliable in a non-UTC zone. It does not change the Mac time zone. Native UTC evidence must not be described as physical DST acceptance.

Five production native comparisons passed with zero differing pixels: world, London, remembered restart, Sydney, a real minute tick. Host checks cover seasonal solstices, seven camera centers, the repeated DST hour, 720 dial states and label/date protection. Current host regressions pass 17,280 style states and 5,920 calendar cases. Re-running the legacy native faces was blocked by an emulator UUID-switching issue; their earlier 17 native comparisons are historical evidence, not a fresh rerun. Phone sandbox tests cover opt-in, rounding, fallback, stale responses and empty phone storage; no real user location was requested.

Run `execution/inspect_bundles.py` with the Pebble Python runtime while the local preview is running to verify embedded UUIDs and HTTP download hashes for three bundles. Source manifest/default build stays Original; use dist/meridian-hemisphere.pbw explicitly. Build script retains .tmp/meridian.elf for fault diagnosis. Transient logs and test reports stay in .tmp/.

Browser observed: edition switching retains independent controls; London updates the globe; date fields appear below; reload retains location; a spring DST gap normalizes forward; live view shows America/Chicago local time and a separate UTC solar instant. Browser geolocation was not granted or called. Ambiguous autumn manual time selects the first occurrence; live mode uses the actual instant.

Independent review: verify_hemisphere approved the prototype against the stated contract after inspecting source and native evidence. Final store screenshots in assets/store/meridian/ are emulator captures, not hardware photos. Paired-phone permissions, non-UTC hardware behavior, wrist readability, battery and publication remain open.
''')
    p=ROOT/'knowledge/INDEX.md';s=p.read_text();row='| [procedural/verify_hemisphere.md](procedural/verify_hemisphere.md) | procedural | 2026-09-23: five native checks, browser evidence, UTC emulator limitation |\n'
    if row not in s:p.write_text(s+'\n'+row)
    (ROOT/'knowledge/SESSION.md').write_text(HEADER+'''# Last Known State
Agent: OpenAI Codex
Handoff-from: OpenAI Codex
Handoff-type: continuation
Goal: implement selected Meridian Hemisphere third edition.
Status: implemented; independent verifier approved. Physical trial remains open.

Project: /Users/danielbally/Git/time-as-hand
Preview: http://127.0.0.1:4286 (third edition selected).
Builds: dist/time-as-hand-original.pbw; dist/time-as-hand-two-hands.pbw; dist/meridian-hemisphere.pbw.
Source manifest/default build: Original, production live clock. Three embedded UUID/download hashes verified.
Hemisphere: location-centered low-resolution globe, seasonal UTC night shading, two numbered hands, existing date/font/color/width controls, opt-in coarse phone coordinates and remembered offline view.
Evidence: .tmp/hemisphere-verification.json; hemisphere-emulator-verification.json (five zero-difference cases); existing style/calendar regression reports. Phone sandbox tests pass. See procedural/verify_hemisphere.md for commands and limitations.
Native findings: static allocation limit required heap pixel buffer; linked atan2f produced invalid longitudes and was replaced; empty phone settings must not overwrite native location. UTC/local mismatch in emulator was not established as a gmtime bug; final tests use explicit UTC process environment.
Documentation: README.md, RELEASE_NOTES.md, PUBLISH.md, article/field-notes.md, domain/hemisphere.md updated. Store screenshots: assets/store/meridian/. No publishing, commits or pushes.
Next: physical paired-phone settings/permission checks, non-UTC/DST watch behavior, wrist reading and battery trial.
Closing audit: the chosen visual concept is now a working third prototype. Article notes capture measured failures and evidence boundaries; more feature expansion should wait for wear-test results.
''')
    p=ROOT/'knowledge/REFLECTIONS.jsonl'
    with p.open('a') as f:f.write(json.dumps({'date':'2026-09-23','project':'time-as-hand','effort':'extended','what_constrained':'Native relocatable math and emulator RTC/timezone behavior','what_worked':'Shared renderer, pixel comparisons, independent challenge to an unproven cache explanation','what_differently':'Set an explicit emulator timezone before testing solar and civil time; capture a minimal native math baseline earlier'})+'\n')
    print('Recorded final Hemisphere delivery evidence.')

if __name__=='__main__':main()
