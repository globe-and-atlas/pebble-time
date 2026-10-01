#pragma once
/*
 * grid/  -  the cardinal grid in WORLD space.
 *
 * The world is north-fixed. Bearings are measured clockwise from north in GRID_DIRS
 * steps of 5 degrees; the dial index from orientation/ says how far the whole world is
 * turned on screen. Because the snap step equals the table step, placing anything on
 * the grid is one table lookup with an index offset: no trigonometry in the draw path.
 *
 * Coordinates handed back are instrument-space pixels (x right, y down).
 */
#include <stdint.h>

/* Must match tools/gen_grid_dirs.py (the table itself is private to grid.c). */
#define GRID_DIRS 72

typedef struct {
  int16_t x, y;
} GridPt;

/* Screen direction index for a world bearing index seen through a dial index. */
static inline uint8_t grid_screen_dir(int bearing_idx, int dial_idx) {
  return (uint8_t)((bearing_idx + dial_idx) % GRID_DIRS);
}

/* Point at radius r (pixels) in a screen direction, relative to (cx, cy). */
GridPt grid_point(int cx, int cy, int r, uint8_t screen_dir);

/* Rotation for the terrain: returns Q15 sin/cos for a dial index. */
void grid_rotation(int dial_idx, int32_t *sin_q15, int32_t *cos_q15);

/* Tick classification for bearing index k (0..71):
 *   0 = minor (5 deg), 1 = mid (15 deg), 2 = major (45 deg), 3 = cardinal (90 deg). */
int grid_tick_class(int k);

/* Radius of ring i (1..rings) for an outer radius. */
int grid_ring_radius(int i, int rings, int outer);
