---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Verify Hemisphere

Run `python3 execution/build_editions.py`, `python3 execution/verify_hemisphere.py`, and `node execution/verify_location.js` from the project root. Existing renderer/calendar/style checks remain relevant. Reproduce native evidence with `/Users/danielbally/.local/share/uv/tools/pebble-tool/bin/python3 execution/check_hemisphere_emulator.py`; launch a fresh emulator (run `pebble kill` first). This script uses an explicit process TZ=UTC because Emery RTC/protocol synchronization was unreliable in a non-UTC zone. It does not change the Mac time zone. Native UTC evidence must not be described as physical DST acceptance.

Five production native comparisons passed with zero differing pixels: world, London, remembered restart, Sydney, a real minute tick. Host checks cover seasonal solstices, seven camera centers, the repeated DST hour, 720 dial states and label/date protection. Current host regressions pass 17,280 style states and 5,920 calendar cases. Re-running the legacy native faces was blocked by an emulator UUID-switching issue; their earlier 17 native comparisons are historical evidence, not a fresh rerun. Phone sandbox tests cover opt-in, rounding, fallback, stale responses and empty phone storage; no real user location was requested.

Run `execution/inspect_bundles.py` with the Pebble Python runtime while the local preview is running to verify embedded UUIDs and HTTP download hashes for three bundles. Source manifest/default build stays Original; use dist/meridian-hemisphere.pbw explicitly. Build script retains .tmp/meridian.elf for fault diagnosis. Transient logs and test reports stay in .tmp/.

Browser observed: edition switching retains independent controls; London updates the globe; date fields appear below; reload retains location; a spring DST gap normalizes forward; live view shows America/Chicago local time and a separate UTC solar instant. Browser geolocation was not granted or called. Ambiguous autumn manual time selects the first occurrence; live mode uses the actual instant.

Independent review: verify_hemisphere approved the prototype against the stated contract after inspecting source and native evidence. Final store screenshots in assets/store/meridian/ are emulator captures, not hardware photos. Paired-phone permissions, non-UTC hardware behavior, wrist readability, battery and publication remain open.

## Emulator recovery (2026-09-23)
If `check_hemisphere_emulator.py` times out in stop() or `pebble install --emulator emery` hangs: `pebble kill; pkill -f qemu-pebble; pebble wipe`, then run the check again. Do not wait on a silent install for more than ~2 minutes.

## 2026-09-23 — Physical math-fault diagnosis
Real-device failure revealed two SDK newlib routines with invalid table/constant pointers: PC0x2c72 in __ieee754_sqrtf, then PC0x2e7e in __ieee754_rem_pio2f. Addresses apply only to the specific intermediate ELF builds. The replacements use integer square-root rounding and a bounded-angle double reducer. Keep these overrides: SDK asinf and sinf/cosf call these internal symbols. Projection/solar input domain remains below32 radians.

Run `python3 execution/verify_sqrt.py` (1,287,073 system sqrtf comparisons), `python3 execution/verify_trig_reduction.py` (649,470 reducer checks), and `python3 execution/verify_incremental.py` (101 image comparisons against historical renderer). Fresh independent verifier approved these fixes. Final Meridian native emulator suite: five zero-difference captures including minute tick. Host editions/calendar/style suites pass. Legacy native UUID switch still failed, so no fresh legacy native acceptance.

Native renderer now prepares projection and overlay in two-row timer callbacks and displays one completed 8-bit bitmap without another screen buffer. `execution/install_device.py --launch-only --seconds 30` enables logs before requesting launch; unlike install, this captured native fault addresses. The helper returns1 without request/install acknowledgement and filters other faces phone logs from console output. Local diagnostic logs may include other faces output; do not publish them raw.

Latest physical status: final math build installed, capture `.tmp/meridian-device-math.png` shows Loading. Phone disconnected before completion/minute capture. Hardware runtime acceptance remains open.

## 2026-09-23 — Wearer-confirmed rendering and contrast
Wearer confirmed final math fix renders the globe, then requested stronger contrast. Changed globe-only palette mapping: light gray→dark gray, dark gray→black. Geometry, hands, date, marker and halos unchanged. Independent historical-output comparison passes101 frames after explicit background-only mapping (934,091 globe pixels darkened,137,300 label pixels preserved across fixtures). Hemisphere720-state checks pass; rebuilt and bundle/download identity checks pass. Preview process restarted on4286 to load shared renderer. Physical higher-contrast capture .tmp/meridian-contrast-after.png shows working dial at3:39 with configured location/date. Fresh emulator attempt failed preflight, so no new emulator-pass claim for this palette update.

Physical follow-up: captured completed higher-contrast dial at3:41 (.tmp/meridian-contrast-minute-ready.png), advancing from3:39. Intermediate screenshot caught Loading; the following capture completed normally. Confirms displayed time advancement, not a guarantee of flicker-free redraw or battery efficiency.

## 2026-09-23 — Hand color picker verification
New HandColorRGB/MinuteColorRGB keys avoid ambiguity with legacy1..8 IDs. Native saves expanded palette indices10..73 to existing persistence keys111/112. Clay settings migrate old choices to RGB before constructing the page; per-edition stores remain separate. Palette expansion generated by execution/generate_colors.py preserves original indices0..9. Preview native color wells snap to64 display colors.

Tests: python3 execution/verify_colors.py (192 exact frames,256 native mappings,512 rounding cases,8 invalids); node execution/verify_colors.js (legacy migration and config); python3 execution/verify_incremental.py (101 historical background-mapped comparisons). Independent reviewer approved after catching and fixing preview bounds. Native emulator check: Pebble Python execution/check_color_emulator.py produced zero differing pixels for new blue/white settings and restart persistence. Actual browser observed color wells, native picker opening, #3498db→#55aaff snapping, reload retention and valid rendered image URL. No current phone UI observation yet.

## 2026-09-23 — Picker editions deployed
Installed dist/time-as-hand-original.pbw, time-as-hand-two-hands.pbw, and meridian-hemisphere.pbw sequentially using pebble install --cloudpebble from watchface/. Each received successful install acknowledgement. Actual-device screenshots confirm all three render: .tmp/original-picker-device.png, .tmp/two-hands-picker-device.png, .tmp/meridian-picker-device.png. Meridian remains active; configured globe/date/hand preferences retained visually. Picker UI is bundled; phone interaction itself was not observed.
