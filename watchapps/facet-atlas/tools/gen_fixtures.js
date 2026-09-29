#!/usr/bin/env node
'use strict';
// Writes the synthetic fixture tiles used by the C tests and the host
// preview renderer into build/host/fixtures/ (never committed).

var fs = require('fs');
var path = require('path');
var fx = require('../test/js/fixtures');

var out = process.argv[2] || path.join(__dirname, '..', 'build', 'host', 'fixtures');
fs.mkdirSync(out, { recursive: true });

// Breakline fixture: chain the mesh edges that lie on the valley floor
// (grid column 32). A real source would supply these; here they stand in
// for one so the format and renderer path are exercised.
function thalweg(mesh) {
  var onAxis = [];
  mesh.verts.forEach(function (v, i) { if (v[0] === 32) onAxis.push(i); });
  onAxis.sort(function (a, b) { return mesh.verts[a][1] - mesh.verts[b][1]; });
  function isEdge(u, w) {
    return mesh.tris.some(function (t) {
      for (var e = 0; e < 3; e++) {
        var p = t[e], q = t[(e + 1) % 3];
        if ((p === u && q === w) || (p === w && q === u)) return true;
      }
      return false;
    });
  }
  var polys = [], cur = [];
  for (var k = 0; k + 1 < onAxis.length; k++) {
    if (isEdge(onAxis[k], onAxis[k + 1])) {
      if (!cur.length) cur.push(onAxis[k]);
      cur.push(onAxis[k + 1]);
    } else if (cur.length) { polys.push(cur); cur = []; }
  }
  if (cur.length) polys.push(cur);
  return polys.slice(0, 16);
}

var cases = {
  plane: fx.build('PLANE FIXTURE', 101, fx.PLANE.sampler),
  valley: fx.build('VALLEY FIXTURE', 102, fx.VALLEY.sampler),
  ridge: fx.build('RIDGE FIXTURE', 103, fx.RIDGE.sampler),
  cliff: fx.build('CLIFF FIXTURE', 104, fx.CLIFF.sampler, { a: { east: 0, north: -1000 }, b: { east: 0, north: 1000 } }),
  breakline: fx.build('BREAKLINE FIXTURE', 105, fx.VALLEY.sampler, { breaklines: thalweg }),
  noimage: fx.build('NO IMAGE FIXTURE', 106, fx.VALLEY.sampler, { noImagery: true, missingNotes: { imagery: 'NO USABLE SCENE' } }),
  noelev: fx.build('NO ELEV FIXTURE', 107, null, { missingNotes: { elevation: 'NO COP-DEM TILE HERE' } }),
  gaps: fx.build('GAPS FIXTURE', 108, function (e) { return e > 700 ? NaN : 400 + 0.1 * e; }),
  stale: fx.build('STALE FIXTURE', 109, fx.VALLEY.sampler, { nowUnix: 1700000000, exagX10: 20 })
};

var expect = {};
Object.keys(cases).forEach(function (k) {
  var r = cases[k];
  fs.writeFileSync(path.join(out, k + '.fat'), Buffer.from(r.bytes));
  expect[k] = {
    siteId: r.tile.siteId, flags: r.tile.flags, bytes: r.bytes.length,
    name: r.tile.meta[1], verts: r.tile.mesh ? r.tile.mesh.verts.length : 0,
    tris: r.tile.mesh ? r.tile.mesh.tris.length : 0,
    breaklines: r.tile.breaklines ? r.tile.breaklines.length : 0
  };
});
// Flat key=value file so the C test needs no JSON parser.
var lines = [];
Object.keys(expect).forEach(function (k) {
  Object.keys(expect[k]).forEach(function (f) { lines.push(k + '.' + f + '=' + expect[k][f]); });
});
fs.writeFileSync(path.join(out, 'expect.txt'), lines.join('\n') + '\n');
console.log('wrote ' + Object.keys(cases).length + ' fixture tiles to ' + out);
