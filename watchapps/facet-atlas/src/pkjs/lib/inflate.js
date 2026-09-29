'use strict';
// Raw DEFLATE (RFC 1951) and zlib (RFC 1950) decoder. PebbleKit JS has no
// zlib, and both data sources ship DEFLATE-compressed GeoTIFF tiles.

var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289,
  16385, 24577];
var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
var CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// Canonical Huffman table: counts per length and symbols sorted by code.
function buildHuffman(lengths, n) {
  var counts = new Uint16Array(16);
  var symbols = new Uint16Array(n);
  var offs = new Uint16Array(16);
  var i;
  for (i = 0; i < n; i++) counts[lengths[i]]++;
  counts[0] = 0;
  for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  for (i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts: counts, symbols: symbols };
}

function Inflater(src) {
  this.src = src;
  this.pos = 0;
  this.bitBuf = 0;
  this.bitCnt = 0;
  this.out = new Uint8Array(Math.max(1024, src.length * 4));
  this.outLen = 0;
}

Inflater.prototype.bits = function (n) {
  while (this.bitCnt < n) {
    if (this.pos >= this.src.length) throw new Error('inflate: unexpected end of data');
    this.bitBuf |= this.src[this.pos++] << this.bitCnt;
    this.bitCnt += 8;
  }
  var v = this.bitBuf & ((1 << n) - 1);
  this.bitBuf >>>= n;
  this.bitCnt -= n;
  return v;
};

Inflater.prototype.decodeSym = function (h) {
  var code = 0, first = 0, index = 0;
  for (var len = 1; len < 16; len++) {
    code |= this.bits(1);
    var count = h.counts[len];
    if (code - count < first) return h.symbols[index + (code - first)];
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new Error('inflate: bad Huffman code');
};

Inflater.prototype.ensure = function (n) {
  if (this.outLen + n <= this.out.length) return;
  var size = this.out.length * 2;
  while (size < this.outLen + n) size *= 2;
  var grown = new Uint8Array(size);
  grown.set(this.out.subarray(0, this.outLen));
  this.out = grown;
};

Inflater.prototype.stored = function () {
  this.bitBuf = 0;
  this.bitCnt = 0;
  if (this.pos + 4 > this.src.length) throw new Error('inflate: truncated stored block');
  var len = this.src[this.pos] | (this.src[this.pos + 1] << 8);
  var nlen = this.src[this.pos + 2] | (this.src[this.pos + 3] << 8);
  if ((len ^ 0xffff) !== nlen) throw new Error('inflate: stored length mismatch');
  this.pos += 4;
  if (this.pos + len > this.src.length) throw new Error('inflate: truncated stored block');
  this.ensure(len);
  this.out.set(this.src.subarray(this.pos, this.pos + len), this.outLen);
  this.outLen += len;
  this.pos += len;
};

Inflater.prototype.codes = function (lit, dist) {
  for (;;) {
    var sym = this.decodeSym(lit);
    if (sym < 256) {
      this.ensure(1);
      this.out[this.outLen++] = sym;
    } else if (sym === 256) {
      return;
    } else {
      sym -= 257;
      if (sym >= 29) throw new Error('inflate: bad length symbol');
      var len = LEN_BASE[sym] + this.bits(LEN_EXTRA[sym]);
      var ds = this.decodeSym(dist);
      if (ds >= 30) throw new Error('inflate: bad distance symbol');
      var d = DIST_BASE[ds] + this.bits(DIST_EXTRA[ds]);
      if (d > this.outLen) throw new Error('inflate: distance too far back');
      this.ensure(len);
      for (var i = 0; i < len; i++) {
        this.out[this.outLen] = this.out[this.outLen - d];
        this.outLen++;
      }
    }
  }
};

var fixedLit = null, fixedDist = null;
function fixedTables() {
  if (fixedLit) return;
  var l = new Uint8Array(288), i;
  for (i = 0; i < 144; i++) l[i] = 8;
  for (; i < 256; i++) l[i] = 9;
  for (; i < 280; i++) l[i] = 7;
  for (; i < 288; i++) l[i] = 8;
  fixedLit = buildHuffman(l, 288);
  var d = new Uint8Array(30);
  for (i = 0; i < 30; i++) d[i] = 5;
  fixedDist = buildHuffman(d, 30);
}

Inflater.prototype.dynamic = function () {
  var nlen = this.bits(5) + 257, ndist = this.bits(5) + 1, ncode = this.bits(4) + 4;
  if (nlen > 286 || ndist > 30) throw new Error('inflate: bad table counts');
  var cl = new Uint8Array(19), i;
  for (i = 0; i < ncode; i++) cl[CL_ORDER[i]] = this.bits(3);
  var clh = buildHuffman(cl, 19);
  var lengths = new Uint8Array(nlen + ndist);
  i = 0;
  while (i < nlen + ndist) {
    var sym = this.decodeSym(clh), rep, val = 0;
    if (sym < 16) { lengths[i++] = sym; continue; }
    if (sym === 16) {
      if (i === 0) throw new Error('inflate: repeat with no previous length');
      val = lengths[i - 1];
      rep = 3 + this.bits(2);
    } else if (sym === 17) {
      rep = 3 + this.bits(3);
    } else {
      rep = 11 + this.bits(7);
    }
    if (i + rep > nlen + ndist) throw new Error('inflate: too many lengths');
    while (rep--) lengths[i++] = val;
  }
  this.codes(buildHuffman(lengths.subarray(0, nlen), nlen),
    buildHuffman(lengths.subarray(nlen), ndist));
};

// Decode raw DEFLATE data. Throws on any malformed or truncated input.
function inflateRaw(src) {
  var z = new Inflater(src);
  var last;
  do {
    last = z.bits(1);
    var type = z.bits(2);
    if (type === 0) z.stored();
    else if (type === 1) { fixedTables(); z.codes(fixedLit, fixedDist); }
    else if (type === 2) z.dynamic();
    else throw new Error('inflate: invalid block type');
  } while (!last);
  return z.out.slice(0, z.outLen);
}

// Decode a zlib stream (TIFF compression 8/32946 stores zlib, not raw).
function inflate(src) {
  if (src.length < 2) throw new Error('inflate: truncated zlib header');
  var cmf = src[0], flg = src[1];
  if ((cmf & 15) !== 8 || ((cmf << 8) | flg) % 31 !== 0) {
    throw new Error('inflate: not a zlib stream');
  }
  if (flg & 32) throw new Error('inflate: preset dictionary unsupported');
  return inflateRaw(src.subarray(2));
}

module.exports = { inflate: inflate, inflateRaw: inflateRaw };
