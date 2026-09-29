# Data sources

Facet Atlas uses two public, keyless AWS Open Data buckets, read with HTTP range requests from PebbleKit JS on the phone. PebbleKit JS is used rather than the settings web view because the Copernicus bucket sends no CORS headers.

Every statement below is marked **verified** (checked first-hand on 2026-09-29, with the evidence named) or **unverified** (still to be confirmed; each one also appears in [RELEASE.md](../RELEASE.md)).

## Elevation: Copernicus DEM GLO-30

| Property | Value | Evidence |
| --- | --- | --- |
| Access | `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{N\|S}{lat:02}_00_{E\|W}{lon:03}_00_DEM/…_DEM.tif` | verified: bucket listing, `readme.html` in the bucket |
| Format | Cloud-Optimized GeoTIFF, float32, DEFLATE with floating-point predictor (3), 1024 × 1024 internal tiles, overviews at 1/2, 1/4, 1/8 | verified: `readme.html`; parsed by `src/pkjs/lib/tiff.js` (N47 E011 read back as 478–3237 m) |
| Resolution | 1 arc-second latitude spacing; longitude spacing widens above 50° (1.5×, 2×, 3×, 5×, 10×) | verified: `readme.html` table |
| Georeference | PixelIsPoint; tile name gives the centre of the west-most column. The bucket copy drops the shared south row and east column | verified: `readme.html`; GeoTIFF tags |
| What it measures | Digital *Surface* Model: includes vegetation and buildings | verified: `readme.html`, licence Art. 2 |
| Acquisition dates | Per tile, from TanDEM-X: e.g. N47 E011 `tsxx_startTime` 2011-02-07, `tsxx_stopTime` 2014-08-06 | verified: per-tile XML `Copernicus_DSM_10_…xml` |
| Horizontal datum | WGS84-G1150 | verified: per-tile XML `horizontalDatumCode` |
| Vertical datum | EGM2008 (EPSG:3855) | verified: per-tile XML `gml:VerticalCRS … EPSG::3855` |
| Coverage | Global land. Oceans have no tiles. Some countries are withheld from the public 30 m release | verified: `readme.html` ("limited worldwide coverage … a small subset of tiles covering specific countries are not yet released") |
| Breaklines | None: the product is a grid | verified: product structure (grid only; auxiliary masks EDM/FLM/HEM/WBM, no vector breaklines) |
| Licence | Copernicus WorldDEM-30 licence (`INFO/eula_F.pdf` in every tile folder): free, worldwide, allows reproduction, distribution and modification | verified: the PDF, Art. 4–5 |
| Attribution | Modified data (Art. 6b): "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved". Plus the liability sentence (6c) and no implied endorsement (6d) | verified: the PDF, Art. 6 |

How Facet Atlas uses it: the phone reads the per-tile XML for dates and datums (missing fields become `UNKNOWN`). It picks the coarsest overview that is no coarser than the watch grid spacing, and interpolates bilinearly between pixel centres, crossing into neighbouring 1° tiles where needed. A missing tile gives "NO COP-DEM TILE HERE"; a partly missing area gives gaps (no mesh, hatched slope, broken profile). Oceans are **not** filled with zero, although the bucket readme suggests that is acceptable.

## Imagery: Sentinel-2 L2A (Cloud-Optimized GeoTIFFs)

| Property | Value | Evidence |
| --- | --- | --- |
| Access | `https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/{zone}/{band}/{square}/{yyyy}/{m}/{scene}/` with `TCI.tif`, `SCL.tif`, `{scene}.json` | verified: S3 listing; scene item JSON |
| Discovery | S3 `ListObjectsV2` with delimiter per month (no STAC API needed) | verified: listing returns one prefix per scene |
| Format | TCI: uint8 RGB, 10 m, DEFLATE + horizontal predictor, nodata 0 in all bands; overviews to 1/16 | verified: parsed by `tiff.js` |
| Tile grid | MGRS 100 km squares; each tile is 109.8 km, starting at the square's west edge and 40 m above its north edge, in UTM | verified: item `proj:transform` [10, 0, 600000, 0, −10, 5300040] and `tileGeometry` for 32TPT |
| Acquisition date | Item `properties.datetime`, shown per site | verified: item JSON |
| Cloud | Item `eo:cloud_cover` (whole granule) is used only to skip very cloudy scenes. The on-watch "CLOUD n%" is measured over the area of interest from `SCL.tif` classes 3, 8, 9 and 10 | verified: item JSON fields; SCL class meanings per the Sen2Cor L2A definition (**unverified** here, see below) |
| Coverage / revisit | Land roughly 56° S–84° N; about 5-day revisit | **unverified** in this environment (ESA pages unreachable); in-app latitude limit is 84° |
| Licence / attribution | The item links `https://sentinel.esa.int/documents/247904/690755/Sentinel_Data_Legal_Notice`: free, full and open, requiring "Contains modified Copernicus Sentinel data [year]" | link **verified** in item JSON; notice text **unverified** (host unreachable from the build environment) |

How Facet Atlas uses it: the phone chooses the MGRS square whose Sentinel-2 tile contains the whole map (1.5× the area of interest). It lists the last 6 months of scenes, newest first, and skips any with more than 80% granule cloud. Up to 4 scenes are checked; the first with no gaps and at most 10% cloud over the area wins, otherwise the least-bad one is used and flagged. Pixels are sampled nearest-neighbour from the overview closest to 144 px across the map, after converting local metres → WGS84 → UTM (Krüger series).

## Why these two

| Candidate | Why not used |
| --- | --- |
| AWS Terrain Tiles (Terrarium PNG) | Mixed sources per zoom level with no per-tile date: could not show an honest elevation date |
| USGS 3DEP | US only |
| SRTM | Older (2000), gaps in mountains; Copernicus is newer and globally consistent with per-tile metadata |
| Sentinel-2 cloudless mosaics | Composite of many dates: no single acquisition date to show |
| Commercial basemaps (Esri, Google, Mapbox imagery) | Keys, terms and unclear acquisition dates |

## Verification notes

Bucket files were fetched and parsed from the build environment on 2026-09-29 (Half Dome test tile: DEM N37 W120, acquisition span 2011-06..2014-08; imagery S2B 11SKB 2026-09-22). The registry pages `registry.opendata.aws`, `sentinel.esa.int` and `spacedata.copernicus.eu` were blocked by that environment's network policy, so the claims that depend on them are marked unverified above.
