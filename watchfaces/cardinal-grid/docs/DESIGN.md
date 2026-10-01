# Cardinal Grid: design notes

## 1. What Pebble Time 2 can measure

From the Pebble developer documentation (hardware comparison table and CompassService reference):

| | Emery (Pebble Time 2) |
| --- | --- |
| Display | 200 x 228, 64 colours |
| Sensors | 6-axis IMU, **compass** |
| Heading API | `compass_service_*` (`CompassHeadingData`) |
| Accelerometer API | `accel_data_service_*`, `accel_tap_service_*` |

So the original premise, that PT2 might have no magnetometer, does not hold: it has one and the SDK
exposes a heading. The design is honest about what that heading is:

* `magnetic_heading` is **magnetic**, not true north. `true_heading` is documented as currently
  equal to it and `is_declination_valid` as always false, so no declination correction is applied or
  claimed. The label says `MAG`.
* The heading is only trustworthy when `compass_status` is `Calibrated`. `Calibrating` means valid
  but still refining (label `CAL`, north axis dashed); `DataInvalid` means the data must not be used
  (label `CAL --`, the dial does not move).
* The accelerometer **cannot** give heading. Rotating about the gravity axis (a flat wrist turning
  like a compass) changes no accelerometer axis. It is used for what it can measure: tilt (the level
  bubble), tap (the reference gesture) and a per-batch settle tick.
* Heading is shown quantised to the 5 degree grid step. Nothing finer is displayed.

Heading convention: `magnetic_heading` increases **counter-clockwise** from north. Equivalently, it
is the clockwise angle at which north appears from 12 o'clock, so it drives the dial rotation
directly. If hardware turns out to report a clockwise bearing, set `CG_HEADING_IS_CLOCKWISE 1`
in `src/c/cg_config.h`.

Phone-derived heading (PebbleKit) was not needed and is not used. It could be added later as an
alternative `orient_feed_heading()` source without touching anything else.

## 2. Coordinate spaces

| Space | Contents | Behaviour |
| --- | --- | --- |
| Screen | time, status text | never rotated; own layer (0..40 px) |
| World / instrument | rings, radials, ticks, cardinals, terrain | north-fixed; seen through the snapped dial index |
| Watch-fixed | heading pointer, centre marker, bubble | drawn in screen orientation, does not turn with the world |

The framebuffer is never rotated. Every world point is placed individually: grid features by table
lookup (bearing index + dial index, no trigonometry), terrain by a Q15 rotation of 26 cached
vertices. Because the snap step equals the grid step (5 degrees, 72 directions), a dial move is an
index shift.

## 3. Architecture

```
compass ─┐                                      ┌─ grid/          (ticks, radials, cardinals)
accel ───┼─> orientation/ ─> snapped dial ─> redraw gate ─> rendering/ ─┤
tap ─────┘   filter, dead zone, snap,                          └─ map_geometry/ (cached projection)
             bubble, reference                  time/ ─> status layer
```

* `orientation/`: pure integer C, stdint only. Circular low-pass on heading (3/8 gain, immediate
  follow above 10 degrees), snap to 72 positions with 2.5 degree hysteresis, accel low-pass
  (1/4 gain) with a Schmitt-trigger dead zone and 2 px quantised bubble, reference set/clear.
* `map_geometry/`: 26-vertex, 39-triangle TIN in flash (`tools/gen_terrain.py`, seeded). The sea-level
  coastline is contoured from the TIN once at startup (marching triangles, integer math), so it is
  consistent with the surface. Projection is cached per dial index.
* `rendering/`: stateless drawing plus `redraw_gate` (first change draws immediately, later ones in
  the same 250 ms window coalesce into one deferred redraw).
* Two layers: the status layer (time + orientation text) and the instrument layer. A minute tick
  redraws only the former; an orientation change only the latter.

## 4. Motion behaviour and battery

* Nothing animates. The screen changes only when a snapped quantity changes.
* Compass events are requested at 2 degree granularity (`compass_service_set_heading_filter`).
* Accelerometer: 10 Hz in batches of 5, so 2 callbacks per second. Samples taken while the watch
  vibrated are discarded.
* Redraws are limited to one per 250 ms; reference feedback bypasses the limit.
* No dynamic allocation, no floating point in the firmware paths.

Measured on the host simulation (`make -C test/host test`):

| Scenario | Result |
| --- | --- |
| 30 s of steady wrist tremor, +/-3 degrees every 100 ms | 0 instrument redraws |
| Same noise on a cell boundary, naive rounding vs this filter | 241 dial changes vs 1 |
| A full brisk turn (180 compass events, 18 s) | 71 instrument redraws, 71 terrain projections |
| Minute tick | status layer only |

Battery drain on real hardware has **not** been measured. The always-on compass subscription is the
main cost; if it is too high, the place to reduce it is `CG_COMPASS_FILTER_DEG` or unsubscribing
after a period without movement.

## 5. Interaction: why a tap and not SELECT

Pebble reserves SELECT (and UP/DOWN) for the system on watchfaces, so a watchface cannot bind
"SELECT = set reference". Cardinal Grid uses the accelerometer tap instead. If you prefer the button,
build as a watchapp (`"watchface": false` in `package.json`, `CG_WATCHAPP=1 pebble build`) and SELECT
performs the same action. Both paths were compile-checked on the host only.

## 6. What is and is not verified

Verified here (host, mock SDK, 2110 checks, AddressSanitizer and UBSan clean, `-Wall -Wextra
-Wpedantic -Wshadow -Werror`):

* orientation maths: convention, wraparound at north, dead zone, hysteresis, tremor rejection, bubble
  signs, reference set/clear/re-zero, persistence round trip
* TIN contouring agrees with the generator (13 coastline segments), rotation invariants, cache
  behaviour, geometry stays inside the ring at all 72 dial positions
* end-to-end event simulation of the real glue file: labels, throttling, layer isolation, tap flow
* pixels: the amber north axis moves with the world while the white pointer stays fixed

**Not verified, because the Pebble SDK could not be downloaded in the environment where this was
written (sdk.repebble.com returned 403):**

* compilation against the real Pebble SDK headers and toolchain (the mock encodes my reading of the
  API; signatures such as `time_ms`, `app_timer_cancel`, `accel_service_set_sampling_rate` and
  `compass_service_set_heading_filter` should be confirmed by `pebble build`)
* the emulator, real fonts and text placement, real 64-colour rendering and antialiasing
* actual compass and accelerometer behaviour on hardware, and battery life

## 7. First-run checklist (emulator, then watch)

1. `pebble build` succeeds for emery with no warnings.
2. Emulator: with compass events, the N label follows the expected side (turn the watch clockwise
   and north should move counter-clockwise on screen). If reversed, flip `CG_HEADING_IS_CLOCKWISE`.
3. Emulator accel: tilt so the 12 o'clock edge is raised; the bubble should move toward 12. If
   reversed, flip the sign in `CG_ACCEL_X_SIGN` / `CG_ACCEL_Y_SIGN`.
4. `°` renders in the Gothic status font. If it shows as a box, replace `\xC2\xB0` in
   `cardinal_grid.c` with a plain suffix.
5. Text sits well: time not clipped at the top, cardinal letters centred on their ticks.
6. Watch: calibrate the compass (figure eight); status should go `CAL` to `MAG`. Confirm the tap
   gesture is easy to trigger deliberately and rare to trigger by accident; if not, restrict
   `tap_handler` to one axis.
7. Leave the watch on a table for a minute: no redraws (use `CG_DEBUG=1`, the overlay shows the
   redraw counter, raw and filtered accelerometer values, and raw vs estimated heading).
8. Tune in `orientation.h` (`OR_DEFAULT_CONFIG`): snap step (`OR_DEFAULT_SNAP_STEPS`, 72 = 5 degrees; it must equal the
   grid table size, so changing it means regenerating `grid_dirs.h` with `tools/gen_grid_dirs.py`), hysteresis (`snap_hyst`, 455 = 2.5 degrees), level dead zone
   (`tilt_deadzone_mg`, 70 = about 4 degrees).

## 8. Known limits and choices

* Hysteresis means the dial can trail the true heading by up to one 5 degree step when you stop.
  That is by design and smaller than typical wrist compass error.
* The lit terrain facets and the ridge line are decoration derived from a made-up surface, not data.
  The terrain is not a real place.
* Only Emery is targeted. Other colour platforms would need their own layout constants.
* No battery or Bluetooth indicators: the brief asked for minimal status information.
