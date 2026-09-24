---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Fix device render

Physical Dev Connect installation succeeds but the watch displays Meridian is not responding. Diagnose the actual failure before declaring the physical trial successful.

Execution: build_editions.py, inspect_bundles.py, existing host renderer checks, device install/screenshot/log CLI.
Artifacts: dist/meridian-hemisphere.pbw, .tmp/device screenshots and timing evidence.
Safety: preserve app UUIDs, preserve saved settings, no credential reads or publication. User authorized paired-watch installation through Dev Connect.

## Validation contract
- The renderer retains existing host pixel output.
- Each display name is at most ten characters.
- Device capture shows Meridian's dial after launch.
- Device capture shows the dial after a real minute transition.
- Rendering timing is recorded on the device when available.
- A fresh verifier reviews the final fix.

Physical permission UX, battery duration, wrist readability and travel/DST behavior remain separate wearer checks.

## 2026-09-23 — Incremental render criteria
- Incremental output equals the synchronous reference image.
- A changed location supersedes a partial projection.
- Settings changes restart a pending native render.
- A timer callback processes at most two globe rows.
- Partial palette-index data is never drawn as a native bitmap.

## 2026-09-23 — Wearer contrast feedback
User confirms globe renders physically but is too faint. Increase globe contrast only.
- Land pixels use dark gray instead of light gray.
- Night land stipple uses black instead of dark gray.
- Ocean graticule uses dark gray instead of light gray.
- Globe rim uses black instead of dark gray.
- Time labels retain their existing pixels.
- Date labels retain their existing pixels.
- Sunlight geometry remains unchanged.
Execution: build_editions.py, verify_hemisphere.py, verify_incremental.py, native emulator/device capture. Outputs existing dist bundles and shared local preview. No credentials or publication.

## 2026-09-23 — Hand color picker contract
Execution: generate_colors.py, generate_settings.py, build_editions.py, color tests, device install. Artifacts: existing preview and three dist bundles.
- Clay offers64 color choices per hand.
- Browser picker snaps to the64-color display palette.
- Old numeric color preferences preserve their appearance.
- RGB settings survive a watch restart.
- Numerals keep their existing black color.
- Date rendering remains unchanged.
No UUID changes, publication, or credential reads.

## 2026-09-23 — Clear and 4 Points contract
Each new edition uses two upright numbers on distinct tracks and four black cardinal marks. Clear defaults: black4px hour, burnt-orange2px minute. 4 Points defaults: black1px hour, black1px minute. Each retains fonts,64-color pickers,width and date settings with independent UUID/storage. Existing0/1/2 rendering is unchanged. Names <=10 characters. Preview downloads match corresponding bundles. Native screenshots demonstrate the variants. Physical installation receives acknowledgement and working face capture. No globe on either new edition.

## 2026-09-23 — Clear hour reach
Clear hour hand and numeral center move from40px to48px radius. Other four editions preserve their geometry. Minute radius stays82px. Numeral clearance remains positive across720 minutes. Cardinal/date regions remain clear. Rebuild, independent review and physical screenshot required.

## 2026-09-23 — Collection proportion review
User clarified review applies to every face. Compared five editions at10:10,3:30,11:55 in .tmp/proportions/review.png. Two Hands,Meridian,4 Points,Clear use48px hour reach and82px minute reach. Original is unchanged. Globe numeral halos follow new layout. Verify720-minute separation, original digest, globe halo, builds and physical deployment.
