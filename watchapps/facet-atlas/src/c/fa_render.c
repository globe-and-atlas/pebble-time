#include "fa_render.h"

#include <stdio.h>
#include <string.h>

// ---- Layout (200 x 228) ----
#define TITLE_H 22
#define BODY_Y0 24
#define BODY_Y1 169  // exclusive
#define STRIP_Y 170
#define FOOT1_Y 190
#define FOOT2_Y 208

// Satellite image placement.
#define IMG_X0 28
#define IMG_Y0 24
#define IMG_SIDE 144

// Oblique TIN view: camera 30 degrees above the horizon.
#define SIN_PITCH 0.5f
#define COS_PITCH 0.8660254f
#define VIEW_CX 100.0f
#define VIEW_CY 97.0f
#define VIEW_HW 94.0f
#define VIEW_HH 58.0f

// Sun from the north-west, 45 degrees up (cartographic hillshade default).
#define LIGHT_X (-0.5f)
#define LIGHT_Y (0.5f)
#define LIGHT_Z (0.70710678f)

static const float s_cos8[FA_YAW_STEPS] = {1.f, 0.70710678f, 0.f, -0.70710678f, -1.f, -0.70710678f, 0.f, 0.70710678f};
static const float s_sin8[FA_YAW_STEPS] = {0.f, 0.70710678f, 1.f, 0.70710678f, 0.f, -0.70710678f, -1.f, -0.70710678f};

// Mesh fill ramp (dark olive to white) and matching edge colours one step
// darker, so edges read as structure without hiding the shading.
static const uint8_t s_shade_fill[4] = {FA_RGB(1, 1, 0), FA_RGB(2, 2, 1), FA_RGB(3, 3, 2), FA_RGB(3, 3, 3)};
static const uint8_t s_shade_edge[4] = {FA_RGB(0, 0, 0), FA_RGB(1, 1, 0), FA_RGB(2, 2, 1), FA_RGB(2, 2, 2)};
static const uint8_t s_slope_fill[4] = {FA_DARK_GRAY, FA_RGB(3, 3, 2), FA_RGB(3, 2, 0), FA_RGB(2, 0, 0)};

static float fa_sqrtf(float v) {
  if (v <= 0.f) return 0.f;
  union {
    float f;
    uint32_t i;
  } u = {v};
  u.i = 0x1fbd1df5u + (u.i >> 1);
  float x = u.f;
  for (int k = 0; k < 3; k++) x = 0.5f * (x + v / x);
  return x;
}

static int fa_roundf(float v) { return v >= 0.f ? (int)(v + 0.5f) : -(int)(-v + 0.5f); }

// ---- Raster primitives ----

static inline void put(FaCanvas *c, int x, int y, uint8_t color) {
  if ((unsigned)x < (unsigned)c->w && (unsigned)y < (unsigned)c->h) c->px[y * c->stride + x] = color;
}

void fa_fill_rect(FaCanvas *c, int x, int y, int w, int h, uint8_t color) {
  int x1 = x + w, y1 = y + h;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x1 > c->w) x1 = c->w;
  if (y1 > c->h) y1 = c->h;
  for (int yy = y; yy < y1; yy++) memset(c->px + yy * c->stride + x, color, (size_t)(x1 > x ? x1 - x : 0));
}

static void stroke_rect(FaCanvas *c, int x, int y, int w, int h, uint8_t color) {
  fa_fill_rect(c, x, y, w, 1, color);
  fa_fill_rect(c, x, y + h - 1, w, 1, color);
  fa_fill_rect(c, x, y, 1, h, color);
  fa_fill_rect(c, x + w - 1, y, 1, h, color);
}

void fa_draw_line(FaCanvas *c, int x0, int y0, int x1, int y1, uint8_t color) {
  int dx = x1 > x0 ? x1 - x0 : x0 - x1, sx = x0 < x1 ? 1 : -1;
  int dy = y1 > y0 ? y0 - y1 : y1 - y0, sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  for (int guard = 0; guard < 1024; guard++) {
    put(c, x0, y0, color);
    if (x0 == x1 && y0 == y1) break;
    int e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

static inline int32_t edge_fn(int ax, int ay, int bx, int by, int px, int py) {
  return (int32_t)(bx - ax) * (py - ay) - (int32_t)(by - ay) * (px - ax);
}

// Inclusive edge test: shared edges are covered twice rather than leaving
// seams; the painter's order decides which triangle wins.
void fa_fill_triangle(FaCanvas *c, int x0, int y0, int x1, int y1, int x2, int y2, uint8_t color, int clip_y0,
                      int clip_y1) {
  int32_t area = edge_fn(x0, y0, x1, y1, x2, y2);
  if (area == 0) return;
  if (area < 0) {
    int tx = x1, ty = y1;
    x1 = x2;
    y1 = y2;
    x2 = tx;
    y2 = ty;
  }
  int minx = x0 < x1 ? (x0 < x2 ? x0 : x2) : (x1 < x2 ? x1 : x2);
  int maxx = x0 > x1 ? (x0 > x2 ? x0 : x2) : (x1 > x2 ? x1 : x2);
  int miny = y0 < y1 ? (y0 < y2 ? y0 : y2) : (y1 < y2 ? y1 : y2);
  int maxy = y0 > y1 ? (y0 > y2 ? y0 : y2) : (y1 > y2 ? y1 : y2);
  if (minx < 0) minx = 0;
  if (maxx >= c->w) maxx = c->w - 1;
  if (miny < clip_y0) miny = clip_y0;
  if (maxy >= clip_y1) maxy = clip_y1 - 1;
  for (int y = miny; y <= maxy; y++) {
    uint8_t *row = c->px + y * c->stride;
    for (int x = minx; x <= maxx; x++) {
      if (edge_fn(x0, y0, x1, y1, x, y) >= 0 && edge_fn(x1, y1, x2, y2, x, y) >= 0 &&
          edge_fn(x2, y2, x0, y0, x, y) >= 0) {
        row[x] = color;
      }
    }
  }
}

static void hatch(FaCanvas *c, int x, int y, int w, int h) {
  fa_fill_rect(c, x, y, w, h, FA_BLACK);
  for (int yy = y; yy < y + h; yy++)
    for (int xx = x; xx < x + w; xx++)
      if (((xx + yy) & 3) == 0) put(c, xx, yy, FA_DARK_GRAY);
}

// ---- Text ----

static FaText *text(FaTextList *tl, int x, int y, int w, int h, FaFont font, FaAlign align, uint8_t color,
                    const char *s) {
  if (tl->count >= FA_MAX_TEXT) return NULL;
  FaText *t = &tl->items[tl->count++];
  t->x = (int16_t)x;
  t->y = (int16_t)y;
  t->w = (int16_t)w;
  t->h = (int16_t)h;
  t->font = (uint8_t)font;
  t->align = (uint8_t)align;
  t->color = color;
  t->bg = 0;
  strncpy(t->text, s ? s : "", FA_TEXT_LEN - 1);
  t->text[FA_TEXT_LEN - 1] = '\0';
  return t;
}

static const char *meta_or_unknown(const FaTile *t, int key) { return t->meta[key][0] ? t->meta[key] : "UNKNOWN"; }

// dst = a + b + c + d, truncated to fit (display lines are cut, never overrun).
static void join(char *dst, size_t n, const char *a, const char *b, const char *c, const char *d) {
  size_t k = 0;
  const char *parts[4] = {a, b, c, d};
  for (int i = 0; i < 4; i++)
    for (const char *p = parts[i]; p && *p && k + 1 < n; p++) dst[k++] = *p;
  dst[k] = '\0';
}

// "1.5x" from tenths without printf floats (not available on the watch).
static void fmt_tenths(char *buf, size_t n, int v, const char *suffix) {
  snprintf(buf, n, "%d.%d%s", v / 10, v % 10, suffix);
}

static void fmt_distance(char *buf, size_t n, uint32_t m) {
  if (m < 1000) {
    snprintf(buf, n, "%lu m", (unsigned long)m);
  } else {
    unsigned long hm = (m + 50) / 100;
    snprintf(buf, n, "%lu.%lu km", hm / 10, hm % 10);
  }
}

static void title_bar(FaCanvas *c, FaTextList *tl, const char *title, int page) {
  fa_fill_rect(c, 0, 0, c->w, TITLE_H, FA_BLACK);
  fa_fill_rect(c, 0, TITLE_H, c->w, 1, FA_DARK_GRAY);
  text(tl, 4, -3, 164, TITLE_H + 2, FA_FONT_TITLE, FA_ALIGN_LEFT, FA_WHITE, title);
  if (page < 0) return;
  for (int k = 0; k < FA_VIEW_COUNT; k++) {
    fa_fill_rect(c, 172 + k * 7, 9, 4, 4, k == page ? FA_WHITE : FA_DARK_GRAY);
  }
}

static void site_strip(FaCanvas *c, const FaTile *t, const FaViewState *vs, FaTextList *tl) {
  fa_fill_rect(c, 0, STRIP_Y - 1, c->w, 1, FA_DARK_GRAY);
  text(tl, 4, STRIP_Y - 3, 126, 20, FA_FONT_BODY_BOLD, FA_ALIGN_LEFT, FA_WHITE, meta_or_unknown(t, FA_META_NAME));
  char buf[16];
  const char *badge = vs->phone_lost ? "NO PHONE" : vs->stale ? "STALE" : vs->phone_offline ? "CACHED" : NULL;
  if (badge) {
    fa_fill_rect(c, 132, STRIP_Y + 1, 64, 16, FA_YELLOW);
    text(tl, 132, STRIP_Y - 2, 64, 18, FA_FONT_SMALL, FA_ALIGN_CENTER, FA_BLACK, badge);
  } else {
    snprintf(buf, sizeof buf, "SITE %u/%u", vs->site_index + 1, vs->site_count ? vs->site_count : 1);
    text(tl, 132, STRIP_Y - 2, 64, 18, FA_FONT_SMALL, FA_ALIGN_RIGHT, FA_LIGHT_GRAY, buf);
  }
}

static void footer(FaTextList *tl, const char *l1, const char *l2, uint8_t c2) {
  text(tl, 4, FOOT1_Y - 3, 192, 18, FA_FONT_SMALL, FA_ALIGN_LEFT, FA_WHITE, l1);
  text(tl, 4, FOOT2_Y - 3, 192, 18, FA_FONT_SMALL, FA_ALIGN_LEFT, c2, l2);
}

static void body_message(FaCanvas *c, FaTextList *tl, const char *headline, const char *detail) {
  hatch(c, 8, BODY_Y0 + 4, c->w - 16, BODY_Y1 - BODY_Y0 - 8);
  fa_fill_rect(c, 16, 60, c->w - 32, 66, FA_BLACK);
  text(tl, 16, 60, c->w - 32, 24, FA_FONT_BODY_BOLD, FA_ALIGN_CENTER, FA_WHITE, headline);
  text(tl, 16, 84, c->w - 32, 40, FA_FONT_SMALL, FA_ALIGN_CENTER, FA_LIGHT_GRAY, detail);
}

// Quarter-grid endpoint to pixels in a square of `side` px whose extent is
// `extent_m` metres, centred on the AOI.
static void endpoint_px(const FaTile *t, const int16_t q[2], int x0, int y0, int side, uint32_t extent_m, int *px,
                        int *py) {
  float step = (float)t->aoi_m / (float)(t->grid_n - 1);
  float off = ((float)extent_m - (float)t->aoi_m) / 2.f;
  *px = x0 + fa_roundf(((float)q[0] / 4.f * step + off) * (float)side / (float)extent_m);
  *py = y0 + fa_roundf(((float)q[1] / 4.f * step + off) * (float)side / (float)extent_m);
}

static void marker(FaCanvas *c, FaTextList *tl, int x, int y, const char *label) {
  fa_fill_rect(c, x - 3, y - 3, 7, 7, FA_BLACK);
  fa_fill_rect(c, x - 2, y - 2, 5, 5, FA_CYAN);
  FaText *t = text(tl, x + 3, y - 17, 12, 16, FA_FONT_BODY_BOLD, FA_ALIGN_LEFT, FA_CYAN, label);
  if (t) t->bg = FA_BLACK;
}

// ---- Views ----

static void view_satellite(FaCanvas *c, const FaTile *t, FaTextList *tl) {
  char l2[FA_TEXT_LEN];
  if (!t->img) {
    body_message(c, tl, "NO SATELLITE IMAGE", meta_or_unknown(t, FA_META_IMG_NOTE));
    footer(tl, "SATELLITE IMAGERY UNAVAILABLE", meta_or_unknown(t, FA_META_IMG_NOTE), FA_YELLOW);
    return;
  }
  int ox = IMG_X0 + (IMG_SIDE - t->img_w) / 2, oy = IMG_Y0 + (IMG_SIDE - t->img_h) / 2;
  for (int y = 0; y < t->img_h; y++) {
    uint8_t *row = c->px + (oy + y) * c->stride + ox;
    for (int x = 0; x < t->img_w; x++) {
      uint8_t idx = fa_pixel_at(t, y * t->img_w + x);
      row[x] = idx ? t->palette[idx] : ((((ox + x) + (oy + y)) & 3) ? FA_BLACK : FA_DARK_GRAY);
    }
  }
  // AOI outline, yellow with a black keyline so it survives any imagery.
  int side = (int)((uint32_t)IMG_SIDE * t->aoi_m / t->image_m);
  int ax = IMG_X0 + (IMG_SIDE - side) / 2, ay = IMG_Y0 + (IMG_SIDE - side) / 2;
  stroke_rect(c, ax - 1, ay - 1, side + 2, side + 2, FA_BLACK);
  stroke_rect(c, ax, ay, side, side, FA_YELLOW);
  stroke_rect(c, ax + 1, ay + 1, side - 2, side - 2, FA_BLACK);
  // Centre marker: open crosshair.
  int cx = IMG_X0 + IMG_SIDE / 2, cy = IMG_Y0 + IMG_SIDE / 2;
  for (int k = 3; k <= 8; k++) {
    put(c, cx + k, cy, FA_YELLOW);
    put(c, cx - k, cy, FA_YELLOW);
    put(c, cx, cy + k, FA_YELLOW);
    put(c, cx, cy - k, FA_YELLOW);
  }
  int px, py;
  endpoint_px(t, t->a_q, IMG_X0, IMG_Y0, IMG_SIDE, t->image_m, &px, &py);
  marker(c, tl, px, py, "A");
  endpoint_px(t, t->b_q, IMG_X0, IMG_Y0, IMG_SIDE, t->image_m, &px, &py);
  marker(c, tl, px, py, "B");

  join(l2, sizeof l2, "IMG ", meta_or_unknown(t, FA_META_IMG_DATE), " ", t->meta[FA_META_IMG_NOTE]);
  bool caution = t->flags & (FA_FLAG_IMAGE_PARTIAL | FA_FLAG_IMAGE_CLOUDY);
  footer(tl, meta_or_unknown(t, FA_META_IMG_SRC), l2, caution ? FA_YELLOW : FA_LIGHT_GRAY);
}

uint8_t fa_shade_level(float nx, float ny, float nz) {
  float len = fa_sqrtf(nx * nx + ny * ny + nz * nz);
  if (len <= 0.f) return 0;
  float i = (nx * LIGHT_X + ny * LIGHT_Y + nz * LIGHT_Z) / len;
  if (i < 0.35f) return 0;
  if (i < 0.6f) return 1;
  if (i < 0.8f) return 2;
  return 3;
}

void fa_mesh_prepare(const FaTile *t, uint8_t exag_x10, FaMeshCache *mc) {
  mc->exag_x10 = exag_x10;
  if (!t->nt) return;
  float c = (float)(t->grid_n - 1) / 2.f;
  float step = (float)t->aoi_m / (float)(t->grid_n - 1);
  float zmid = ((float)t->z_min + (float)t->z_max) / 2.f;
  float k = (float)exag_x10 / 10.f / step;  // metres -> grid cells, exaggerated
  for (uint16_t i = 0; i < t->nv; i++) mc->zx[i] = ((float)fa_rd_i16(t->verts + i * 4 + 2) - zmid) * k;
  // Fit: the largest scale at which every rotation's projected bounding box
  // fits the viewport. One scale for all rotations, so stepping the view
  // never zooms; each rotation is centred on its own box.
  float best = 1e9f;
  for (int yaw = 0; yaw < FA_YAW_STEPS; yaw++) {
    float x0 = 1e9f, x1 = -1e9f, y0 = 1e9f, y1 = -1e9f;
    for (uint16_t i = 0; i < t->nv; i++) {
      float X = (float)t->verts[i * 4] - c, Y = c - (float)t->verts[i * 4 + 1];
      float xr = X * s_cos8[yaw] - Y * s_sin8[yaw], yr = X * s_sin8[yaw] + Y * s_cos8[yaw];
      float up = yr * SIN_PITCH + mc->zx[i] * COS_PITCH;
      if (xr < x0) x0 = xr;
      if (xr > x1) x1 = xr;
      if (up < y0) y0 = up;
      if (up > y1) y1 = up;
    }
    float sx = 2.f * VIEW_HW / (x1 - x0 + 1e-3f), sy = 2.f * VIEW_HH / (y1 - y0 + 1e-3f);
    float s = sx < sy ? sx : sy;
    if (s < best) best = s;
    mc->off_x[yaw] = -(x0 + x1) / 2.f;
    mc->off_y[yaw] = -(y0 + y1) / 2.f;
  }
  mc->scale_base = best;

  for (uint16_t i = 0; i < t->nt; i++) {
    const uint8_t *tr = t->tris + i * 3;
    float X[3], Y[3];
    for (int v = 0; v < 3; v++) {
      X[v] = (float)t->verts[tr[v] * 4] - c;
      Y[v] = c - (float)t->verts[tr[v] * 4 + 1];
    }
    float ux = X[1] - X[0], uy = Y[1] - Y[0], uz = mc->zx[tr[1]] - mc->zx[tr[0]];
    float vx = X[2] - X[0], vy = Y[2] - Y[0], vz = mc->zx[tr[2]] - mc->zx[tr[0]];
    mc->shade[i] = fa_shade_level(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    mc->break_edges[i] = 0;
  }
  // Mark triangle edges that carry a source breakline.
  const uint8_t *p = t->breaks;
  for (uint8_t b = 0; p && b < t->n_break; b++) {
    uint8_t cnt = p[0];
    for (uint8_t s = 1; s < cnt; s++) {
      uint8_t u = p[s], w = p[s + 1];
      for (uint16_t i = 0; i < t->nt; i++) {
        const uint8_t *tr = t->tris + i * 3;
        for (int e = 0; e < 3; e++) {
          uint8_t a = tr[e], bb = tr[(e + 1) % 3];
          if ((a == u && bb == w) || (a == w && bb == u)) mc->break_edges[i] |= (uint8_t)(1 << e);
        }
      }
    }
    p += 1 + cnt;
  }
}

void fa_mesh_project(const FaTile *t, uint8_t yaw, FaMeshCache *mc) {
  static float vdepth[FA_MAX_VERTS];
  float c = (float)(t->grid_n - 1) / 2.f;
  float co = s_cos8[yaw % FA_YAW_STEPS], si = s_sin8[yaw % FA_YAW_STEPS], s = mc->scale_base;
  for (uint16_t i = 0; i < t->nv; i++) {
    float X = (float)t->verts[i * 4] - c, Y = c - (float)t->verts[i * 4 + 1], Z = mc->zx[i];
    float xr = X * co - Y * si, yr = X * si + Y * co;
    uint8_t k = yaw % FA_YAW_STEPS;
    mc->sx[i] = (int16_t)fa_roundf(VIEW_CX + (xr + mc->off_x[k]) * s);
    mc->sy[i] = (int16_t)fa_roundf(VIEW_CY - (yr * SIN_PITCH + Z * COS_PITCH + mc->off_y[k]) * s);
    vdepth[i] = yr * COS_PITCH - Z * SIN_PITCH;  // larger = farther from the camera
  }
  for (uint16_t i = 0; i < t->nt; i++) {
    const uint8_t *tr = t->tris + i * 3;
    mc->depth[i] = vdepth[tr[0]] + vdepth[tr[1]] + vdepth[tr[2]];
    mc->order[i] = i;
  }
  // Shell sort: far to near, ties by index, so output is deterministic.
  static const uint16_t gaps[] = {109, 41, 19, 5, 1};
  for (unsigned g = 0; g < sizeof gaps / sizeof gaps[0]; g++) {
    uint16_t gap = gaps[g];
    for (uint16_t i = gap; i < t->nt; i++) {
      uint16_t v = mc->order[i];
      uint16_t j = i;
      while (j >= gap) {
        uint16_t u = mc->order[j - gap];
        bool before = mc->depth[u] > mc->depth[v] || (mc->depth[u] == mc->depth[v] && u < v);
        if (before) break;
        mc->order[j] = u;
        j = (uint16_t)(j - gap);
      }
      mc->order[j] = v;
    }
  }
}

static void view_tin(FaCanvas *c, const FaTile *t, FaMeshCache *mc, const FaViewState *vs, FaTextList *tl) {
  char l1[FA_TEXT_LEN], ex[12], line[FA_TEXT_LEN];
  fmt_tenths(ex, sizeof ex, vs->exag_x10, "x");
  snprintf(l1, sizeof l1, "VERT EXAG %s  VIEW %03u\xc2\xb0", ex, (unsigned)(vs->yaw % FA_YAW_STEPS) * 45u);
  if (!t->nt) {
    body_message(c, tl, "NO TERRAIN MESH",
                 t->meta[FA_META_SIMPLIFY][0] ? t->meta[FA_META_SIMPLIFY] : meta_or_unknown(t, FA_META_ELEV_NOTE));
    footer(tl, l1, "ELEVATION UNAVAILABLE", FA_YELLOW);
    return;
  }
  if (mc->exag_x10 != vs->exag_x10) fa_mesh_prepare(t, vs->exag_x10, mc);
  fa_mesh_project(t, vs->yaw, mc);
  for (uint16_t k = 0; k < t->nt; k++) {
    uint16_t i = mc->order[k];
    const uint8_t *tr = t->tris + i * 3;
    int x[3], y[3];
    for (int v = 0; v < 3; v++) {
      x[v] = mc->sx[tr[v]];
      y[v] = mc->sy[tr[v]];
    }
    uint8_t sh = mc->shade[i];
    fa_fill_triangle(c, x[0], y[0], x[1], y[1], x[2], y[2], s_shade_fill[sh], BODY_Y0, BODY_Y1);
    for (int e = 0; e < 3; e++) {
      int f = (e + 1) % 3;
      if (mc->break_edges[i] & (1 << e)) {
        fa_draw_line(c, x[e], y[e], x[f], y[f], FA_CYAN);
        fa_draw_line(c, x[e], y[e] - 1, x[f], y[f] - 1, FA_CYAN);
      } else {
        fa_draw_line(c, x[e], y[e], x[f], y[f], s_shade_edge[sh]);
      }
    }
  }
  // Mesh edges may not cross into the title bar or site strip.
  fa_fill_rect(c, 0, 0, c->w, BODY_Y0, FA_BLACK);
  fa_fill_rect(c, 0, BODY_Y1, c->w, c->h - BODY_Y1, FA_BLACK);
  join(line, sizeof line, "BREAKLINES: ", meta_or_unknown(t, FA_META_BREAKLINES), NULL, NULL);
  FaText *tx = text(tl, 4, BODY_Y0 - 2, 192, 16, FA_FONT_SMALL, FA_ALIGN_LEFT,
                    (t->flags & FA_FLAG_HAS_BREAKLINES) ? FA_CYAN : FA_LIGHT_GRAY, line);
  if (tx) tx->bg = FA_BLACK;
  join(line, sizeof line, "DEM ", meta_or_unknown(t, FA_META_ELEV_DATE), NULL, NULL);
  tx = text(tl, 4, BODY_Y1 - 16, 192, 16, FA_FONT_SMALL, FA_ALIGN_LEFT, FA_LIGHT_GRAY, line);
  if (tx) tx->bg = FA_BLACK;
  footer(tl, l1, meta_or_unknown(t, FA_META_SIMPLIFY), FA_LIGHT_GRAY);
}

static void view_slope(FaCanvas *c, const FaTile *t, FaTextList *tl) {
  char l2[FA_TEXT_LEN];
  if (!t->slope) {
    body_message(c, tl, "NO ELEVATION DATA", meta_or_unknown(t, FA_META_ELEV_NOTE));
    footer(tl, "SLOPE NEEDS ELEVATION", meta_or_unknown(t, FA_META_ELEV_SRC), FA_YELLOW);
    return;
  }
  int n = t->slope_n, cell = 130 / n;
  if (cell < 1) cell = 1;
  int side = n * cell, x0 = (c->w - side) / 2, y0 = BODY_Y0 + 1;
  for (int r = 0; r < n; r++) {
    for (int q = 0; q < n; q++) {
      uint8_t cls = fa_slope_at(t, r * n + q);
      if (cls) {
        fa_fill_rect(c, x0 + q * cell, y0 + r * cell, cell, cell, s_slope_fill[cls]);
      } else {
        hatch(c, x0 + q * cell, y0 + r * cell, cell, cell);
      }
    }
  }
  stroke_rect(c, x0 - 1, y0 - 1, side + 2, side + 2, FA_LIGHT_GRAY);
  // A-B line: grid quarter cells map directly onto the raster.
  float k = (float)cell / 4.f;
  int ax = x0 + fa_roundf(t->a_q[0] * k), ay = y0 + fa_roundf(t->a_q[1] * k);
  int bx = x0 + fa_roundf(t->b_q[0] * k), by = y0 + fa_roundf(t->b_q[1] * k);
  fa_draw_line(c, ax, ay, bx, by, FA_CYAN);
  marker(c, tl, ax, ay, "A");
  marker(c, tl, bx, by, "B");
  // Legend.
  static const char *const labels[3] = {"<10\xc2\xb0", "10-30\xc2\xb0", ">30\xc2\xb0"};
  for (int i = 0; i < 3; i++) {
    int lx = 6 + i * 66;
    fa_fill_rect(c, lx, BODY_Y1 - 12, 10, 10, s_slope_fill[i + 1]);
    stroke_rect(c, lx - 1, BODY_Y1 - 13, 12, 12, FA_LIGHT_GRAY);
    text(tl, lx + 13, BODY_Y1 - 17, 52, 16, FA_FONT_SMALL, FA_ALIGN_LEFT, FA_WHITE, labels[i]);
  }
  unsigned cell_m = (t->aoi_m + (t->grid_n - 1) / 2u) / (t->grid_n - 1u);
  snprintf(l2, sizeof l2, "HORN 3X3 ON %um GRID", cell_m);
  footer(tl, "DERIVED FROM ELEVATION", l2, FA_LIGHT_GRAY);
}

static void view_profile(FaCanvas *c, const FaTile *t, FaTextList *tl) {
  char buf[FA_TEXT_LEN], l1[FA_TEXT_LEN];
  join(l1, sizeof l1, "HEIGHT: ", meta_or_unknown(t, FA_META_V_REF), NULL, NULL);
  int n = t->prof_n, lo = 32767, hi = -32768;
  for (int i = 0; i < n; i++) {
    int z = fa_rd_i16(t->prof + i * 2);
    if (z == FA_PROFILE_NODATA) continue;
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  if (!t->prof || hi < lo) {
    body_message(c, tl, "NO ELEVATION DATA", meta_or_unknown(t, FA_META_ELEV_NOTE));
    footer(tl, "PROFILE NEEDS ELEVATION", meta_or_unknown(t, FA_META_ELEV_SRC), FA_YELLOW);
    return;
  }
  if (hi - lo < 10) {
    int mid = (hi + lo) / 2;
    lo = mid - 5;
    hi = mid + 5;
  }
  int pad = (hi - lo) / 20 + 1;
  lo -= pad;
  hi += pad;
  const int px0 = 40, px1 = 192, py0 = BODY_Y0 + 14, py1 = BODY_Y1 - 22;
  // Axes.
  fa_fill_rect(c, px0 - 1, py0, 1, py1 - py0 + 1, FA_LIGHT_GRAY);
  fa_fill_rect(c, px0 - 1, py1 + 1, px1 - px0 + 2, 1, FA_LIGHT_GRAY);
  int xs[FA_MAX_PROFILE], ys[FA_MAX_PROFILE];
  bool ok[FA_MAX_PROFILE];
  for (int i = 0; i < n; i++) {
    int z = fa_rd_i16(t->prof + i * 2);
    ok[i] = z != FA_PROFILE_NODATA;
    xs[i] = px0 + (px1 - px0) * i / (n - 1);
    ys[i] = ok[i] ? py1 - (int)((int32_t)(py1 - py0) * (z - lo) / (hi - lo)) : py1;
  }
  // Area under the section, then the section line on top.
  for (int i = 0; i + 1 < n; i++) {
    if (!ok[i] || !ok[i + 1]) continue;
    fa_fill_triangle(c, xs[i], ys[i], xs[i + 1], ys[i + 1], xs[i], py1, FA_DARK_GRAY, py0, py1 + 1);
    fa_fill_triangle(c, xs[i + 1], ys[i + 1], xs[i + 1], py1, xs[i], py1, FA_DARK_GRAY, py0, py1 + 1);
  }
  for (int i = 0; i + 1 < n; i++) {
    if (!ok[i] || !ok[i + 1]) continue;
    fa_draw_line(c, xs[i], ys[i], xs[i + 1], ys[i + 1], FA_WHITE);
    fa_draw_line(c, xs[i], ys[i] - 1, xs[i + 1], ys[i + 1] - 1, FA_WHITE);
  }
  snprintf(buf, sizeof buf, "%d", hi);
  text(tl, 0, py0 - 9, px0 - 4, 16, FA_FONT_SMALL, FA_ALIGN_RIGHT, FA_WHITE, buf);
  snprintf(buf, sizeof buf, "%d", lo);
  text(tl, 0, py1 - 9, px0 - 4, 16, FA_FONT_SMALL, FA_ALIGN_RIGHT, FA_WHITE, buf);
  text(tl, 0, (py0 + py1) / 2 - 9, px0 - 4, 16, FA_FONT_SMALL, FA_ALIGN_RIGHT, FA_LIGHT_GRAY, "m");
  text(tl, px0 - 4, py1 + 1, 30, 16, FA_FONT_SMALL, FA_ALIGN_LEFT, FA_WHITE, "0");
  fmt_distance(buf, sizeof buf, t->prof_len_m);
  text(tl, px1 - 80, py1 + 1, 82, 16, FA_FONT_SMALL, FA_ALIGN_RIGHT, FA_WHITE, buf);
  int ia = 0, ib = n - 1;
  while (ia < n - 1 && !ok[ia]) ia++;
  while (ib > 0 && !ok[ib]) ib--;
  FaText *ta = text(tl, xs[ia], ys[ia] - 20, 14, 18, FA_FONT_BODY_BOLD, FA_ALIGN_LEFT, FA_CYAN, "A");
  FaText *tb = text(tl, xs[ib] - 12, ys[ib] - 20, 14, 18, FA_FONT_BODY_BOLD, FA_ALIGN_LEFT, FA_CYAN, "B");
  if (ta && ta->y < py0 - 10) ta->y = (int16_t)(py0 - 10);
  if (tb && tb->y < py0 - 10) tb->y = (int16_t)(py0 - 10);
  join(buf, sizeof buf, "DEM ", meta_or_unknown(t, FA_META_ELEV_DATE), NULL, NULL);
  footer(tl, l1, buf, FA_LIGHT_GRAY);
}

static const char *const s_titles[FA_VIEW_COUNT] = {"SATELLITE IMAGE", "SIMPLIFIED TIN", "SLOPE (DERIVED)",
                                                    "PROFILE A-B"};

void fa_render_view(FaCanvas *c, const FaTile *t, FaMeshCache *mc, const FaViewState *vs, FaTextList *tl) {
  tl->count = 0;
  fa_fill_rect(c, 0, 0, c->w, c->h, FA_BLACK);
  switch (vs->view) {
    case FA_VIEW_SATELLITE: view_satellite(c, t, tl); break;
    case FA_VIEW_TIN: view_tin(c, t, mc, vs, tl); break;
    case FA_VIEW_SLOPE: view_slope(c, t, tl); break;
    default: view_profile(c, t, tl); break;
  }
  title_bar(c, tl, s_titles[vs->view % FA_VIEW_COUNT], vs->view);
  site_strip(c, t, vs, tl);
}

void fa_render_status(FaCanvas *c, const char *title, const char *headline, const char *detail, const char *hint,
                      uint8_t progress_pct, FaTextList *tl) {
  tl->count = 0;
  fa_fill_rect(c, 0, 0, c->w, c->h, FA_BLACK);
  title_bar(c, tl, title, -1);
  text(tl, 8, 32, c->w - 16, 58, FA_FONT_HEADLINE, FA_ALIGN_CENTER, FA_WHITE, headline);
  text(tl, 8, 92, c->w - 16, progress_pct <= 100 ? 64 : 100, FA_FONT_BODY, FA_ALIGN_CENTER, FA_LIGHT_GRAY, detail);
  if (progress_pct <= 100) {
    stroke_rect(c, 20, 170, c->w - 40, 10, FA_LIGHT_GRAY);
    fa_fill_rect(c, 22, 172, (c->w - 44) * progress_pct / 100, 6, FA_WHITE);
  }
  if (hint && hint[0]) {
    fa_fill_rect(c, 0, 198, c->w, 1, FA_DARK_GRAY);
    text(tl, 4, 200, c->w - 8, 22, FA_FONT_BODY_BOLD, FA_ALIGN_CENTER, FA_WHITE, hint);
  }
}
