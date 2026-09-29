#pragma once
// Platform-independent renderer for the four views. Graphics are written
// straight into an 8-bit GColor8 frame buffer; text is emitted as a list
// that the watch draws with system fonts after releasing the frame buffer
// (and that the host preview tool records).

#include "fa_tile.h"

#define FA_SCREEN_W 200
#define FA_SCREEN_H 228
#define FA_MAX_TEXT 16
#define FA_TEXT_LEN 72
#define FA_YAW_STEPS 8

typedef enum { FA_VIEW_SATELLITE, FA_VIEW_TIN, FA_VIEW_SLOPE, FA_VIEW_PROFILE, FA_VIEW_COUNT } FaView;
typedef enum { FA_FONT_TITLE, FA_FONT_BODY, FA_FONT_BODY_BOLD, FA_FONT_SMALL, FA_FONT_HEADLINE } FaFont;
typedef enum { FA_ALIGN_LEFT, FA_ALIGN_CENTER, FA_ALIGN_RIGHT } FaAlign;

// GColor8: 0b11rrggbb, 2 bits per channel.
#define FA_RGB(r, g, b) ((uint8_t)(0xC0 | ((r) << 4) | ((g) << 2) | (b)))
#define FA_BLACK FA_RGB(0, 0, 0)
#define FA_WHITE FA_RGB(3, 3, 3)
#define FA_DARK_GRAY FA_RGB(1, 1, 1)
#define FA_LIGHT_GRAY FA_RGB(2, 2, 2)
#define FA_YELLOW FA_RGB(3, 3, 0)
#define FA_CYAN FA_RGB(0, 3, 3)

typedef struct {
  uint8_t *px;
  int16_t stride;  // bytes per row
  int16_t w, h;
} FaCanvas;

typedef struct {
  int16_t x, y, w, h;
  uint8_t font, align, color, bg;  // bg == 0: transparent
  char text[FA_TEXT_LEN];
} FaText;

typedef struct {
  FaText items[FA_MAX_TEXT];
  uint8_t count;
} FaTextList;

// Per-tile derived data, recomputed when the tile or exaggeration changes.
typedef struct {
  uint8_t exag_x10;
  float scale_base;  // fit scale for this exaggeration, same for every rotation
  float off_x[FA_YAW_STEPS], off_y[FA_YAW_STEPS];  // per-rotation centring
  float zx[FA_MAX_VERTS];
  uint8_t shade[FA_MAX_TRIS];
  uint8_t break_edges[FA_MAX_TRIS];  // bit e: edge (e, e+1) is a source breakline
  int16_t sx[FA_MAX_VERTS], sy[FA_MAX_VERTS];
  float depth[FA_MAX_TRIS];
  uint16_t order[FA_MAX_TRIS];
} FaMeshCache;

typedef struct {
  FaView view;
  uint8_t yaw;       // 0..FA_YAW_STEPS-1, 45 degree steps
  uint8_t exag_x10;  // the setting actually used for drawing
  bool stale;        // tile older than FA_STALE_DAYS
  bool phone_lost;   // Bluetooth connection to the phone is down
  bool phone_offline;  // phone has no network: tile served from its cache
  uint8_t site_index, site_count;
} FaViewState;

#define FA_STALE_DAYS 30

void fa_mesh_prepare(const FaTile *t, uint8_t exag_x10, FaMeshCache *mc);
void fa_mesh_project(const FaTile *t, uint8_t yaw, FaMeshCache *mc);

void fa_render_view(FaCanvas *c, const FaTile *t, FaMeshCache *mc, const FaViewState *vs, FaTextList *tl);
// Full-screen message for loading, error, empty and offline states.
void fa_render_status(FaCanvas *c, const char *title, const char *headline, const char *detail,
                      const char *hint, uint8_t progress_pct, FaTextList *tl);

// Raster primitives (exposed for tests).
void fa_fill_rect(FaCanvas *c, int x, int y, int w, int h, uint8_t color);
void fa_draw_line(FaCanvas *c, int x0, int y0, int x1, int y1, uint8_t color);
void fa_fill_triangle(FaCanvas *c, int x0, int y0, int x1, int y1, int x2, int y2, uint8_t color, int clip_y0,
                      int clip_y1);

// Triangle shade level (0 dark .. 3 bright) for a lit surface normal; exposed for tests.
uint8_t fa_shade_level(float nx, float ny, float nz);
