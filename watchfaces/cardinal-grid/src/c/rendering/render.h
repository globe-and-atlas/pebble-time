#pragma once
/*
 * rendering/  -  draws the two layers. Stateless: everything comes in through the
 * view structs, and the only cache (the projected terrain) lives in map_geometry.
 *
 * Coordinate spaces (see docs/DESIGN.md):
 *   SCREEN space      time and status text. Never rotated.
 *   INSTRUMENT space  grid, terrain, ticks, labels: the north-fixed world, seen through
 *                     the dial index. The heading pointer and centre marker are fixed to
 *                     the watch, so they do not turn with the world.
 */
#include <pebble.h>
#include "../orientation/orientation.h"

typedef enum {
  RENDER_FLASH_NONE = 0,
  RENDER_FLASH_SET,     /* amber outer ring: reference set */
  RENDER_FLASH_CLEARED  /* cyan outer ring: reference cleared */
} RenderFlash;

typedef struct {
  uint16_t       dial_idx;   /* snapped dial index from orientation/ */
  int8_t         bubble_x;   /* tilt bubble offset in pixels */
  int8_t         bubble_y;
  OrMode         mode;
  OrCompassState compass;
  RenderFlash    flash;
  const char    *debug;      /* multi-line text, or NULL. Only set in CG_DEBUG builds. */
} InstrumentView;

typedef struct {
  const char *time;   /* "17:24" */
  const char *label;  /* "MAG 285°" */
  const char *sub;    /* second status line, may be empty */
  GColor      time_color; /* time digits, from settings */
} StatusView;

void render_instrument(GContext *ctx, const InstrumentView *v);
void render_status(GContext *ctx, GRect bounds, const StatusView *v);

/* Number of instrument draws since launch (debug overlay, tests). */
uint32_t render_instrument_count(void);
