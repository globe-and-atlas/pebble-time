#include "orientation.h"

/* --- small integer helpers ------------------------------------------------ */

static int32_t wrap_signed(int32_t a) {
  a &= 0xFFFF;
  return a >= 0x8000 ? a - 0x10000 : a;
}

static uint16_t wrap_angle(int32_t a) { return (uint16_t)(a & 0xFFFF); }

static int32_t iabs(int32_t v) { return v < 0 ? -v : v; }

/* Divide rounding to nearest, halves away from zero. */
static int32_t div_round(int32_t n, int32_t d) {
  return (n >= 0 ? n + d / 2 : n - d / 2) / d;
}

/* Cheap hypot: max + 3/8 min, within ~7% of the true value. Plenty for a dead zone. */
static int32_t hypot_approx(int32_t a, int32_t b) {
  a = iabs(a);
  b = iabs(b);
  return a > b ? a + (b * 3) / 8 : b + (a * 3) / 8;
}

static uint16_t idx_of(const OrConfig *c, uint16_t angle) {
  return (uint16_t)((((uint32_t)angle * c->snap_steps) + 32768u) / OR_ANGLE_FULL) % c->snap_steps;
}

static uint16_t angle_of(const OrConfig *c, uint16_t idx) {
  return (uint16_t)(((uint32_t)idx * OR_ANGLE_FULL) / c->snap_steps);
}

/* --- dial ----------------------------------------------------------------- */

/* Clockwise rotation of the north-fixed world, measured from the active zero. */
static uint16_t rotation(const Orientation *o) {
  return o->mode == OR_MODE_RELATIVE ? wrap_angle((int32_t)o->heading_est - (int32_t)o->ref)
                                     : o->heading_est;
}

/* Move the snapped dial. With `force` (or on first use) it jumps straight to the
 * nearest position; otherwise the estimate must leave the current cell by half a
 * step plus the hysteresis before the dial moves, so noise cannot chatter it. */
static bool resnap(Orientation *o, bool force) {
  const uint16_t rot = rotation(o);
  const uint16_t want = idx_of(&o->cfg, rot);
  if (!o->dial_valid || force) {
    const bool changed = !o->dial_valid || o->dial_idx != want;
    o->dial_idx = want;
    o->dial_valid = true;
    return changed;
  }
  const int32_t d = iabs(wrap_signed((int32_t)rot - (int32_t)angle_of(&o->cfg, o->dial_idx)));
  const int32_t half = (int32_t)(OR_ANGLE_FULL / o->cfg.snap_steps / 2u);
  if (d > half + (int32_t)o->cfg.snap_hyst) {
    o->dial_idx = want;
    return true;
  }
  return false;
}

/* One circular low-pass step toward the latest raw heading. Sensor noise is a few
 * degrees, so anything bigger than OR_JUMP is a real event (calibration finishing, the
 * watch swung round) and is followed at once rather than smoothed. */
#define OR_JUMP 1820 /* 10 degrees */

static void relax(Orientation *o) {
  const int32_t diff = wrap_signed((int32_t)o->heading_target - (int32_t)o->heading_est);
  if (iabs(diff) > OR_JUMP) {
    o->heading_est = o->heading_target;
    return;
  }
  o->heading_est = wrap_angle((int32_t)o->heading_est + (diff * (int32_t)o->cfg.heading_alpha_x8) / 8);
}

/* --- public: setup -------------------------------------------------------- */

void orient_init(Orientation *o, const OrConfig *cfg) {
  const OrConfig def = OR_DEFAULT_CONFIG;
  *o = (Orientation){0};
  o->cfg = cfg ? *cfg : def;
  o->compass = OR_COMPASS_INVALID; /* "not yet known" until the first event says otherwise */
}

void orient_restore(Orientation *o, OrMode mode, uint16_t ref) {
  o->mode = mode;
  o->ref = ref;
  if (o->have_heading) resnap(o, true);
}

/* --- public: heading ------------------------------------------------------ */

bool orient_feed_heading(Orientation *o, uint16_t heading, OrCompassState state) {
  bool changed = (o->compass != state);
  o->compass = state;
  if (state == OR_COMPASS_INVALID || state == OR_COMPASS_UNAVAILABLE) {
    return changed; /* never let bad data move the dial */
  }
  o->heading_target = heading;
  if (!o->have_heading) {
    o->have_heading = true;
    o->heading_est = heading;
    resnap(o, true);
    return true;
  }
  relax(o);
  if (resnap(o, false)) changed = true;
  return changed;
}

bool orient_tick(Orientation *o) {
  if (!o->have_heading || o->heading_est == o->heading_target) return false;
  relax(o);
  return resnap(o, false);
}

/* --- public: reference ---------------------------------------------------- */

bool orient_tap(Orientation *o, uint32_t now_ms) {
  if (!o->have_heading) return false;
  if (o->mode == OR_MODE_RELATIVE && (uint32_t)(now_ms - o->ref_event_ms) <= o->cfg.ref_clear_window_ms &&
      o->ref_event == OR_REF_EVENT_SET) {
    o->mode = OR_MODE_MAGNETIC;
    o->ref_event = OR_REF_EVENT_CLEARED;
  } else {
    o->mode = OR_MODE_RELATIVE;
    o->ref = o->heading_est;
    o->ref_event = OR_REF_EVENT_SET;
  }
  o->ref_event_ms = now_ms;
  resnap(o, true);
  return true;
}

/* --- public: tilt --------------------------------------------------------- */

/* Bubble target in quarter pixels. Gravity's in-plane component points downhill,
 * so the bubble rides the opposite (high) side: on screen +x is right, +y is down,
 * and device +y is toward 12 o'clock, hence the sign pattern below. */
static void bubble_target_q4(const Orientation *o, int32_t *tx, int32_t *ty) {
  const int32_t gx = o->gx16 / 16;
  const int32_t gy = o->gy16 / 16;
  const int32_t mag = hypot_approx(gx, gy);
  /* Schmitt trigger: leaving level needs the full dead zone, returning to it only 3/4. */
  const int32_t dz = (o->bubble_x != 0 || o->bubble_y != 0) ? (o->cfg.tilt_deadzone_mg * 3) / 4
                                                            : o->cfg.tilt_deadzone_mg;
  *tx = 0;
  *ty = 0;
  if (mag < dz) return;
  int32_t px = div_round(-gx * (int32_t)o->cfg.bubble_max_px * 4, o->cfg.tilt_full_scale_mg);
  int32_t py = div_round(gy * (int32_t)o->cfg.bubble_max_px * 4, o->cfg.tilt_full_scale_mg);
  const int32_t rim = (int32_t)o->cfg.bubble_max_px * 4;
  const int32_t r = hypot_approx(px, py);
  if (r > rim) { /* radial clamp keeps the bubble inside its rim at any tilt */
    px = px * rim / r;
    py = py * rim / r;
  }
  *tx = px;
  *ty = py;
}

bool orient_feed_accel(Orientation *o, int16_t x_mg, int16_t y_mg, int16_t z_mg) {
  const int32_t shift = o->cfg.accel_shift;
  if (!o->have_accel) {
    o->have_accel = true;
    o->gx16 = (int32_t)x_mg * 16;
    o->gy16 = (int32_t)y_mg * 16;
    o->gz16 = (int32_t)z_mg * 16;
  } else {
    o->gx16 += ((int32_t)x_mg * 16 - o->gx16) / (1 << shift);
    o->gy16 += ((int32_t)y_mg * 16 - o->gy16) / (1 << shift);
    o->gz16 += ((int32_t)z_mg * 16 - o->gz16) / (1 << shift);
  }

  int32_t tx, ty;
  bubble_target_q4(o, &tx, &ty);
  const int32_t step4 = (int32_t)o->cfg.bubble_step_px * 4;
  /* Hysteresis: the target must move 3/4 of a step away from the committed
   * position before the bubble is re-quantised. */
  const int32_t dx = iabs(tx - (int32_t)o->bubble_x * 4);
  const int32_t dy = iabs(ty - (int32_t)o->bubble_y * 4);
  const bool centring = (tx == 0 && ty == 0);
  if (!centring && dx < (step4 * 3) / 4 && dy < (step4 * 3) / 4) return false;
  if (centring && o->bubble_x == 0 && o->bubble_y == 0) return false;

  const int32_t nx = div_round(tx, step4) * (int32_t)o->cfg.bubble_step_px;
  const int32_t ny = div_round(ty, step4) * (int32_t)o->cfg.bubble_step_px;
  if (nx == o->bubble_x && ny == o->bubble_y) return false;
  o->bubble_x = (int8_t)nx;
  o->bubble_y = (int8_t)ny;
  return true;
}

/* --- public: read side ---------------------------------------------------- */

uint16_t orient_dial_angle(const Orientation *o) {
  return o->dial_valid ? angle_of(&o->cfg, o->dial_idx) : 0;
}

int orient_label_deg(const Orientation *o) {
  if (!o->dial_valid) return -1;
  /* The dial turns clockwise by `rot`, so the top of the watch points at bearing -rot. */
  const int deg = (int)(((uint32_t)o->dial_idx * 360u) / o->cfg.snap_steps);
  return (360 - deg) % 360;
}

int orient_heading_deg_x10(const Orientation *o) {
  if (!o->have_heading) return -1;
  const uint32_t rot = rotation(o);
  const uint32_t brg = (OR_ANGLE_FULL - rot) & 0xFFFFu;
  return (int)((brg * 3600u) / OR_ANGLE_FULL);
}
