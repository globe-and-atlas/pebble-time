'use strict';
// Base64 for Uint8Array. PebbleKit JS does not guarantee btoa/atob.

var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var REV = {};
for (var i = 0; i < ABC.length; i++) REV[ABC[i]] = i;

function encode(bytes) {
  var out = '', n = bytes.length, k;
  for (k = 0; k + 2 < n; k += 3) {
    var v = (bytes[k] << 16) | (bytes[k + 1] << 8) | bytes[k + 2];
    out += ABC[v >> 18] + ABC[(v >> 12) & 63] + ABC[(v >> 6) & 63] + ABC[v & 63];
  }
  if (n - k === 1) {
    var a = bytes[k] << 16;
    out += ABC[a >> 18] + ABC[(a >> 12) & 63] + '==';
  } else if (n - k === 2) {
    var b = (bytes[k] << 16) | (bytes[k + 1] << 8);
    out += ABC[b >> 18] + ABC[(b >> 12) & 63] + ABC[(b >> 6) & 63] + '=';
  }
  return out;
}

function decode(str) {
  str = String(str).replace(/[^A-Za-z0-9+/]/g, '');
  var out = new Uint8Array(Math.floor(str.length * 3 / 4)), o = 0, buf = 0, bits = 0;
  for (var j = 0; j < str.length; j++) {
    buf = (buf << 6) | REV[str[j]];
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out.subarray(0, o);
}

module.exports = { encode: encode, decode: decode };
