'use strict';
// AppMessage commands and status codes. Mirrored in src/c/fa_proto.h;
// tools/preflight.js fails the build if the two drift apart.

var CMD = {
  HELLO: 1,      // watch -> phone: {chunk}  app started, max chunk bytes
  REQ_SITE: 2,   // watch -> phone: {index}  send this saved site
  NACK: 3,       // watch -> phone: {offset, status}  resume from offset / failed
  DONE: 4,       // watch -> phone: {site, status}  0 = tile accepted
  SITES: 10,     // phone -> watch: {count, index, status}
  BEGIN: 11,     // phone -> watch: {site, total, crc, index, count}
  CHUNK: 12,     // phone -> watch: {offset, data}
  END: 13,       // phone -> watch: {site}
  SETTINGS: 14,  // phone -> watch: {exag}
  STATUS: 15     // phone -> watch: {status, text}
};

// STATUS codes (phone -> watch).
var PHONE = {
  NO_SITES: 1,
  PREPARING: 2,
  REVIEW: 3,       // prepared, waiting for the user to review it on the phone
  PREP_FAILED: 4,
  SEND_FAILED: 5,
  NET_OFFLINE: 6   // no network; watch is being served from the phone cache
};

// Watch transfer error codes are FaStatus values from src/c/fa_tile.h.
var FA_E_OFFSET = 22;

module.exports = { CMD: CMD, PHONE: PHONE, FA_E_OFFSET: FA_E_OFFSET };
