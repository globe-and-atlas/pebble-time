'use strict';
// Terrain derivation from an elevation sampler. Everything here is
// deterministic and independent of where the elevations come from, so the
// same code runs on real DEM data and on the synthetic test fixtures.
//
// Grid convention: GRID_N x GRID_N samples, row 0 = north edge, column 0 =
// west edge, spacing = aoi_m / (GRID_N - 1). Elevations in metres.

var GRID_N = 65;               // 2^6 + 1, required by the RTIN hierarchy
var MAX_VERTS = 255;           // vertex indices travel as uint8
var MAX_TRIS = 480;            // see docs/BUDGET.md
var PROFILE_SAMPLES = 64;
var SLOPE_GENTLE_DEG = 10;     // below: gentle
var SLOPE_STEEP_DEG = 30;      // at or above: steep; between: moderate
var SLOPE_NODATA = 0, SLOPE_GENTLE = 1, SLOPE_MODERATE = 2, SLOPE_STEEP = 3;

// sampler(east_m, north_m) -> elevation (m) or NaN.
function sampleGrid(sampler, aoiM, n) {
  n = n || GRID_N;
  var half = aoiM / 2, step = aoiM / (n - 1);
  var z = new Float64Array(n * n), missing = 0;
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      var v = sampler(-half + c * step, half - r * step);
      if (typeof v !== 'number' || !isFinite(v)) { v = NaN; missing++; }
      z[r * n + c] = v;
    }
  }
  return { n: n, aoiM: aoiM, step: step, z: z, missing: missing };
}

// Horn (1981) 3x3 slope in degrees at every grid node. Edge nodes reuse
// the nearest interior row/column (clamped window). NaN where any of the
// window's nodes is missing.
function slopeDegrees(grid) {
  var n = grid.n, z = grid.z, s = grid.step;
  var out = new Float64Array(n * n);
  function at(r, c) {
    r = r < 0 ? 0 : (r >= n ? n - 1 : r);
    c = c < 0 ? 0 : (c >= n ? n - 1 : c);
    return z[r * n + c];
  }
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      var a = at(r - 1, c - 1), b = at(r - 1, c), cc = at(r - 1, c + 1);
      var d = at(r, c - 1), f = at(r, c + 1);
      var g = at(r + 1, c - 1), h = at(r + 1, c), i = at(r + 1, c + 1);
      // Clamped windows at the border compress the baseline; correct for it.
      var wx = (c === 0 || c === n - 1) ? 1 : 2;
      var wy = (r === 0 || r === n - 1) ? 1 : 2;
      var dzdx = ((cc + 2 * f + i) - (a + 2 * d + g)) / (4 * wx * s);
      var dzdy = ((g + 2 * h + i) - (a + 2 * b + cc)) / (4 * wy * s);
      out[r * n + c] = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180 / Math.PI;
    }
  }
  return out;
}

function slopeClass(deg) {
  if (!isFinite(deg)) return SLOPE_NODATA;
  if (deg < SLOPE_GENTLE_DEG) return SLOPE_GENTLE;
  if (deg < SLOPE_STEEP_DEG) return SLOPE_MODERATE;
  return SLOPE_STEEP;
}

// Elevation cross-section from A to B (local metres). Samples the source
// directly (not the resampled grid) so the profile keeps source detail.
function profile(sampler, a, b, count) {
  count = count || PROFILE_SAMPLES;
  var dx = b.east - a.east, dy = b.north - a.north;
  var length = Math.sqrt(dx * dx + dy * dy);
  var z = [];
  for (var k = 0; k < count; k++) {
    var t = k / (count - 1);
    var v = sampler(a.east + dx * t, a.north + dy * t);
    z.push(typeof v === 'number' && isFinite(v) ? v : NaN);
  }
  return { lengthM: length, z: z };
}

// ---- Right-triangulated irregular network (RTIN) ----
// Method: Evans, Kirkpatrick & Townsend (2001) right-triangle hierarchy on
// a (2^k+1)^2 grid, with the bottom-up error propagation popularised by
// Mapbox's Martini. A node is inserted when the vertical error of the
// coarser triangle at that node exceeds the tolerance; propagation to the
// parent forces the neighbouring split, so the mesh has no T-junctions.
function rtinErrors(grid) {
  var size = grid.n, tile = size - 1, z = grid.z;
  var numTriangles = tile * tile * 2 - 2;
  var numParents = numTriangles - tile * tile;
  var errors = new Float64Array(size * size);
  for (var i = numTriangles - 1; i >= 0; i--) {
    var id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
    if (id & 1) { bx = by = cx = tile; } else { ax = ay = cy = tile; }
    while ((id >>= 1) > 1) {
      var mx0 = (ax + bx) >> 1, my0 = (ay + by) >> 1;
      if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; }
      cx = mx0; cy = my0;
    }
    var mx = (ax + bx) >> 1, my = (ay + by) >> 1;
    var mid = my * size + mx;
    var interp = (z[ay * size + ax] + z[by * size + bx]) / 2;
    var err = Math.abs(interp - z[mid]);
    if (err > errors[mid]) errors[mid] = err;
    if (i < numParents) {
      var ccx = mx + my - ay, ccy = my + ax - mx;
      var left = ((ay + ccy) >> 1) * size + ((ax + ccx) >> 1);
      var right = ((by + ccy) >> 1) * size + ((bx + ccx) >> 1);
      errors[mid] = Math.max(errors[mid], errors[left], errors[right]);
    }
  }
  return errors;
}

function rtinExtract(grid, errors, maxError) {
  var size = grid.n, tile = size - 1;
  var index = new Int32Array(size * size).fill(-1);
  var verts = [], tris = [];
  function vid(x, y) {
    var k = y * size + x;
    if (index[k] < 0) { index[k] = verts.length; verts.push([x, y]); }
    return index[k];
  }
  function walk(ax, ay, bx, by, cx, cy) {
    var mx = (ax + bx) >> 1, my = (ay + by) >> 1;
    if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) {
      walk(cx, cy, ax, ay, mx, my);
      walk(bx, by, cx, cy, mx, my);
    } else {
      tris.push([vid(ax, ay), vid(bx, by), vid(cx, cy)]);
    }
  }
  walk(0, 0, tile, tile, tile, 0);
  walk(tile, tile, 0, 0, 0, tile);
  // Normalise winding: counter-clockwise when north is up. In grid (x east,
  // y south) coordinates that is a negative cross product.
  for (var t = 0; t < tris.length; t++) {
    var p = verts[tris[t][0]], q = verts[tris[t][1]], r = verts[tris[t][2]];
    var cross = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (cross > 0) { var tmp = tris[t][1]; tris[t][1] = tris[t][2]; tris[t][2] = tmp; }
  }
  return { verts: verts, tris: tris };
}

// Smallest tolerance (metres) whose mesh fits the watch budget. Candidate
// tolerances are the distinct node errors, so the search is exact and
// deterministic.
function buildTin(grid, limits) {
  limits = limits || {};
  var maxV = limits.maxVerts || MAX_VERTS, maxT = limits.maxTris || MAX_TRIS;
  if (grid.missing) throw new Error('terrain: grid has missing samples; no mesh');
  var errors = rtinErrors(grid);
  var cands = Array.prototype.slice.call(errors).map(function (e) { return Math.round(e * 100) / 100; });
  cands.push(0);
  cands = cands.sort(function (a, b) { return a - b; }).filter(function (v, i, arr) { return i === 0 || v !== arr[i - 1]; });
  var lo = 0, hi = cands.length - 1, best = null;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    var m = rtinExtract(grid, errors, cands[mid]);
    if (m.verts.length <= maxV && m.tris.length <= maxT) { best = { mesh: m, tol: cands[mid] }; hi = mid - 1; } else lo = mid + 1;
  }
  if (!best) throw new Error('terrain: no tolerance fits the mesh budget');
  var mesh = best.mesh;
  mesh.z = mesh.verts.map(function (v) { return grid.z[v[1] * grid.n + v[0]]; });
  mesh.tolerance = best.tol;
  return mesh;
}

// Twice the signed area in grid units; negative = CCW with north up.
function triArea2(mesh, t) {
  var p = mesh.verts[t[0]], q = mesh.verts[t[1]], r = mesh.verts[t[2]];
  return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
}

module.exports = {
  GRID_N: GRID_N, MAX_VERTS: MAX_VERTS, MAX_TRIS: MAX_TRIS, PROFILE_SAMPLES: PROFILE_SAMPLES,
  SLOPE_GENTLE_DEG: SLOPE_GENTLE_DEG, SLOPE_STEEP_DEG: SLOPE_STEEP_DEG,
  SLOPE_NODATA: SLOPE_NODATA, SLOPE_GENTLE: SLOPE_GENTLE, SLOPE_MODERATE: SLOPE_MODERATE, SLOPE_STEEP: SLOPE_STEEP,
  sampleGrid: sampleGrid, slopeDegrees: slopeDegrees, slopeClass: slopeClass, profile: profile,
  rtinErrors: rtinErrors, rtinExtract: rtinExtract, buildTin: buildTin, triArea2: triArea2
};
