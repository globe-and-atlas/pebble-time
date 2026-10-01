/* HOST-ONLY mock of the Pebble SDK slice Cardinal Grid uses. See pebble.h. */
#undef time
#undef localtime
#include "mock_control.h"

/* ---- framebuffer -------------------------------------------------------- */
static uint8_t fb[MOCK_H][MOCK_W];        /* GColor8 argb per pixel */

struct GContext {
  GColor stroke, fill, text;
  uint8_t width;
  int ox, oy;                             /* layer origin in screen space */
  int cx0, cy0, cx1, cy1;                 /* clip rectangle, screen space, [x0,x1) */
  int layer_id;
};

static void put(GContext *c, int x, int y, GColor col) {
  x += c->ox;
  y += c->oy;
  if (x < c->cx0 || x >= c->cx1 || y < c->cy0 || y >= c->cy1) return;
  fb[y][x] = col.argb;
}

static void stamp(GContext *c, int x, int y, GColor col, int w) {
  if (w <= 1) { put(c, x, y, col); return; }
  const int lo = -(w - 1) / 2;
  for (int j = 0; j < w; ++j) {
    for (int i = 0; i < w; ++i) put(c, x + lo + i, y + lo + j, col);
  }
}

/* ---- text log ----------------------------------------------------------- */
typedef struct {
  char text[48];
  GRect box;
  const char *font;
  uint8_t colour;
  GTextAlignment align;
  int layer_id;
  bool used;
} TextEntry;
static TextEntry s_text[64];

/* ---- graphics API ------------------------------------------------------- */
GFont fonts_get_system_font(const char *key) { return key; }
void graphics_context_set_stroke_color(GContext *c, GColor col) { c->stroke = col; }
void graphics_context_set_fill_color(GContext *c, GColor col) { c->fill = col; }
void graphics_context_set_text_color(GContext *c, GColor col) { c->text = col; }
void graphics_context_set_stroke_width(GContext *c, uint8_t w) { c->width = w ? w : 1; }

void graphics_draw_line(GContext *c, GPoint p0, GPoint p1) {
  int x0 = p0.x, y0 = p0.y;
  const int x1 = p1.x, y1 = p1.y;
  const int dx = abs(x1 - x0), dy = -abs(y1 - y0);
  const int sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  for (;;) {
    stamp(c, x0, y0, c->stroke, c->width);
    if (x0 == x1 && y0 == y1) break;
    const int e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

static void circle_ring(GContext *c, int cx, int cy, int r, GColor col) {
  int x = r, y = 0, err = 1 - r;
  while (x >= y) {
    put(c, cx + x, cy + y, col); put(c, cx + y, cy + x, col);
    put(c, cx - y, cy + x, col); put(c, cx - x, cy + y, col);
    put(c, cx - x, cy - y, col); put(c, cx - y, cy - x, col);
    put(c, cx + y, cy - x, col); put(c, cx + x, cy - y, col);
    ++y;
    if (err < 0) err += 2 * y + 1;
    else { --x; err += 2 * (y - x) + 1; }
  }
}

void graphics_draw_circle(GContext *c, GPoint p, uint16_t radius) {
  for (int i = 0; i < c->width; ++i) {
    const int r = (int)radius + i - (c->width - 1) / 2;
    if (r >= 0) circle_ring(c, p.x, p.y, r, c->stroke);
  }
}

void graphics_fill_circle(GContext *c, GPoint p, uint16_t radius) {
  for (int dy = -(int)radius; dy <= (int)radius; ++dy) {
    for (int dx = -(int)radius; dx <= (int)radius; ++dx) {
      if (dx * dx + dy * dy <= (int)radius * (int)radius + (int)radius / 2) put(c, p.x + dx, p.y + dy, c->fill);
    }
  }
}

void graphics_fill_rect(GContext *c, GRect r, uint16_t corner, GCornerMask m) {
  (void)corner; (void)m;
  for (int y = 0; y < r.size.h; ++y)
    for (int x = 0; x < r.size.w; ++x) put(c, r.origin.x + x, r.origin.y + y, c->fill);
}

void graphics_draw_text(GContext *c, const char *text, GFont font, const GRect box, GTextOverflowMode o,
                        GTextAlignment a, GTextAttributes *attrs) {
  (void)o; (void)attrs;
  for (size_t i = 0; i < sizeof s_text / sizeof s_text[0]; ++i) {
    if (s_text[i].used) continue;
    snprintf(s_text[i].text, sizeof s_text[i].text, "%s", text);
    s_text[i].box = GRect(box.origin.x + c->ox, box.origin.y + c->oy, box.size.w, box.size.h);
    s_text[i].font = font;
    s_text[i].colour = c->text.argb;
    s_text[i].align = a;
    s_text[i].layer_id = c->layer_id;
    s_text[i].used = true;
    return;
  }
}

/* ---- layers and windows -------------------------------------------------- */
struct Layer {
  GRect frame;
  LayerUpdateProc proc;
  bool dirty;
  uint32_t draws;
  struct Layer *children[4];
  int nchildren;
  int id;
};
struct Window {
  WindowHandlers h;
  struct Layer root;
  ClickConfigProvider click_provider;
};

static int s_next_layer_id;
static Window *s_window;

Window *window_create(void) {
  Window *w = calloc(1, sizeof *w);
  w->root.frame = GRect(0, 0, MOCK_W, MOCK_H);
  w->root.id = -1;
  return w;
}
void window_destroy(Window *w) {
  if (w->h.unload && w->root.nchildren) w->h.unload(w); /* the real OS unloads a loaded window */
  if (s_window == w) s_window = NULL;
  free(w);
}
void window_set_window_handlers(Window *w, WindowHandlers h) { w->h = h; }
void window_set_background_color(Window *w, GColor c) { (void)w; (void)c; }
void window_stack_push(Window *w, bool animated) {
  (void)animated;
  s_window = w;
  if (w->h.load) w->h.load(w);
  if (w->click_provider) w->click_provider(NULL);
}
Layer *window_get_root_layer(Window *w) { return &w->root; }
Layer *layer_create(GRect frame) {
  Layer *l = calloc(1, sizeof *l);
  l->frame = frame;
  l->dirty = true;
  l->id = s_next_layer_id++;
  return l;
}
void layer_destroy(Layer *l) { free(l); }
void layer_set_update_proc(Layer *l, LayerUpdateProc p) { l->proc = p; }
void layer_add_child(Layer *parent, Layer *child) {
  parent->children[parent->nchildren++] = child;
}
void layer_mark_dirty(Layer *l) { l->dirty = true; }
GRect layer_get_bounds(const Layer *l) { return GRect(0, 0, l->frame.size.w, l->frame.size.h); }
void window_set_click_config_provider(Window *w, ClickConfigProvider p) { w->click_provider = p; }

static ClickHandler s_select;
void window_single_click_subscribe(ButtonId id, ClickHandler h) { if (id == BUTTON_ID_SELECT) s_select = h; }
void mock_press_select(void) { if (s_select) s_select(NULL, NULL); }

int mock_flush(void) {
  if (!s_window) return 0;
  int n = 0;
  for (int i = 0; i < s_window->root.nchildren; ++i) {
    Layer *l = s_window->root.children[i];
    if (!l->dirty) continue;
    l->dirty = false;
    for (size_t t = 0; t < sizeof s_text / sizeof s_text[0]; ++t)
      if (s_text[t].used && s_text[t].layer_id == l->id) s_text[t].used = false;
    GContext ctx = {.stroke = GColorWhite, .fill = GColorBlack, .text = GColorWhite, .width = 1,
                    .ox = l->frame.origin.x, .oy = l->frame.origin.y,
                    .cx0 = l->frame.origin.x, .cy0 = l->frame.origin.y,
                    .cx1 = l->frame.origin.x + l->frame.size.w, .cy1 = l->frame.origin.y + l->frame.size.h,
                    .layer_id = l->id};
    if (l->proc) l->proc(l, &ctx);
    ++l->draws;
    ++n;
  }
  return n;
}

uint32_t mock_layer_draws(int index) {
  return (s_window && index < s_window->root.nchildren) ? s_window->root.children[index]->draws : 0;
}

/* ---- virtual clock and timers -------------------------------------------- */
static uint32_t s_now;
static int s_hour = 17, s_minute = 24;
static bool s_24h = true;

struct AppTimer { uint32_t due; AppTimerCallback cb; void *data; bool active; };
static struct AppTimer s_timers[16];

uint32_t mock_now_ms(void) { return s_now; }
void mock_set_clock(int h, int m) { s_hour = h; s_minute = m; }
void mock_set_24h(bool h24) { s_24h = h24; }
bool clock_is_24h_style(void) { return s_24h; }
uint16_t time_ms(time_t *tloc, uint16_t *out_ms) {
  const time_t base = 1790000000;
  if (tloc) *tloc = base + s_now / 1000;
  if (out_ms) *out_ms = (uint16_t)(s_now % 1000);
  return (uint16_t)(s_now % 1000);
}
time_t mock_time(time_t *t) { time_t v = 1790000000 + s_now / 1000; if (t) *t = v; return v; }
struct tm *mock_localtime(const time_t *t) {
  (void)t;
  static struct tm tm;
  memset(&tm, 0, sizeof tm);
  tm.tm_hour = s_hour;
  tm.tm_min = s_minute;
  return &tm;
}

AppTimer *app_timer_register(uint32_t ms, AppTimerCallback cb, void *data) {
  for (size_t i = 0; i < sizeof s_timers / sizeof s_timers[0]; ++i) {
    if (!s_timers[i].active) {
      s_timers[i] = (struct AppTimer){s_now + ms, cb, data, true};
      return &s_timers[i];
    }
  }
  fprintf(stderr, "mock: out of timers\n");
  abort();
}
void app_timer_cancel(AppTimer *t) { if (t) t->active = false; }

void mock_advance_ms(uint32_t ms) {
  const uint32_t target = s_now + ms;
  for (;;) {
    struct AppTimer *next = NULL;
    for (size_t i = 0; i < sizeof s_timers / sizeof s_timers[0]; ++i)
      if (s_timers[i].active && s_timers[i].due <= target && (!next || s_timers[i].due < next->due)) next = &s_timers[i];
    if (!next) break;
    s_now = next->due;
    next->active = false;
    next->cb(next->data);
  }
  s_now = target;
}

/* ---- services -------------------------------------------------------------- */
static TickHandler s_tick;
static AccelDataHandler s_accel;
static AccelTapHandler s_tap;
static CompassHeadingHandler s_compass;
static uint32_t s_accel_batch;

void tick_timer_service_subscribe(TimeUnits u, TickHandler h) { (void)u; s_tick = h; }
void tick_timer_service_unsubscribe(void) { s_tick = NULL; }
int accel_service_set_sampling_rate(AccelSamplingRate r) { (void)r; return 0; }
void accel_data_service_subscribe(uint32_t n, AccelDataHandler h) { s_accel_batch = n; s_accel = h; }
void accel_data_service_unsubscribe(void) { s_accel = NULL; }
void accel_tap_service_subscribe(AccelTapHandler h) { s_tap = h; }
void accel_tap_service_unsubscribe(void) { s_tap = NULL; }
void compass_service_subscribe(CompassHeadingHandler h) { s_compass = h; }
void compass_service_unsubscribe(void) { s_compass = NULL; }
int compass_service_set_heading_filter(int32_t f) { (void)f; return 0; }

void mock_fire_compass(int32_t heading, CompassStatus st) {
  if (!s_compass) return;
  s_compass((CompassHeadingData){heading, heading, st, false});
}
void mock_fire_accel(int16_t x, int16_t y, int16_t z) {
  if (!s_accel) return;
  AccelData d[16];
  const uint32_t n = s_accel_batch < 16 ? s_accel_batch : 16;
  for (uint32_t i = 0; i < n; ++i) d[i] = (AccelData){x, y, z, false, 0};
  s_accel(d, n);
}
void mock_fire_tap(void) { if (s_tap) s_tap(ACCEL_AXIS_Z, 1); }
void mock_fire_tick(void) { if (s_tick) s_tick(mock_localtime(NULL), MINUTE_UNIT); }

/* ---- persistence ----------------------------------------------------------- */
static struct { bool have; uint8_t data[32]; size_t size; } s_persist[8];
int persist_read_data(uint32_t key, void *buf, size_t size) {
  if (key >= 8 || !s_persist[key].have) return -1;
  const size_t n = size < s_persist[key].size ? size : s_persist[key].size;
  memcpy(buf, s_persist[key].data, n);
  return (int)n;
}
int persist_write_data(uint32_t key, const void *data, size_t size) {
  if (key >= 8 || size > 32) return -1;
  memcpy(s_persist[key].data, data, size);
  s_persist[key].size = size;
  s_persist[key].have = true;
  return (int)size;
}
void app_event_loop(void) {}

/* ---- lifecycle and output ---------------------------------------------------- */
void mock_reset(void) {
  memset(fb, GColorBlack.argb, sizeof fb);
  memset(s_text, 0, sizeof s_text);
  memset(s_timers, 0, sizeof s_timers);
  memset(s_persist, 0, sizeof s_persist);
  s_now = 0;
  s_hour = 17;
  s_minute = 24;
  s_24h = true;
  s_tick = NULL; s_accel = NULL; s_tap = NULL; s_compass = NULL; s_select = NULL;
  s_window = NULL;
  s_next_layer_id = 0;
}

GColor mock_pixel(int x, int y) { return (GColor){fb[y][x]}; }

static void rgb(uint8_t argb, uint8_t out[3]) {
  out[0] = (uint8_t)(((argb >> 4) & 3) * 85);
  out[1] = (uint8_t)(((argb >> 2) & 3) * 85);
  out[2] = (uint8_t)((argb & 3) * 85);
}

void mock_write_ppm(const char *path) {
  FILE *f = fopen(path, "wb");
  if (!f) { perror(path); abort(); }
  fprintf(f, "P6\n%d %d\n255\n", MOCK_W, MOCK_H);
  for (int y = 0; y < MOCK_H; ++y)
    for (int x = 0; x < MOCK_W; ++x) { uint8_t c[3]; rgb(fb[y][x], c); fwrite(c, 1, 3, f); }
  fclose(f);
}

void mock_write_text_log(const char *path) {
  FILE *f = fopen(path, "w");
  if (!f) { perror(path); abort(); }
  for (size_t i = 0; i < sizeof s_text / sizeof s_text[0]; ++i) {
    if (!s_text[i].used) continue;
    uint8_t c[3];
    rgb(s_text[i].colour, c);
    fprintf(f, "%d\t%d\t%d\t%d\t%s\t%d\t%d,%d,%d\t%s\n", s_text[i].box.origin.x, s_text[i].box.origin.y,
            s_text[i].box.size.w, s_text[i].box.size.h, s_text[i].font, (int)s_text[i].align, c[0], c[1], c[2],
            s_text[i].text);
  }
  fclose(f);
}

/* ---- settings stubs: nothing persisted, no messages ------------------------ */
GColor GColorFromHEX(uint32_t hex) {
  return GC_((hex >> 22) & 3, (hex >> 14) & 3, (hex >> 6) & 3);
}
bool persist_exists(uint32_t key) { (void)key; return false; }
int32_t persist_read_int(uint32_t key) { (void)key; return 0; }
int persist_write_int(uint32_t key, int32_t value) { (void)key; (void)value; return 4; }
Tuple *dict_find(const DictionaryIterator *iter, uint32_t key) { (void)iter; (void)key; return NULL; }
void app_message_register_inbox_received(AppMessageInboxReceived h) { (void)h; }
int app_message_open(uint32_t inbox, uint32_t outbox) { (void)inbox; (void)outbox; return 0; }
