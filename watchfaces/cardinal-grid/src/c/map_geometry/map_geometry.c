#define MG_TERRAIN_DEFINE
#include "map_geometry.h"

typedef struct {
  int16_t x4, y4; /* quarter pixels, world space (x east, y north) */
} WorldPt;

typedef struct {
  WorldPt a, b;
} WorldSeg;

static WorldSeg s_coast[MG_MAX_SEGS];
static uint8_t  s_ncoast;
static bool     s_ready;

static MgProjected s_cache;
static uint32_t    s_projections;

/* Round-to-nearest signed division. */
static int32_t div_round(int32_t n, int32_t d) {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  return (n >= 0 ? n + d / 2 : n - d / 2) / d;
}

/* Where the sea-level contour crosses TIN edge (i, j). The lower vertex index is always
 * the interpolation origin, so two triangles sharing an edge agree exactly. */
static WorldPt crossing(uint8_t i, uint8_t j) {
  if (i > j) {
    const uint8_t t = i;
    i = j;
    j = t;
  }
  const int32_t dz = (int32_t)mg_vz[j] - mg_vz[i];
  const int32_t t = (int32_t)MG_SEA_LEVEL_M - mg_vz[i];
  return (WorldPt){(int16_t)(mg_vx4[i] + div_round(((int32_t)mg_vx4[j] - mg_vx4[i]) * t, dz)),
                   (int16_t)(mg_vy4[i] + div_round(((int32_t)mg_vy4[j] - mg_vy4[i]) * t, dz))};
}

void mg_init(void) {
  if (s_ready) return;
  s_ncoast = 0;
  for (int t = 0; t < MG_NT; ++t) {
    const uint8_t v[3] = {mg_tri[t][0], mg_tri[t][1], mg_tri[t][2]};
    bool above[3];
    int n_above = 0;
    for (int k = 0; k < 3; ++k) {
      above[k] = mg_vz[v[k]] > MG_SEA_LEVEL_M;
      n_above += above[k];
    }
    if (n_above == 0 || n_above == 3) continue; /* wholly land or wholly sea */
    /* The lone vertex is the one on the minority side of the contour. */
    const bool lone_is_above = (n_above == 1);
    int lone = 0;
    for (int k = 0; k < 3; ++k) {
      if (above[k] == lone_is_above) lone = k;
    }
    const uint8_t l = v[lone], p = v[(lone + 1) % 3], q = v[(lone + 2) % 3];
    if (s_ncoast < MG_MAX_SEGS) {
      s_coast[s_ncoast++] = (WorldSeg){crossing(l, p), crossing(l, q)};
    }
  }
  s_ready = true;
}

int mg_coast_segments(void) { return s_ncoast; }

uint32_t mg_projection_count(void) { return s_projections; }

/* World (e, n) in quarter pixels to instrument pixel offsets for a clockwise dial
 * rotation theta: x = e cos + n sin,  y(down) = e sin - n cos. */
static MgPt project_point(int32_t e4, int32_t n4, int32_t s, int32_t c) {
  const int32_t x = e4 * c + n4 * s;
  const int32_t y = e4 * s - n4 * c;
  return (MgPt){(int16_t)div_round(x, 4 * 32768), (int16_t)div_round(y, 4 * 32768)};
}

const MgProjected *mg_project(uint16_t key, int32_t sin_q15, int32_t cos_q15) {
  mg_init();
  if (s_cache.valid && s_cache.key == key) return &s_cache;
  for (int i = 0; i < MG_NV; ++i) {
    s_cache.v[i] = project_point(mg_vx4[i], mg_vy4[i], sin_q15, cos_q15);
  }
  for (int i = 0; i < s_ncoast; ++i) {
    s_cache.coast[i].a = project_point(s_coast[i].a.x4, s_coast[i].a.y4, sin_q15, cos_q15);
    s_cache.coast[i].b = project_point(s_coast[i].b.x4, s_coast[i].b.y4, sin_q15, cos_q15);
  }
  s_cache.ncoast = s_ncoast;
  s_cache.key = key;
  s_cache.valid = true;
  ++s_projections;
  return &s_cache;
}

void mg_triangle(int i, uint8_t *a, uint8_t *b, uint8_t *c) {
  *a = mg_tri[i][0];
  *b = mg_tri[i][1];
  *c = mg_tri[i][2];
}

bool mg_triangle_filled(int i) { return mg_tri_fill[i] != 0; }

void mg_edge_ends(int i, uint8_t *a, uint8_t *b) {
  *a = mg_edge[i][0];
  *b = mg_edge[i][1];
}

uint8_t mg_ridge_vertex(int i) { return mg_ridge[i]; }
