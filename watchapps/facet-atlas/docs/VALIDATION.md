# Validation contract

Written from the project brief before implementation, then tracked as evidence came in. The task is complete only when every assertion passes. Status as of 2026-09-29:

**PASS** = verified, with the evidence named. **HOST** = verified on the host only; the same code runs on the watch, but the watch has not run it. **OPEN** = not yet verified.

| # | Assertion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A clean Pebble Time 2 production build succeeds | **OPEN** | Blocked: `sdk.repebble.com` denied by the build environment's network policy. Core C compiles warning-free under `-std=c99 -Wall -Wextra -Werror -Os` on the host, and `main.c` compiles against a stub header; neither replaces `pebble build` |
| 2 | The phone companion can select a location and prepare one bounded terrain tile | **HOST** | `tools/prepare_tile.js` on real Copernicus and Sentinel-2 data (Half Dome, 14,306 B ≤ 16,384 B); companion flow tests (prepare → review → send); settings page run in an isolated VM context. Not yet run inside the Pebble phone app |
| 3 | A complete transfer produces a watch tile with the expected site id and metadata | **HOST** | `test/c/test_main.c` reassembles fixture tiles in 1 B to 1,984 B chunks and checks the site id, name and flags; `transfer.test.js` checks byte-exact delivery |
| 4 | A partial or malformed transfer is rejected without rendering corrupt geometry | **HOST** | C tests: every truncation rejected; out-of-order, overrun, wrong-site, CRC, degenerate, inverted, out-of-range and bad-breakline cases rejected; 11 K single-byte mutations with recomputed CRC never yield out-of-range geometry (ASan/UBSan clean). The previous tile is kept by design (two buffers) |
| 5 | The TIN contains no degenerate triangles | **PASS** | Generator: `terrain.test.js` (area, winding, coverage = full square, no T-junctions, no duplicates, on plane, valley, ridge, cliff, sinusoid and random terrain). Watch: `fa_tile_parse` rejects any zero-area or inverted triangle |
| 6 | The synthetic plane produces the expected profile and slope within a documented tolerance | **PASS** | Slope 12.604° ± 0.01° at every node (Horn is exact on a plane); W–E profile 300 → 700 m, linear within ± 0.5 m (int16 metre quantisation) |
| 7 | The synthetic valley renders as a valley, not a ridge or a flat surface | **HOST** | Profile minimum at the centre with rims more than 400 m higher. Renderer: the valley floor projects below the rim, its sun-facing east wall is brighter than its west wall, and all three reverse for the ridge fixture. A flipped-sun mutation makes the test fail |
| 8 | Satellite imagery date and elevation provenance are shown separately | **HOST** | Satellite view footer: imagery source and date. TIN, Slope and Profile: DEM acquisition span and datum. Phone preview: separate "Satellite imagery" and "Elevation" tables. Checked in host previews and tests |
| 9 | The mesh screen identifies simplification and shows the actual exaggeration setting | **HOST** | Title "SIMPLIFIED TIN"; footer `RTIN <tol> <v>v <t>t` and `VERT EXAG n.nx` taken from the value used to draw; the C test checks the label at 1.0×, 2.0× and 3.0× |
| 10 | Missing imagery, missing elevation, stale cache and offline use each have an honest visible state | **HOST** | NO SATELLITE IMAGE / NO TERRAIN MESH / NO ELEVATION DATA with reasons; STALE badge after 30 days; CACHED badge when the phone has no network; PHONE UNREACHABLE; TRANSFER INCOMPLETE. Host previews and companion tests. Emulator captures open |
| 11 | All four views captured from the real Pebble emulator at 200×228 and visually inspected | **OPEN** | Blocked by #1. Host previews (`make previews`) were inspected and fixed for overflow and overlap; they are not emulator captures |
| 12 | The watch cycles views and rotates the mesh with physical-style button events in the emulator | **OPEN** | Blocked by #1 |
| 13 | Tests, lint, type checks and release preflight pass with the documented commands | **PARTIAL** | `make check` passes (tests, lint, type checks, preflight). `tools/preflight.js --release` fails, as designed, until #1, #11 and #12 are done |
| 14 | No credentials, private location fixtures, generated build outputs or temporary test data are committed | **PASS** | `.gitignore` covers build, .pbw, .fat and node_modules; preflight scans tracked files for forbidden paths, key patterns and coordinates not on the public allow-list; fixtures are synthetic at 0,0 |

## Tolerances

| Quantity | Tolerance | Reason |
| --- | --- | --- |
| Plane slope | ± 0.01° | float rounding; Horn's method is exact for planes |
| Profile height | ± 0.5 m | tile stores whole metres |
| TIN height at grid nodes | ≤ stated RTIN tolerance | construction guarantee, checked at every node |
| Slope class boundaries | exact at 10° and 30° | classes are half-open: [0, 10), [10, 30), [30, 90] |
