---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Add Hemisphere

## Contract
Target: third edition, G&A Meridian — Hemisphere, based on selected concept 06.
Scripts: execution/generate_land.py, execution/preview.py, execution/build_editions.py, execution/verify_hemisphere.py.
Outputs: shared native renderer; preview at port 4286; dist/meridian-hemisphere.pbw; article/field-notes.md.
Safety: no secret reads, commits, publication, or external location service. Transient evidence stays in .tmp/.

## Validation Contract
- Edition 03 displays a globe behind two upright numbered hands.
- Night shading follows the UTC instant.
- Solar declination changes with the season.
- Local clock changes do not independently move the terminator.
- The selected coordinates determine the globe center.
- Phone location is opt-in.
- Saved coordinates remain usable offline.
- Existing date controls are available in edition 03.
- Existing font controls are available in edition 03.
- Existing hand color controls are available in edition 03.
- Existing hand width controls are available in edition 03.
- Original default pixel digest is unchanged.
- The third native bundle has a distinct embedded UUID.
- Browser controls are inspected in the running preview.
- Native edition 03 is inspected in the emulator.
- A fresh verifier reviews the final artifacts.

## Scope
North-up orthographic globe, low-resolution land, subtle graticule, dithered geometric night hemisphere. This is not weather imagery or a precise sunrise calculator. World view at 0°N 0°E is the unset-location default; no location marker until a location is chosen. Phone coordinates are rounded to 0.1°. Hands and calendar follow watch local time; solar calculation uses UTC. Refresh once per minute. Physical battery and wrist testing remain separate.
