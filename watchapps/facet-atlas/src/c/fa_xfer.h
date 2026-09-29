#pragma once
// Chunked tile reassembly. Platform independent (host-tested). Chunks must
// arrive in order; any gap, overrun, wrong site or bad checksum fails the
// transfer and the previous tile stays on screen.

#include "fa_tile.h"

typedef enum { FA_XFER_IDLE, FA_XFER_RECEIVING, FA_XFER_COMPLETE, FA_XFER_FAILED } FaXferState;

typedef struct {
  uint8_t *buf;  // owned by the caller, capacity FA_MAX_TILE_BYTES
  FaXferState state;
  FaStatus error;
  uint32_t site_id;
  uint32_t total;
  uint32_t received;
  uint32_t crc;
  bool gap_reported;  // one NACK per gap; later out-of-order chunks are dropped
} FaXfer;

void fa_xfer_init(FaXfer *x, uint8_t *buf);
FaStatus fa_xfer_begin(FaXfer *x, uint32_t site_id, uint32_t total, uint32_t crc);
// FA_E_OFFSET: first chunk after a gap, caller NACKs with x->received.
// FA_E_STATE: stray or repeated out-of-order chunk, caller ignores it.
FaStatus fa_xfer_chunk(FaXfer *x, uint32_t offset, const uint8_t *data, uint32_t len);
// Completes the transfer: checks length, checksum, site and full tile
// validity. On FA_OK, `out` describes the tile inside x->buf.
FaStatus fa_xfer_end(FaXfer *x, uint32_t site_id, FaTile *out);
// Abandons a transfer in progress (timeout, disconnect).
void fa_xfer_abort(FaXfer *x, FaStatus why);
uint8_t fa_xfer_percent(const FaXfer *x);
