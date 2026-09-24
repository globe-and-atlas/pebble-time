---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Add calendar options

User request: both editions offer weekday, date, month, year, and combinations at the top or bottom according to settings.

## Contract
- Target directive: directives/add_calendar.md.
- Execution: execution/preview.py, execution/build_editions.py, execution/verify_calendar.py, execution/check_calendar_emulator.py.
- Output: local preview at port 4286; independently installable PBWs in dist/.
- Safety: do not read secrets; do not publish; transient evidence stays in .tmp/.

## Product choices
Four independent fields in weekday/day/month/year order; English abbreviated weekday/month; four-digit year. Date off by default. Top/bottom position. Each edition retains separate settings. Calendar follows watch local time. Preview offers a sample date. Phone settings are bundled with Clay, without a hosted configuration service.
Original cardinal-time behavior remains single numeral when calendar is off; enabled calendar remains visible at cardinal times.

## Validation
- [x] Each of the 16 field combinations produces the expected text.
- [x] Both editions support top placement.
- [x] Both editions support bottom placement.
- [x] Hidden calendar preserves the original edition pixel digest.
- [x] Date glyphs remain inside the display.
- [x] Date bands do not overwrite time pixels during 720 distinct minute states of either edition.
- [x] The browser retains separate calendar preferences for each edition after reload.
- [x] Phone configuration offers the four independent field toggles.
- [x] Phone configuration offers top/bottom placement.
- [x] Watch settings survive app restart.
- [x] Native local-date data refreshes on minute ticks.
- [x] Both production PBWs build with configurable capability.
- [x] Native emulator calendar screenshots match the shared renderer.
- [x] A fresh verifier approves the final implementation.

## Checklist
- [x] Implement calendar rendering.
- [x] Implement settings surfaces.
- [x] Verify native behavior.
- [x] Record evidence and usage.
