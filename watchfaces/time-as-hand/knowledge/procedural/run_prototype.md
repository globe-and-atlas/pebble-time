---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Run the prototype
From project root: `python3 execution/preview.py`, then open http://127.0.0.1:4286. Python standard library plus local C compiler required. Server is loopback-only and serves an explicit route allowlist.

Run `python3 execution/verify.py` after changing renderer. In `watchface/`, run `pebble build`, then `pebble install --emulator emery`. Run emulator image comparison with the Pebble tool environment's Python: `/Users/danielbally/.local/share/uv/tools/pebble-tool/bin/python3 execution/check_emulator.py`.

Physical install requires user's Pebble phone app. Enable Dev Connect under Devices, authenticate with the user's own account, then run `pebble login` and `pebble install --cloudpebble` from watchface/. Do not automate account credentials. No deployment or app-store publication required.

The app has no external data service, backend, runtime AI or secrets. Bundled Clay phone-side JavaScript provides offline configuration. Its preview server is development-only. Rebuild after code changes; restart preview to reload the compiled C library.

## Current two-edition workflow — 2026-09-23
- Build: `python3 execution/build_editions.py`; distributes two distinct UUIDs in dist/. Source manifest returns to Original.
- Regenerate font data/catalogs after changes: `python3 execution/generate_fonts.py`, then `python3 execution/generate_settings.py`.
- Verify: `python3 execution/verify_editions.py`, `python3 execution/verify_calendar.py`, `python3 execution/verify_styles.py`.
- Native comparison: Pebble environment python3 execution/check_calendar_emulator.py. It sends actual configuration messages and tests app restart persistence. Test-clock overrides stay in temporary emulator builds; finally rebuilds live distributables.
- Stop active emulator app before installing another UUID: `python3 execution/stop_emulator_app.py`. Installing alone can acknowledge transfer while prior watchface remains active. Avoid sending a second start while an install is transitioning. Emulator transport can time out on long batches; errors are not pixel evidence.
- `pebble clean` is needed after messageKeys change to regenerate SDK headers.
- Publish via current dashboard using the explicit PBWs: see PUBLISH.md. Do not run pebble publish from default source and expect Two Hands: it rebuilds Original.

2026-09-23 verification: 1,440 host minute checks passed; 8 native fixed-time emulator states matched pixel-exactly; restored live build matched local time. Independent verifier approved final build and download identity. The source-based browser was manually inspected.

Final settings delivery: 17 native pixel comparisons passed; both editions retained date/style settings across app restart. Final production Two Hands frame matched local clock. Bundle embedded UUIDs and preview download hashes matched. Independent final verifier approved. Paired-phone settings interaction and physical wear/battery remain untested.

## 2026-09-23 — Physical Dev Connect trial
Display names are Original, Two Hands, Meridian (each <=10 characters); UUIDs and download filenames retained. Build and embedded bundle inspection passed in the Pebble tool Python environment. `pebble install --cloudpebble ../dist/meridian-hemisphere.pbw` from watchface/ received installation acknowledgement. A physical screenshot then showed Meridian is not responding (`.tmp/meridian-device.png`). This is a failed runtime trial, not hardware acceptance. Diagnostic draw timing logs are included in current PBWs but no timing was received. Separate concurrent proxy CLI connections disconnected one another. The logs-before-install helper is execution/install_device.py; its zero exit status is not proof of installation because it currently also exits zero after bounded interruption. Last attempt could not connect to the phone. Resume with the phone app connected, dismiss the watch error, capture launch logs and verify first draw plus minute tick. Root cause remains unknown.

## 2026-09-23 — Clear and 4 Points

Build five editions with `python3 execution/build_editions.py`. Edition3 is4 Points (1px black hands); edition4 isClear (4px black hour,2px #AA5500 minute). Each has four3px cardinal marks, separate UUID/settings, optional dates and12 fonts. Preview selectors/downloads checked live. `python3 execution/verify_clear_points.py` independently verifies default/override frames and date/marker clearance; report .tmp/clear-points-verification.json. `execution/check_clear_points_emulator.py` checks live-clock native screenshots. Physical deployment requires a separate successful Dev Connect acknowledgement for each bundle; waiting for phone is not installation.

Current acceptance boundary: browser and independent host checks passed; new native emulator comparisons did not pass because captures retained Meridian error UI. Physical installation remains pending phone connection; neither new bundle received an acknowledgement.

Deployment retry succeeded for both4 Points andClear; actual physical captures are .tmp/four-points-device.png and .tmp/clear-device.png. Clear subsequent hour-reach refinement is48px (minute82px); other editions stay40px. Updated Clear installed successfully, final screenshot/review in progress.

Collection review supersedes Clear-only refinement: Two Hands,Meridian,4 Points,Clear now share48px hour/82px minute tracks. Original unchanged (digest verified). Shared exported layout matches globe halos. verify_editions and verify_hemisphere pass720 states each; label gap minimum4px. Compare via execution/review_hand_proportions.py; screenshot evidence uses actual renderer.

All four proportion-updated bundles installed and actual physical screens reviewed. Clear left active. Phone-preview generation: python3 execution/prepare_phone_previews.py (five native-size PNGs, round-trip pixel validation). Preview assets alone do not populate mobile locker; listing screenshots needed. See PUBLISH.md visibility correction before any upload.

Phone-thumbnail delivery: signed-in developer dashboard New → upload correctPBW → description → native200x228 PNG → select Unlisted → Submit. Verify Unlisted badge and preview on resulting listing. Five0.1.0 releases created; IDs in assets/phone-previews/listings.json. Listings are link-accessible but excluded from search/browsing. Mobile cache refresh must be observed separately.
