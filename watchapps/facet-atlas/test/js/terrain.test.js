'use strict';
var test = require('node:test');
var assert = require('node:assert');
var terrain = require('../../src/pkjs/lib/terrain');
var fx = require('./fixtures');

// Tolerances (documented in docs/VALIDATION.md):
var SLOPE_TOL_DEG = 0.01;   // Horn is exact on a plane; float noise only
var PROFILE_TOL_M = 0.5;    // int16 metre quantisation in the tile

function meshHeightAt(mesh, x, y) {
  // Barycentric interpolation of the TIN at grid point (x, y).
  for (var t = 0; t < mesh.tris.length; t++) {
    var p = mesh.tris[t].map(function (i) { return mesh.verts[i]; });
    var d = (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1]);
    var l0 = ((p[1][1] - p[2][1]) * (x - p[2][0]) + (p[2][0] - p[1][0]) * (y - p[2][1])) / d;
    var l1 = ((p[2][1] - p[0][1]) * (x - p[2][0]) + (p[0][0] - p[2][0]) * (y - p[2][1])) / d;
    var l2 = 1 - l0 - l1;
    if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) {
      return l0 * mesh.z[mesh.tris[t][0]] + l1 * mesh.z[mesh.tris[t][1]] + l2 * mesh.z[mesh.tris[t][2]];
    }
  }
  return NaN;
}

function checkMesh(mesh, grid) {
  var seen = {};
  mesh.tris.forEach(function (t, i) {
    var a2 = terrain.triArea2(mesh, t);
    assert.ok(a2 < 0, 'triangle ' + i + ' must be CCW north-up and non-degenerate (area2=' + a2 + ')');
    assert.ok(t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]);
    var key = t.slice().sort(function (a, b) { return a - b; }).join(',');
    assert.ok(!seen[key], 'duplicate triangle');
    seen[key] = true;
  });
  assert.ok(mesh.verts.length <= terrain.MAX_VERTS);
  assert.ok(mesh.tris.length <= terrain.MAX_TRIS);
  // Coverage: triangle areas sum to the full square (no holes, no overlaps).
  var total = mesh.tris.reduce(function (s, t) { return s - terrain.triArea2(mesh, t) / 2; }, 0);
  var side = grid.n - 1;
  assert.strictEqual(total, side * side);
  // No T-junctions: no vertex lies strictly inside another triangle's edge.
  mesh.tris.forEach(function (t) {
    for (var e = 0; e < 3; e++) {
      var p = mesh.verts[t[e]], q = mesh.verts[t[(e + 1) % 3]];
      mesh.verts.forEach(function (v, vi) {
        if (vi === t[e] || vi === t[(e + 1) % 3]) return;
        var cross = (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]);
        if (cross !== 0) return;
        var dot = (v[0] - p[0]) * (q[0] - p[0]) + (v[1] - p[1]) * (q[1] - p[1]);
        var len2 = (q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]);
        assert.ok(dot <= 0 || dot >= len2, 'T-junction at vertex ' + vi);
      });
    }
  });
}

test('plane: slope equals the analytic value everywhere', function () {
  var grid = terrain.sampleGrid(fx.PLANE.sampler, fx.AOI);
  var s = terrain.slopeDegrees(grid);
  for (var i = 0; i < s.length; i++) assert.ok(Math.abs(s[i] - fx.PLANE.slopeDeg) < SLOPE_TOL_DEG, 'node ' + i + ': ' + s[i]);
  assert.strictEqual(terrain.slopeClass(fx.PLANE.slopeDeg), terrain.SLOPE_MODERATE);
});

test('plane: W-E profile is linear 300 m -> 700 m', function () {
  var p = terrain.profile(fx.PLANE.sampler, { east: -1000, north: 0 }, { east: 1000, north: 0 });
  assert.strictEqual(p.lengthM, 2000);
  p.z.forEach(function (z, k) {
    var expect = 300 + 400 * k / (p.z.length - 1);
    assert.ok(Math.abs(Math.round(z) - expect) <= PROFILE_TOL_M, 'sample ' + k);
  });
});

test('plane: mesh collapses to the two root triangles', function () {
  var grid = terrain.sampleGrid(fx.PLANE.sampler, fx.AOI);
  var mesh = terrain.buildTin(grid);
  checkMesh(mesh, grid);
  assert.strictEqual(mesh.tris.length, 2);
  assert.strictEqual(mesh.tolerance, 0);
});

test('valley: profile dips in the middle and walls are 26.6 degrees', function () {
  var p = terrain.profile(fx.VALLEY.sampler, { east: -1000, north: 0 }, { east: 1000, north: 0 });
  var min = Math.min.apply(null, p.z), iMin = p.z.indexOf(min);
  assert.ok(iMin >= 31 && iMin <= 32, 'minimum near the centre, got ' + iMin);
  assert.ok(p.z[0] - min > 400 && p.z[63] - min > 400, 'both ends well above the floor');
  var grid = terrain.sampleGrid(fx.VALLEY.sampler, fx.AOI);
  var s = terrain.slopeDegrees(grid);
  assert.ok(Math.abs(s[10 * grid.n + 5] - fx.VALLEY.slopeDeg) < SLOPE_TOL_DEG);
  assert.ok(Math.abs(s[10 * grid.n + 60] - fx.VALLEY.slopeDeg) < SLOPE_TOL_DEG);
});

test('valley and cliff meshes are valid and within their stated tolerance', function () {
  [fx.VALLEY, fx.RIDGE, fx.CLIFF].forEach(function (f) {
    var grid = terrain.sampleGrid(f.sampler, fx.AOI);
    var mesh = terrain.buildTin(grid);
    checkMesh(mesh, grid);
    for (var y = 0; y < grid.n; y++) {
      for (var x = 0; x < grid.n; x++) {
        var err = Math.abs(meshHeightAt(mesh, x, y) - grid.z[y * grid.n + x]);
        assert.ok(err <= mesh.tolerance + 1e-6, 'error ' + err + ' > tolerance ' + mesh.tolerance + ' at ' + x + ',' + y);
      }
    }
  });
});

test('cliff: the 120 m step survives simplification', function () {
  var grid = terrain.sampleGrid(fx.CLIFF.sampler, fx.AOI);
  var mesh = terrain.buildTin(grid);
  assert.ok(mesh.tolerance < 120, 'tolerance ' + mesh.tolerance + ' would erase the cliff');
  var zs = mesh.z.slice().sort(function (a, b) { return a - b; });
  assert.strictEqual(zs[0], 500);
  assert.strictEqual(zs[zs.length - 1], 620);
});

test('RTIN is deterministic', function () {
  var grid = terrain.sampleGrid(function (e, n) { return 1000 + 80 * Math.sin(e / 170) * Math.cos(n / 230); }, fx.AOI);
  var a = terrain.buildTin(grid), b = terrain.buildTin(grid);
  assert.deepStrictEqual(a.tris, b.tris);
  assert.deepStrictEqual(a.verts, b.verts);
  checkMesh(a, grid);
});

test('budget is respected on rough terrain', function () {
  var seed = 7;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var grid = terrain.sampleGrid(function () { return 1000 + rnd() * 300; }, fx.AOI);
  var mesh = terrain.buildTin(grid);
  checkMesh(mesh, grid);
  assert.ok(mesh.tolerance > 0);
});

test('grid with gaps yields no mesh', function () {
  var grid = terrain.sampleGrid(function (e) { return e > 900 ? NaN : 100; }, fx.AOI);
  assert.ok(grid.missing > 0);
  assert.throws(function () { terrain.buildTin(grid); }, /missing/);
});
