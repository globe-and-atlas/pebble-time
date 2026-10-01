/*
 * Host tests for Cardinal Grid: unit tests for the pure modules, plus an event-level
 * simulation of the real glue file (cardinal_grid.c is #included so its static handlers
 * can be driven directly, against the mock SDK in ./mock).
 *
 *   ./test_cardinal            run every check, exit non-zero on failure
 *   ./test_cardinal frames DIR write preview frames (PPM + text log) into DIR
 */
#define main cardinal_main
#include "../../src/c/cardinal_grid.c"
#undef main

#include <math.h>
#include "../../src/c/rendering/palette.h"
#include "mock/mock_control.h"

static int g_failures, g_checks;

#define CHECK(cond)                                                                    \
  do {                                                                                 \
    ++g_checks;                                                                        \
    if (!(cond)) {                                                                     \
      ++g_failures;                                                                    \
      printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);                         \
    }                                                                                  \
  } while (0)

#define CHECK_EQ_STR(a, b)                                                             \
  do {                                                                                 \
    ++g_checks;                                                                        \
    if (strcmp((a), (b)) != 0) {                                                       \
      ++g_failures;                                                                    \
      printf("  FAIL %s:%d  \"%s\" != \"%s\"\n", __FILE__, __LINE__, (a), (b));        \
    }                                                                                  \
  } while (0)

static void section(const char *name) { printf("%s\n", name); }

/* Deterministic noise in [-amp, +amp] (units of 1/10 degree). */
static uint32_t s_lcg = 12345;
static int noise_x10(int amp_x10) {
  s_lcg = s_lcg * 1664525u + 1013904223u;
  return (int)((s_lcg >> 8) % (uint32_t)(2 * amp_x10 + 1)) - amp_x10;
}

/* Pebble-convention heading value for a watch whose 12 o'clock points at compass
 * bearing `deg_x10` (tenths of a degree, clockwise from north): counter-clockwise. */
static int32_t heading_for_bearing_x10(int deg_x10) {
  int64_t a = -(int64_t)deg_x10 * 65536 / 3600;
  return (int32_t)(((a % 65536) + 65536) % 65536);
}

/* --- orientation ------------------------------------------------------------ */

static void test_orientation_basics(void) {
  section("orientation: heading convention and labels");
  Orientation o;
  orient_init(&o, NULL);
  CHECK(orient_label_deg(&o) == -1);
  CHECK(orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(0), OR_COMPASS_CALIBRATED));
  CHECK(orient_dial_index(&o) == 0 && orient_label_deg(&o) == 0);

  orient_init(&o, NULL);
  orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(900), OR_COMPASS_CALIBRATED); /* facing east */
  CHECK(orient_label_deg(&o) == 90);
  CHECK(orient_dial_index(&o) == 54); /* north has moved to 9 o'clock: 270 degrees clockwise */

  orient_init(&o, NULL);
  orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(2700), OR_COMPASS_CALIBRATED); /* facing west */
  CHECK(orient_label_deg(&o) == 270);
  CHECK(orient_dial_index(&o) == 18); /* north at 3 o'clock */
}

static void test_orientation_invalid(void) {
  section("orientation: bad data never moves the dial");
  Orientation o;
  orient_init(&o, NULL);
  orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(900), OR_COMPASS_CALIBRATED);
  const uint16_t before = orient_dial_index(&o);
  CHECK(orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(2000), OR_COMPASS_INVALID)); /* state change */
  CHECK(orient_dial_index(&o) == before);
  CHECK(!orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(2500), OR_COMPASS_INVALID)); /* no change at all */
  CHECK(orient_dial_index(&o) == before);
  CHECK(orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(2500), OR_COMPASS_CALIBRATING));
  CHECK(orient_dial_index(&o) != before);
}

static int count_dial_changes(int centre_x10, int amp_x10, int events, bool hysteresis) {
  Orientation o;
  OrConfig cfg = OR_DEFAULT_CONFIG;
  if (!hysteresis) { cfg.snap_hyst = 0; cfg.heading_alpha_x8 = 8; } /* raw: no filter, no dead zone */
  orient_init(&o, &cfg);
  int changes = 0;
  uint16_t last = 0xFFFF;
  for (int i = 0; i < events; ++i) {
    orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(centre_x10 + noise_x10(amp_x10)), OR_COMPASS_CALIBRATED);
    orient_tick(&o);
    if (i > 0 && orient_dial_index(&o) != last) ++changes;
    last = orient_dial_index(&o);
  }
  return changes;
}

static void test_orientation_jitter(void) {
  section("orientation: noise does not chatter the dial");
  s_lcg = 1;
  CHECK(count_dial_changes(1000, 30, 500, true) == 0);   /* +/-3 deg about a cell centre */
  s_lcg = 1;
  const int naive_edge = count_dial_changes(1025, 30, 500, false);
  s_lcg = 1;
  const int filtered_edge = count_dial_changes(1025, 30, 500, true); /* worst case: on a cell boundary */
  printf("  boundary case: %d dial changes unfiltered, %d filtered\n", naive_edge, filtered_edge);
  CHECK(naive_edge > 100);
  CHECK(filtered_edge <= 4);
  s_lcg = 1;
  CHECK(count_dial_changes(0, 30, 500, true) == 0);      /* straddling north: 359 <-> 1 wraps cleanly */
}

static void test_orientation_sweep(void) {
  section("orientation: a full turn visits every dial position once");
  Orientation o;
  orient_init(&o, NULL);
  int changes = 0;
  uint16_t last = 0xFFFF;
  for (int b = 0; b < 3600; b += 20) { /* 2 degrees per event */
    orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(b), OR_COMPASS_CALIBRATED);
    if (last != 0xFFFF && orient_dial_index(&o) != last) ++changes;
    last = orient_dial_index(&o);
  }
  for (int i = 0; i < 10; ++i) orient_tick(&o); /* let the filter settle */
  printf("  dial moves in one turn: %d (72 positions)\n", changes);
  CHECK(changes >= 68 && changes <= 74);
  CHECK(orient_label_deg(&o) == 355); /* last sample 358 deg -> 5 degree grid */
}

static void test_orientation_reference(void) {
  section("orientation: reference set, clear, reset");
  Orientation o;
  orient_init(&o, NULL);
  CHECK(!orient_tap(&o, 0)); /* nothing to reference yet */
  orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(2000), OR_COMPASS_CALIBRATED);
  CHECK(orient_tap(&o, 1000));
  CHECK(o.mode == OR_MODE_RELATIVE && o.ref_event == OR_REF_EVENT_SET);
  CHECK(orient_label_deg(&o) == 0);
  for (int b = 2000; b <= 2500; b += 20) orient_feed_heading(&o, (uint16_t)heading_for_bearing_x10(b), OR_COMPASS_CALIBRATED);
  for (int i = 0; i < 10; ++i) orient_tick(&o);
  /* Turned 50 degrees clockwise from the reference. The dial is allowed to trail by up to one
   * step (half a step plus the hysteresis), never more. */
  CHECK(abs(orient_label_deg(&o) - 50) <= 5);
  CHECK(orient_tap(&o, 1800)); /* quick second tap clears */
  CHECK(o.mode == OR_MODE_MAGNETIC && o.ref_event == OR_REF_EVENT_CLEARED);
  CHECK(abs(orient_label_deg(&o) - 250) <= 5);
  CHECK(orient_tap(&o, 5000)); /* set again ... */
  CHECK(orient_tap(&o, 9000)); /* ... a slow second tap RE-zeroes rather than clears */
  CHECK(o.mode == OR_MODE_RELATIVE && o.ref_event == OR_REF_EVENT_SET);
  CHECK(orient_label_deg(&o) == 0);
}

static void feed_tilt(Orientation *o, int x, int y, int z, int n) {
  for (int i = 0; i < n; ++i) orient_feed_accel(o, (int16_t)x, (int16_t)y, (int16_t)z);
}

static void test_orientation_tilt(void) {
  section("orientation: tilt bubble, dead zone and tremor");
  Orientation o;
  orient_init(&o, NULL);
  feed_tilt(&o, 0, 0, -1000, 20);
  CHECK(o.bubble_x == 0 && o.bubble_y == 0);
  feed_tilt(&o, 20, -40, -998, 20); /* under the dead zone */
  CHECK(o.bubble_x == 0 && o.bubble_y == 0);

  orient_init(&o, NULL);
  feed_tilt(&o, 0, -300, -950, 30); /* 12 o'clock raised: gravity toward 6 */
  CHECK(o.bubble_x == 0 && o.bubble_y < 0); /* bubble rides toward 12: up the screen */
  orient_init(&o, NULL);
  feed_tilt(&o, -300, 0, -950, 30); /* right side raised: gravity toward 9 */
  CHECK(o.bubble_x > 0 && o.bubble_y == 0);
  orient_init(&o, NULL);
  feed_tilt(&o, 900, 900, 0, 30); /* extreme: stays on the rim */
  CHECK(o.bubble_x * o.bubble_x + o.bubble_y * o.bubble_y <= 13 * 13);

  /* Wrist tremor: +/-25 mg alternating about a 250 mg tilt must not move a settled bubble. */
  orient_init(&o, NULL);
  feed_tilt(&o, 0, -250, -960, 30);
  const int8_t by0 = o.bubble_y;
  int moves = 0;
  for (int i = 0; i < 200; ++i) {
    if (orient_feed_accel(&o, 0, (int16_t)(-250 + ((i & 1) ? 25 : -25)), -960)) ++moves;
  }
  CHECK(moves == 0 && o.bubble_y == by0);
}

/* --- gate, clock, grid, geometry -------------------------------------------- */

static void test_gate(void) {
  section("redraw gate");
  RedrawGate g;
  gate_init(&g, 250);
  CHECK(gate_request(&g, 1000) == GATE_NOW);
  CHECK(gate_request(&g, 1100) == 150);
  CHECK(gate_request(&g, 1120) == GATE_PENDING);
  CHECK(gate_request(&g, 1200) == GATE_PENDING);
  gate_fired(&g, 1250);
  CHECK(gate_request(&g, 1300) == 200);
  gate_fired(&g, 1500);
  CHECK(gate_request(&g, 2000) == GATE_NOW);
  /* millisecond counter wraparound */
  gate_init(&g, 250);
  CHECK(gate_request(&g, 0xFFFFFF00u) == GATE_NOW);
  CHECK(gate_request(&g, 0x00000010u) == GATE_NOW);       /* 272 ms later, across the wrap */
}

static void test_clock(void) {
  section("clock");
  char b[8];
  clock_format(b, sizeof b, 17, 24, true);  CHECK_EQ_STR(b, "17:24");
  clock_format(b, sizeof b, 7, 5, true);    CHECK_EQ_STR(b, "07:05");
  clock_format(b, sizeof b, 17, 24, false); CHECK_EQ_STR(b, "5:24");
  clock_format(b, sizeof b, 0, 0, false);   CHECK_EQ_STR(b, "12:00");
  clock_format(b, sizeof b, 12, 30, false); CHECK_EQ_STR(b, "12:30");
  clock_format(b, sizeof b, 23, 59, false); CHECK_EQ_STR(b, "11:59");
}

static void test_grid(void) {
  section("grid");
  GridPt p = grid_point(100, 92, 70, 0);
  CHECK(p.x == 100 && p.y == 22); /* north is up */
  p = grid_point(100, 92, 70, 18);
  CHECK(p.x == 170 && p.y == 92); /* 90 degrees clockwise: 3 o'clock */
  p = grid_point(100, 92, 70, 36);
  CHECK(p.x == 100 && p.y == 162);
  p = grid_point(100, 92, 70, 54);
  CHECK(p.x == 30 && p.y == 92);
  CHECK(grid_tick_class(0) == 3 && grid_tick_class(18) == 3 && grid_tick_class(9) == 2);
  CHECK(grid_tick_class(3) == 1 && grid_tick_class(1) == 0);
  CHECK(grid_screen_dir(70, 5) == 3);
  for (int d = 0; d < GRID_DIRS; ++d) { /* every table entry is (very nearly) unit length */
    int32_t s, c;
    grid_rotation(d, &s, &c);
    const double m = sqrt((double)s * s + (double)c * c) / 32767.0;
    CHECK(m > 0.9995 && m < 1.0005);
  }
}

static void test_map_geometry(void) {
  section("map geometry");
  mg_init();
  CHECK(mg_coast_segments() == MG_EXPECT_SEGS); /* C contouring agrees with the generator */
  int32_t s, c;
  grid_rotation(0, &s, &c);
  MgPt v0[MG_NV];
  const MgProjected *m0 = mg_project(0, s, c);
  memcpy(v0, m0->v, sizeof v0);
  for (int i = 0; i < MG_NV; ++i) CHECK(v0[i].x * v0[i].x + v0[i].y * v0[i].y <= CG_MAP_R * CG_MAP_R);
  for (int i = 0; i < m0->ncoast; ++i) {
    CHECK(m0->coast[i].a.x * m0->coast[i].a.x + m0->coast[i].a.y * m0->coast[i].a.y <= (CG_MAP_R + 1) * (CG_MAP_R + 1));
  }

  /* Turning the dial 90 degrees clockwise sends (x, y) to (-y, x) and preserves radius. */
  grid_rotation(18, &s, &c);
  const MgProjected *m18 = mg_project(18, s, c);
  for (int i = 0; i < MG_NV; ++i) {
    CHECK(abs(m18->v[i].x - (-v0[i].y)) <= 1 && abs(m18->v[i].y - v0[i].x) <= 1);
  }

  /* The cache recomputes only when the dial index changes. */
  const uint32_t before = mg_projection_count();
  grid_rotation(18, &s, &c);
  mg_project(18, s, c);
  mg_project(18, s, c);
  CHECK(mg_projection_count() == before);
  grid_rotation(19, &s, &c);
  mg_project(19, s, c);
  CHECK(mg_projection_count() == before + 1);

  for (int d = 0; d < GRID_DIRS; ++d) { /* every rotation keeps the geometry inside the ring */
    grid_rotation(d, &s, &c);
    const MgProjected *m = mg_project((uint16_t)d, s, c);
    for (int i = 0; i < MG_NV; ++i) CHECK(m->v[i].x * m->v[i].x + m->v[i].y * m->v[i].y <= (CG_MAP_R + 1) * (CG_MAP_R + 1));
  }
}

/* --- end-to-end simulation of the firmware glue ------------------------------ */

static bool s_sim_running;

static void sim_start(void) {
  if (s_sim_running) deinit(); /* tear down the previous run like a real app exit */
  mock_reset();
  s_gate_timer = NULL;
  s_flash_timer = NULL;
  s_flash = RENDER_FLASH_NONE;
  s_label[0] = s_sub[0] = '\0';
#ifdef CG_DEBUG
  s_events = 0;
#endif
  init();
  s_sim_running = true;
  mock_flush();
}

static uint32_t instr_draws(void) { return mock_layer_draws(1); }
static uint32_t status_draws(void) { return mock_layer_draws(0); }

static void compass(int bearing_x10, CompassStatus st) { mock_fire_compass(heading_for_bearing_x10(bearing_x10), st); }

static void test_sim_startup(void) {
  section("sim: startup state");
  sim_start();
  CHECK_EQ_STR(s_time, "17:24");
  CHECK_EQ_STR(s_label, "CAL --");
  CHECK_EQ_STR(s_sub, "TURN WRIST");
  CHECK(instr_draws() == 1 && status_draws() == 1);
  mock_advance_ms(60000);
  mock_flush();
  CHECK(instr_draws() == 1 && status_draws() == 1); /* nothing moves on its own */
}

static void test_sim_heading(void) {
  section("sim: calibrated heading, labels, stillness");
  sim_start();
  compass(1000, CompassStatusCalibrated);
  mock_flush();
  CHECK_EQ_STR(s_label, "MAG 100\xC2\xB0");
  CHECK_EQ_STR(s_sub, "MAGNETIC");
  const uint32_t base = instr_draws();
  s_lcg = 7;
  for (int i = 0; i < 300; ++i) { /* 30 s of tremor +/-3 deg every 100 ms */
    compass(1000 + noise_x10(30), CompassStatusCalibrated);
    mock_fire_accel(0, 0, -1000);
    mock_advance_ms(100);
    mock_flush();
  }
  printf("  redraws during 30 s of steady wrist tremor: %u\n", (unsigned)(instr_draws() - base));
  CHECK(instr_draws() == base);

  compass(1000, CompassStatusCalibrating);
  mock_flush();
  CHECK_EQ_STR(s_label, "CAL 100\xC2\xB0");
  CHECK_EQ_STR(s_sub, "CALIBRATING");
  mock_advance_ms(300); /* let the throttle window pass */
  compass(1000, CompassStatusDataInvalid);
  mock_advance_ms(300);
  mock_flush();
  CHECK_EQ_STR(s_label, "CAL --");
}

static void test_sim_throttle(void) {
  section("sim: a full turn is throttled");
  sim_start();
  compass(0, CompassStatusCalibrated);
  mock_flush();
  const uint32_t base = instr_draws();
  const uint32_t proj0 = mg_projection_count();
  int events = 0;
  for (int b = 0; b < 3600; b += 20) { /* 2 degrees every 100 ms: a brisk 20 s turn */
    compass(b, CompassStatusCalibrated);
    mock_fire_accel(0, 0, -1000);
    mock_advance_ms(100);
    mock_flush();
    ++events;
  }
  mock_advance_ms(600);
  mock_flush();
  const uint32_t draws = instr_draws() - base;
  printf("  %d compass events over 18 s -> %u instrument redraws (%u terrain projections)\n", events, (unsigned)draws,
         (unsigned)(mg_projection_count() - proj0));
  CHECK(draws <= 18 * 4 + 6); /* never faster than every 250 ms */
  CHECK(draws >= 30);         /* but it does keep up */
  CHECK(mg_projection_count() - proj0 <= draws);
  CHECK(s_orient.compass == OR_COMPASS_CALIBRATED);
}

static void test_sim_time_isolation(void) {
  section("sim: minute tick redraws only the status layer");
  sim_start();
  compass(450, CompassStatusCalibrated);
  mock_flush();
  const uint32_t i0 = instr_draws(), s0 = status_draws();
  mock_set_clock(17, 25);
  mock_fire_tick();
  mock_flush();
  CHECK_EQ_STR(s_time, "17:25");
  CHECK(instr_draws() == i0 && status_draws() == s0 + 1);
  mock_set_24h(false);
  mock_fire_tick();
  CHECK_EQ_STR(s_time, "5:25");
}

static void test_sim_reference(void) {
  section("sim: tap sets, confirms and clears the reference");
  sim_start();
  mock_fire_tap(); /* no heading yet: ignored */
  mock_flush();
  CHECK(s_orient.mode == OR_MODE_MAGNETIC && s_flash == RENDER_FLASH_NONE);

  compass(2000, CompassStatusCalibrated);
  mock_flush();
  const uint32_t d0 = instr_draws();
  mock_fire_tap();
  mock_flush();
  CHECK(instr_draws() == d0 + 1); /* feedback is immediate, not throttled */
  CHECK_EQ_STR(s_label, "REL 000\xC2\xB0");
  CHECK_EQ_STR(s_sub, "REF SET");
  CHECK(s_flash == RENDER_FLASH_SET);
  mock_advance_ms(CG_FLASH_MS + 10);
  mock_flush();
  CHECK(s_flash == RENDER_FLASH_NONE);
  CHECK_EQ_STR(s_sub, "REFERENCE");

  PersistedRef saved;
  CHECK(persist_read_data(CG_PERSIST_REF, &saved, sizeof saved) == (int)sizeof saved);
  CHECK(saved.mode == OR_MODE_RELATIVE);

  /* A relaunch keeps the reference: it is an absolute magnetic heading. */
  Orientation relaunch;
  orient_init(&relaunch, NULL);
  orient_restore(&relaunch, (OrMode)saved.mode, saved.ref);
  orient_feed_heading(&relaunch, (uint16_t)heading_for_bearing_x10(2000), OR_COMPASS_CALIBRATED);
  CHECK(orient_label_deg(&relaunch) == 0);

  mock_advance_ms(200); /* now 1.6 s after the first tap: too slow to count as a clear */
  mock_fire_tap();      /* so it re-zeroes */
  CHECK(s_flash == RENDER_FLASH_SET);
  mock_advance_ms(700);
  mock_fire_tap(); /* quick second tap: clears */
  mock_flush();
  CHECK(s_flash == RENDER_FLASH_CLEARED);
  CHECK_EQ_STR(s_sub, "REF CLEARED");
  CHECK_EQ_STR(s_label, "MAG 200\xC2\xB0");
}

static void test_sim_tilt(void) {
  section("sim: tilt bubble drives a redraw, level does not");
  sim_start();
  mock_fire_accel(0, 0, -1000);
  mock_advance_ms(500);
  mock_flush();
  const uint32_t d0 = instr_draws();
  for (int i = 0; i < 10; ++i) {
    mock_fire_accel(0, -320, -930);
    mock_advance_ms(500);
    mock_flush();
  }
  CHECK(s_orient.bubble_y < 0);
  CHECK(instr_draws() > d0 && instr_draws() <= d0 + 6);
}

/* --- pixels: the world turns, the instrument does not ------------------------ */

static bool is_colour(int x, int y, GColor c) { return mock_pixel(x, y).argb == c.argb; }

static void test_pixels(void) {
  section("pixels: north axis turns with the world, pointer stays with the watch");
  sim_start();
  compass(0, CompassStatusCalibrated); /* facing north */
  mock_flush();
  const int cy = CG_INSTR_Y + CG_CY;
  CHECK(is_colour(CG_CX, cy - 30, CG_AMBER));     /* north axis straight up */
  CHECK(is_colour(CG_CX, cy - 60, CG_POINTER));   /* pointer at the top */

  compass(2700, CompassStatusCalibrated); /* facing west: north is now to the right */
  for (int i = 0; i < 6; ++i) { mock_advance_ms(300); mock_fire_accel(0, 0, -1000); }
  mock_flush();
  CHECK(is_colour(CG_CX + 30, cy, CG_AMBER));
  CHECK(!is_colour(CG_CX, cy - 30, CG_AMBER));
  CHECK(is_colour(CG_CX, cy - 60, CG_POINTER));   /* pointer has not moved */

  /* Uncalibrated: the amber axis becomes dashed, so some pixels along it are dark. */
  sim_start();
  compass(0, CompassStatusCalibrating);
  mock_flush();
  int amber = 0, other = 0;
  for (int y = cy - 60; y < cy - 14; ++y) {
    if (is_colour(CG_CX, y, CG_AMBER)) ++amber; else ++other;
  }
  CHECK(amber > 10 && other > 8);
}

/* --- preview frames ----------------------------------------------------------- */

static void frame(const char *dir, const char *name) {
  char path[256];
  mock_flush();
  snprintf(path, sizeof path, "%s/%s.ppm", dir, name);
  mock_write_ppm(path);
  snprintf(path, sizeof path, "%s/%s.txt", dir, name);
  mock_write_text_log(path);
}

static void settle(void) {
  for (int i = 0; i < 6; ++i) { mock_fire_accel(0, 0, -1000); mock_advance_ms(500); }
}

static void write_frames(const char *dir) {
  static const struct { const char *name; int bearing_x10; } shots[] = {
      {"mag_000", 0}, {"mag_045", 450}, {"mag_090", 900}, {"mag_137", 1370}, {"mag_287", 2870}};
  for (size_t i = 0; i < sizeof shots / sizeof shots[0]; ++i) {
    sim_start();
    compass(shots[i].bearing_x10, CompassStatusCalibrated);
    settle();
    frame(dir, shots[i].name);
  }
  sim_start(); /* still calibrating */
  compass(1370, CompassStatusCalibrating);
  settle();
  frame(dir, "calibrating");

  sim_start(); /* tilted */
  compass(2870, CompassStatusCalibrated);
  for (int i = 0; i < 8; ++i) { mock_fire_accel(-260, -220, -920); mock_advance_ms(500); }
  frame(dir, "tilted");

  sim_start(); /* reference set, then turned 50 degrees */
  compass(2000, CompassStatusCalibrated);
  settle();
  mock_fire_tap();
  frame(dir, "reference_flash");
  mock_advance_ms(CG_FLASH_MS + 10);
  compass(2500, CompassStatusCalibrated);
  settle();
  frame(dir, "reference_rel");

  sim_start(); /* 12-hour clock */
  mock_set_24h(false);
  mock_set_clock(9, 5);
  mock_fire_tick();
  compass(600, CompassStatusCalibrated);
  settle();
  frame(dir, "clock_12h");
}

int main(int argc, char **argv) {
  if (argc >= 3 && strcmp(argv[1], "frames") == 0) {
    write_frames(argv[2]);
    printf("frames written to %s\n", argv[2]);
    return 0;
  }
  test_orientation_basics();
  test_orientation_invalid();
  test_orientation_jitter();
  test_orientation_sweep();
  test_orientation_reference();
  test_orientation_tilt();
  test_gate();
  test_clock();
  test_grid();
  test_map_geometry();
  test_sim_startup();
  test_sim_heading();
  test_sim_throttle();
  test_sim_time_isolation();
  test_sim_reference();
  test_sim_tilt();
  test_pixels();
  printf("\n%d checks, %d failed\n", g_checks, g_failures);
  return g_failures ? 1 : 0;
}
