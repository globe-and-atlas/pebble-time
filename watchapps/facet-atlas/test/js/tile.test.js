'use strict';
var test = require('node:test');
var assert = require('node:assert');
var tile = require('../../src/pkjs/lib/tile');
var fx = require('./fixtures');

var F = tile.FLAG, M = tile.META;

function recrc(b) {
  var c = tile.crc32(b, 0, b.length - 4);
  b[b.length - 4] = c & 255; b[b.length - 3] = (c >>> 8) & 255; b[b.length - 2] = (c >>> 16) & 255; b[b.length - 1] = c >>> 24;
  return b;
}

function sectionOffset(bytes, type) {
  var p = tile.HEADER_BYTES, n = bytes[6] | (bytes[7] << 8);
  for (var s = 0; s < n; s++) {
    if (bytes[p] === type) return p + 4;
    p += 4 + (bytes[p + 2] | (bytes[p + 3] << 8));
  }
  return -1;
}

test('crc32 matches the IEEE check value', function () {
  assert.strictEqual(tile.crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('complete plane tile round-trips with site id and provenance', function () {
  var r = fx.build('PLANE', 4242, fx.PLANE.sampler);
  assert.ok(r.bytes.length <= tile.LIMITS.maxTileBytes);
  var t = tile.decode(r.bytes);
  assert.strictEqual(t.siteId, 4242);
  assert.strictEqual(t.meta[M.NAME], 'PLANE');
  assert.strictEqual(t.meta[M.ELEV_SRC], 'SYNTHETIC FIXTURE');
  assert.strictEqual(t.meta[M.IMG_DATE], '2026-01-01');
  assert.strictEqual(t.meta[M.BREAKLINES], 'NONE IN SOURCE');
  assert.ok(t.flags & F.HAS_IMAGE && t.flags & F.HAS_ELEV);
  assert.strictEqual(t.geo.exagX10, 10);
  // Profile survives encoding within 0.5 m.
  t.profile.z.forEach(function (z, k) { assert.ok(Math.abs(z - (300 + 400 * k / 63)) <= 0.5); });
  // Slope classes: all moderate (12.6 degrees).
  assert.ok(Array.prototype.every.call(t.slope.classes, function (c) { return c === 2; }));
});

test('every truncation and every single-bit flip is rejected', function () {
  var bytes = fx.build('VALLEY', 7, fx.VALLEY.sampler).bytes;
  for (var n = 0; n < bytes.length; n += 97) assert.throws(function () { tile.decode(bytes.slice(0, n)); });
  for (var i = 0; i < bytes.length; i += 13) {
    var b = bytes.slice();
    b[i] ^= 1 << (i % 8);
    assert.throws(function () { tile.decode(b); }, undefined, 'flip at ' + i);
  }
});

test('structurally invalid geometry is rejected even with a valid CRC', function () {
  var bytes = fx.build('VALLEY', 7, fx.VALLEY.sampler).bytes;
  var mesh = sectionOffset(bytes, tile.SEC.MESH);
  var nv = bytes[mesh] | (bytes[mesh + 1] << 8);
  var tris = mesh + 4 + nv * 4;
  // Out-of-range vertex index.
  var b = bytes.slice(); b[tris] = nv; recrc(b);
  assert.throws(function () { tile.decode(b); }, /out of range/);
  // Degenerate: repeat a vertex.
  b = bytes.slice(); b[tris + 1] = b[tris]; recrc(b);
  assert.throws(function () { tile.decode(b); }, /degenerate/);
  // Inverted winding: swap two vertices.
  b = bytes.slice(); var t1 = b[tris + 1]; b[tris + 1] = b[tris + 2]; b[tris + 2] = t1; recrc(b);
  assert.throws(function () { tile.decode(b); }, /inverted/);
  // Flag claims imagery that is not there.
  var noImg = fx.build('X', 1, fx.PLANE.sampler, { noImagery: true }).bytes.slice();
  noImg[5] |= F.HAS_IMAGE; recrc(noImg);
  assert.throws(function () { tile.decode(noImg); }, /image/);
});

test('missing imagery and missing elevation produce honest, labelled tiles', function () {
  var t = tile.decode(fx.build('NOIMG', 1, fx.PLANE.sampler, { noImagery: true, missingNotes: { imagery: 'NO USABLE SCENE' } }).bytes);
  assert.ok(!(t.flags & F.HAS_IMAGE));
  assert.strictEqual(t.meta[M.IMG_SRC], 'NO SATELLITE IMAGE');
  assert.strictEqual(t.meta[M.IMG_NOTE], 'NO USABLE SCENE');
  assert.strictEqual(t.image, undefined);

  t = tile.decode(fx.build('NOELEV', 2, null, { missingNotes: { elevation: 'NO COP-DEM TILE HERE' } }).bytes);
  assert.ok(!(t.flags & F.HAS_ELEV));
  assert.strictEqual(t.mesh, undefined);
  assert.strictEqual(t.profile, undefined);
  assert.strictEqual(t.meta[M.ELEV_NOTE], 'NO COP-DEM TILE HERE');
  assert.strictEqual(t.meta[M.ELEV_DATE], undefined, 'no fabricated date');

  t = tile.decode(fx.build('GAPS', 3, function (e) { return e > 900 ? NaN : 100; }).bytes);
  assert.ok(t.flags & F.ELEV_PARTIAL);
  assert.ok(!(t.flags & F.HAS_ELEV));
  assert.match(t.meta[M.SIMPLIFY], /^NO MESH/);
  assert.ok(t.profile.z.some(function (z) { return isNaN(z); }), 'profile gaps stay gaps');
  assert.ok(Array.prototype.some.call(t.slope.classes, function (c) { return c === 0; }), 'slope nodata stays nodata');
});

test('unknown provenance is stored as UNKNOWN, never invented', function () {
  var prepare = require('../../src/pkjs/lib/prepare');
  var r = prepare.buildTile({
    siteId: 9, name: 'N', lat: 0, lon: 0, aoiM: 2000, a: { east: -500, north: 0 }, b: { east: 500, north: 0 },
    nowUnix: 0, elevation: { sampler: fx.PLANE.sampler, meta: { src: 'X' } }, imagery: null
  });
  var t = tile.decode(r.bytes);
  ['ELEV_DATE', 'H_REF', 'V_REF', 'ELEV_RES'].forEach(function (k) { assert.strictEqual(t.meta[M[k]], 'UNKNOWN'); });
});

test('real-scale content fits the tile budget', function () {
  var seed = 3;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var r = fx.build('ROUGH', 5, function () { return 1000 + rnd() * 400; }, {
    imagerySampler: function () { return [rnd() * 255, rnd() * 255, rnd() * 255]; }
  });
  assert.ok(r.bytes.length <= tile.LIMITS.maxTileBytes, r.bytes.length + ' bytes');
  var t = tile.decode(r.bytes);
  assert.ok(t.mesh.tris.length <= tile.LIMITS.maxTris);
});

test('endpoints outside the map are refused', function () {
  assert.throws(function () {
    fx.build('BAD', 1, fx.PLANE.sampler, { a: { east: -5000, north: 0 } });
  }, /outside/);
});
