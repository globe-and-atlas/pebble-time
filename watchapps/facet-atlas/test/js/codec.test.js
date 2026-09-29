'use strict';
var test = require('node:test');
var assert = require('node:assert');
var zlib = require('node:zlib');
var inflate = require('../../src/pkjs/lib/inflate');
var tiffLib = require('../../src/pkjs/lib/tiff');

function seeded(n, seed) {
  var out = new Uint8Array(n);
  for (var i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; out[i] = seed >>> 24; }
  return out;
}

test('inflate matches zlib across levels and data shapes', function () {
  var inputs = [
    new Uint8Array(0), seeded(1, 1), seeded(70000, 2),
    new Uint8Array(100000).fill(7),
    Uint8Array.from(Buffer.from('terrain '.repeat(5000)))
  ];
  inputs.forEach(function (input) {
    [0, 1, 6, 9].forEach(function (level) {
      var z = zlib.deflateSync(input, { level: level });
      assert.deepStrictEqual(Buffer.from(inflate.inflate(new Uint8Array(z))), Buffer.from(input));
    });
  });
});

test('inflate rejects truncated and corrupt streams', function () {
  var z = new Uint8Array(zlib.deflateSync(seeded(5000, 3)));
  assert.throws(function () { inflate.inflate(z.subarray(0, z.length / 2)); });
  assert.throws(function () { inflate.inflate(new Uint8Array([0x78, 0x9c, 0xff, 0xff, 0xff])); });
  assert.throws(function () { inflate.inflate(new Uint8Array([0x12, 0x34])); }, /zlib/);
});

// Build a minimal tiled little-endian GeoTIFF in memory.
function makeTiff(opts) {
  var w = opts.width, h = opts.height, tw = opts.tile, spp = opts.samples || 1, bps = opts.bits / 8;
  var across = Math.ceil(w / tw), down = Math.ceil(h / tw);
  var tiles = [];
  for (var ty = 0; ty < down; ty++) {
    for (var tx = 0; tx < across; tx++) {
      var buf = new Uint8Array(tw * tw * spp * bps), dv = new DataView(buf.buffer);
      for (var y = 0; y < tw; y++) {
        for (var x = 0; x < tw; x++) {
          for (var s = 0; s < spp; s++) {
            var v = opts.value(tx * tw + x, ty * tw + y, s), o = ((y * tw + x) * spp + s) * bps;
            if (opts.bits === 32) dv.setFloat32(o, v, true); else if (opts.bits === 16) dv.setUint16(o, v, true); else buf[o] = v;
          }
        }
      }
      predict(buf, tw, spp, bps, opts.predictor);
      tiles.push(new Uint8Array(zlib.deflateSync(buf)));
    }
  }
  /** @type {any[]} */
  var entries = [
    [256, 3, [w]], [257, 3, [h]], [258, 3, [opts.bits]], [259, 3, [8]], [277, 3, [spp]],
    [284, 3, [1]], [317, 3, [opts.predictor]], [322, 3, [tw]], [323, 3, [tw]],
    [324, 4, tiles.map(function () { return 0; })], [325, 4, tiles.map(function (t) { return t.length; })],
    [339, 3, [opts.bits === 32 ? 3 : 1]],
    [33550, 12, [0.5, 0.5, 0]], [33922, 12, [0, 0, 0, 10, 20, 0]],
    [34735, 3, [1, 1, 0, 1, 1025, 0, 1, 2]]
  ];
  var ifdSize = 2 + entries.length * 12 + 4;
  var extraAt = 8 + ifdSize, extra = [];
  var sizes = { 3: 2, 4: 4, 12: 8 };
  var layout = entries.map(function (e) {
    var bytes = sizes[e[1]] * e[2].length;
    if (bytes <= 4) return null;
    var at = extraAt + extra.length;
    for (var i = 0; i < bytes; i++) extra.push(0);
    return at;
  });
  var dataAt = extraAt + extra.length;
  var offsets = [], p = dataAt;
  tiles.forEach(function (t) { offsets.push(p); p += t.length; });
  entries[9][2] = offsets;
  var out = new Uint8Array(p), dv = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
  dv.setUint16(8, entries.length, true);
  entries.forEach(function (e, i) {
    var at = 10 + i * 12;
    dv.setUint16(at, e[0], true); dv.setUint16(at + 2, e[1], true); dv.setUint32(at + 4, e[2].length, true);
    var target = layout[i] === null ? at + 8 : layout[i];
    if (layout[i] !== null) dv.setUint32(at + 8, layout[i], true);
    e[2].forEach(function (v, k) {
      if (e[1] === 3) dv.setUint16(target + k * 2, v, true);
      else if (e[1] === 4) dv.setUint32(target + k * 4, v, true);
      else dv.setFloat64(target + k * 8, v, true);
    });
  });
  dv.setUint32(10 + entries.length * 12, 0, true);
  tiles.forEach(function (t, i) { out.set(t, offsets[i]); });
  return out;
}

// Forward predictors (inverse of what the reader undoes).
function predict(buf, w, spp, bps, predictor) {
  var y, x;
  if (predictor === 2 && bps === 1) {
    for (y = 0; y < w; y++) for (x = w * spp - 1; x >= spp; x--) buf[y * w * spp + x] = (buf[y * w * spp + x] - buf[y * w * spp + x - spp]) & 255;
  } else if (predictor === 3) {
    var rowBytes = w * spp * bps, n = w * spp, tmp = new Uint8Array(rowBytes);
    for (y = 0; y < w; y++) {
      var row = y * rowBytes;
      for (var s = 0; s < n; s++) for (var b = 0; b < bps; b++) tmp[(bps - 1 - b) * n + s] = buf[row + s * bps + b];
      for (x = rowBytes - 1; x >= 1; x--) tmp[x] = (tmp[x] - tmp[x - 1]) & 255;
      buf.set(tmp, row);
    }
  }
}

function memIo(file) {
  return function (url, a, b) { return Promise.resolve(file.slice(a, Math.min(b, file.length))); };
}

test('COG reader: float32 + floating-point predictor, PixelIsPoint georef', async function () {
  var file = makeTiff({ width: 40, height: 24, tile: 16, bits: 32, predictor: 3, value: function (x, y) { return 100.25 + x * 3 - y * 0.5; } });
  var r = new tiffLib.CogReader('mem', memIo(file));
  await r.open();
  var g = r.georef();
  assert.strictEqual(g.originX, 10 - 0.25);
  assert.strictEqual(g.originY, 20 + 0.25);
  await r.prefetch(0, 0, 0, 39, 23);
  for (var y = 0; y < 24; y += 5) for (var x = 0; x < 40; x += 3) {
    assert.strictEqual(r.sample(0, x, y, 0), Math.fround(100.25 + x * 3 - y * 0.5));
  }
  assert.ok(isNaN(r.sample(0, 40, 0, 0)), 'outside the image is NaN, not a value');
});

test('COG reader: uint8 RGB + horizontal predictor', async function () {
  var file = makeTiff({ width: 20, height: 20, tile: 16, bits: 8, samples: 3, predictor: 2, value: function (x, y, s) { return (x * 7 + y * 3 + s * 50) & 255; } });
  var r = new tiffLib.CogReader('mem', memIo(file));
  await r.open();
  await r.prefetch(0, 0, 0, 19, 19);
  for (var s = 0; s < 3; s++) assert.strictEqual(r.sample(0, 17, 18, s), (17 * 7 + 18 * 3 + s * 50) & 255);
});

test('COG reader: refuses to sample tiles it has not fetched', async function () {
  var file = makeTiff({ width: 40, height: 40, tile: 16, bits: 8, predictor: 1, value: function () { return 1; } });
  var r = new tiffLib.CogReader('mem', memIo(file));
  await r.open();
  await r.prefetch(0, 0, 0, 5, 5);
  assert.throws(function () { r.sample(0, 30, 30, 0); }, /prefetched/);
});
