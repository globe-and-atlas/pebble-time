#pragma once
/*
 * Redraw throttle. Pure logic (no timers): the caller owns the clock and the timer.
 *
 * Many sensor events can arrive inside one throttle window. The first one after a quiet
 * period redraws immediately; later ones are coalesced into a single deferred redraw at
 * the end of the window. So the display responds instantly to a new movement but can
 * never be redrawn more often than once per `min_interval_ms`.
 */
#include <stdint.h>
#include <stdbool.h>

typedef struct {
  uint16_t min_interval_ms;
  bool     have_last;
  bool     pending;
  uint32_t last_ms;
} RedrawGate;

#define GATE_NOW      0  /* draw immediately */
#define GATE_PENDING (-1) /* a deferred redraw is already scheduled: do nothing */

void gate_init(RedrawGate *g, uint16_t min_interval_ms);

/* Returns GATE_NOW, GATE_PENDING, or a delay in ms (> 0) after which the caller must
 * call gate_fired() and redraw. GATE_NOW also records the draw. */
int32_t gate_request(RedrawGate *g, uint32_t now_ms);

/* The deferred timer fired and the caller is redrawing now. */
void gate_fired(RedrawGate *g, uint32_t now_ms);
