'use strict';
// Build one watch tile from abstract samplers. Real data (sources.js) and
// synthetic fixtures (test/js/fixtures.js) both enter here, so the fixture
// tests exercise the exact code that runs on the phone.

var terrain = require('./terrain');
var image = require('./image');
var tile = require('./tile');

var IMAGE_SIDE = 144;
var IMAGE_SCALE = 1.5;         // satellite context extends past the AOI
var DEFAULT_EXAG_X10 = 10;     // 1.0x
var PARTIAL_IMAGE_FRACTION = 0.01; // caution label above 1% missing pixels (each gap is hatched regardless)

// opts: {
//   siteId, name, lat, lon, aoiM, a:{east,north}, b:{east,north}, exagX10,
//   nowUnix,
//   elevation: null | { sampler(e,n)->m|NaN, meta:{src,date,hRef,vRef,res,note} },
//   imagery:   null | { sampler(e,n)->[r,g,b]|null, meta:{src,date,note}, cloudy:bool },
//   missingNotes: { elevation, imagery } (why a source is absent)
// }
function buildTile(o) {
  var M = tile.META, F = tile.FLAG;
  var meta = {}, flags = 0;
  var half = o.aoiM / 2, step = o.aoiM / (terrain.GRID_N - 1);
  var imageM = Math.round(o.aoiM * IMAGE_SCALE);
  var limit = imageM / 2;
  [o.a, o.b].forEach(function (p) {
    if (Math.abs(p.east) > limit || Math.abs(p.north) > limit) throw new Error('prepare: profile endpoint outside the map');
  });
  function q(p) { return [Math.round((p.east + half) / step * 4), Math.round((half - p.north) / step * 4)]; }

  meta[M.NAME] = o.name || (o.lat.toFixed(4) + ',' + o.lon.toFixed(4));
  var out = {
    siteId: o.siteId, meta: meta,
    geo: {
      lat: o.lat, lon: o.lon, aoiM: o.aoiM, imageM: imageM, preparedUnix: o.nowUnix,
      zMin: 0, zMax: 0, gridN: terrain.GRID_N, exagX10: o.exagX10 || DEFAULT_EXAG_X10,
      aQ: q(o.a), bQ: q(o.b)
    }
  };

  var stats = {};
  if (o.elevation) {
    var em = o.elevation.meta;
    meta[M.ELEV_SRC] = em.src; meta[M.ELEV_DATE] = em.date || 'UNKNOWN';
    meta[M.H_REF] = em.hRef || 'UNKNOWN'; meta[M.V_REF] = em.vRef || 'UNKNOWN';
    meta[M.ELEV_RES] = em.res || 'UNKNOWN';
    if (em.note) meta[M.ELEV_NOTE] = em.note;
    meta[M.BREAKLINES] = o.elevation.breaklines ? 'SOURCE BREAKLINES' : 'NONE IN SOURCE';
    var grid = terrain.sampleGrid(o.elevation.sampler, o.aoiM);
    var slopes = terrain.slopeDegrees(grid);
    var classes = new Uint8Array(grid.n * grid.n);
    for (var k = 0; k < classes.length; k++) classes[k] = terrain.slopeClass(slopes[k]);
    out.slope = { n: grid.n, classes: classes };
    out.profile = terrain.profile(o.elevation.sampler, o.a, o.b);
    var zs = Array.prototype.filter.call(grid.z, isFinite);
    if (zs.length) {
      out.geo.zMin = Math.floor(Math.min.apply(null, zs));
      out.geo.zMax = Math.ceil(Math.max.apply(null, zs));
    }
    if (grid.missing) {
      flags |= F.ELEV_PARTIAL;
      meta[M.SIMPLIFY] = 'NO MESH: ' + grid.missing + ' GAPS';
    } else {
      out.mesh = terrain.buildTin(grid);
      flags |= F.HAS_ELEV;
      meta[M.SIMPLIFY] = 'RTIN ' + fmtTol(out.mesh.tolerance) + ' ' + out.mesh.verts.length + 'v ' + out.mesh.tris.length + 't';
      if (o.elevation.breaklines) {
        out.breaklines = o.elevation.breaklines(out.mesh);
        if (out.breaklines.length) flags |= F.HAS_BREAKLINES;
      }
    }
    stats.grid = grid; stats.slopes = slopes;
  } else {
    meta[M.ELEV_SRC] = 'NO ELEVATION';
    meta[M.ELEV_NOTE] = (o.missingNotes && o.missingNotes.elevation) || 'UNAVAILABLE';
  }

  if (o.imagery) {
    var im = renderImage(o.imagery.sampler, imageM);
    meta[M.IMG_SRC] = o.imagery.meta.src; meta[M.IMG_DATE] = o.imagery.meta.date || 'UNKNOWN';
    if (o.imagery.meta.note) meta[M.IMG_NOTE] = o.imagery.meta.note;
    if (im.validCount === 0) {
      meta[M.IMG_NOTE] = 'NO PIXELS OVER SITE';
    } else {
      var qz = image.quantize(im.rgb, im.valid, IMAGE_SIDE, IMAGE_SIDE);
      out.image = { w: IMAGE_SIDE, h: IMAGE_SIDE, palette: qz.palette, pixels: qz.pixels };
      flags |= F.HAS_IMAGE;
      if (im.validCount < IMAGE_SIDE * IMAGE_SIDE * (1 - PARTIAL_IMAGE_FRACTION)) flags |= F.IMAGE_PARTIAL;
      if (o.imagery.cloudy) flags |= F.IMAGE_CLOUDY;
    }
  } else {
    meta[M.IMG_SRC] = 'NO SATELLITE IMAGE';
    meta[M.IMG_NOTE] = (o.missingNotes && o.missingNotes.imagery) || 'UNAVAILABLE';
  }
  out.flags = flags;
  return { bytes: tile.encode(out), tile: out, stats: stats };
}

function fmtTol(t) { return (t < 10 ? t.toFixed(1) : String(Math.round(t))) + 'm'; }

function renderImage(sampler, imageM) {
  var n = IMAGE_SIDE, px = imageM / n, half = imageM / 2;
  var rgb = new Uint8Array(n * n * 3), valid = new Uint8Array(n * n), count = 0;
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      var c = sampler(-half + (x + 0.5) * px, half - (y + 0.5) * px);
      if (!c) continue;
      var i = y * n + x;
      rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
      valid[i] = 1; count++;
    }
  }
  return { rgb: rgb, valid: valid, validCount: count };
}

module.exports = { buildTile: buildTile, IMAGE_SIDE: IMAGE_SIDE, IMAGE_SCALE: IMAGE_SCALE, DEFAULT_EXAG_X10: DEFAULT_EXAG_X10 };
