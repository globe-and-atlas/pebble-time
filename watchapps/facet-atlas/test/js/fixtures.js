'use strict';
// Synthetic terrain with analytically known answers. No real locations:
// fixtures sit at 0,0 (Null Island) with made-up metadata that is labelled
// as synthetic, so they can never be mistaken for measurements.

var prepare = require('../../src/pkjs/lib/prepare');

var AOI = 2000;

// Plane: z = 500 + 0.2 * east + 0.1 * north.
// Gradient magnitude sqrt(0.05) -> slope atan(0.2236) = 12.604 degrees.
var PLANE = {
  gx: 0.2, gy: 0.1, z0: 500,
  sampler: function (e, n) { return 500 + 0.2 * e + 0.1 * n; },
  slopeDeg: Math.atan(Math.sqrt(0.05)) * 180 / Math.PI
};

// V-shaped valley along the north-south axis, walls at 1:2 (26.565 deg).
var VALLEY = {
  sampler: function (e) { return 800 + 0.5 * Math.abs(e); },
  slopeDeg: Math.atan(0.5) * 180 / Math.PI
};

// Mirror image of the valley, used to prove the renderer can tell them apart.
var RIDGE = { sampler: function (e) { return 1300 - 0.5 * Math.abs(e); } };

// A 120 m cliff running north-south 300 m east of centre.
var CLIFF = { sampler: function (e) { return e > 300 ? 620 : 500; } };

function imagerySampler(e, n) {
  // Deterministic synthetic pattern: quadrants of different colours.
  return [e < 0 ? 60 : 200, n < 0 ? 90 : 170, 120];
}

var SYNTH_ELEV_META = {
  src: 'SYNTHETIC FIXTURE', date: 'N/A (MODEL)', hRef: 'LOCAL', vRef: 'LOCAL', res: 'ANALYTIC', note: 'TEST DATA'
};

function build(name, siteId, elevSampler, opts) {
  opts = opts || {};
  return prepare.buildTile({
    siteId: siteId, name: name, lat: 0, lon: 0, aoiM: AOI,
    a: opts.a || { east: -AOI / 2, north: 0 }, b: opts.b || { east: AOI / 2, north: 0 },
    exagX10: opts.exagX10 || 10, nowUnix: opts.nowUnix || 1767225600,
    elevation: elevSampler ? { sampler: elevSampler, meta: SYNTH_ELEV_META, breaklines: opts.breaklines } : null,
    imagery: opts.noImagery ? null : {
      sampler: opts.imagerySampler || imagerySampler,
      meta: { src: 'SYNTHETIC IMAGE', date: '2026-01-01', note: 'TEST PATTERN' }
    },
    missingNotes: opts.missingNotes || {}
  });
}

module.exports = {
  AOI: AOI, PLANE: PLANE, VALLEY: VALLEY, RIDGE: RIDGE, CLIFF: CLIFF,
  imagerySampler: imagerySampler, build: build
};
