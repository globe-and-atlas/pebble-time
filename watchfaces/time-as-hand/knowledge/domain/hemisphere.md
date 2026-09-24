---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Meridian — Hemisphere

Third edition selected from concept 06. Two upright numbered hands over a north-up orthographic globe, subdued gray land, dotted night shading, thin graticule and teal center ring when a location is set. Existing type/hand/date controls apply. No weather or satellite imagery.

Sunlight uses UTC year, day of year and minute via NOAA's fractional-year declination/equation-of-time approximation. Day/night is the geometric solar horizon; atmospheric refraction, terrain and twilight are not modeled. DST affects the displayed civil clock through the watch OS, never the solar input. The phone must keep the watch time/time zone correct.

Location changes the camera center, not the clock's time zone. Default is an explicitly unset world view at 0°N 0°E. Manual presets: London, Chicago, Tokyo, Sydney; custom latitude/longitude also supported. Phone location is optional, rounded to 0.1°, refreshed on launch, settings Save and hourly. Coordinates stay in phone/watch storage. On lookup failure the saved view remains; the native watch keeps calculating sunlight offline. Browser location uses a one-time opt-in button and separate browser storage.

Browser time/date controls use the browser's time zone. Spring gaps normalize forward; an ambiguous autumn manual time selects the earlier occurrence. Live mode uses the actual UTC instant, including the second occurrence. No manual DST offset toggle is required.

Data: [Natural Earth 5.1.2 110m land](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2), public domain. Cached source and SHA-256: data/land-source.json. execution/generate_land.py produces an 8,100-byte 360×180 bitmask. Projection cache is 11,400 bytes and refreshes only when center coordinates change. No pre-rendered rotations or network imagery. A 45,600-byte display buffer is allocated on the heap to stay within Pebble's 65,535-byte static virtual-size limit.

Sources: [NOAA solar equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF), [Pebble UTC/local time semantics](https://developer.rebble.io/docs/c/Standard_C/Time/), [PebbleKit JS location](https://developer.rebble.io/guides/communication/using-pebblekit-js/).

Native pitfall: linked atan2f returned invalid longitudes in the relocatable Pebble build despite correct host output. A range-reduced polynomial replaces it; finite/index guards remain. Do not accept host-only math tests. Battery and physical phone permission behavior need a paired-watch trial.

## 2026-09-23 — Numeral halo and graticule
Numbers on the globe are cleared by a glyph-shaped halo, not a rectangle: globe pixels within r = numeral scale (3 hour, 2 minute; disc rule dx²+dy²<=r²+1) of any stroke are left white (`halo_near` in globe.inc). The rectangular hand clearance in render_split (2 px margin) is unchanged, so Original/Two Hands output is byte-identical. Hands and ink are never overpainted by the globe. Radius 1 looked thin over the night hatch; radius 2 left speckles in the counters of the 3× numerals, hence scale-based. The graticule is dotted gray over sea and white over land (it previously vanished on land, being the same gray). Host test: verify_hemisphere.py derives the halo independently and also requires globe pixels inside a label box but outside the halo (so it can't regress to a solid block). Screenshots in assets/store/meridian/ were refreshed from the native captures.
