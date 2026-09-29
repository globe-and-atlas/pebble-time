---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-24T12:30:55.333289+00:00"
---
# Decisions

## Initial Decision

- Template profile: `dashboard-static`
- Deploy target: `local-only`
- Runtime: `static`

## 2026-09-29: Facet Atlas

- New app, not merged into Overpass Watch or Constellation Watch. It should live in its own repository (`globe-and-atlas/facet-atlas`); creating it failed with 403 (the session lacked org admin), so it is staged in `watchapps/facet-atlas/`.
- Data: Copernicus DEM GLO-30 (per-tile acquisition dates and datums) and Sentinel-2 L2A COGs (per-scene date), both anonymous AWS Open Data. Tile preparation runs in PebbleKit JS because the DEM bucket sends no CORS headers.
- Mesh: RTIN with the smallest tolerance that fits 255 vertices / 480 triangles; tolerance shown on the watch.
- Tiles live on the phone (the watch persists only the last name, index and view); two 16 KB buffers on the watch so a bad transfer never replaces a good tile.
