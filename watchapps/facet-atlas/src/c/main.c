// Facet Atlas watchapp: UI state, buttons and AppMessage glue. Tile
// validation (fa_tile), reassembly (fa_xfer) and drawing (fa_render) are
// platform independent and host-tested; this file only wires them to the
// Pebble SDK.

#include <pebble.h>

#include "fa_proto.h"
#include "fa_render.h"
#include "fa_xfer.h"

#define PERSIST_LAST_INDEX 1
#define PERSIST_LAST_NAME 2
#define PERSIST_VIEW 3
#define SECONDS_PER_DAY 86400

typedef enum {
  ST_CONNECTING,
  ST_NO_SITES,
  ST_PHONE_STATUS,
  ST_RECEIVING,
  ST_VIEW,
  ST_ERROR,
  ST_OFFLINE,
} AppState;

static Window *s_window;
static Layer *s_canvas;
static AppState s_state;

// Two tile buffers: the one on screen and the one being received, so a
// failed transfer never disturbs the tile being viewed.
static uint8_t *s_tile_buf, *s_rx_buf;
static FaTile s_tile;
static bool s_have_tile;
static FaMeshCache *s_mesh;
static FaXfer s_xfer;
static FaTextList s_text;
static FaViewState s_vs;

static AppTimer *s_timer;
static uint8_t s_site_count;
static uint8_t s_phone_status;
static char s_headline[32];
static char s_detail[FA_TEXT_LEN];
static char s_last_name[FA_MAX_META_LEN + 1];

// One pending outbound message, retried while the outbox is busy.
static struct {
  bool pending;
  uint8_t tries;
  int32_t cmd, a, b;
  uint32_t key_a, key_b;
} s_out;

static uint32_t s_chunk_bytes = FA_CHUNK_BYTES;

static void redraw(void) { layer_mark_dirty(s_canvas); }

// dst = a + b + c, truncated to fit.
static void cat3(char *dst, size_t n, const char *a, const char *b, const char *c) {
  dst[0] = '\0';
  strncat(dst, a, n - 1);
  strncat(dst, b, n - 1 - strlen(dst));
  strncat(dst, c, n - 1 - strlen(dst));
}

static void set_state(AppState st) {
  s_state = st;
  redraw();
}

static void status_screen(AppState st, const char *headline, const char *detail) {
  strncpy(s_headline, headline, sizeof s_headline - 1);
  strncpy(s_detail, detail ? detail : "", sizeof s_detail - 1);
  set_state(st);
}

// ---- Outbox ----

static void flush_out(void *unused);

static void send(int32_t cmd, uint32_t key_a, int32_t a, uint32_t key_b, int32_t b) {
  s_out.pending = true;
  s_out.tries = 0;
  s_out.cmd = cmd;
  s_out.key_a = key_a;
  s_out.a = a;
  s_out.key_b = key_b;
  s_out.b = b;
  flush_out(NULL);
}

static void flush_out(void *unused) {
  if (!s_out.pending) return;
  DictionaryIterator *it;
  if (app_message_outbox_begin(&it) != APP_MSG_OK) {
    if (++s_out.tries < 10) app_timer_register(200, flush_out, NULL);
    return;
  }
  dict_write_int32(it, MESSAGE_KEY_cmd, s_out.cmd);
  if (s_out.key_a) dict_write_int32(it, s_out.key_a, s_out.a);
  if (s_out.key_b) dict_write_int32(it, s_out.key_b, s_out.b);
  if (app_message_outbox_send() == APP_MSG_OK) s_out.pending = false;
  else if (++s_out.tries < 10) app_timer_register(200, flush_out, NULL);
}

static void outbox_failed(DictionaryIterator *it, AppMessageResult reason, void *ctx) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "outbox failed %d", (int)reason);
}

// ---- Timers ----

static void cancel_timer(void) {
  if (s_timer) app_timer_cancel(s_timer);
  s_timer = NULL;
}

static void hello_timeout(void *unused) {
  s_timer = NULL;
  if (s_state != ST_CONNECTING) return;
  char detail[FA_TEXT_LEN];
  cat3(detail, sizeof detail, "Last site: ", s_last_name[0] ? s_last_name : "none", ". Tiles are cached on the phone.");
  status_screen(ST_OFFLINE, "PHONE UNREACHABLE", detail);
}

static void xfer_timeout(void *unused) {
  s_timer = NULL;
  if (s_xfer.state != FA_XFER_RECEIVING) return;
  fa_xfer_abort(&s_xfer, FA_E_TIMEOUT);
  send(FA_CMD_DONE, MESSAGE_KEY_site, (int32_t)s_xfer.site_id, MESSAGE_KEY_status, FA_E_TIMEOUT);
  status_screen(ST_ERROR, "TRANSFER INCOMPLETE",
                s_have_tile ? "No data for 10 s. Previous tile kept." : "No data for 10 s. Nothing was drawn.");
}

static void connect(void) {
  cancel_timer();
  status_screen(ST_CONNECTING, "CONNECTING", "Asking the phone for your saved sites.");
  send(FA_CMD_HELLO, MESSAGE_KEY_chunk, (int32_t)s_chunk_bytes, 0, 0);
  s_timer = app_timer_register(FA_HELLO_TIMEOUT_MS, hello_timeout, NULL);
}

// ---- Tile lifecycle ----

static void refresh_stale(void) {
  s_vs.stale = s_have_tile && (uint32_t)time(NULL) > s_tile.prepared_unix + FA_STALE_DAYS * SECONDS_PER_DAY;
}

static void accept_tile(const FaTile *t) {
  // The received buffer becomes the displayed one; `t` already points into it.
  uint8_t *old = s_tile_buf;
  s_tile_buf = s_rx_buf;
  s_rx_buf = old;
  s_xfer.buf = s_rx_buf;
  s_tile = *t;
  s_have_tile = true;
  s_vs.exag_x10 = s_tile.exag_x10;
  s_vs.yaw = 0;
  fa_mesh_prepare(&s_tile, s_vs.exag_x10, s_mesh);
  refresh_stale();
  strncpy(s_last_name, s_tile.meta[FA_META_NAME], sizeof s_last_name - 1);
  persist_write_string(PERSIST_LAST_NAME, s_last_name);
  persist_write_int(PERSIST_LAST_INDEX, s_vs.site_index);
  set_state(ST_VIEW);
}

static const char *phone_detail(uint8_t status) {
  switch (status) {
    case FA_PHONE_PREPARING: return "The phone is downloading elevation and imagery.";
    case FA_PHONE_REVIEW: return "Ready. Review the preview in the phone settings, then send it.";
    case FA_PHONE_PREP_FAILED: return "The phone could not prepare the site.";
    case FA_PHONE_SEND_FAILED: return "The phone could not send the tile.";
    default: return "";
  }
}

// ---- Inbox ----

static int32_t tuple_int(DictionaryIterator *it, uint32_t key, int32_t dflt) {
  Tuple *t = dict_find(it, key);
  if (!t) return dflt;
  if (t->length == 1) return t->type == TUPLE_INT ? t->value->int8 : t->value->uint8;
  if (t->length == 2) return t->type == TUPLE_INT ? t->value->int16 : t->value->uint16;
  return t->value->int32;
}

static void on_begin(DictionaryIterator *it) {
  uint32_t site = (uint32_t)tuple_int(it, MESSAGE_KEY_site, 0);
  s_vs.site_index = (uint8_t)tuple_int(it, MESSAGE_KEY_index, 0);
  s_site_count = (uint8_t)tuple_int(it, MESSAGE_KEY_count, s_site_count);
  s_vs.site_count = s_site_count;
  FaStatus st = fa_xfer_begin(&s_xfer, site, (uint32_t)tuple_int(it, MESSAGE_KEY_total, 0),
                              (uint32_t)tuple_int(it, MESSAGE_KEY_crc, 0));
  cancel_timer();
  if (st != FA_OK) {
    send(FA_CMD_DONE, MESSAGE_KEY_site, (int32_t)site, MESSAGE_KEY_status, st);
    status_screen(ST_ERROR, "TILE REFUSED", fa_status_name(st));
    return;
  }
  s_timer = app_timer_register(FA_XFER_TIMEOUT_MS, xfer_timeout, NULL);
  snprintf(s_detail, sizeof s_detail, "Site %u of %u", s_vs.site_index + 1u, s_site_count ? s_site_count : 1u);
  strncpy(s_headline, "RECEIVING TILE", sizeof s_headline - 1);
  set_state(ST_RECEIVING);
}

static void on_chunk(DictionaryIterator *it) {
  Tuple *data = dict_find(it, MESSAGE_KEY_data);
  uint32_t offset = (uint32_t)tuple_int(it, MESSAGE_KEY_offset, -1);
  if (!data || data->type != TUPLE_BYTE_ARRAY) return;
  FaStatus st = fa_xfer_chunk(&s_xfer, offset, data->value->data, data->length);
  if (st == FA_OK) {
    if (s_timer) app_timer_reschedule(s_timer, FA_XFER_TIMEOUT_MS);
    redraw();
  } else if (st == FA_E_OFFSET) {
    send(FA_CMD_NACK, MESSAGE_KEY_offset, (int32_t)s_xfer.received, MESSAGE_KEY_status, st);
  } else if (st != FA_E_STATE) {
    cancel_timer();
    send(FA_CMD_DONE, MESSAGE_KEY_site, (int32_t)s_xfer.site_id, MESSAGE_KEY_status, st);
    status_screen(ST_ERROR, "TILE REJECTED", fa_status_name(st));
  }
}

static void on_end(DictionaryIterator *it) {
  uint32_t site = (uint32_t)tuple_int(it, MESSAGE_KEY_site, 0);
  FaTile t;
  cancel_timer();
  FaStatus st = fa_xfer_end(&s_xfer, site, &t);
  send(FA_CMD_DONE, MESSAGE_KEY_site, (int32_t)site, MESSAGE_KEY_status, st);
  if (st == FA_OK) {
    accept_tile(&t);
  } else {
    cat3(s_detail, sizeof s_detail, "Reason: ", fa_status_name(st),
         s_have_tile ? ". Previous tile kept." : ". Nothing was drawn.");
    strncpy(s_headline, st == FA_E_LENGTH ? "TRANSFER INCOMPLETE" : "TILE REJECTED", sizeof s_headline - 1);
    set_state(ST_ERROR);
  }
}

static void inbox_received(DictionaryIterator *it, void *ctx) {
  switch (tuple_int(it, MESSAGE_KEY_cmd, 0)) {
    case FA_CMD_SITES:
      cancel_timer();
      s_site_count = (uint8_t)tuple_int(it, MESSAGE_KEY_count, 0);
      s_vs.site_count = s_site_count;
      s_vs.phone_offline = tuple_int(it, MESSAGE_KEY_status, 0) == FA_PHONE_NET_OFFLINE;
      if (!s_site_count) {
        status_screen(ST_NO_SITES, "NO SITES YET", "Add a site in Facet Atlas settings in the Pebble phone app.");
      } else if (s_state == ST_CONNECTING) {
        status_screen(ST_PHONE_STATUS, "LOADING", "The phone is sending the saved site.");
      } else {
        redraw();
      }
      break;
    case FA_CMD_BEGIN: on_begin(it); break;
    case FA_CMD_CHUNK: on_chunk(it); break;
    case FA_CMD_END: on_end(it); break;
    case FA_CMD_SETTINGS: {
      int32_t ex = tuple_int(it, MESSAGE_KEY_exag, 10);
      if (ex >= 5 && ex <= 50) s_vs.exag_x10 = (uint8_t)ex;
      redraw();
      break;
    }
    case FA_CMD_STATUS: {
      cancel_timer();
      s_phone_status = (uint8_t)tuple_int(it, MESSAGE_KEY_status, 0);
      Tuple *txt = dict_find(it, MESSAGE_KEY_text);
      const char *extra = txt && txt->type == TUPLE_CSTRING ? txt->value->cstring : "";
      cat3(s_detail, sizeof s_detail, extra, " ", phone_detail(s_phone_status));
      static const char *const heads[] = {"", "NO SITES YET", "PREPARING", "REVIEW ON PHONE", "PREP FAILED",
                                          "SEND FAILED", "PHONE OFFLINE"};
      const char *h = s_phone_status < 7 ? heads[s_phone_status] : "PHONE";
      if (s_phone_status == FA_PHONE_NET_OFFLINE && s_have_tile) {
        s_vs.phone_offline = true;
        redraw();
        break;
      }
      strncpy(s_headline, h, sizeof s_headline - 1);
      set_state(s_phone_status == FA_PHONE_NO_SITES ? ST_NO_SITES : ST_PHONE_STATUS);
      break;
    }
    default: break;
  }
}

static void inbox_dropped(AppMessageResult reason, void *ctx) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "inbox dropped %d", (int)reason);
}

// ---- Connection ----

static void on_connection(bool connected) {
  s_vs.phone_lost = !connected;
  if (!connected && s_xfer.state == FA_XFER_RECEIVING) {
    cancel_timer();
    fa_xfer_abort(&s_xfer, FA_E_TIMEOUT);
    status_screen(ST_ERROR, "TRANSFER INCOMPLETE", "Bluetooth connection lost.");
  } else if (connected && s_state != ST_VIEW) {
    connect();
  } else {
    redraw();
  }
}

// ---- Buttons ----

static bool can_retry(void) {
  return s_state == ST_ERROR || s_state == ST_OFFLINE || s_state == ST_NO_SITES || s_state == ST_PHONE_STATUS;
}

static void select_click(ClickRecognizerRef rec, void *ctx) {
  if (s_state == ST_VIEW) {
    s_vs.view = (FaView)((s_vs.view + 1) % FA_VIEW_COUNT);
    persist_write_int(PERSIST_VIEW, s_vs.view);
    redraw();
  } else if (s_state == ST_ERROR && s_have_tile) {
    // Retry the site that failed; the previous tile remains until a new one validates.
    send(FA_CMD_REQ_SITE, MESSAGE_KEY_index, s_vs.site_index, 0, 0);
    set_state(ST_VIEW);
  } else if (can_retry()) {
    connect();
  }
}

static void step(int dir) {
  if (s_state != ST_VIEW) return;
  if (s_vs.view == FA_VIEW_TIN) {
    s_vs.yaw = (uint8_t)((s_vs.yaw + FA_YAW_STEPS + dir) % FA_YAW_STEPS);
    redraw();
  } else if (s_site_count > 1) {
    uint8_t next = (uint8_t)((s_vs.site_index + s_site_count + dir) % s_site_count);
    send(FA_CMD_REQ_SITE, MESSAGE_KEY_index, next, 0, 0);
  }
}

static void up_click(ClickRecognizerRef rec, void *ctx) { step(-1); }
static void down_click(ClickRecognizerRef rec, void *ctx) { step(1); }

static void click_config(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click);
  window_single_click_subscribe(BUTTON_ID_UP, up_click);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_click);
}

// ---- Drawing ----

static GFont font_for(uint8_t f) {
  switch (f) {
    case FA_FONT_TITLE: return fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
    case FA_FONT_BODY: return fonts_get_system_font(FONT_KEY_GOTHIC_18);
    case FA_FONT_BODY_BOLD: return fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
    case FA_FONT_HEADLINE: return fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
    default: return fonts_get_system_font(FONT_KEY_GOTHIC_14);
  }
}

static void canvas_update(Layer *layer, GContext *ctx) {
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  if (!fb) return;
  FaCanvas c = {gbitmap_get_data(fb), (int16_t)gbitmap_get_bytes_per_row(fb), FA_SCREEN_W, FA_SCREEN_H};
  switch (s_state) {
    case ST_VIEW:
      refresh_stale();
      fa_render_view(&c, &s_tile, s_mesh, &s_vs, &s_text);
      break;
    case ST_RECEIVING:
      fa_render_status(&c, "FACET ATLAS", s_headline, s_detail, "", fa_xfer_percent(&s_xfer), &s_text);
      break;
    case ST_CONNECTING:
      fa_render_status(&c, "FACET ATLAS", s_headline, s_detail, "", 255, &s_text);
      break;
    default: {
      const char *hint = s_state == ST_ERROR && s_have_tile ? "SELECT: RETRY  (VIEW KEPT)" : "SELECT: RETRY";
      fa_render_status(&c, "FACET ATLAS", s_headline, s_detail, hint, 255, &s_text);
      break;
    }
  }
  graphics_release_frame_buffer(ctx, fb);

  for (int i = 0; i < s_text.count; i++) {
    const FaText *t = &s_text.items[i];
    GRect box = GRect(t->x, t->y, t->w, t->h);
    GFont font = font_for(t->font);
    GTextAlignment align = t->align == FA_ALIGN_CENTER   ? GTextAlignmentCenter
                           : t->align == FA_ALIGN_RIGHT ? GTextAlignmentRight
                                                        : GTextAlignmentLeft;
    if (t->bg) {
      GSize sz = graphics_text_layout_get_content_size(t->text, font, box, GTextOverflowModeTrailingEllipsis, align);
      int x = t->align == FA_ALIGN_CENTER ? t->x + (t->w - sz.w) / 2 : (t->align == FA_ALIGN_RIGHT ? t->x + t->w - sz.w : t->x);
      graphics_context_set_fill_color(ctx, (GColor){.argb = t->bg});
      graphics_fill_rect(ctx, GRect(x - 1, t->y + 3, sz.w + 2, sz.h), 0, GCornerNone);
    }
    graphics_context_set_text_color(ctx, (GColor){.argb = t->color});
    graphics_draw_text(ctx, t->text, font, box, GTextOverflowModeTrailingEllipsis, align, NULL);
  }
}

// ---- App lifecycle ----

static void window_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  s_canvas = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_canvas, canvas_update);
  layer_add_child(root, s_canvas);
}

static void window_unload(Window *w) { layer_destroy(s_canvas); }

static void init(void) {
  s_tile_buf = malloc(FA_MAX_TILE_BYTES);
  s_rx_buf = malloc(FA_MAX_TILE_BYTES);
  s_mesh = malloc(sizeof(FaMeshCache));
  fa_xfer_init(&s_xfer, s_rx_buf);
  APP_LOG(APP_LOG_LEVEL_INFO, "heap free after buffers: %d (mesh cache %d)", (int)heap_bytes_free(),
          (int)sizeof(FaMeshCache));

  s_vs.exag_x10 = 10;
  s_vs.view = (FaView)(persist_read_int(PERSIST_VIEW) % FA_VIEW_COUNT);
  s_vs.site_index = (uint8_t)persist_read_int(PERSIST_LAST_INDEX);
  persist_read_string(PERSIST_LAST_NAME, s_last_name, sizeof s_last_name);

  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_click_config_provider(s_window, click_config);
  window_set_window_handlers(s_window, (WindowHandlers){.load = window_load, .unload = window_unload});
  window_stack_push(s_window, true);

  app_message_register_inbox_received(inbox_received);
  app_message_register_inbox_dropped(inbox_dropped);
  app_message_register_outbox_failed(outbox_failed);
  uint32_t inbox = app_message_inbox_size_maximum();
  if (inbox > FA_INBOX_BYTES) inbox = FA_INBOX_BYTES;
  s_chunk_bytes = inbox - FA_CHUNK_OVERHEAD - FA_CHUNK_MARGIN;
  app_message_open(inbox, FA_OUTBOX_BYTES);

  connection_service_subscribe((ConnectionHandlers){.pebble_app_connection_handler = on_connection});
  s_vs.phone_lost = !connection_service_peek_pebble_app_connection();
  if (!s_tile_buf || !s_rx_buf || !s_mesh) {
    status_screen(ST_ERROR, "OUT OF MEMORY", "Could not allocate tile buffers.");
    return;
  }
  connect();
}

static void deinit(void) {
  cancel_timer();
  connection_service_unsubscribe();
  window_destroy(s_window);
  free(s_mesh);
  free(s_rx_buf);
  free(s_tile_buf);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
