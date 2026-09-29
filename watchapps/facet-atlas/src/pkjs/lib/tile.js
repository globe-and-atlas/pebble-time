'use strict';
// Facet Atlas tile ("FAT1") encoder and decoder. The byte layout is
// specified in docs/TILE_FORMAT.md and mirrored by src/c/fa_tile.c; the
// limits below must match src/c/fa_tile.h (checked by tools/preflight.js).

var LIMITS = {
  maxTileBytes: 16384,
  maxVerts: 255,
  maxTris: 480,
  maxBreakPolys: 16,
  maxBreakPoints: 128,
  maxGridN: 65,
  maxProfile: 64,
  maxImageSide: 144,
  maxMetaLen: 31
};

var SEC = { META: 1, GEO: 2, MESH: 3, BREAK: 4, SLOPE: 5, PROFILE: 6, IMAGE: 7 };
var FLAG = {
  HAS_IMAGE: 1, HAS_ELEV: 2, ELEV_PARTIAL: 4, HAS_BREAKLINES: 8,
  IMAGE_PARTIAL: 16, IMAGE_CLOUDY: 32
};
var META = {
  NAME: 1, ELEV_SRC: 2, ELEV_DATE: 3, H_REF: 4, V_REF: 5, ELEV_RES: 6,
  SIMPLIFY: 7, IMG_SRC: 8, IMG_DATE: 9, IMG_NOTE: 10, ELEV_NOTE: 11, BREAKLINES: 12
};
var HEADER_BYTES = 16;
var PROFILE_NODATA = -32768;

var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes, start, end) {
  var c = 0xFFFFFFFF;
  for (var i = start || 0, e = end === undefined ? bytes.length : end; i < e; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function Writer() { this.b = []; }
Writer.prototype.u8 = function (v) { this.b.push(v & 0xFF); };
Writer.prototype.u16 = function (v) { this.u8(v); this.u8(v >> 8); };
Writer.prototype.i16 = function (v) { this.u16(v & 0xFFFF); };
Writer.prototype.u32 = function (v) { this.u16(v & 0xFFFF); this.u16((v >>> 16) & 0xFFFF); };
Writer.prototype.i32 = function (v) { this.u32(v >>> 0); };
Writer.prototype.bytes = function (a) { for (var i = 0; i < a.length; i++) this.u8(a[i]); };

function asciiClean(s) {
  s = String(s === undefined || s === null ? '' : s);
  var out = '';
  for (var i = 0; i < s.length && out.length < LIMITS.maxMetaLen; i++) {
    var c = s.charCodeAt(i);
    out += c >= 32 && c < 127 ? s[i] : '?';
  }
  return out;
}

function clampI16(v) { return Math.max(-32767, Math.min(32767, Math.round(v))); }

// tile = { siteId, flags, meta:{key:str}, geo:{...}, mesh?, breaklines?,
//          slope?, profile?, image? } -> Uint8Array
function encode(tile) {
  var sections = [];
  function section(type, fill) { var w = new Writer(); fill(w); sections.push({ type: type, data: w.b }); }

  section(SEC.META, function (w) {
    Object.keys(tile.meta || {}).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
      var s = asciiClean(tile.meta[k]);
      if (!s) return;
      w.u8(k); w.u8(s.length);
      for (var i = 0; i < s.length; i++) w.u8(s.charCodeAt(i));
    });
  });
  var g = tile.geo;
  section(SEC.GEO, function (w) {
    w.i32(Math.round(g.lat * 1e5)); w.i32(Math.round(g.lon * 1e5));
    w.u16(g.aoiM); w.u16(g.imageM); w.u32(g.preparedUnix);
    w.i16(clampI16(g.zMin)); w.i16(clampI16(g.zMax));
    w.u8(g.gridN); w.u8(g.exagX10);
    w.i16(g.aQ[0]); w.i16(g.aQ[1]); w.i16(g.bQ[0]); w.i16(g.bQ[1]);
  });
  if (tile.mesh) {
    var m = tile.mesh;
    if (m.verts.length > LIMITS.maxVerts || m.tris.length > LIMITS.maxTris) throw new Error('tile: mesh over budget');
    section(SEC.MESH, function (w) {
      w.u16(m.verts.length); w.u16(m.tris.length);
      m.verts.forEach(function (v, i) { w.u8(v[0]); w.u8(v[1]); w.i16(clampI16(m.z[i])); });
      m.tris.forEach(function (t) { w.u8(t[0]); w.u8(t[1]); w.u8(t[2]); });
    });
  }
  if (tile.breaklines && tile.breaklines.length) {
    section(SEC.BREAK, function (w) {
      w.u8(tile.breaklines.length);
      tile.breaklines.forEach(function (poly) { w.u8(poly.length); w.bytes(poly); });
    });
  }
  if (tile.slope) {
    section(SEC.SLOPE, function (w) {
      var n = tile.slope.n, cls = tile.slope.classes, packed = new Uint8Array(Math.ceil(n * n / 4));
      for (var k = 0; k < n * n; k++) packed[k >> 2] |= (cls[k] & 3) << ((k & 3) * 2);
      w.u8(n); w.bytes(packed);
    });
  }
  if (tile.profile) {
    section(SEC.PROFILE, function (w) {
      var p = tile.profile;
      w.u8(p.z.length); w.u32(Math.round(p.lengthM));
      p.z.forEach(function (z) { w.i16(isFinite(z) ? clampI16(z) : PROFILE_NODATA); });
    });
  }
  if (tile.image) {
    section(SEC.IMAGE, function (w) {
      var im = tile.image, packed = new Uint8Array(Math.ceil(im.w * im.h / 2));
      for (var k = 0; k < im.w * im.h; k++) packed[k >> 1] |= (im.pixels[k] & 15) << (k & 1 ? 0 : 4);
      w.u8(im.w); w.u8(im.h); w.bytes(im.palette); w.bytes(packed);
    });
  }

  var body = new Writer();
  var total = HEADER_BYTES + 4;
  sections.forEach(function (s) { total += 4 + s.data.length; });
  body.bytes([0x46, 0x41, 0x54, 0x31]); // "FAT1"
  body.u8(1); body.u8(tile.flags); body.u16(sections.length);
  body.u32(tile.siteId >>> 0); body.u32(total);
  sections.forEach(function (s) {
    if (s.data.length > 0xFFFF) throw new Error('tile: section too large');
    body.u8(s.type); body.u8(0); body.u16(s.data.length); body.bytes(s.data);
  });
  var out = new Uint8Array(total);
  out.set(body.b);
  var crc = crc32(out, 0, total - 4);
  out[total - 4] = crc & 0xFF; out[total - 3] = (crc >>> 8) & 0xFF;
  out[total - 2] = (crc >>> 16) & 0xFF; out[total - 1] = (crc >>> 24) & 0xFF;
  if (total > LIMITS.maxTileBytes) throw new Error('tile: ' + total + ' bytes exceeds ' + LIMITS.maxTileBytes);
  return out;
}

// Decoder used by tests and the phone preview. Throws on anything the
// watch would reject; the watch has its own independent C validator.
function decode(bytes) {
  if (bytes.length < HEADER_BYTES + 4) throw new Error('tile: too short');
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'FAT1') throw new Error('tile: bad magic');
  if (bytes[4] !== 1) throw new Error('tile: unsupported version');
  var total = dv.getUint32(12, true);
  if (total !== bytes.length) throw new Error('tile: length mismatch');
  if (crc32(bytes, 0, total - 4) !== dv.getUint32(total - 4, true)) throw new Error('tile: CRC mismatch');
  var t = { flags: bytes[5], siteId: dv.getUint32(8, true), meta: {} };
  var nsec = dv.getUint16(6, true), p = HEADER_BYTES, seen = {};
  for (var s = 0; s < nsec; s++) {
    if (p + 4 > total - 4) throw new Error('tile: section header overruns');
    var type = bytes[p], len = dv.getUint16(p + 2, true), d = p + 4;
    if (d + len > total - 4) throw new Error('tile: section overruns');
    if (seen[type]) throw new Error('tile: duplicate section');
    seen[type] = true;
    decodeSection(t, type, bytes, dv, d, len);
    p = d + len;
  }
  if (p !== total - 4) throw new Error('tile: trailing bytes');
  if (!t.geo) throw new Error('tile: missing GEO');
  if ((t.flags & FLAG.HAS_IMAGE) && !t.image) throw new Error('tile: flag says image, none present');
  if ((t.flags & FLAG.HAS_ELEV) && !(t.mesh && t.slope)) throw new Error('tile: flag says elevation, no mesh');
  return t;
}

function decodeSection(t, type, bytes, dv, d, len) {
  var i, k;
  switch (type) {
    case SEC.META:
      for (i = d; i < d + len;) {
        if (i + 2 > d + len) throw new Error('tile: META truncated');
        var key = bytes[i], n = bytes[i + 1];
        if (n > LIMITS.maxMetaLen || i + 2 + n > d + len) throw new Error('tile: META entry bad');
        t.meta[key] = String.fromCharCode.apply(null, bytes.subarray(i + 2, i + 2 + n));
        i += 2 + n;
      }
      break;
    case SEC.GEO:
      if (len !== 30) throw new Error('tile: GEO length');
      t.geo = {
        lat: dv.getInt32(d, true) / 1e5, lon: dv.getInt32(d + 4, true) / 1e5,
        aoiM: dv.getUint16(d + 8, true), imageM: dv.getUint16(d + 10, true),
        preparedUnix: dv.getUint32(d + 12, true),
        zMin: dv.getInt16(d + 16, true), zMax: dv.getInt16(d + 18, true),
        gridN: bytes[d + 20], exagX10: bytes[d + 21],
        aQ: [dv.getInt16(d + 22, true), dv.getInt16(d + 24, true)],
        bQ: [dv.getInt16(d + 26, true), dv.getInt16(d + 28, true)]
      };
      if (t.geo.gridN < 2 || t.geo.gridN > LIMITS.maxGridN) throw new Error('tile: grid size');
      if (!t.geo.exagX10) throw new Error('tile: zero exaggeration');
      break;
    case SEC.MESH: {
      var nv = dv.getUint16(d, true), nt = dv.getUint16(d + 2, true);
      if (nv < 3 || nv > LIMITS.maxVerts || nt < 1 || nt > LIMITS.maxTris) throw new Error('tile: mesh counts');
      if (len !== 4 + nv * 4 + nt * 3) throw new Error('tile: MESH length');
      var m = { verts: [], z: [], tris: [] };
      for (i = 0; i < nv; i++) { k = d + 4 + i * 4; m.verts.push([bytes[k], bytes[k + 1]]); m.z.push(dv.getInt16(k + 2, true)); }
      for (i = 0; i < nt; i++) {
        k = d + 4 + nv * 4 + i * 3;
        var tri = [bytes[k], bytes[k + 1], bytes[k + 2]];
        if (tri[0] >= nv || tri[1] >= nv || tri[2] >= nv) throw new Error('tile: triangle index out of range');
        var a = m.verts[tri[0]], b = m.verts[tri[1]], c = m.verts[tri[2]];
        var cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cross === 0) throw new Error('tile: degenerate triangle ' + i);
        if (cross > 0) throw new Error('tile: inverted triangle ' + i);
        m.tris.push(tri);
      }
      t.mesh = m;
      break;
    }
    case SEC.BREAK: {
      var np = bytes[d], q = d + 1, polys = [];
      if (np > LIMITS.maxBreakPolys) throw new Error('tile: too many breaklines');
      for (i = 0; i < np; i++) {
        if (q >= d + len) throw new Error('tile: BREAK truncated');
        var cnt = bytes[q];
        if (cnt < 2 || q + 1 + cnt > d + len) throw new Error('tile: BREAK polyline bad');
        polys.push(Array.prototype.slice.call(bytes.subarray(q + 1, q + 1 + cnt)));
        q += 1 + cnt;
      }
      if (q !== d + len) throw new Error('tile: BREAK length');
      t.breaklines = polys;
      break;
    }
    case SEC.SLOPE: {
      var sn = bytes[d];
      if (sn < 2 || sn > LIMITS.maxGridN || len !== 1 + Math.ceil(sn * sn / 4)) throw new Error('tile: SLOPE length');
      var cls = new Uint8Array(sn * sn);
      for (k = 0; k < sn * sn; k++) cls[k] = (bytes[d + 1 + (k >> 2)] >> ((k & 3) * 2)) & 3;
      t.slope = { n: sn, classes: cls };
      break;
    }
    case SEC.PROFILE: {
      var pc = bytes[d];
      if (pc < 2 || pc > LIMITS.maxProfile || len !== 5 + pc * 2) throw new Error('tile: PROFILE length');
      var pz = [];
      for (i = 0; i < pc; i++) { var v = dv.getInt16(d + 5 + i * 2, true); pz.push(v === PROFILE_NODATA ? NaN : v); }
      t.profile = { lengthM: dv.getUint32(d + 1, true), z: pz };
      break;
    }
    case SEC.IMAGE: {
      var w = bytes[d], h = bytes[d + 1];
      if (!w || !h || w > LIMITS.maxImageSide || h > LIMITS.maxImageSide) throw new Error('tile: image size');
      if (len !== 2 + 16 + Math.ceil(w * h / 2)) throw new Error('tile: IMAGE length');
      var px = new Uint8Array(w * h);
      for (k = 0; k < w * h; k++) px[k] = (bytes[d + 18 + (k >> 1)] >> (k & 1 ? 0 : 4)) & 15;
      t.image = { w: w, h: h, palette: Array.prototype.slice.call(bytes.subarray(d + 2, d + 18)), pixels: px };
      break;
    }
    default:
      throw new Error('tile: unknown section ' + type);
  }
}

module.exports = {
  LIMITS: LIMITS, SEC: SEC, FLAG: FLAG, META: META, HEADER_BYTES: HEADER_BYTES,
  PROFILE_NODATA: PROFILE_NODATA, crc32: crc32, encode: encode, decode: decode
};
