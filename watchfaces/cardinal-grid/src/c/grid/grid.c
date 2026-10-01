#include "grid.h"
#include "grid_dirs.h"

/* Round-to-nearest (r * q) / 32768, well defined for negative values. */
static int mul_q15(int r, int q) {
  const int32_t p = (int32_t)r * q;
  return (int)((p + (p >= 0 ? 16384 : -16384)) / 32768);
}

GridPt grid_point(int cx, int cy, int r, uint8_t screen_dir) {
  const int d = screen_dir % GRID_DIRS;
  /* Screen angle theta is clockwise from 12 o'clock: x = r sin(theta), y = -r cos(theta). */
  return (GridPt){(int16_t)(cx + mul_q15(r, grid_dir_table[d].s)),
                  (int16_t)(cy - mul_q15(r, grid_dir_table[d].c))};
}

void grid_rotation(int dial_idx, int32_t *sin_q15, int32_t *cos_q15) {
  const int d = ((dial_idx % GRID_DIRS) + GRID_DIRS) % GRID_DIRS;
  *sin_q15 = grid_dir_table[d].s;
  *cos_q15 = grid_dir_table[d].c;
}

int grid_tick_class(int k) {
  k %= GRID_DIRS;
  if (k % 18 == 0) return 3;
  if (k % 9 == 0) return 2;
  if (k % 3 == 0) return 1;
  return 0;
}

int grid_ring_radius(int i, int rings, int outer) {
  return (outer * i + rings / 2) / rings;
}
