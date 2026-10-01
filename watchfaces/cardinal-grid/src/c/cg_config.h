#pragma once
/*
 * Cardinal Grid: application-level constants. Sensor conditioning tunables live in
 * orientation/orientation.h (OR_DEFAULT_CONFIG) so they travel with that module.
 *
 * Screen: Pebble Time 2 / Emery, 200 x 228, 64 colours.
 */

/* --- screen layout (screen space) ---------------------------------------- */
#define CG_SCREEN_W 200
#define CG_SCREEN_H 228

/* The status strip (time + orientation label) is its own small layer, so a minute
 * tick never redraws the instrument and an orientation change never redraws the time. */
#define CG_STATUS_H 40
#define CG_INSTR_Y  CG_STATUS_H
#define CG_INSTR_H  (CG_SCREEN_H - CG_STATUS_H)

/* --- instrument geometry (instrument space, layer coordinates) ------------ */
#define CG_CX          (CG_SCREEN_W / 2)
#define CG_CY          (132 - CG_INSTR_Y)  /* screen y = 132 */
#define CG_R           70                  /* outer range ring radius */
#define CG_RINGS       4                   /* rings at R/4, R/2, 3R/4, R */
#define CG_R_LABEL     85                  /* cardinal label centre radius */
#define CG_R_CLEAR     11                  /* radial lines stop this far from the centre */
#define CG_MAP_R       66                  /* terrain never extends beyond this */

/* --- timing --------------------------------------------------------------- */
#define CG_MIN_REDRAW_MS   250   /* instrument redraw throttle */
#define CG_FLASH_MS        1400  /* reference confirmation flash */
#define CG_ACCEL_BATCH     5     /* samples per accel callback ... */
                                 /* ... at 10 Hz => 2 callbacks per second */

/* Compass event dead band. The OS only wakes us when the heading moved this far. */
#define CG_COMPASS_FILTER_DEG 2

/* Persistent storage key for the reference (mode + heading). */
#define CG_PERSIST_REF 1
#define CG_PERSIST_HOUR_MODE 2
#define CG_PERSIST_TIME_COLOR 3

/* Accelerometer axis sign fix-ups, so a single line changes if the emulator/hardware
 * convention differs from orientation.h. Device frame: x right, y toward 12, z out. */
#define CG_ACCEL_X_SIGN  1
#define CG_ACCEL_Y_SIGN  1
#define CG_ACCEL_Z_SIGN  1

/* Set true if a heading of X turns out to be a CLOCKWISE bearing on hardware.
 * Pebble documents magnetic_heading as counter-clockwise from north (default). */
#ifndef CG_HEADING_IS_CLOCKWISE
#define CG_HEADING_IS_CLOCKWISE 0
#endif
