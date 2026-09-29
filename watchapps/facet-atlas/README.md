# Facet Atlas

A Pebble Time 2 watchapp and phone companion for exploring the shape of a chosen place. One saved site, four views of the same terrain tile:

1. **Satellite**: Sentinel-2 true-colour image as a north-up map, with the area of interest (yellow), centre marker and profile endpoints A and B.
2. **Simplified TIN**: an oblique, shaded triangulated surface you rotate in 45° steps, labelled with its simplification and the vertical exaggeration in use.
3. **Slope**: an overhead slope map derived from elevation, in three classes (gentle < 10°, moderate 10–30°, steep ≥ 30°).
4. **Profile**: the elevation cross-section from A to B, with distance and elevation axes.

Facet Atlas is an educational field instrument, not a survey tool. It keeps three things apart everywhere:

| | What it is | Where it comes from |
| --- | --- | --- |
| **Measured source data** | Elevation samples; satellite image pixels | Copernicus DEM GLO-30; Sentinel-2 L2A |
| **Derived terrain** | Resampled grid, slope classes, A–B profile, simplified TIN | Computed on the phone, deterministically, from the elevation source |
| **Illustrative rendering** | Shading, oblique projection, vertical exaggeration, colour reduction | Computed on the watch |

Nothing on the watch is a live measurement.

> **Status (2026-09-29): not yet built with the Pebble SDK, not yet run in the emulator.** All host-side checks pass (tests, lint, type checks, consistency preflight). The build environment used so far could not reach the Pebble SDK server, so the production build, emulator captures and button tests are still open. See [RELEASE.md](RELEASE.md) and [docs/VALIDATION.md](docs/VALIDATION.md).

## Controls

| Button | Satellite, Slope, Profile | TIN view | Error / offline screens |
| --- | --- | --- | --- |
| SELECT | next view | next view | retry |
| UP / DOWN | previous / next saved site | rotate the view 45° | |
| BACK | exit | exit | exit |

Profile endpoints, vertical exaggeration (1.0×, 1.5×, 2.0×, 3.0×; default 1.0×) and the site list are set in the phone companion: in the Pebble app, open Facet Atlas settings.

## Using the phone companion

1. Read the data notice and accept it (shown once; reopen it with "What leaves this phone?").
2. **Add a site**: type coordinates (`latitude, longitude`) or tap *Use this phone's location*, choose an area (1, 2 or 4 km square), choose profile endpoints (a preset line through the centre, or custom coordinates), and choose vertical exaggeration.
3. **Prepare preview**: the phone downloads elevation and imagery and builds the tile. Nothing goes to the watch yet.
4. **Review**: the preview shows the satellite map with the area and A–B line, the profile, and separate provenance tables for imagery and elevation, including anything missing, partial, cloudy or stale. Tap the map twice to draw new endpoints A then B, then *Re-prepare*.
5. **Send to watch**. Sites you have sent appear on the watch; UP/DOWN switches between them.
6. **Refresh** looks for newer imagery. **Remove** deletes the site and its cached tile. **Export tile** shows the tile (base64) with its provenance.

Up to 6 sites are kept. Prepared tiles are cached on the phone and work offline: without a network the phone keeps serving the cached tile, and the watch labels it **CACHED**. A tile prepared more than 30 days ago is labelled **STALE**.

## Data sources and provenance

Full details, including how each fact was verified: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

- **Elevation: Copernicus DEM GLO-30** (AWS Open Data, `s3://copernicus-dem-30m`). 1 arc-second (~30 m) *surface* model: it includes trees and buildings. It is built from TanDEM-X acquisitions; each tile's own metadata gives the acquisition span (for example 2011-06..2014-08). Horizontal WGS84-G1150; heights relative to EGM2008 (EPSG:3855). There are no breaklines in the source, so Facet Atlas shows "BREAKLINES: NONE IN SOURCE" and does not invent ridges or streams. A few countries are not in the public 30 m release, and oceans have no tiles; both show as "NO ELEVATION".
- **Imagery: Sentinel-2 L2A** (AWS Open Data, `s3://sentinel-cogs`, maintained by Element 84), true-colour (TCI) at 10 m. The phone takes the most recent scene in the last 6 months that covers the map with at most 10% cloud over the area of interest, using the scene classification layer. Otherwise it uses the least-cloudy scene it checked and labels it cloudy. The acquisition date shown is that scene's date. It is never the terrain date.

Attribution, as required by the Copernicus WorldDEM-30 licence (Art. 6):

> Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30.

> Contains modified Copernicus Sentinel data (year of each scene shown in the app).

Facet Atlas is not endorsed by ESA, the European Union, Airbus or Element 84.

## How a tile is made

All on the phone, in [`src/pkjs/lib`](src/pkjs/lib), and reproducible from the command line with `node tools/prepare_tile.js`:

1. **Grid**: 65 × 65 elevation samples over the area, by bilinear interpolation of the DEM at the coarsest overview no coarser than the grid spacing (31 m for 2 km). This is a light resampling of the source: no smoothing filter is applied.
2. **Slope**: Horn's 3×3 method on that grid, classified gentle, moderate or steep.
3. **Profile**: 64 samples along A–B, taken from the DEM directly, not from the grid.
4. **Simplified TIN**: a right-triangulated irregular network (RTIN; Evans, Kirkpatrick & Townsend 2001, with the error propagation used by Mapbox's Martini). The phone picks the smallest vertical tolerance whose mesh fits the watch budget of 255 vertices and 480 triangles, and labels it on the watch as, for example, `RTIN 47m 252v 468t`. The method is deterministic and crack-free, with no degenerate triangles. Cliffs larger than the tolerance are kept; smaller detail is generalised, and the label states by how much.
5. **Image**: 144 × 144 px over 1.5× the area, reduced to a 16-colour palette of Pebble's 64 colours with Floyd–Steinberg dithering. Palette entry 0 is reserved for "no imagery" and is drawn as a hatch, never as a colour.
6. **Tile**: a checksummed binary tile, at most 16 KB; see [docs/TILE_FORMAT.md](docs/TILE_FORMAT.md). It is sent in chunks of up to 1,984 bytes, and the watch validates it completely before drawing anything. A partial or malformed transfer is rejected, and the previous tile stays on screen.

## Privacy

- Your exact coordinates are never sent to any server.
- To prepare a site, the phone requests public files from two Amazon S3 buckets. The file names and byte ranges reveal the 1° DEM cell and the 100 km Sentinel-2 grid square, i.e. the approximate region, and, as with any web request, your IP address. No account, API key, analytics or other service is involved.
- Stored on the phone (Pebble app storage): site settings, prepared tiles, your acceptance of the data notice, and the last phone location if you asked for it.
- Stored on the watch: the last site name, its index and the last view.
- Phone location is read only when you tap "Use this phone's location".

## Limitations

- The DEM is a *surface* model: forest canopy and buildings raise it. It is not bare earth.
- Terrain dates are the DEM acquisition span (2011–2015), and the land may have changed since.
- At most 480 triangles: rugged terrain gets a tolerance of tens of metres, shown on the TIN screen.
- The grid is 65 × 65. At 4 km (62 m spacing) the slope map smooths short steep pitches compared with the source.
- Sentinel-2 covers land between about 56° S and 84° N. Imagery can be cloudy, hazy or partly missing, and each of these is labelled.
- Vertical accuracy is not modelled or displayed per point.
- Sites near 1° DEM tile edges at the 50°/60°/70°… latitude boundaries, where tile spacing changes, sample the edge pixel nearest the boundary.

## Development

Host-side checks need Node.js ≥ 18, a C compiler and GNU make. Pillow is needed only for previews.

```sh
npm --prefix tools/dev ci      # eslint + typescript, kept out of the Pebble package.json
make test                      # JS tests (node:test) + C core tests with ASan/UBSan
make lint typecheck            # eslint; tsc --checkJs; strict C syntax checks
make preflight                 # C/JS consistency, message keys, repository hygiene
make previews                  # host renders to build/host/previews (NOT emulator captures)
```

Watch build and emulator (Pebble SDK 4.x; `pebble` is the Core Devices pebble-tool):

```sh
uv tool install pebble-tool && pebble sdk install latest
pebble build                                   # -> build/facet-atlas.pbw
pebble install --emulator emery                # Pebble Time 2
pebble screenshot --emulator emery docs/screenshots/emery-satellite.png
node tools/preflight.js --release              # requires the four emulator captures and the .pbw
```

Layout: `src/c/` watch (platform-independent core `fa_tile`, `fa_xfer`, `fa_render` plus Pebble glue in `main.c`); `src/pkjs/` phone (entry `index.js`, settings page `config_page.js`, libraries in `lib/`); `test/` host tests and synthetic fixtures; `tools/` preparation, previews and preflight; `docs/` format, budget, sources and validation.
