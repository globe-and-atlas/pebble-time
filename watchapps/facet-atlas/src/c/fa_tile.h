#pragma once
// Facet Atlas tile ("FAT1") validation and parsing. Platform independent:
// compiled into the watchapp and into the host tests. Layout is specified
// in docs/TILE_FORMAT.md; limits must match src/pkjs/lib/tile.js.

#include <stdbool.h>
#include <stdint.h>

#define FA_MAX_TILE_BYTES 16384
#define FA_MAX_VERTS 255
#define FA_MAX_TRIS 480
#define FA_MAX_BREAK_POLYS 16
#define FA_MAX_BREAK_POINTS 128
#define FA_MAX_GRID_N 65
#define FA_MAX_PROFILE 64
#define FA_MAX_IMAGE_SIDE 144
#define FA_MAX_META_LEN 31
#define FA_META_KEYS 13
#define FA_PROFILE_NODATA (-32768)

enum {
  FA_FLAG_HAS_IMAGE = 1,
  FA_FLAG_HAS_ELEV = 2,
  FA_FLAG_ELEV_PARTIAL = 4,
  FA_FLAG_HAS_BREAKLINES = 8,
  FA_FLAG_IMAGE_PARTIAL = 16,
  FA_FLAG_IMAGE_CLOUDY = 32,
};

enum {
  FA_META_NAME = 1,
  FA_META_ELEV_SRC = 2,
  FA_META_ELEV_DATE = 3,
  FA_META_H_REF = 4,
  FA_META_V_REF = 5,
  FA_META_ELEV_RES = 6,
  FA_META_SIMPLIFY = 7,
  FA_META_IMG_SRC = 8,
  FA_META_IMG_DATE = 9,
  FA_META_IMG_NOTE = 10,
  FA_META_ELEV_NOTE = 11,
  FA_META_BREAKLINES = 12,
};

typedef enum {
  FA_OK = 0,
  FA_E_SHORT,
  FA_E_MAGIC,
  FA_E_VERSION,
  FA_E_LENGTH,
  FA_E_CRC,
  FA_E_SECTION,
  FA_E_DUPLICATE,
  FA_E_UNKNOWN_SECTION,
  FA_E_META,
  FA_E_GEO,
  FA_E_MESH_COUNTS,
  FA_E_MESH_INDEX,
  FA_E_MESH_COORD,
  FA_E_DEGENERATE,
  FA_E_INVERTED,
  FA_E_BREAKLINE,
  FA_E_SLOPE,
  FA_E_PROFILE,
  FA_E_IMAGE,
  FA_E_FLAGS,
  FA_E_TOO_BIG,
  FA_E_OFFSET,
  FA_E_STATE,
  FA_E_SITE,
  FA_E_NOMEM,
  FA_E_TIMEOUT,
  FA_E_COUNT
} FaStatus;

typedef struct {
  uint32_t site_id;
  uint8_t flags;
  char meta[FA_META_KEYS][FA_MAX_META_LEN + 1];  // "" when absent

  int32_t lat_e5, lon_e5;
  uint16_t aoi_m, image_m;
  uint32_t prepared_unix;
  int16_t z_min, z_max;
  uint8_t grid_n, exag_x10;
  int16_t a_q[2], b_q[2];  // profile endpoints, quarter grid cells from NW

  uint16_t nv, nt;
  const uint8_t *verts;  // nv x {u8 gx, u8 gy, i16le z}
  const uint8_t *tris;   // nt x {u8 a, u8 b, u8 c}, CCW north-up

  uint8_t n_break;
  const uint8_t *breaks;  // n_break x {u8 count, count x u8 vertex}

  uint8_t slope_n;
  const uint8_t *slope;  // 2 bits per cell, row-major from NW

  uint8_t prof_n;
  uint32_t prof_len_m;
  const uint8_t *prof;  // prof_n x i16le metres, FA_PROFILE_NODATA = gap

  uint8_t img_w, img_h;
  const uint8_t *palette;  // 16 GColor8 values; index 0 = no imagery
  const uint8_t *img;      // 4 bits per pixel, high nibble first
} FaTile;

uint32_t fa_crc32(const uint8_t *data, uint32_t len);

// Validates every byte of `buf` and fills `out` (which points into buf).
// Returns FA_OK only if the tile is complete, consistent and renderable.
FaStatus fa_tile_parse(const uint8_t *buf, uint32_t len, FaTile *out);

const char *fa_status_name(FaStatus s);

static inline int16_t fa_rd_i16(const uint8_t *p) { return (int16_t)(uint16_t)(p[0] | (p[1] << 8)); }
static inline uint16_t fa_rd_u16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
static inline uint32_t fa_rd_u32(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static inline uint8_t fa_slope_at(const FaTile *t, int k) { return (uint8_t)((t->slope[k >> 2] >> ((k & 3) * 2)) & 3); }
static inline uint8_t fa_pixel_at(const FaTile *t, int k) {
  return (uint8_t)((t->img[k >> 1] >> ((k & 1) ? 0 : 4)) & 15);
}
