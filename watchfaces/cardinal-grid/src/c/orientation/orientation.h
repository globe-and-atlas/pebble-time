#pragma once
/*
 * orientation/  -  reusable heading + tilt conditioning. No drawing, no Pebble types.
 *
 * This module turns raw, jittery sensor samples into a small set of *stable*
 * quantities a watch face can draw without flicker:
 *
 *   dial index    the world-frame rotation, snapped to CONFIG.snap_steps positions per
 *                 turn, with a hysteresis dead zone so sensor noise at a cell boundary
 *                 cannot toggle the display.
 *   bubble        the projection of gravity into the display plane, dead-zoned and
 *                 quantised to whole pixels (a bubble level).
 *   reference     an optional user-set heading. In RELATIVE mode the dial is measured
 *                 from it instead of from magnetic north.
 *
 * Nothing here knows about the screen, so another face (e.g. Gravity Watershed) can
 * link orientation.c unchanged and call only the parts it needs.
 *
 * Angle units are Pebble trig units: 65536 = one full turn.
 *
 * Conventions (match the Pebble SDK; verify on hardware, see docs/DESIGN.md):
 *   heading      CompassHeadingData.magnetic_heading. It INCREASES COUNTER-CLOCKWISE
 *                from magnetic north, i.e. it is the angle the watch has been turned
 *                counter-clockwise from north. Equivalently, north appears on the dial
 *                clockwise from 12 o'clock by exactly this angle, so the value can be
 *                used directly as the clockwise rotation of a north-fixed drawing.
 *   accel        device frame in milli-g: x toward 3 o'clock, y toward 12 o'clock,
 *                z out of the display. The reading points toward gravity, so a watch
 *                lying flat and face up reads z = -1000.
 */
#include <stdint.h>
#include <stdbool.h>

#define OR_ANGLE_FULL 65536u

typedef enum {
  OR_COMPASS_UNAVAILABLE = 0, /* no magnetometer service */
  OR_COMPASS_INVALID,         /* calibrating, data must not be used */
  OR_COMPASS_CALIBRATING,     /* data valid, still being refined */
  OR_COMPASS_CALIBRATED       /* data valid and calibrated */
} OrCompassState;

typedef enum {
  OR_MODE_MAGNETIC = 0, /* dial measured from magnetic north */
  OR_MODE_RELATIVE      /* dial measured from a user-set reference heading */
} OrMode;

typedef enum {
  OR_REF_EVENT_NONE = 0,
  OR_REF_EVENT_SET,
  OR_REF_EVENT_CLEARED
} OrRefEvent;

typedef struct {
  uint16_t snap_steps;         /* dial positions per turn. 72 = 5 degree increments */
  uint16_t snap_hyst;          /* extra angle, beyond half a step, before the dial moves */
  uint8_t  heading_alpha_x8;   /* heading low-pass gain in eighths (3 => 3/8 per update) */
  uint8_t  accel_shift;        /* accel low-pass: gain = 1 / 2^shift per sample batch */
  int16_t  tilt_deadzone_mg;   /* in-plane gravity below this reads as level */
  int16_t  tilt_full_scale_mg; /* in-plane gravity that drives the bubble to its rim */
  uint8_t  bubble_max_px;      /* bubble travel at full scale */
  uint8_t  bubble_step_px;     /* bubble moves in whole multiples of this */
  uint16_t ref_clear_window_ms;/* a 2nd tap inside this window clears the reference */
} OrConfig;

/* 5 degree snap, 2.5 degree hysteresis, ~4 degree level dead zone. */
#define OR_DEFAULT_SNAP_STEPS 72u
#define OR_DEFAULT_CONFIG { OR_DEFAULT_SNAP_STEPS, 455u, 3u, 2u, 70, 500, 12u, 2u, 1500u }

typedef struct {
  OrConfig cfg;

  /* heading */
  bool           have_heading;
  uint16_t       heading_target; /* latest raw sample */
  uint16_t       heading_est;    /* low-passed estimate */
  OrCompassState compass;

  /* reference / mode */
  OrMode     mode;
  uint16_t   ref;
  uint32_t   ref_event_ms;
  OrRefEvent ref_event;

  /* snapped dial */
  bool     dial_valid;
  uint16_t dial_idx;

  /* tilt (filtered accel is kept in 1/16 mg) */
  bool    have_accel;
  int32_t gx16, gy16, gz16;
  int8_t  bubble_x, bubble_y; /* screen pixels, +x right, +y down */
} Orientation;

void orient_init(Orientation *o, const OrConfig *cfg);

/* Feed one compass sample. Returns true when anything drawable changed
 * (dial index or compass state). Invalid/unavailable samples never move the dial. */
bool orient_feed_heading(Orientation *o, uint16_t heading, OrCompassState state);

/* Feed one accel sample (already averaged over a batch is fine). Returns true when
 * the bubble moved. */
bool orient_feed_accel(Orientation *o, int16_t x_mg, int16_t y_mg, int16_t z_mg);

/* Relax the heading estimate toward the latest sample. Call at a slow, steady rate
 * (the accel batch callback is ideal) so the estimate settles when the compass stops
 * emitting events. Returns true if the dial index changed. */
bool orient_tick(Orientation *o);

/* Wrist tap / button: set the reference, or clear it if this is a quick second tap.
 * Returns false if there is no heading yet. */
bool orient_tap(Orientation *o, uint32_t now_ms);

/* Restore a persisted reference. Marks RELATIVE mode. */
void orient_restore(Orientation *o, OrMode mode, uint16_t ref);

/* --- read side ------------------------------------------------------------ */
static inline uint16_t orient_dial_index(const Orientation *o) { return o->dial_idx; }
uint16_t orient_dial_angle(const Orientation *o);  /* snapped clockwise rotation, angle units */
/* Bearing in whole degrees the top of the watch points at, quantised to the snap step
 * (from magnetic north, or from the reference in RELATIVE mode). -1 if no valid heading. */
int  orient_label_deg(const Orientation *o);
/* Where in a full turn the dial index sits, as clockwise degrees x10 (for debug). */
int  orient_heading_deg_x10(const Orientation *o);
