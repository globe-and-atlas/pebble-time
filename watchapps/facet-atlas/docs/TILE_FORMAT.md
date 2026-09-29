# Tile format FAT1

One tile carries everything the watch shows for a site. It is little-endian and at most 16,384 bytes. The encoder is `src/pkjs/lib/tile.js`; the watch validator is `src/c/fa_tile.c`. Both must reject the same things, and `tools/preflight.js` checks that their limits match.

## Header (16 bytes)

| Offset | Type | Field |
| --- | --- | --- |
| 0 | char[4] | `FAT1` |
| 4 | u8 | version = 1 |
| 5 | u8 | flags (below) |
| 6 | u16 | section count |
| 8 | u32 | site id |
| 12 | u32 | total length including the CRC |

Sections follow: `u8 type, u8 0, u16 length, payload`. Each type appears at most once, in any order. The tile ends with a `u32` CRC-32 (IEEE) of every preceding byte.

Flags: 1 `HAS_IMAGE`, 2 `HAS_ELEV` (complete grid, mesh present), 4 `ELEV_PARTIAL` (gaps; no mesh), 8 `HAS_BREAKLINES`, 16 `IMAGE_PARTIAL` (> 1 % of pixels missing), 32 `IMAGE_CLOUDY`. Flags must agree with the sections present.

## Sections

| Type | Name | Payload |
| --- | --- | --- |
| 1 | META | repeated `u8 key, u8 len, ASCII[len]` (printable, ≤ 31). Keys: 1 name, 2 elevation source, 3 elevation date, 4 horizontal ref, 5 vertical ref, 6 elevation resolution, 7 simplification, 8 imagery source, 9 imagery date, 10 imagery note, 11 elevation note, 12 breaklines. Absent = shown as UNKNOWN |
| 2 | GEO (30 B) | `i32 lat·1e5, i32 lon·1e5, u16 aoi_m, u16 image_m, u32 prepared_unix, i16 z_min, i16 z_max, u8 grid_n, u8 exag×10, i16 A.x, A.y, B.x, B.y` (A/B in quarter grid cells from the NW corner) |
| 3 | MESH | `u16 nv, u16 nt, nv × {u8 gx, u8 gy, i16 z_m}, nt × {u8 a, b, c}` |
| 4 | BREAK | `u8 npoly, npoly × {u8 count, count × u8 vertex}`: every consecutive pair must be a mesh edge |
| 5 | SLOPE | `u8 n, ⌈n²/4⌉ bytes`: 2 bits per cell, row-major from the NW, 0 nodata, 1 gentle, 2 moderate, 3 steep |
| 6 | PROFILE | `u8 count, u32 length_m, count × i16 z_m` (−32768 = no data) |
| 7 | IMAGE | `u8 w, u8 h, 16 × GColor8 palette, ⌈w·h/2⌉ bytes`: 4 bits per pixel, high nibble first; index 0 = no imagery |

## Validation (watch)

A tile is drawn only if all of these hold. Otherwise the previous tile stays and the watch shows the reason:

- length matches the header; CRC matches; version 1; no unknown, duplicate, overlapping or trailing sections
- counts within limits (255 vertices, 480 triangles, 65 × 65 grid, 64 profile samples, 144 × 144 image)
- every vertex inside the grid; every triangle index in range
- every triangle non-degenerate and counter-clockwise with north up (negative cross product in grid coordinates, whose y axis points south)
- breaklines run along mesh edges
- flags agree with sections; slope grid size equals the GEO grid size

Grid coordinates are `u8` and heights are `i16` metres, so projection arithmetic cannot overflow. The renderer works in floats on at most 255 vertices.
