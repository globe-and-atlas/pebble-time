# Release checklist

Three kinds of evidence, never mixed: **host** (runs anywhere, no SDK), **emulator** (Pebble SDK and QEMU, `emery`) and **physical** (a real Pebble Time 2 with a real phone). A release needs all host and emulator items. Physical items are recorded separately, with the date, watch firmware and phone app version.

`node tools/preflight.js --release` fails while any emulator item below is unchecked, or while the four captures or the `.pbw` are missing.

## Host (automated: `make check`)

- [x] JS tests: geometry, profile and slope fixtures, tile codec, transfer, companion flows, settings page (`make test-js`)
- [x] C core tests with ASan/UBSan: parser, reassembly, malformed and truncated input, render bounds, valley vs ridge (`make test-c`)
- [x] Lint (eslint, ES5 for phone code) and type checks (`tsc --checkJs`; strict C; `main.c` against a stub header)
- [x] Preflight: C/JS limits and protocol match, message keys declared, no forbidden files or unlisted coordinates
- [x] Real-data tile prepared from the public sources (`tools/prepare_tile.js`, Half Dome)

## Emulator (Pebble SDK 4.x, `pebble install --emulator emery`)

- [ ] Clean production build: `pebble clean && pebble build` with no warnings (emulator)
- [ ] Record `heap_bytes_free` from the start-up log in docs/BUDGET.md (emulator)
- [ ] Install; the watch shows CONNECTING, then NO SITES YET, with no phone sites (emulator)
- [ ] Phone companion: add a site, prepare, review, send; the tile arrives with the expected site name and metadata (emulator)
- [ ] Capture `docs/screenshots/emery-satellite.png`, `-tin.png`, `-slope.png`, `-profile.png` at 200×228 and inspect each: legibility, labels, no overlap (emulator)
- [ ] Buttons via `pebble emu-button click select|up|down`: SELECT cycles 4 views; UP/DOWN rotates the TIN in 45° steps; UP/DOWN switches sites elsewhere (emulator)
- [ ] Exaggeration change in the phone settings updates the TIN label and shape without a re-transfer (emulator)
- [ ] Missing imagery, missing elevation, STALE and CACHED states, each captured (use the fixture sites) (emulator)
- [ ] Interrupted transfer (kill the phone app mid-transfer): TRANSFER INCOMPLETE, previous tile kept, SELECT retries (emulator)
- [ ] Phone unreachable at launch: PHONE UNREACHABLE with the last site name (emulator)
- [ ] Measure TIN redraw time per rotation step with `APP_LOG` timestamps (emulator)

## Physical watch (record separately)

- [ ] Pebble Time 2 hardware: all four views legible outdoors in sunlight
- [ ] Transfer over real Bluetooth, including walking out of range mid-transfer
- [ ] Location permission prompt, and "Use this phone's location" in the settings web view on iOS and Android
- [ ] Phone offline (airplane mode): the cached site still loads; refresh shows the no-network message
- [ ] TIN rotation feels responsive (target < 150 ms per step)

## Before publishing

- [ ] Confirm the Sentinel data legal notice wording ("Contains modified Copernicus Sentinel data [year]") at the URL linked from the scene metadata
- [ ] Confirm Sentinel-2 latitude coverage and the SCL class definitions from ESA documentation
- [ ] Move to its own repository (CloudPebble imports one project per repository) and link it from the pebble-time index
