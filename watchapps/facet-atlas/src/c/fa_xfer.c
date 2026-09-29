#include "fa_xfer.h"

#include <string.h>

void fa_xfer_init(FaXfer *x, uint8_t *buf) {
  memset(x, 0, sizeof(*x));
  x->buf = buf;
}

static FaStatus fail(FaXfer *x, FaStatus why) {
  x->state = FA_XFER_FAILED;
  x->error = why;
  return why;
}

FaStatus fa_xfer_begin(FaXfer *x, uint32_t site_id, uint32_t total, uint32_t crc) {
  x->site_id = site_id;
  x->total = total;
  x->crc = crc;
  x->received = 0;
  x->error = FA_OK;
  x->gap_reported = false;
  if (!x->buf) return fail(x, FA_E_NOMEM);
  if (total < 20) return fail(x, FA_E_SHORT);
  if (total > FA_MAX_TILE_BYTES) return fail(x, FA_E_TOO_BIG);
  x->state = FA_XFER_RECEIVING;
  return FA_OK;
}

FaStatus fa_xfer_chunk(FaXfer *x, uint32_t offset, const uint8_t *data, uint32_t len) {
  if (x->state != FA_XFER_RECEIVING) return FA_E_STATE;  // stray chunk: ignore, don't disturb
  if (offset != x->received || len == 0 || !data) {
    if (x->gap_reported) return FA_E_STATE;
    x->gap_reported = true;
    return FA_E_OFFSET;
  }
  x->gap_reported = false;
  if (len > x->total - x->received) return fail(x, FA_E_LENGTH);
  memcpy(x->buf + offset, data, len);
  x->received += len;
  return FA_OK;
}

FaStatus fa_xfer_end(FaXfer *x, uint32_t site_id, FaTile *out) {
  if (x->state != FA_XFER_RECEIVING) return fail(x, FA_E_STATE);
  if (site_id != x->site_id) return fail(x, FA_E_SITE);
  if (x->received != x->total) return fail(x, FA_E_LENGTH);
  if (fa_crc32(x->buf, x->total) != x->crc) return fail(x, FA_E_CRC);
  FaStatus st = fa_tile_parse(x->buf, x->total, out);
  if (st != FA_OK) return fail(x, st);
  if (out->site_id != site_id) return fail(x, FA_E_SITE);
  x->state = FA_XFER_COMPLETE;
  return FA_OK;
}

void fa_xfer_abort(FaXfer *x, FaStatus why) {
  if (x->state == FA_XFER_RECEIVING) fail(x, why);
}

uint8_t fa_xfer_percent(const FaXfer *x) {
  if (!x->total) return 0;
  return (uint8_t)((x->received * 100u) / x->total);
}
