#include "render.h"

#include "palette.h"
#include "../cg_config.h"
#include "../grid/grid.h"
#include "../map_geometry/map_geometry.h"

static uint32_t s_instrument_draws;

uint32_t render_instrument_count(void) { return s_instrument_draws; }

/* --- primitives ----------------------------------------------------------- */

static void stroke(GContext *ctx, GColor c, uint8_t w) {
  graphics_context_set_stroke_color(ctx, c);
  graphics_context_set_stroke_width(ctx, w);
}

static GPoint at(MgPt p) { return GPoint(CG_CX + p.x, CG_CY + p.y); }

static GPoint gp(GridPt p) { return GPoint(p.x, p.y); }

/* Dashed line: `on` pixels drawn, `off` pixels skipped, along the line. */
static void dashed_line(GContext *ctx, GPoint a, GPoint b, int on, int off) {
  const int dx = b.x - a.x, dy = b.y - a.y;
  const int adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
  const int len = adx > ady ? adx + ady / 2 : ady + adx / 2; /* ~ Euclidean length */
  if (len == 0) return;
  for (int s = 0; s < len; s += on + off) {
    int e = s + on;
    if (e > len) e = len;
    graphics_draw_line(ctx, GPoint(a.x + dx * s / len, a.y + dy * s / len),
                       GPoint(a.x + dx * e / len, a.y + dy * e / len));
  }
}

/* Scanline triangle fill using horizontal lines. Small, allocation-free, and exact
 * on integer coordinates (no antialiasing seams inside a facet). */
static void fill_triangle(GContext *ctx, GPoint p0, GPoint p1, GPoint p2, GColor colour) {
  GPoint t;
  if (p0.y > p1.y) { t = p0; p0 = p1; p1 = t; }
  if (p1.y > p2.y) { t = p1; p1 = p2; p2 = t; }
  if (p0.y > p1.y) { t = p0; p0 = p1; p1 = t; }
  if (p2.y == p0.y) return;
  stroke(ctx, colour, 1);
  for (int y = p0.y; y <= p2.y; ++y) {
    const int xa = p0.x + (p2.x - p0.x) * (y - p0.y) / (p2.y - p0.y);
    int xb;
    if (y < p1.y) {
      xb = p0.x + (p1.x - p0.x) * (y - p0.y) / (p1.y - p0.y);
    } else if (p2.y == p1.y) {
      xb = p1.x;
    } else {
      xb = p1.x + (p2.x - p1.x) * (y - p1.y) / (p2.y - p1.y);
    }
    graphics_draw_line(ctx, GPoint(xa < xb ? xa : xb, y), GPoint(xa < xb ? xb : xa, y));
  }
}

/* --- terrain (world space, cached projection) ------------------------------ */

static void draw_terrain(GContext *ctx, const InstrumentView *v) {
  int32_t s, c;
  grid_rotation(v->dial_idx, &s, &c);
  const MgProjected *m = mg_project(v->dial_idx, s, c);

  /* Sparse lit facets first, so every line sits on top of them. */
  for (int i = 0; i < MG_NT; ++i) {
    if (!mg_triangle_filled(i)) continue;
    uint8_t a, b, d;
    mg_triangle(i, &a, &b, &d);
    fill_triangle(ctx, at(m->v[a]), at(m->v[b]), at(m->v[d]), CG_FACET);
  }

  stroke(ctx, CG_TIN, 1);
  for (int i = 0; i < MG_NE; ++i) {
    uint8_t a, b;
    mg_edge_ends(i, &a, &b);
    graphics_draw_line(ctx, at(m->v[a]), at(m->v[b]));
  }
}

static void draw_terrain_overlay(GContext *ctx, const InstrumentView *v) {
  int32_t s, c;
  grid_rotation(v->dial_idx, &s, &c);
  const MgProjected *m = mg_project(v->dial_idx, s, c); /* cache hit */

  stroke(ctx, CG_BOUNDARY, 1);
  for (int i = 0; i + 1 < MG_NRIDGE; ++i) {
    dashed_line(ctx, at(m->v[mg_ridge_vertex(i)]), at(m->v[mg_ridge_vertex(i + 1)]), 4, 3);
  }

  stroke(ctx, CG_COAST, 2);
  for (int i = 0; i < m->ncoast; ++i) {
    graphics_draw_line(ctx, at(m->coast[i].a), at(m->coast[i].b));
  }
}

/* --- grid (world space) ---------------------------------------------------- */

static void draw_rings(GContext *ctx, const InstrumentView *v) {
  const GPoint centre = GPoint(CG_CX, CG_CY);
  stroke(ctx, CG_GRID_DIM, 1);
  for (int i = 1; i < CG_RINGS; ++i) {
    graphics_draw_circle(ctx, centre, grid_ring_radius(i, CG_RINGS, CG_R));
  }
  switch (v->flash) {
    case RENDER_FLASH_SET:     stroke(ctx, CG_AMBER, 3); break;
    case RENDER_FLASH_CLEARED: stroke(ctx, CG_COAST, 3); break;
    default:                   stroke(ctx, CG_GRID, 1); break;
  }
  graphics_draw_circle(ctx, centre, CG_R);
}

static void draw_radials(GContext *ctx, const InstrumentView *v) {
  for (int k = 0; k < GRID_DIRS; k += 9) { /* every 45 degrees */
    const uint8_t d = grid_screen_dir(k, v->dial_idx);
    const GPoint a = gp(grid_point(CG_CX, CG_CY, CG_R_CLEAR, d));
    const GPoint b = gp(grid_point(CG_CX, CG_CY, CG_R, d));
    stroke(ctx, CG_GRID_DIM, 1);
    if (k % 18 == 0) {
      if (k != 0) graphics_draw_line(ctx, a, b);
    } else {
      dashed_line(ctx, a, b, 2, 3);
    }
  }
}

/* The north axis is the reference geometry: amber and solid when the heading is
 * trustworthy, amber and dashed while the compass is still calibrating. */
static void draw_north_axis(GContext *ctx, const InstrumentView *v) {
  const uint8_t d = grid_screen_dir(0, v->dial_idx);
  const GPoint a = gp(grid_point(CG_CX, CG_CY, CG_R_CLEAR, d));
  const GPoint b = gp(grid_point(CG_CX, CG_CY, CG_R + 5, d));
  stroke(ctx, CG_AMBER, 1);
  if (v->compass == OR_COMPASS_CALIBRATED || v->mode == OR_MODE_RELATIVE) {
    graphics_draw_line(ctx, a, b);
  } else {
    dashed_line(ctx, a, b, 5, 3);
  }
}

static void draw_ticks(GContext *ctx, const InstrumentView *v) {
  static const uint8_t len_for_class[4] = {2, 3, 5, 5};
  for (int k = 0; k < GRID_DIRS; ++k) {
    const int cls = grid_tick_class(k);
    if (k == 0) continue; /* the north axis already reaches here */
    const uint8_t d = grid_screen_dir(k, v->dial_idx);
    stroke(ctx, cls == 0 ? CG_GRID_DIM : CG_GRID, 1);
    graphics_draw_line(ctx, gp(grid_point(CG_CX, CG_CY, CG_R + 1, d)),
                       gp(grid_point(CG_CX, CG_CY, CG_R + 1 + len_for_class[cls], d)));
  }
}

static void draw_cardinals(GContext *ctx, const InstrumentView *v) {
  static const char *const names[4] = {"N", "E", "S", "W"};
  const GFont font = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  for (int i = 0; i < 4; ++i) {
    const uint8_t d = grid_screen_dir(i * 18, v->dial_idx);
    const GridPt p = grid_point(CG_CX, CG_CY, CG_R_LABEL, d);
    graphics_context_set_text_color(ctx, i == 0 ? CG_AMBER : CG_GRID);
    /* Gothic 14 has ~3 px of leading; centre the capitals on the point. */
    graphics_draw_text(ctx, names[i], font, GRect(p.x - 10, p.y - 8, 20, 16), GTextOverflowModeFill,
                       GTextAlignmentCenter, NULL);
  }
}

/* --- instrument, fixed to the watch (does not turn with the world) --------- */

static void draw_pointer(GContext *ctx, const InstrumentView *v) {
  (void)v;
  /* Lubber pointer: the direction the top of the watch is facing. */
  fill_triangle(ctx, GPoint(CG_CX, CG_CY - CG_R + 1), GPoint(CG_CX - 5, CG_CY - CG_R + 11),
                GPoint(CG_CX + 5, CG_CY - CG_R + 11), CG_POINTER);
}

static void draw_marker(GContext *ctx, const InstrumentView *v) {
  const GPoint c = GPoint(CG_CX, CG_CY);
  stroke(ctx, CG_POINTER, 1);
  graphics_draw_circle(ctx, c, 4);
  graphics_draw_line(ctx, GPoint(c.x - 8, c.y), GPoint(c.x - 6, c.y));
  graphics_draw_line(ctx, GPoint(c.x + 6, c.y), GPoint(c.x + 8, c.y));
  graphics_draw_line(ctx, GPoint(c.x, c.y - 8), GPoint(c.x, c.y - 6));
  graphics_draw_line(ctx, GPoint(c.x, c.y + 6), GPoint(c.x, c.y + 8));
  /* Bubble level: sits in the ring when the watch is level, rides to the high side otherwise. */
  graphics_context_set_fill_color(ctx, CG_POINTER);
  graphics_fill_circle(ctx, GPoint(c.x + v->bubble_x, c.y + v->bubble_y), 2);
}

#ifdef CG_DEBUG
static void draw_debug(GContext *ctx, const InstrumentView *v) {
  if (!v->debug) return;
  graphics_context_set_fill_color(ctx, CG_BG);
  graphics_fill_rect(ctx, GRect(0, CG_INSTR_H - 58, 96, 58), 0, GCornerNone);
  graphics_context_set_text_color(ctx, CG_GRID);
  graphics_draw_text(ctx, v->debug, fonts_get_system_font(FONT_KEY_GOTHIC_14),
                     GRect(0, CG_INSTR_H - 60, 100, 60), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
}
#endif

/* --- entry points ---------------------------------------------------------- */

void render_instrument(GContext *ctx, const InstrumentView *v) {
  ++s_instrument_draws;
  graphics_context_set_fill_color(ctx, CG_BG);
  graphics_fill_rect(ctx, GRect(0, 0, CG_SCREEN_W, CG_INSTR_H), 0, GCornerNone);

  draw_terrain(ctx, v);          /* facets + TIN edges */
  draw_rings(ctx, v);            /* over the terrain, dim enough to read through */
  draw_radials(ctx, v);
  draw_terrain_overlay(ctx, v);  /* ridge boundary + coastline stay legible above the grid */
  draw_north_axis(ctx, v);
  draw_ticks(ctx, v);
  draw_cardinals(ctx, v);
  draw_pointer(ctx, v);
  draw_marker(ctx, v);
#ifdef CG_DEBUG
  draw_debug(ctx, v);
#endif
}

void render_status(GContext *ctx, GRect bounds, const StatusView *v) {
  graphics_context_set_fill_color(ctx, CG_BG);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);
  graphics_context_set_text_color(ctx, v->time_color);
  graphics_draw_text(ctx, v->time, fonts_get_system_font(FONT_KEY_LECO_32_BOLD_NUMBERS),
                     GRect(4, 0, 110, 38), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
  graphics_context_set_text_color(ctx, CG_TEXT_DIM);
  graphics_draw_text(ctx, v->label, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD),
                     GRect(100, 2, bounds.size.w - 106, 16), GTextOverflowModeFill, GTextAlignmentRight, NULL);
  if (v->sub && v->sub[0]) {
    graphics_draw_text(ctx, v->sub, fonts_get_system_font(FONT_KEY_GOTHIC_14),
                       GRect(100, 18, bounds.size.w - 106, 16), GTextOverflowModeFill, GTextAlignmentRight, NULL);
  }
}
