---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Time as Hand

A native Pebble Time 2 watchface experiment with a matching local preview and article evidence kit.

Five editions: Original puts the full digital time along an hour hand; Two Hands places upright hour and minute numbers near their respective hand tips; Meridian adds a globe with calculated day/night shading beneath those two hands. 4 Points adds four cardinal marks and fine black hands; Clear uses those marks with a heavy black hour hand and orange minute hand. Original reduces to a single upright numeral at 3:00, 6:00, 9:00 and 12:00 for that minute. The other editions retain both numbers. The two-hand editions use a48px hour track and82px minute track, with upright tip numerals. The clock uses local time and 12-hour notation; AM/PM is intentionally not displayed.

Each offers 12 original pixel numeral fonts (Pixel, Retro, Modern, Classic), 64-color hand pickers, widths of 1–5 pixels, and optional weekday/day/month/year combinations at the top or bottom. The four two-hand editions style each hand independently. Date typography stays constant. Defaults retain the original appearance with date hidden.

Hemisphere uses UTC plus the date for sunlight, independently of local daylight saving. Choose a manual city/coordinates or opt into phone location; the saved center works offline. The world-view default has no location marker. Coordinates change the globe view, not the watch time zone. See [Hemisphere design notes](knowledge/domain/hemisphere.md).

## Try it now

```bash
cd /Users/danielbally/Git/pebble-time/watchfaces/time-as-hand
python3 execution/preview.py
```

Open http://127.0.0.1:4286. Select an edition; adjust time, typography, hands and calendar. Browser preferences persist separately per edition. The dial stays visible while scrolling settings. PNGs use the same C renderer as the watch. The preview is not a physical reflectance simulation. Browser choices do not rewrite downloads: use each watchface's settings in the Pebble phone app after installation.

## Build and install

SDK installed for this session: Pebble CLI 5.0.40, SDK 4.33.1. Native target: Emery only (Pebble Time 2).

```bash
cd /Users/danielbally/Git/pebble-time/watchfaces/time-as-hand
python3 execution/build_editions.py
cd watchface
pebble install --emulator emery ../dist/time-as-hand-two-hands.pbw
```

Installable outputs: `dist/time-as-hand-original.pbw`, `dist/time-as-hand-two-hands.pbw`, `dist/meridian-hemisphere.pbw`, `dist/four-points.pbw`, and `dist/clear.pbw`. Each has its own UUID, so the five can coexist. The build script restores the source manifest and default build to Original. Each preview edition links its matching download.

For the physical watch, open the current Pebble mobile app, enable Dev Connect from Devices, then authenticate personally. From `watchface/`:

```bash
pebble login
pebble install --cloudpebble ../dist/time-as-hand-two-hands.pbw
```

The build needs no API key. Bundled Clay phone-side JavaScript provides offline settings; no custom phone app, hosted settings page, or preview server is needed on the wrist. No store submission is needed for sideloading. Official setup: https://developer.repebble.com/sdk/

## Verify

```bash
python3 execution/verify.py
python3 execution/verify_editions.py
python3 execution/verify_clear_points.py
python3 execution/verify_calendar.py
python3 execution/verify_styles.py
python3 execution/verify_hemisphere.py
node execution/verify_location.js
python3 execution/verify_preview.py
/Users/danielbally/.local/share/uv/tools/pebble-tool/bin/python3 execution/check_hemisphere_emulator.py
/Users/danielbally/.local/share/uv/tools/pebble-tool/bin/python3 execution/check_calendar_emulator.py
/Users/danielbally/.local/share/uv/tools/pebble-tool/bin/python3 execution/inspect_bundles.py
```

Host checks cover default preservation, 5,920 calendar-format cases and 17,280 styled time states. Emulator fixtures compare native pixels and persistent preferences, then rebuild the three live-clock bundles in finally. Emulator protocol issues are logged in knowledge/ERRORS.md. Reports/screenshots live in `.tmp/`, never committed. Do not distribute a PBW built with `TAH_TEST_MINUTE` set.

## Publishing
See [PUBLISH.md](PUBLISH.md) for the Pebble dashboard route, bundle choices and physical checks still needed before a public release. Nothing has been uploaded or published.

## Article

`article/draft.md` is a working draft about the experiment so far. `article/field-notes.md` holds provenance, evidence limits and questions for the physical trial. Neither is published. Hardware readability, battery measurements and wearer observations remain untested.
