#!/usr/bin/env python3
"""Record verified settings milestone without completing pending hardware work."""
from datetime import datetime
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FRONT='---\ngenerated_by: "OpenAI Codex (GPT-6)"\ntimestamp: "2026-09-23"\n---\n'
def main():
    native=json.loads((ROOT/'.tmp/calendar-emulator-verification.json').read_text())
    assert len(native)==17 and all(r['different_pixels']==0 for r in native)
    assert json.loads((ROOT/'.tmp/styles-verification.json').read_text())['status']=='pass'
    for name in ('add_edition','add_calendar','add_typography'):
        p=ROOT/'directives'/f'{name}.md';p.write_text(p.read_text().replace('- [ ]','- [x]'))
    p=ROOT/'task.md';text=p.read_text();cut=text.index('## Two-hand edition')
    text=text[:cut]+text[cut:].replace('- [ ]','- [x]').replace('— in progress','— verified')
    p.write_text(text+'\nDelivery: preview and both native bundles verified. PUBLISH.md and assets/store/ prepared; nothing published. Physical trial remains open above.\n')
    p=ROOT/'knowledge/SESSION.md'
    p.write_text(FRONT+'''# Last Known State
Agent: OpenAI Codex
Handoff-from: OpenAI Codex
Handoff-type: continuation
Goal: two watchface editions with date, fonts and hand settings; update preview and explain store publishing.
Status: implemented and independently verified. Physical trial and publication remain user next steps.

Project: /Users/danielbally/Git/time-as-hand
Preview: http://127.0.0.1:4286 (execution/preview.py)
Builds: dist/time-as-hand-original.pbw; dist/time-as-hand-two-hands.pbw
Source manifest/default build: Original; normal live clock. Distinct embedded UUIDs verified.
Settings: 12 original numeral glyph sets, eight hand colors, widths1–5, optional weekday/day/month/year top/bottom; each edition saves separately. Clay1.1.0 phone configuration bundled. No external data service.
Evidence: .tmp/editions-verification.json, calendar-verification.json, styles-verification.json, calendar-emulator-verification.json. 17 native comparisons pass, including style/date persistence and production live clock. 17,280 styled time states and 5,920 date formatting checks pass. Original digest preserved.
Independent review: verify_two_hands, verify_calendar and verify_styles approved; final native/bundle evidence reviewed by verify_styles.
Emulator gotcha: stop active app before changing UUID; restarting transport between edition fixture batches avoids observed timeouts. See execution/check_calendar_emulator.py and knowledge/ERRORS.md.
Publishing: PUBLISH.md; assets/store/{original,two-hands}/ has three verified native screenshots each. Current official dashboard checked. Nothing uploaded or published; no account accessed.
Next: install on paired Pebble Time 2, operate phone settings, assess wrist readability/battery, then publish chosen edition(s) through dashboard using explicit PBWs.
Closing audit: requested controls are concrete in both preview and native builds. Additional settings are user-authorized; physical usefulness and article conclusions remain unproven. Do not substitute feature count for the wear test.
''')
    p=ROOT/'knowledge/DECISIONS.md'
    with p.open('a') as f:f.write('''\n## 2026-09-23 — Editions and personalization
- Keep distinct UUIDs for Original and Two Hands so each can coexist and retain settings independently.
- Twelve original 5×7 numeral glyph sets preserve layout bounds; date uses a consistent small typeface. No external font assets.
- Hand styling retains optical defaults, supports eight Pebble-native foreground colors and explicit widths1–5. Time labels stay black.
- Bundle Clay1.1.0 configuration rather than hosting a settings page. Browser preferences demonstrate the feature but do not mutate PBWs.
- Use developer dashboard uploads of explicit PBWs for first store release; CLI publish rebuilds the default source edition.
''')
    p=ROOT/'knowledge/procedural/run_prototype.md'
    with p.open('a') as f:f.write('\nFinal settings delivery: 17 native pixel comparisons passed; both editions retained date/style settings across app restart. Final production Two Hands frame matched local clock. Bundle embedded UUIDs and preview download hashes matched. Independent final verifier approved. Paired-phone settings interaction and physical wear/battery remain untested.\n')
    p=ROOT/'article/field-notes.md'
    with p.open('a') as f:f.write('\nFinal native extension evidence: .tmp/calendar-emulator-verification.json contains 17 successful comparisons with zero differing pixels, including both-edition settings persistence and final production live clock. Three verified native screenshots per edition copied to assets/store/. These remain emulator evidence.\n')
    p=ROOT/'knowledge/INDEX.md'
    with p.open('a') as f:f.write('\nLast updated 2026-09-23: renderer.md covers editions/calendar/fonts; deps.md covers Clay1.1.0 and SDK keys; run_prototype.md covers current build/native lifecycle and publication workflow; ../PUBLISH.md contains current store guide.\n')
    p=ROOT/'knowledge/REFLECTIONS.jsonl'
    with p.open('a') as f:f.write(json.dumps({'date':'2026-09-23','project':'time-as-hand','effort':'extended','what_constrained':'Emery installation acknowledged before switching watchface UUID; transport timed out during extended batches.','what_worked':'Shared renderer, original pixel digest, explicit app stop before install, independent review, native fixture and restart comparisons.','what_differently':'Verify embedded UUID and active application early; keep native fixture batches bounded and preserve wearable testing as next milestone.'})+'\n')
    p=ROOT/'.tmp/runlog.md'
    with p.open('a') as f:f.write(f'\n### {datetime.now().isoformat(timespec="minutes")} — Settings delivered\n- Changed: second edition, calendar, typography, hand styling, preview, PBWs, publishing guide.\n- Test: native17/17, styled17280, calendar5920, baseline and bundle hashes passed; independent verifier approved.\n- Next: physical trial before publication.\n')
    print('Recorded verified delivery; physical trial remains pending.')
if __name__=='__main__':main()
