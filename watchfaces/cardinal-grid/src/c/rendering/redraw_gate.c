#include "redraw_gate.h"

void gate_init(RedrawGate *g, uint16_t min_interval_ms) {
  g->min_interval_ms = min_interval_ms;
  g->have_last = false;
  g->pending = false;
  g->last_ms = 0;
}

int32_t gate_request(RedrawGate *g, uint32_t now_ms) {
  if (g->pending) return GATE_PENDING;
  if (!g->have_last) {
    g->have_last = true;
    g->last_ms = now_ms;
    return GATE_NOW;
  }
  const uint32_t elapsed = now_ms - g->last_ms; /* unsigned: safe across wraparound */
  if (elapsed >= g->min_interval_ms) {
    g->last_ms = now_ms;
    return GATE_NOW;
  }
  g->pending = true;
  return (int32_t)(g->min_interval_ms - elapsed);
}

void gate_fired(RedrawGate *g, uint32_t now_ms) {
  g->pending = false;
  g->have_last = true;
  g->last_ms = now_ms;
}
