#pragma once
/*
 * HOST-ONLY MOCK of the small slice of the Pebble SDK that Cardinal Grid uses.
 *
 * This is NOT the Pebble SDK. It exists so the firmware sources can be compiled with
 * strict warnings and exercised on a normal computer (unit tests, event simulation,
 * preview frames) in an environment where the real SDK cannot be downloaded. It encodes
 * my reading of the SDK's API, so a clean build here does not prove the code compiles
 * against the real headers: run `pebble build` for that.
 */
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* --- colour (Pebble GColor8: 2 bits per channel, alpha 0b11) ---------------- */
typedef struct { uint8_t argb; } GColor8;
typedef GColor8 GColor;
#define GC_(r, g, b) ((GColor){(uint8_t)(0xC0 | ((r) << 4) | ((g) << 2) | (b))})
#define GColorBlack        GC_(0, 0, 0)
GColor GColorFromHEX(uint32_t hex);
#define GColorWhite        GC_(3, 3, 3)
#define GColorLightGray    GC_(2, 2, 2)
#define GColorDarkGray     GC_(1, 1, 1)
#define GColorChromeYellow GC_(3, 2, 0)
#define GColorMidnightGreen GC_(0, 1, 1)
#define GColorDarkGreen    GC_(0, 1, 0)
#define GColorTiffanyBlue  GC_(0, 2, 2)
#define GColorCadetBlue    GC_(1, 2, 2)

/* --- geometry ------------------------------------------------------------- */
typedef struct { int16_t x, y; } GPoint;
typedef struct { int16_t w, h; } GSize;
typedef struct { GPoint origin; GSize size; } GRect;
#define GPoint(x, y) ((GPoint){(x), (y)})
#define GRect(x, y, w, h) ((GRect){{(x), (y)}, {(w), (h)}})

/* --- graphics ------------------------------------------------------------- */
typedef struct GContext GContext;
typedef const char *GFont;
typedef struct GTextAttributes GTextAttributes;
typedef enum { GTextOverflowModeWordWrap, GTextOverflowModeTrailingEllipsis, GTextOverflowModeFill } GTextOverflowMode;
typedef enum { GTextAlignmentLeft, GTextAlignmentCenter, GTextAlignmentRight } GTextAlignment;
typedef enum { GCornerNone = 0 } GCornerMask;

#define FONT_KEY_GOTHIC_14 "GOTHIC_14"
#define FONT_KEY_GOTHIC_14_BOLD "GOTHIC_14_BOLD"
#define FONT_KEY_LECO_32_BOLD_NUMBERS "LECO_32_BOLD_NUMBERS"

GFont fonts_get_system_font(const char *key);
void graphics_context_set_stroke_color(GContext *ctx, GColor c);
void graphics_context_set_fill_color(GContext *ctx, GColor c);
void graphics_context_set_text_color(GContext *ctx, GColor c);
void graphics_context_set_stroke_width(GContext *ctx, uint8_t w);
void graphics_draw_line(GContext *ctx, GPoint p0, GPoint p1);
void graphics_draw_circle(GContext *ctx, GPoint p, uint16_t radius);
void graphics_fill_circle(GContext *ctx, GPoint p, uint16_t radius);
void graphics_fill_rect(GContext *ctx, GRect rect, uint16_t corner_radius, GCornerMask mask);
void graphics_draw_text(GContext *ctx, const char *text, GFont font, const GRect box, GTextOverflowMode overflow,
                        GTextAlignment align, GTextAttributes *attrs);

/* --- windows and layers ---------------------------------------------------- */
typedef struct Layer Layer;
typedef struct Window Window;
typedef void (*LayerUpdateProc)(Layer *layer, GContext *ctx);
typedef struct { void (*load)(Window *); void (*appear)(Window *); void (*disappear)(Window *); void (*unload)(Window *); } WindowHandlers;

Window *window_create(void);
void window_destroy(Window *w);
void window_set_window_handlers(Window *w, WindowHandlers h);
void window_set_background_color(Window *w, GColor c);
void window_stack_push(Window *w, bool animated);
Layer *window_get_root_layer(Window *w);
Layer *layer_create(GRect frame);
void layer_destroy(Layer *l);
void layer_set_update_proc(Layer *l, LayerUpdateProc p);
void layer_add_child(Layer *parent, Layer *child);
void layer_mark_dirty(Layer *l);
GRect layer_get_bounds(const Layer *l);

/* --- buttons (watchapp build only) ------------------------------------------ */
typedef void *ClickRecognizerRef;
typedef void (*ClickHandler)(ClickRecognizerRef recognizer, void *context);
typedef void (*ClickConfigProvider)(void *context);
typedef enum { BUTTON_ID_BACK, BUTTON_ID_UP, BUTTON_ID_SELECT, BUTTON_ID_DOWN } ButtonId;
void window_set_click_config_provider(Window *w, ClickConfigProvider p);
void window_single_click_subscribe(ButtonId id, ClickHandler h);

/* --- time and timers -------------------------------------------------------- */
typedef enum { MINUTE_UNIT = 1 << 2 } TimeUnits;
typedef void (*TickHandler)(struct tm *tick_time, TimeUnits units_changed);
typedef struct AppTimer AppTimer;
typedef void (*AppTimerCallback)(void *data);
void tick_timer_service_subscribe(TimeUnits units, TickHandler h);
void tick_timer_service_unsubscribe(void);
uint16_t time_ms(time_t *tloc, uint16_t *out_ms);
bool clock_is_24h_style(void);
AppTimer *app_timer_register(uint32_t timeout_ms, AppTimerCallback cb, void *data);
void app_timer_cancel(AppTimer *t);

/* --- sensors ---------------------------------------------------------------- */
#define TRIG_MAX_ANGLE 0x10000
typedef struct { int16_t x, y, z; bool did_vibrate; uint64_t timestamp; } AccelData;
typedef enum { ACCEL_AXIS_X = 0, ACCEL_AXIS_Y = 1, ACCEL_AXIS_Z = 2 } AccelAxisType;
typedef enum { ACCEL_SAMPLING_10HZ = 10, ACCEL_SAMPLING_25HZ = 25 } AccelSamplingRate;
typedef void (*AccelDataHandler)(AccelData *data, uint32_t num_samples);
typedef void (*AccelTapHandler)(AccelAxisType axis, int32_t direction);
int accel_service_set_sampling_rate(AccelSamplingRate rate);
void accel_data_service_subscribe(uint32_t samples_per_update, AccelDataHandler h);
void accel_data_service_unsubscribe(void);
void accel_tap_service_subscribe(AccelTapHandler h);
void accel_tap_service_unsubscribe(void);

typedef enum { CompassStatusDataInvalid = 0, CompassStatusCalibrating = 1, CompassStatusCalibrated = 2, CompassStatusUnavailable = -1 } CompassStatus;
typedef struct { int32_t magnetic_heading; int32_t true_heading; CompassStatus compass_status; bool is_declination_valid; } CompassHeadingData;
typedef void (*CompassHeadingHandler)(CompassHeadingData heading);
void compass_service_subscribe(CompassHeadingHandler h);
void compass_service_unsubscribe(void);
int compass_service_set_heading_filter(int32_t filter);

/* --- storage and event loop ------------------------------------------------- */
int persist_read_data(uint32_t key, void *buffer, size_t size);
int persist_write_data(uint32_t key, const void *data, size_t size);
bool persist_exists(uint32_t key);
int32_t persist_read_int(uint32_t key);
int persist_write_int(uint32_t key, int32_t value);

/* --- app messages (settings): enough to compile the inbox handler ----------- */
typedef enum { TUPLE_BYTE_ARRAY = 0, TUPLE_CSTRING = 1, TUPLE_UINT = 2, TUPLE_INT = 3 } TupleType;
typedef struct {
  uint32_t key; TupleType type; uint16_t length;
  union { char cstring[1]; uint8_t uint8; uint16_t uint16; uint32_t uint32; int8_t int8; int16_t int16; int32_t int32; } value[];
} Tuple;
typedef struct DictionaryIterator DictionaryIterator;
typedef void (*AppMessageInboxReceived)(DictionaryIterator *iter, void *context);
Tuple *dict_find(const DictionaryIterator *iter, uint32_t key);
void app_message_register_inbox_received(AppMessageInboxReceived h);
int app_message_open(uint32_t inbox, uint32_t outbox);
#define MESSAGE_KEY_Setting_HourMode 10000
#define MESSAGE_KEY_Setting_TimeColor 10001
void app_event_loop(void);

/* The firmware calls time() and localtime(); the mock supplies a controllable clock. */
time_t mock_time(time_t *t);
struct tm *mock_localtime(const time_t *t);
#define time(t) mock_time(t)
#define localtime(t) mock_localtime(t)
