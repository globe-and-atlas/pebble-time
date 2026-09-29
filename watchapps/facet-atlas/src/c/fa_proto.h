#pragma once
// AppMessage commands and phone status codes. Mirrored in
// src/pkjs/lib/protocol.js; tools/preflight.js checks they match.

enum {
  FA_CMD_HELLO = 1,
  FA_CMD_REQ_SITE = 2,
  FA_CMD_NACK = 3,
  FA_CMD_DONE = 4,
  FA_CMD_SITES = 10,
  FA_CMD_BEGIN = 11,
  FA_CMD_CHUNK = 12,
  FA_CMD_END = 13,
  FA_CMD_SETTINGS = 14,
  FA_CMD_STATUS = 15,
};

enum {
  FA_PHONE_NO_SITES = 1,
  FA_PHONE_PREPARING = 2,
  FA_PHONE_REVIEW = 3,
  FA_PHONE_PREP_FAILED = 4,
  FA_PHONE_SEND_FAILED = 5,
  FA_PHONE_NET_OFFLINE = 6,
};

// Inbox sized for one chunk plus dictionary overhead: 1 header byte and
// 7 bytes per tuple (cmd, offset, data), ints sent as 4 bytes by PebbleKit JS.
#define FA_INBOX_BYTES 2048
#define FA_OUTBOX_BYTES 128
#define FA_CHUNK_OVERHEAD (1 + 3 * 7 + 4 + 4)
#define FA_CHUNK_MARGIN 34
#define FA_CHUNK_BYTES (FA_INBOX_BYTES - FA_CHUNK_OVERHEAD - FA_CHUNK_MARGIN)
#define FA_XFER_TIMEOUT_MS 10000
#define FA_HELLO_TIMEOUT_MS 8000
