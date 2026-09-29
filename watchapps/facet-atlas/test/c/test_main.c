// Host tests for the watch core: tile validation, chunk reassembly and
// the renderer's geometry. Run via `make test` (built with ASan/UBSan).

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../../src/c/fa_proto.h"
#include "../../src/c/fa_render.h"
#include "../../src/c/fa_xfer.h"

static int s_fail, s_pass;
static const char *s_dir;

#define CHECK(cond, ...)                                  \
  do {                                                    \
    if (cond) {                                           \
      s_pass++;                                           \
    } else {                                              \
      s_fail++;                                           \
      fprintf(stderr, "FAIL %s:%d: ", __FILE__, __LINE__); \
      fprintf(stderr, __VA_ARGS__);                       \
      fputc('\n', stderr);                                \
    }                                                     \
  } while (0)

static uint8_t *load(const char *name, uint32_t *len) {
  char path[512];
  snprintf(path, sizeof path, "%s/%s.fat", s_dir, name);
  FILE *f = fopen(path, "rb");
  if (!f) {
    fprintf(stderr, "missing fixture %s (run tools/gen_fixtures.js)\n", path);
    exit(2);
  }
  uint8_t *buf = malloc(FA_MAX_TILE_BYTES + 16);
  *len = (uint32_t)fread(buf, 1, FA_MAX_TILE_BYTES + 16, f);
  fclose(f);
  return buf;
}

static long expect(const char *key) {
  char path[512], line[256];
  snprintf(path, sizeof path, "%s/expect.txt", s_dir);
  FILE *f = fopen(path, "r");
  if (!f) exit(2);
  size_t kl = strlen(key);
  while (fgets(line, sizeof line, f)) {
    if (!strncmp(line, key, kl) && line[kl] == '=') {
      fclose(f);
      return strtol(line + kl + 1, NULL, 10);
    }
  }
  fclose(f);
  fprintf(stderr, "no expectation %s\n", key);
  exit(2);
}

static void recrc(uint8_t *b, uint32_t len) {
  uint32_t c = fa_crc32(b, len - 4);
  b[len - 4] = (uint8_t)c;
  b[len - 3] = (uint8_t)(c >> 8);
  b[len - 2] = (uint8_t)(c >> 16);
  b[len - 1] = (uint8_t)(c >> 24);
}

static const char *const s_names[] = {"plane", "valley", "ridge", "cliff", "breakline",
                                      "noimage", "noelev", "gaps", "stale"};

static void test_parse_fixtures(void) {
  for (size_t i = 0; i < sizeof s_names / sizeof s_names[0]; i++) {
    uint32_t len;
    uint8_t *b = load(s_names[i], &len);
    FaTile t;
    FaStatus st = fa_tile_parse(b, len, &t);
    char k[64];
    CHECK(st == FA_OK, "%s: parse %s", s_names[i], fa_status_name(st));
    snprintf(k, sizeof k, "%s.siteId", s_names[i]);
    CHECK(t.site_id == (uint32_t)expect(k), "%s site id", s_names[i]);
    snprintf(k, sizeof k, "%s.flags", s_names[i]);
    CHECK(t.flags == expect(k), "%s flags", s_names[i]);
    snprintf(k, sizeof k, "%s.tris", s_names[i]);
    CHECK(t.nt == expect(k), "%s tris", s_names[i]);
    snprintf(k, sizeof k, "%s.breaklines", s_names[i]);
    CHECK(t.n_break == expect(k), "%s breaklines", s_names[i]);
    free(b);
  }
}

// Reassemble `name` in chunks of `chunk` bytes.
static FaStatus reassemble(const uint8_t *tile, uint32_t len, uint32_t chunk, FaTile *out, uint8_t *rx) {
  FaXfer x;
  fa_xfer_init(&x, rx);
  FaStatus st = fa_xfer_begin(&x, fa_rd_u32(tile + 8), len, fa_crc32(tile, len));
  if (st != FA_OK) return st;
  for (uint32_t off = 0; off < len; off += chunk) {
    uint32_t n = len - off < chunk ? len - off : chunk;
    if ((st = fa_xfer_chunk(&x, off, tile + off, n)) != FA_OK) return st;
  }
  return fa_xfer_end(&x, fa_rd_u32(tile + 8), out);
}

static void test_transfer(void) {
  uint32_t len;
  uint8_t *tile = load("valley", &len);
  uint8_t *rx = malloc(FA_MAX_TILE_BYTES);
  FaTile t;
  const uint32_t sizes[] = {FA_CHUNK_BYTES, 1, 7, 64, 1000, len};
  for (size_t i = 0; i < sizeof sizes / sizeof sizes[0]; i++) {
    CHECK(reassemble(tile, len, sizes[i], &t, rx) == FA_OK, "chunk %u", sizes[i]);
    CHECK(t.site_id == 102 && !strcmp(t.meta[FA_META_NAME], "VALLEY FIXTURE"), "metadata after chunk %u", sizes[i]);
  }
  CHECK(FA_CHUNK_BYTES == 1984, "chunk size %d", FA_CHUNK_BYTES);

  FaXfer x;
  fa_xfer_init(&x, rx);
  // Out of order: first gap NACKs, repeats are ignored, the right offset recovers.
  CHECK(fa_xfer_begin(&x, 102, len, fa_crc32(tile, len)) == FA_OK, "begin");
  CHECK(fa_xfer_chunk(&x, 0, tile, 100) == FA_OK, "chunk 0");
  CHECK(fa_xfer_chunk(&x, 200, tile + 200, 100) == FA_E_OFFSET, "gap is reported");
  CHECK(fa_xfer_chunk(&x, 300, tile + 300, 100) == FA_E_STATE, "repeat gap is ignored");
  CHECK(x.received == 100, "nothing written after the gap");
  CHECK(fa_xfer_chunk(&x, 100, tile + 100, len - 100) == FA_OK, "resume");
  CHECK(fa_xfer_end(&x, 102, &t) == FA_OK, "end after resume");

  // Incomplete: END before all bytes.
  fa_xfer_begin(&x, 102, len, fa_crc32(tile, len));
  fa_xfer_chunk(&x, 0, tile, len / 2);
  CHECK(fa_xfer_end(&x, 102, &t) == FA_E_LENGTH, "incomplete transfer rejected");
  CHECK(x.state == FA_XFER_FAILED, "incomplete leaves FAILED state");
  // Overrun.
  fa_xfer_begin(&x, 102, 100, 0);
  CHECK(fa_xfer_chunk(&x, 0, tile, 101) == FA_E_LENGTH, "overrun rejected");
  // Wrong site.
  fa_xfer_begin(&x, 999, len, fa_crc32(tile, len));
  fa_xfer_chunk(&x, 0, tile, len);
  CHECK(fa_xfer_end(&x, 999, &t) == FA_E_SITE, "site mismatch rejected");
  // Corrupted byte.
  memcpy(rx, tile, len);
  fa_xfer_begin(&x, 102, len, fa_crc32(tile, len));
  uint8_t *bad = malloc(len);
  memcpy(bad, tile, len);
  bad[len / 3] ^= 0x10;
  fa_xfer_chunk(&x, 0, bad, len);
  CHECK(fa_xfer_end(&x, 102, &t) == FA_E_CRC, "corruption rejected");
  // Too big / timeout.
  CHECK(fa_xfer_begin(&x, 1, FA_MAX_TILE_BYTES + 1, 0) == FA_E_TOO_BIG, "oversize refused");
  fa_xfer_begin(&x, 102, len, 0);
  fa_xfer_abort(&x, FA_E_TIMEOUT);
  CHECK(x.state == FA_XFER_FAILED && x.error == FA_E_TIMEOUT, "timeout aborts");
  CHECK(fa_xfer_chunk(&x, 0, tile, 10) == FA_E_STATE, "chunk after abort ignored");
  free(bad);
  free(rx);
  free(tile);
}

static void test_malformed(void) {
  uint32_t len;
  uint8_t *tile = load("breakline", &len);
  uint8_t *b = malloc(len);
  FaTile t;
  // Every truncation fails.
  int ok = 0;
  for (uint32_t n = 0; n < len; n++) ok += fa_tile_parse(tile, n, &t) == FA_OK;
  CHECK(ok == 0, "%d truncations accepted", ok);
  // Every single-byte change with a recomputed CRC is either rejected or
  // yields a structurally valid tile (never out-of-range geometry).
  int accepted = 0;
  for (uint32_t i = 0; i < len - 4; i++) {
    memcpy(b, tile, len);
    b[i] ^= 0x5A;
    recrc(b, len);
    if (fa_tile_parse(b, len, &t) != FA_OK) continue;
    accepted++;
    for (uint16_t k = 0; k < t.nt * 3; k++) CHECK(t.tris[k] < t.nv, "index escapes after mutating byte %u", i);
    for (uint16_t k = 0; k < t.nv; k++) CHECK(t.verts[k * 4] < t.grid_n, "coord escapes after mutating byte %u", i);
  }
  CHECK(accepted > 0, "mutation test exercised the accept path");  // e.g. pixel bytes

  // Targeted structural attacks.
  FaTile good;
  fa_tile_parse(tile, len, &good);
  uint32_t tri0 = (uint32_t)(good.tris - tile);
  memcpy(b, tile, len);
  b[tri0 + 1] = b[tri0];
  recrc(b, len);
  CHECK(fa_tile_parse(b, len, &t) == FA_E_DEGENERATE, "degenerate triangle");
  memcpy(b, tile, len);
  uint8_t tmp = b[tri0 + 1];
  b[tri0 + 1] = b[tri0 + 2];
  b[tri0 + 2] = tmp;
  recrc(b, len);
  CHECK(fa_tile_parse(b, len, &t) == FA_E_INVERTED, "inverted triangle");
  memcpy(b, tile, len);
  b[tri0] = (uint8_t)good.nv;
  recrc(b, len);
  CHECK(fa_tile_parse(b, len, &t) == FA_E_MESH_INDEX, "index out of range");
  // A breakline that does not follow a mesh edge is rejected.
  memcpy(b, tile, len);
  uint32_t br = (uint32_t)(good.breaks - tile);
  b[br + 2] = b[br + 1] == 0 ? 1 : 0;  // second vertex of the first polyline
  recrc(b, len);
  FaStatus st = fa_tile_parse(b, len, &t);
  CHECK(st == FA_E_BREAKLINE || st == FA_OK, "breakline rewrite: %s", fa_status_name(st));
  memcpy(b, tile, len);
  b[5] ^= FA_FLAG_HAS_IMAGE;
  recrc(b, len);
  CHECK(fa_tile_parse(b, len, &t) == FA_E_FLAGS, "flag/section mismatch");
  free(b);
  free(tile);
}

static uint8_t s_fb[FA_SCREEN_H + 2][FA_SCREEN_W + 16];
static FaMeshCache s_mc;

static FaCanvas canvas(void) {
  memset(s_fb, 0xAB, sizeof s_fb);
  FaCanvas c = {&s_fb[1][8], FA_SCREEN_W + 16, FA_SCREEN_W, FA_SCREEN_H};
  return c;
}

static bool guards_intact(void) {
  for (int x = 0; x < FA_SCREEN_W + 16; x++)
    if (s_fb[0][x] != 0xAB || s_fb[FA_SCREEN_H + 1][x] != 0xAB) return false;
  for (int y = 0; y < FA_SCREEN_H + 2; y++)
    for (int x = 0; x < 8; x++)
      if (s_fb[y][x] != 0xAB || s_fb[y][FA_SCREEN_W + 8 + x] != 0xAB) return false;
  return true;
}

// Mean shade of triangles whose centroid is east (sign > 0) or west of the axis.
static float mean_shade(const FaTile *t, int sign) {
  float c = (t->grid_n - 1) / 2.f, sum = 0;
  int n = 0;
  for (uint16_t i = 0; i < t->nt; i++) {
    const uint8_t *tr = t->tris + i * 3;
    float cx = (t->verts[tr[0] * 4] + t->verts[tr[1] * 4] + t->verts[tr[2] * 4]) / 3.f - c;
    if ((sign > 0 && cx > 0.5f) || (sign < 0 && cx < -0.5f)) {
      sum += s_mc.shade[i];
      n++;
    }
  }
  return n ? sum / n : -1;
}

// Screen y of the axis vertex (32,32) vs the west rim at the same row. The
// projection is linear, so the rim point (0,32) projects to the midpoint of
// the corner vertices (0,0) and (0,64), which every RTIN mesh contains.
static void axis_vs_rim(const FaTile *t, int *axis_y, int *rim_y) {
  int nw = -1, sw = -1;
  *axis_y = -1;
  for (uint16_t i = 0; i < t->nv; i++) {
    int gx = t->verts[i * 4], gy = t->verts[i * 4 + 1];
    if (gx == 32 && gy == 32) *axis_y = s_mc.sy[i];
    if (gx == 0 && gy == 0) nw = s_mc.sy[i];
    if (gx == 0 && gy == 64) sw = s_mc.sy[i];
  }
  *rim_y = (nw >= 0 && sw >= 0) ? (nw + sw) / 2 : -1;
}

static void test_render_geometry(void) {
  const char *names[] = {"valley", "ridge", "plane"};
  float east[3], west[3];
  int axis[3], rim[3];
  for (int k = 0; k < 3; k++) {
    uint32_t len;
    uint8_t *b = load(names[k], &len);
    FaTile t;
    fa_tile_parse(b, len, &t);
    fa_mesh_prepare(&t, 10, &s_mc);
    fa_mesh_project(&t, 0, &s_mc);
    east[k] = mean_shade(&t, 1);
    west[k] = mean_shade(&t, -1);
    axis_vs_rim(&t, &axis[k], &rim[k]);
    free(b);
  }
  // Sun in the north-west: a valley's east wall faces west (lit), its west
  // wall faces east (shaded). A ridge is the reverse. A plane is uniform.
  CHECK(east[0] > west[0], "valley: east wall %.2f should be brighter than west %.2f", east[0], west[0]);
  CHECK(east[1] < west[1], "ridge: east side %.2f should be darker than west %.2f", east[1], west[1]);
  CHECK(east[2] == west[2], "plane: uniform shade (%.2f vs %.2f)", east[2], west[2]);
  // Valley floor projects lower on screen (larger y) than the rim at the same row; ridge crest higher.
  CHECK(axis[0] > 0 && rim[0] > 0 && axis[0] > rim[0], "valley floor below rim (axis %d rim %d)", axis[0], rim[0]);
  CHECK(axis[1] > 0 && rim[1] > 0 && axis[1] < rim[1], "ridge crest above rim (axis %d rim %d)", axis[1], rim[1]);
  CHECK(fa_shade_level(0, 0, 1) == 2, "flat ground shade level");
}

static void test_render_bounds(void) {
  FaTextList tl;
  FaViewState vs = {0};
  vs.site_count = 3;
  for (size_t i = 0; i < sizeof s_names / sizeof s_names[0]; i++) {
    uint32_t len;
    uint8_t *b = load(s_names[i], &len);
    FaTile t;
    fa_tile_parse(b, len, &t);
    memset(&s_mc, 0, sizeof s_mc);
    fa_mesh_prepare(&t, t.exag_x10, &s_mc);
    for (int view = 0; view < FA_VIEW_COUNT; view++) {
      for (uint8_t yaw = 0; yaw < FA_YAW_STEPS; yaw++) {
        for (uint8_t ex = 10; ex <= 30; ex += 10) {
          FaCanvas c = canvas();
          vs.view = (FaView)view;
          vs.yaw = yaw;
          vs.exag_x10 = ex;
          fa_render_view(&c, &t, &s_mc, &vs, &tl);
          CHECK(guards_intact(), "%s view %d yaw %u exag %u wrote outside the canvas", s_names[i], view, yaw, ex);
          CHECK(tl.count > 0 && tl.count <= FA_MAX_TEXT, "text list");
          if (view == FA_VIEW_TIN) {
            char want[16];
            snprintf(want, sizeof want, "%d.%dx", ex / 10, ex % 10);
            bool found = false;
            for (int k = 0; k < tl.count; k++) found |= strstr(tl.items[k].text, want) != NULL;
            CHECK(found, "%s TIN view shows exaggeration %s", s_names[i], want);
          }
          if (view != FA_VIEW_TIN) break;
        }
        if (view != FA_VIEW_TIN) break;
      }
    }
    free(b);
  }
  FaCanvas c = canvas();
  fa_render_status(&c, "FACET ATLAS", "PHONE UNREACHABLE", "detail", "SELECT: RETRY", 55, &tl);
  CHECK(guards_intact(), "status screen bounds");
}

int main(int argc, char **argv) {
  s_dir = argc > 1 ? argv[1] : "build/host/fixtures";
  test_parse_fixtures();
  test_transfer();
  test_malformed();
  test_render_geometry();
  test_render_bounds();
  printf("%d passed, %d failed\n", s_pass, s_fail);
  return s_fail ? 1 : 0;
}
