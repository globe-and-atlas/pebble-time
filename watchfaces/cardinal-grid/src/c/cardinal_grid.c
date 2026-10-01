/*
 * Cardinal Grid: a minimalist cartographic orientation instrument for Pebble Time 2.
 *
 * This file is only glue. It owns the window, the two layers and the sensor
 * subscriptions, and moves data between the modules:
 *
 *   sensors -> orientation/ (filter, dead zone, snap) -> redraw gate -> layers
 *                                                          |
 *                                       rendering/ + grid/ + map_geometry/
 *
 * Sensors are the compass service (heading) and the accelerometer (tilt bubble and
 * wrist tap). Nothing animates: the screen changes only when a snapped quantity
 * changes, at most CG_MIN_REDRAW_MS apart.
 */
#include <pebble.h>

#include "cg_config.h"
#include "grid/grid.h"
#include "map_geometry/map_geometry.h"
#include "orientation/orientation.h"
#include "rendering/redraw_gate.h"
#include "rendering/render.h"
#include "time/clock.h"

/* The grid table and the orientation snap step must agree (see grid/grid.h). */
_Static_assert(GRID_DIRS == OR_DEFAULT_SNAP_STEPS, "dial snap steps must equal the grid table size");

static Window *s_window;
static Layer *s_instrument_layer;
static Layer *s_status_layer;

static Orientation s_orient;
static RedrawGate s_gate;
static AppTimer *s_gate_timer;
static AppTimer *s_flash_timer;
static RenderFlash s_flash;

static char s_time[8];
enum { HOUR_WATCH, HOUR_12, HOUR_24 };
static int s_hour_mode = HOUR_WATCH;
static int s_time_hex = 0xFFFFFF; /* time digits, 0xRRGGBB from the settings colour picker */
static char s_label[24];
static char s_sub[24];

#ifdef CG_DEBUG
static char s_debug[160];
static int16_t s_raw_x, s_raw_y, s_raw_z;
static int s_raw_heading_deg10;
static uint32_t s_events;
#endif

typedef struct {
  uint8_t mode;
  uint16_t ref;
} PersistedRef;

/* --- helpers -------------------------------------------------------------- */

static uint32_t now_ms(void) {
  time_t s;
  uint16_t ms;
  time_ms(&s, &ms);
  return (uint32_t)s * 1000u + ms;
}

static void save_reference(void) {
  const PersistedRef p = {(uint8_t)s_orient.mode, s_orient.ref};
  persist_write_data(CG_PERSIST_REF, &p, sizeof p);
}

/* Compose the status text from the orientation state. Returns true if it changed. */
static bool refresh_status_text(void) {
  char label[sizeof s_label];
  char sub[sizeof s_sub];
  const int deg = orient_label_deg(&s_orient);

  if (s_orient.compass == OR_COMPASS_UNAVAILABLE) {
    snprintf(label, sizeof label, "NO MAG");
  } else if (deg < 0 || s_orient.compass == OR_COMPASS_INVALID) {
    snprintf(label, sizeof label, "CAL --");
  } else {
    const char *tag = s_orient.mode == OR_MODE_RELATIVE ? "REL"
                      : (s_orient.compass == OR_COMPASS_CALIBRATED ? "MAG" : "CAL");
    snprintf(label, sizeof label, "%s %03d\xC2\xB0", tag, deg % 360);
  }

  if (s_flash == RENDER_FLASH_SET) {
    snprintf(sub, sizeof sub, "REF SET");
  } else if (s_flash == RENDER_FLASH_CLEARED) {
    snprintf(sub, sizeof sub, "REF CLEARED");
  } else if (s_orient.compass == OR_COMPASS_UNAVAILABLE) {
    sub[0] = '\0';
  } else if (s_orient.compass != OR_COMPASS_CALIBRATED) {
    snprintf(sub, sizeof sub, "%s", s_orient.have_heading ? "CALIBRATING" : "TURN WRIST");
  } else {
    snprintf(sub, sizeof sub, "%s", s_orient.mode == OR_MODE_RELATIVE ? "REFERENCE" : "MAGNETIC");
  }

  if (strcmp(label, s_label) == 0 && strcmp(sub, s_sub) == 0) return false;
  memcpy(s_label, label, sizeof s_label);
  memcpy(s_sub, sub, sizeof s_sub);
  return true;
}

/* --- redraw scheduling ----------------------------------------------------- */

static void redraw_now(void) {
  layer_mark_dirty(s_instrument_layer);
  if (refresh_status_text()) layer_mark_dirty(s_status_layer);
}

static void gate_timer_cb(void *ctx) {
  (void)ctx;
  s_gate_timer = NULL;
  gate_fired(&s_gate, now_ms());
  redraw_now();
}

/* Ask for an instrument redraw. `immediate` bypasses the throttle for user feedback. */
static void request_redraw(bool immediate) {
  const uint32_t now = now_ms();
  if (immediate) {
    if (s_gate_timer) {
      app_timer_cancel(s_gate_timer);
      s_gate_timer = NULL;
    }
    gate_fired(&s_gate, now);
    redraw_now();
    return;
  }
  const int32_t r = gate_request(&s_gate, now);
  if (r == GATE_NOW) {
    redraw_now();
  } else if (r > 0) {
    s_gate_timer = app_timer_register((uint32_t)r, gate_timer_cb, NULL);
  }
}

/* --- reference (tap, or SELECT in a watchapp build) ------------------------ */

static void flash_timer_cb(void *ctx) {
  (void)ctx;
  s_flash_timer = NULL;
  s_flash = RENDER_FLASH_NONE;
  request_redraw(true);
}

static void toggle_reference(void) {
  if (!orient_tap(&s_orient, now_ms())) return;
  s_flash = s_orient.ref_event == OR_REF_EVENT_SET ? RENDER_FLASH_SET : RENDER_FLASH_CLEARED;
  save_reference();
  if (s_flash_timer) app_timer_cancel(s_flash_timer);
  s_flash_timer = app_timer_register(CG_FLASH_MS, flash_timer_cb, NULL);
  request_redraw(true);
}

static void tap_handler(AccelAxisType axis, int32_t direction) {
  (void)axis;
  (void)direction;
  toggle_reference();
}

#ifdef CG_WATCHAPP
static void select_click_handler(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  toggle_reference();
}

static void click_config_provider(void *context) {
  (void)context;
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
}
#endif

/* --- sensors --------------------------------------------------------------- */

static OrCompassState map_compass_status(CompassStatus s) {
  switch (s) {
    case CompassStatusCalibrated:  return OR_COMPASS_CALIBRATED;
    case CompassStatusCalibrating: return OR_COMPASS_CALIBRATING;
    case CompassStatusDataInvalid: return OR_COMPASS_INVALID;
    default:                       return OR_COMPASS_UNAVAILABLE;
  }
}

static void compass_handler(CompassHeadingData heading) {
  int32_t h = heading.magnetic_heading;
#if CG_HEADING_IS_CLOCKWISE
  h = TRIG_MAX_ANGLE - h;
#endif
#ifdef CG_DEBUG
  ++s_events;
  s_raw_heading_deg10 = (int)(((TRIG_MAX_ANGLE - (h & 0xFFFF)) & 0xFFFF) * 3600 / TRIG_MAX_ANGLE);
#endif
  if (orient_feed_heading(&s_orient, (uint16_t)(h & 0xFFFF), map_compass_status(heading.compass_status))) {
    request_redraw(false);
  }
}

/* Runs twice a second. Averages the batch (dropping samples taken while the watch
 * vibrated), updates the tilt bubble, and lets the heading estimate settle. */
static void accel_handler(AccelData *data, uint32_t num) {
  int32_t sx = 0, sy = 0, sz = 0;
  uint32_t n = 0;
  for (uint32_t i = 0; i < num; ++i) {
    if (data[i].did_vibrate) continue;
    sx += data[i].x;
    sy += data[i].y;
    sz += data[i].z;
    ++n;
  }
  if (n == 0) return;
  const int16_t x = (int16_t)(CG_ACCEL_X_SIGN * sx / (int32_t)n);
  const int16_t y = (int16_t)(CG_ACCEL_Y_SIGN * sy / (int32_t)n);
  const int16_t z = (int16_t)(CG_ACCEL_Z_SIGN * sz / (int32_t)n);
#ifdef CG_DEBUG
  s_raw_x = x;
  s_raw_y = y;
  s_raw_z = z;
#endif
  bool changed = orient_feed_accel(&s_orient, x, y, z);
  if (orient_tick(&s_orient)) changed = true;
  if (changed) request_redraw(false);
}

/* --- layers ---------------------------------------------------------------- */

static void instrument_update_proc(Layer *layer, GContext *ctx) {
  (void)layer;
  InstrumentView v = {
      .dial_idx = orient_dial_index(&s_orient),
      .bubble_x = s_orient.bubble_x,
      .bubble_y = s_orient.bubble_y,
      .mode = s_orient.mode,
      .compass = s_orient.compass,
      .flash = s_flash,
      .debug = NULL,
  };
#ifdef CG_DEBUG
  /* raw accel / filtered gravity / heading raw vs estimate / update counters */
  snprintf(s_debug, sizeof s_debug, "a %d %d %d\ng %d %d\nh %d.%d e%d.%d\ndraw %lu ev %lu proj %lu",
           s_raw_x, s_raw_y, s_raw_z, (int)(s_orient.gx16 / 16), (int)(s_orient.gy16 / 16),
           s_raw_heading_deg10 / 10, s_raw_heading_deg10 % 10, orient_heading_deg_x10(&s_orient) / 10,
           orient_heading_deg_x10(&s_orient) % 10, (unsigned long)(render_instrument_count() + 1),
           (unsigned long)s_events, (unsigned long)mg_projection_count());
  v.debug = s_debug;
#endif
  render_instrument(ctx, &v);
}

static void status_update_proc(Layer *layer, GContext *ctx) {
  const StatusView v = {.time = s_time, .label = s_label, .sub = s_sub, .time_color = GColorFromHEX(s_time_hex)};
  render_status(ctx, layer_get_bounds(layer), &v);
}

/* --- time ------------------------------------------------------------------ */

static void update_time(void) {
  const time_t t = time(NULL);
  const struct tm *lt = localtime(&t);
  const bool h24 = s_hour_mode == HOUR_24 || (s_hour_mode == HOUR_WATCH && clock_is_24h_style());
  clock_format(s_time, sizeof s_time, lt->tm_hour, lt->tm_min, h24);
  layer_mark_dirty(s_status_layer);
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  (void)tick_time;
  (void)units_changed;
  update_time();
}

/* --- settings ------------------------------------------------------------- */

/* Clay sends selects as strings and colours as ints of any width. */
static bool tuple_int(const Tuple *t, int *out) {
  if (!t) return false;
  if (t->type == TUPLE_CSTRING) *out = atoi(t->value->cstring);
  else if (t->length == 1) *out = t->type == TUPLE_INT ? t->value->int8 : t->value->uint8;
  else if (t->length == 2) *out = t->type == TUPLE_INT ? t->value->int16 : t->value->uint16;
  else if (t->length == 4) *out = t->type == TUPLE_INT ? (int)t->value->int32 : (int)t->value->uint32;
  else return false;
  return true;
}

static void inbox_handler(DictionaryIterator *iter, void *context) {
  (void)context;
  int v;
  if (tuple_int(dict_find(iter, MESSAGE_KEY_Setting_HourMode), &v) && v >= HOUR_WATCH && v <= HOUR_24) {
    s_hour_mode = v;
    persist_write_int(CG_PERSIST_HOUR_MODE, s_hour_mode);
  }
  if (tuple_int(dict_find(iter, MESSAGE_KEY_Setting_TimeColor), &v) && v >= 0 && v <= 0xFFFFFF) {
    s_time_hex = v;
    persist_write_int(CG_PERSIST_TIME_COLOR, s_time_hex);
  }
  update_time();
}

/* --- lifecycle ------------------------------------------------------------- */

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  window_set_background_color(window, GColorBlack);

  s_status_layer = layer_create(GRect(0, 0, CG_SCREEN_W, CG_STATUS_H));
  layer_set_update_proc(s_status_layer, status_update_proc);
  layer_add_child(root, s_status_layer);

  s_instrument_layer = layer_create(GRect(0, CG_INSTR_Y, CG_SCREEN_W, CG_INSTR_H));
  layer_set_update_proc(s_instrument_layer, instrument_update_proc);
  layer_add_child(root, s_instrument_layer);

  refresh_status_text();
  update_time();
}

static void window_unload(Window *window) {
  (void)window;
  layer_destroy(s_instrument_layer);
  layer_destroy(s_status_layer);
}

static void init(void) {
  const OrConfig cfg = OR_DEFAULT_CONFIG;
  orient_init(&s_orient, &cfg);
  gate_init(&s_gate, CG_MIN_REDRAW_MS);
  mg_init(); /* contour the TIN once; everything static is now cached */

  PersistedRef saved;
  if (persist_read_data(CG_PERSIST_REF, &saved, sizeof saved) == (int)sizeof saved &&
      saved.mode == OR_MODE_RELATIVE) {
    orient_restore(&s_orient, OR_MODE_RELATIVE, saved.ref);
  }

  if (persist_exists(CG_PERSIST_HOUR_MODE)) s_hour_mode = persist_read_int(CG_PERSIST_HOUR_MODE) % 3;
  if (persist_exists(CG_PERSIST_TIME_COLOR)) s_time_hex = persist_read_int(CG_PERSIST_TIME_COLOR) & 0xFFFFFF;

  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){.load = window_load, .unload = window_unload});
#ifdef CG_WATCHAPP
  window_set_click_config_provider(s_window, click_config_provider);
#endif
  window_stack_push(s_window, true);

  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
  app_message_register_inbox_received(inbox_handler);
  app_message_open(128, 32);

  accel_service_set_sampling_rate(ACCEL_SAMPLING_10HZ);
  accel_data_service_subscribe(CG_ACCEL_BATCH, accel_handler);
  accel_tap_service_subscribe(tap_handler);

  compass_service_set_heading_filter(TRIG_MAX_ANGLE * CG_COMPASS_FILTER_DEG / 360);
  compass_service_subscribe(compass_handler);
}

static void deinit(void) {
  compass_service_unsubscribe();
  accel_tap_service_unsubscribe();
  accel_data_service_unsubscribe();
  tick_timer_service_unsubscribe();
  if (s_gate_timer) app_timer_cancel(s_gate_timer);
  if (s_flash_timer) app_timer_cancel(s_flash_timer);
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
  return 0;
}
