#include "fa_tile.h"

#include <string.h>

#define HEADER_BYTES 16

enum { SEC_META = 1, SEC_GEO, SEC_MESH, SEC_BREAK, SEC_SLOPE, SEC_PROFILE, SEC_IMAGE, SEC_MAX };

// CRC-32 (IEEE), nibble table: 64 bytes of flash instead of 1 KB.
static const uint32_t s_crc_nibble[16] = {
  0x00000000, 0x1DB71064, 0x3B6E20C8, 0x26D930AC, 0x76DC4190, 0x6B6B51F4, 0x4DB26158, 0x5005713C,
  0xEDB88320, 0xF00F9344, 0xD6D6A3E8, 0xCB61B38C, 0x9B64C2B0, 0x86D3D2D4, 0xA00AE278, 0xBDBDF21C,
};

uint32_t fa_crc32(const uint8_t *data, uint32_t len) {
  uint32_t c = 0xFFFFFFFFu;
  for (uint32_t i = 0; i < len; i++) {
    c ^= data[i];
    c = (c >> 4) ^ s_crc_nibble[c & 15];
    c = (c >> 4) ^ s_crc_nibble[c & 15];
  }
  return c ^ 0xFFFFFFFFu;
}

static const char *const s_status_names[FA_E_COUNT] = {
  "OK", "SHORT", "MAGIC", "VERSION", "LENGTH", "CRC", "SECTION", "DUPLICATE",
  "UNKNOWN SECTION", "META", "GEO", "MESH COUNTS", "MESH INDEX", "MESH COORD",
  "DEGENERATE TRI", "INVERTED TRI", "BREAKLINE", "SLOPE", "PROFILE", "IMAGE",
  "FLAGS", "TOO BIG", "OFFSET", "STATE", "SITE", "NO MEMORY", "TIMEOUT",
};

const char *fa_status_name(FaStatus s) { return (unsigned)s < FA_E_COUNT ? s_status_names[s] : "?"; }

static FaStatus parse_meta(FaTile *t, const uint8_t *d, uint16_t len) {
  uint16_t i = 0;
  while (i < len) {
    if (i + 2 > len) return FA_E_META;
    uint8_t key = d[i], n = d[i + 1];
    if (n > FA_MAX_META_LEN || i + 2 + n > len) return FA_E_META;
    if (key == 0 || key >= FA_META_KEYS) return FA_E_META;
    for (uint8_t k = 0; k < n; k++) {
      uint8_t ch = d[i + 2 + k];
      if (ch < 32 || ch > 126) return FA_E_META;
      t->meta[key][k] = (char)ch;
    }
    t->meta[key][n] = '\0';
    i = (uint16_t)(i + 2 + n);
  }
  return FA_OK;
}

static FaStatus parse_geo(FaTile *t, const uint8_t *d, uint16_t len) {
  if (len != 30) return FA_E_GEO;
  t->lat_e5 = (int32_t)fa_rd_u32(d);
  t->lon_e5 = (int32_t)fa_rd_u32(d + 4);
  t->aoi_m = fa_rd_u16(d + 8);
  t->image_m = fa_rd_u16(d + 10);
  t->prepared_unix = fa_rd_u32(d + 12);
  t->z_min = fa_rd_i16(d + 16);
  t->z_max = fa_rd_i16(d + 18);
  t->grid_n = d[20];
  t->exag_x10 = d[21];
  for (int k = 0; k < 2; k++) {
    t->a_q[k] = fa_rd_i16(d + 22 + 2 * k);
    t->b_q[k] = fa_rd_i16(d + 26 + 2 * k);
  }
  if (t->grid_n < 2 || t->grid_n > FA_MAX_GRID_N) return FA_E_GEO;
  if (t->aoi_m == 0 || t->image_m < t->aoi_m || t->exag_x10 == 0) return FA_E_GEO;
  if (t->z_max < t->z_min) return FA_E_GEO;
  if (t->lat_e5 < -9000000 || t->lat_e5 > 9000000 || t->lon_e5 < -18000000 || t->lon_e5 > 18000000) return FA_E_GEO;
  return FA_OK;
}

static FaStatus parse_mesh(FaTile *t, const uint8_t *d, uint16_t len, uint8_t grid_n) {
  if (len < 4) return FA_E_MESH_COUNTS;
  uint16_t nv = fa_rd_u16(d), nt = fa_rd_u16(d + 2);
  if (nv < 3 || nv > FA_MAX_VERTS || nt < 1 || nt > FA_MAX_TRIS) return FA_E_MESH_COUNTS;
  if ((uint32_t)len != 4u + nv * 4u + nt * 3u) return FA_E_MESH_COUNTS;
  const uint8_t *v = d + 4, *tr = d + 4 + nv * 4;
  for (uint16_t i = 0; i < nv; i++) {
    if (v[i * 4] >= grid_n || v[i * 4 + 1] >= grid_n) return FA_E_MESH_COORD;
  }
  for (uint16_t i = 0; i < nt; i++) {
    uint8_t a = tr[i * 3], b = tr[i * 3 + 1], c = tr[i * 3 + 2];
    if (a >= nv || b >= nv || c >= nv) return FA_E_MESH_INDEX;
    int32_t ax = v[a * 4], ay = v[a * 4 + 1];
    int32_t cross = (v[b * 4] - ax) * (v[c * 4 + 1] - ay) - (v[b * 4 + 1] - ay) * (v[c * 4] - ax);
    if (cross == 0) return FA_E_DEGENERATE;
    if (cross > 0) return FA_E_INVERTED;  // grid y points south: CCW north-up is negative
  }
  t->nv = nv;
  t->nt = nt;
  t->verts = v;
  t->tris = tr;
  return FA_OK;
}

static bool is_mesh_edge(const FaTile *t, uint8_t u, uint8_t w) {
  for (uint16_t i = 0; i < t->nt; i++) {
    const uint8_t *tr = t->tris + i * 3;
    for (int e = 0; e < 3; e++) {
      uint8_t p = tr[e], q = tr[(e + 1) % 3];
      if ((p == u && q == w) || (p == w && q == u)) return true;
    }
  }
  return false;
}

// Breaklines must run along mesh edges: that is what makes them preserved
// rather than drawn over the surface.
static FaStatus parse_break(FaTile *t, const uint8_t *d, uint16_t len) {
  if (len < 1 || t->nt == 0) return FA_E_BREAKLINE;
  uint8_t np = d[0];
  if (np == 0 || np > FA_MAX_BREAK_POLYS) return FA_E_BREAKLINE;
  uint16_t q = 1, points = 0;
  for (uint8_t i = 0; i < np; i++) {
    if (q >= len) return FA_E_BREAKLINE;
    uint8_t cnt = d[q];
    if (cnt < 2 || q + 1 + cnt > len) return FA_E_BREAKLINE;
    points = (uint16_t)(points + cnt);
    if (points > FA_MAX_BREAK_POINTS) return FA_E_BREAKLINE;
    for (uint8_t k = 0; k < cnt; k++) {
      if (d[q + 1 + k] >= t->nv) return FA_E_BREAKLINE;
      if (k > 0 && !is_mesh_edge(t, d[q + k], d[q + 1 + k])) return FA_E_BREAKLINE;
    }
    q = (uint16_t)(q + 1 + cnt);
  }
  if (q != len) return FA_E_BREAKLINE;
  t->n_break = np;
  t->breaks = d + 1;
  return FA_OK;
}

FaStatus fa_tile_parse(const uint8_t *buf, uint32_t len, FaTile *t) {
  memset(t, 0, sizeof(*t));
  if (!buf || len < HEADER_BYTES + 4) return FA_E_SHORT;
  if (len > FA_MAX_TILE_BYTES) return FA_E_TOO_BIG;
  if (memcmp(buf, "FAT1", 4) != 0) return FA_E_MAGIC;
  if (buf[4] != 1) return FA_E_VERSION;
  if (fa_rd_u32(buf + 12) != len) return FA_E_LENGTH;
  if (fa_crc32(buf, len - 4) != fa_rd_u32(buf + len - 4)) return FA_E_CRC;
  t->flags = buf[5];
  t->site_id = fa_rd_u32(buf + 8);
  uint16_t nsec = fa_rd_u16(buf + 6);

  // Two passes: GEO and MESH first, since other sections refer to them.
  const uint8_t *sec_at[SEC_MAX] = {0};
  uint16_t sec_len[SEC_MAX] = {0};
  uint32_t p = HEADER_BYTES;
  for (uint16_t s = 0; s < nsec; s++) {
    if (p + 4 > len - 4) return FA_E_SECTION;
    uint8_t type = buf[p];
    uint16_t slen = fa_rd_u16(buf + p + 2);
    if (buf[p + 1] != 0) return FA_E_SECTION;
    if (p + 4 + slen > len - 4) return FA_E_SECTION;
    if (type == 0 || type >= SEC_MAX) return FA_E_UNKNOWN_SECTION;
    if (sec_at[type]) return FA_E_DUPLICATE;
    sec_at[type] = buf + p + 4;
    sec_len[type] = slen;
    p += 4u + slen;
  }
  if (p != len - 4) return FA_E_SECTION;
  if (!sec_at[SEC_GEO]) return FA_E_GEO;

  FaStatus st;
  if (sec_at[SEC_META] && (st = parse_meta(t, sec_at[SEC_META], sec_len[SEC_META])) != FA_OK) return st;
  if ((st = parse_geo(t, sec_at[SEC_GEO], sec_len[SEC_GEO])) != FA_OK) return st;
  if (sec_at[SEC_MESH] && (st = parse_mesh(t, sec_at[SEC_MESH], sec_len[SEC_MESH], t->grid_n)) != FA_OK) return st;
  if (sec_at[SEC_BREAK] && (st = parse_break(t, sec_at[SEC_BREAK], sec_len[SEC_BREAK])) != FA_OK) return st;

  if (sec_at[SEC_SLOPE]) {
    const uint8_t *d = sec_at[SEC_SLOPE];
    uint8_t n = sec_len[SEC_SLOPE] ? d[0] : 0;
    if (n < 2 || n > FA_MAX_GRID_N || sec_len[SEC_SLOPE] != 1u + (n * n + 3u) / 4u) return FA_E_SLOPE;
    t->slope_n = n;
    t->slope = d + 1;
  }
  if (sec_at[SEC_PROFILE]) {
    const uint8_t *d = sec_at[SEC_PROFILE];
    uint8_t n = sec_len[SEC_PROFILE] ? d[0] : 0;
    if (n < 2 || n > FA_MAX_PROFILE || sec_len[SEC_PROFILE] != 5u + n * 2u) return FA_E_PROFILE;
    t->prof_n = n;
    t->prof_len_m = fa_rd_u32(d + 1);
    t->prof = d + 5;
  }
  if (sec_at[SEC_IMAGE]) {
    const uint8_t *d = sec_at[SEC_IMAGE];
    if (sec_len[SEC_IMAGE] < 18) return FA_E_IMAGE;
    uint8_t w = d[0], h = d[1];
    if (!w || !h || w > FA_MAX_IMAGE_SIDE || h > FA_MAX_IMAGE_SIDE) return FA_E_IMAGE;
    if (sec_len[SEC_IMAGE] != 18u + (w * h + 1u) / 2u) return FA_E_IMAGE;
    t->img_w = w;
    t->img_h = h;
    t->palette = d + 2;
    t->img = d + 18;
  }

  // Flags must agree with the sections actually present.
  if (!!(t->flags & FA_FLAG_HAS_IMAGE) != !!t->img) return FA_E_FLAGS;
  if ((t->flags & FA_FLAG_HAS_ELEV) && !(t->nt && t->slope)) return FA_E_FLAGS;
  if (!(t->flags & FA_FLAG_HAS_ELEV) && t->nt) return FA_E_FLAGS;
  if (!!(t->flags & FA_FLAG_HAS_BREAKLINES) != !!t->n_break) return FA_E_FLAGS;
  if (t->slope && t->slope_n != t->grid_n) return FA_E_FLAGS;
  return FA_OK;
}
