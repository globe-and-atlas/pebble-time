#pragma once
/* Test-side controls for the host mock: a virtual clock, event injection, and framebuffer output. */
#include "pebble.h"

#define MOCK_W 200
#define MOCK_H 228

void mock_reset(void);
uint32_t mock_now_ms(void);
void mock_advance_ms(uint32_t ms);          /* moves the clock and fires due AppTimers */
void mock_set_clock(int hour, int minute);
void mock_set_24h(bool h24);

/* Repaint every dirty layer, as the OS would before the next display update. Returns the
 * number of layers redrawn. */
int mock_flush(void);

/* Event injection (no-ops if the firmware has not subscribed). */
void mock_fire_compass(int32_t magnetic_heading, CompassStatus status);
void mock_fire_accel(int16_t x, int16_t y, int16_t z);  /* one batch of identical samples */
void mock_fire_tap(void);
void mock_fire_tick(void);
void mock_press_select(void);

/* Draw-call accounting. */
uint32_t mock_layer_draws(int layer_index);  /* 0 = first added child of root, 1 = second */

/* Output. The text log lets a preview script overlay real glyphs on the raw pixels. */
void mock_write_ppm(const char *path);
void mock_write_text_log(const char *path);
GColor mock_pixel(int x, int y);
