'use strict';
// Public data sources. Both are anonymous, keyless AWS Open Data buckets
// read with HTTP range requests. See docs/DATA_SOURCES.md for coverage,
// terms, attribution and the verification notes behind each constant.
//
// io = { fetchRange(url, start, endExclusive) -> Promise<Uint8Array>,
//        fetchText(url) -> Promise<string> }
// Both must reject with err.status set (e.g. 404) on HTTP errors.

var geo = require('./geo');
var tiffLib = require('./tiff');

var DEM_BASE = 'https://copernicus-dem-30m.s3.amazonaws.com/';
var S2_BUCKET = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/';
var S2_PREFIX = 'sentinel-s2-l2a-cogs/';
var S2_TILE_SPAN = 109800;        // metres, from item proj:shape x 10 m
var S2_MAX_SCENE_CLOUD = 80;      // granule-wide %, skip worse scenes
var S2_ACCEPT_AOI_CLOUD = 10;     // % of AOI pixels flagged cloud/shadow by SCL
var S2_LOOKBACK_MONTHS = 6;
var S2_MAX_CHECKS = 4;

function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

// Copernicus GLO-30 tile id for the 1x1 degree cell containing (lat, lon).
function demTileName(latCell, lonCell) {
  var ns = latCell >= 0 ? 'N' : 'S', ew = lonCell >= 0 ? 'E' : 'W';
  return 'Copernicus_DSM_COG_10_' + ns + pad(Math.abs(latCell), 2) + '_00_' + ew + pad(Math.abs(lonCell), 3) + '_00_DEM';
}

function isMissing(err) { return err && (err.status === 404 || err.status === 403); }

// Parse the per-tile ISO 19115 XML shipped with each DEM tile.
function parseDemXml(xml) {
  function grab(re) { var m = xml.match(re); return m ? m[1] : null; }
  return {
    start: grab(/<tsxx:tsxx_startTime>([0-9-]{10})/),
    stop: grab(/<tsxx:tsxx_stopTime>([0-9-]{10})/),
    hDatum: grab(/<tsxx:horizontalDatumCode>([^<]+)</),
    vEpsg: grab(/<gml:VerticalCRS[^>]*>[\s\S]*?codeSpace="EPSG::(\d+)"/)
  };
}

// Returns Promise<{ sampler, meta } | { missing: 'reason' }>.
// extentM: side of the square (metres) that must be sampleable.
function openElevation(io, lat, lon, extentM, gridStepM) {
  var frame = geo.localFrame(lat, lon);
  var half = extentM / 2;
  var corners = [[-half, -half], [half, -half], [-half, half], [half, half]].map(function (c) {
    return frame.toLatLon(c[0], c[1]);
  });
  var cells = {};
  corners.forEach(function (p) { cells[Math.floor(p.lat) + ':' + Math.floor(p.lon)] = [Math.floor(p.lat), Math.floor(p.lon)]; });
  var keys = Object.keys(cells).sort();
  var tiles = {};
  var metas = [];
  return Promise.all(keys.map(function (k) {
    var name = demTileName(cells[k][0], cells[k][1]);
    var url = DEM_BASE + name + '/' + name + '.tif';
    var r = new tiffLib.CogReader(url, io.fetchRange);
    return r.open().then(function () {
      var xmlName = name.replace('_COG', '').replace(/_DEM$/, '');
      return io.fetchText(DEM_BASE + name + '/' + xmlName + '.xml').then(parseDemXml, function () { return null; });
    }).then(function (m) {
      tiles[k] = { reader: r, cell: cells[k] };
      if (m) metas.push(m);
    }, function (err) {
      if (!isMissing(err)) throw err;
      tiles[k] = null;
    });
  })).then(function () {
    var present = keys.filter(function (k) { return tiles[k]; });
    if (!present.length) return /** @type {any} */ ({ missing: 'NO COP-DEM TILE HERE' });
    // Choose one overview level for all tiles: coarsest whose pixel is no
    // larger than the watch grid spacing.
    var cosLat = Math.cos(lat * Math.PI / 180);
    var t0 = tiles[present[0]].reader, g0 = t0.georef();
    var level = 0;
    for (var i = 1; i < t0.images.length; i++) {
      var f = t0.images[0].width / t0.images[i].width;
      var pxM = Math.max(g0.pixelX * f * 111320 * cosLat, g0.pixelY * f * 110574);
      if (pxM <= gridStepM) level = i;
    }
    var jobs = present.map(function (k) {
      var t = tiles[k], g = t.reader.georef();
      var img = t.reader.images[level], f = g.width / img.width;
      t.g = g; t.f = f; t.img = img;
      var lats = corners.map(function (p) { return p.lat; }), lons = corners.map(function (p) { return p.lon; });
      var x0 = Math.floor((Math.min.apply(null, lons) - g.originX) / (g.pixelX * f)) - 2;
      var x1 = Math.ceil((Math.max.apply(null, lons) - g.originX) / (g.pixelX * f)) + 2;
      var y0 = Math.floor((g.originY - Math.max.apply(null, lats)) / (g.pixelY * f)) - 2;
      var y1 = Math.ceil((g.originY - Math.min.apply(null, lats)) / (g.pixelY * f)) + 2;
      return t.reader.prefetch(level, Math.max(0, x0), Math.max(0, y0), Math.min(img.width - 1, x1), Math.min(img.height - 1, y1));
    });
    return Promise.all(jobs).then(function () {
      function pixel(latCell, lonCell, px, py) {
        // Tiles are exactly 1 degree, so a pixel index outside this tile is
        // the same lattice point in the neighbouring tile.
        var t = tiles[latCell + ':' + lonCell];
        if (!t) return NaN;
        var w = t.img.width, h = t.img.height;
        if (px < 0) return pixel(latCell, lonCell - 1, px + w, py);
        if (px >= w) return pixel(latCell, lonCell + 1, px - w, py);
        if (py < 0) return pixel(latCell + 1, lonCell, px, py + h);
        if (py >= h) return pixel(latCell - 1, lonCell, px, py - h);
        return t.reader.sample(level, px, py, 0);
      }
      function sampler(east, north) {
        var p = frame.toLatLon(east, north);
        var lc = Math.floor(p.lat), oc = Math.floor(p.lon);
        var t = tiles[lc + ':' + oc];
        if (!t) return NaN;
        var fx = (p.lon - t.g.originX) / (t.g.pixelX * t.f) - 0.5;
        var fy = (t.g.originY - p.lat) / (t.g.pixelY * t.f) - 0.5;
        var x = Math.floor(fx), y = Math.floor(fy), ax = fx - x, ay = fy - y;
        var z00 = pixel(lc, oc, x, y), z10 = pixel(lc, oc, x + 1, y);
        var z01 = pixel(lc, oc, x, y + 1), z11 = pixel(lc, oc, x + 1, y + 1);
        return (z00 * (1 - ax) + z10 * ax) * (1 - ay) + (z01 * (1 - ax) + z11 * ax) * ay;
      }
      var start = metas.map(function (m) { return m.start; }).filter(Boolean).sort()[0];
      var stop = metas.map(function (m) { return m.stop; }).filter(Boolean).sort().pop();
      var hd = metas.map(function (m) { return m.hDatum; }).filter(Boolean);
      var ve = metas.map(function (m) { return m.vEpsg; }).filter(Boolean);
      var nativeM = Math.round(g0.pixelY * 110574);
      var levelM = Math.round(g0.pixelY * t0.images[0].width / t0.images[level].width * 110574);
      return {
        sampler: sampler,
        level: level,
        meta: {
          src: 'COPERNICUS DEM GLO-30 (DSM)',
          date: start && stop ? 'ACQ ' + start.slice(0, 7) + '..' + stop.slice(0, 7) : null,
          hRef: hd.length && hd.every(function (d) { return d === hd[0]; }) ? hd[0] : null,
          vRef: ve.length && ve.every(function (v) { return v === '3855'; }) ? 'EGM2008 (EPSG:3855)' : null,
          res: level === 0 ? '1 ARCSEC (~' + nativeM + 'm)' : '~' + levelM + 'm OVERVIEW OF 1"',
          note: 'SURFACE MODEL: INCL TREES/BLDGS'
        }
      };
    });
  });
}

// --- Sentinel-2 L2A ---

function s2TileBounds(sq) {
  // Sentinel-2 tiles start at the MGRS square's west edge and extend
  // S2_TILE_SPAN east; their top is 40 m above the square's north edge.
  var e0 = Math.floor(sq.utm.easting / 100000) * 100000;
  var nTop = Math.floor(sq.utm.northing / 100000) * 100000 + 100000 + 40;
  return { e0: e0, e1: e0 + S2_TILE_SPAN, n0: nTop - S2_TILE_SPAN, n1: nTop };
}

// Choose an MGRS square whose Sentinel-2 tile contains the whole extent.
function chooseS2Square(lat, lon, extentM) {
  var frame = geo.localFrame(lat, lon), half = extentM / 2;
  var pts = [[0, 0], [-half, -half], [half, -half], [-half, half], [half, half]].map(function (c) {
    return frame.toLatLon(c[0], c[1]);
  });
  for (var i = 0; i < pts.length; i++) {
    var sq = geo.mgrsSquare(pts[i].lat, pts[i].lon);
    if (!sq.band) continue;
    var b = s2TileBounds(sq);
    var ok = pts.every(function (p) {
      var u = geo.toUtm(p.lat, p.lon, sq.zone);
      return u.easting >= b.e0 && u.easting < b.e1 && u.northing > b.n0 && u.northing <= b.n1;
    });
    if (ok) return sq;
  }
  return null;
}

function listScenes(io, sq, now) {
  var months = [];
  for (var k = 0; k < S2_LOOKBACK_MONTHS; k++) {
    var d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    months.push(d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1) + '/');
  }
  var base = S2_PREFIX + sq.zone + '/' + sq.band + '/' + sq.square + '/';
  return Promise.all(months.map(function (m) {
    var url = S2_BUCKET + '?list-type=2&delimiter=%2F&prefix=' + encodeURIComponent(base + m);
    return io.fetchText(url).then(function (xml) {
      var out = [], re = /<Prefix>([^<]+\/)<\/Prefix>/g, mm;
      while ((mm = re.exec(xml))) if (mm[1] !== base + m) out.push(mm[1]);
      return out;
    });
  })).then(function (lists) {
    var byDate = {};
    [].concat.apply([], lists).forEach(function (p) {
      var m = p.match(/(S2[ABC])_\w+_(\d{8})_(\d+)_L2A\/$/);
      if (!m) return;
      var prev = byDate[m[2]];
      if (!prev || parseInt(m[3], 10) > prev.seq) byDate[m[2]] = { path: p, date: m[2], seq: parseInt(m[3], 10), platform: m[1] };
    });
    return Object.keys(byDate).sort().reverse().map(function (k) { return byDate[k]; });
  });
}

// Returns Promise<{ sampler, meta, cloudy } | { missing }>.
function openImagery(io, lat, lon, extentM, aoiM, pixelM, now) {
  var sq = chooseS2Square(lat, lon, extentM);
  if (!sq) return Promise.resolve({ missing: 'OUTSIDE SENTINEL-2 GRID' });
  var frame = geo.localFrame(lat, lon);
  return listScenes(io, sq, now).then(function (scenes) {
    if (!scenes.length) return { missing: 'NO SCENE IN ' + S2_LOOKBACK_MONTHS + ' MONTHS' };
    var best = null, checks = 0;
    function tryScene(i) {
      if (i >= scenes.length || checks >= S2_MAX_CHECKS) return Promise.resolve(best);
      var s = scenes[i], name = s.path.split('/').slice(-2)[0];
      return io.fetchText(S2_BUCKET + s.path + name + '.json').then(JSON.parse).then(function (item) {
        var p = item.properties || {};
        if (typeof p['eo:cloud_cover'] === 'number' && p['eo:cloud_cover'] > S2_MAX_SCENE_CLOUD) return tryScene(i + 1);
        checks++;
        return evaluateScene(io, frame, sq, S2_BUCKET + s.path, extentM, aoiM, pixelM).then(function (/** @type {any} */ ev) {
          ev.item = p; ev.scene = name;
          var score = ev.aoiCloudPct + ev.nodataPct * 2;
          if (!best || score < best.score) { ev.score = score; best = ev; }
          if (ev.nodataPct === 0 && ev.aoiCloudPct <= S2_ACCEPT_AOI_CLOUD) return best;
          return tryScene(i + 1);
        });
      }, function (err) { if (isMissing(err)) return tryScene(i + 1); throw err; });
    }
    return tryScene(0).then(function (b) {
      if (!b) return { missing: 'NO USABLE SCENE' };
      var date = b.item.datetime ? b.item.datetime.slice(0, 10) : null;
      var plat = (b.item.platform || 'sentinel-2').toUpperCase();
      return {
        sampler: b.sampler,
        cloudy: b.aoiCloudPct > S2_ACCEPT_AOI_CLOUD,
        scene: b.scene,
        meta: {
          src: plat + ' L2A TCI 10m',
          date: date,
          note: 'CLOUD ' + Math.round(b.aoiCloudPct) + '%' + (b.nodataPct > 0 ? ' GAPS ' + Math.round(b.nodataPct) + '%' : '')
        }
      };
    });
  });
}

function evaluateScene(io, frame, sq, base, extentM, aoiM, pixelM) {
  var tci = new tiffLib.CogReader(base + 'TCI.tif', io.fetchRange);
  var scl = new tiffLib.CogReader(base + 'SCL.tif', io.fetchRange);
  var half = extentM / 2;
  function utmOf(e, n) { var p = frame.toLatLon(e, n); return geo.toUtm(p.lat, p.lon, sq.zone); }
  function windowFor(r, level) {
    var g = r.georef(), f = g.width / r.images[level].width;
    var us = [utmOf(-half, -half), utmOf(half, -half), utmOf(-half, half), utmOf(half, half)];
    var es = us.map(function (u) { return u.easting; }), ns = us.map(function (u) { return u.northing; });
    var img = r.images[level];
    return {
      g: g, f: f,
      x0: Math.max(0, Math.floor((Math.min.apply(null, es) - g.originX) / (g.pixelX * f)) - 1),
      x1: Math.min(img.width - 1, Math.ceil((Math.max.apply(null, es) - g.originX) / (g.pixelX * f)) + 1),
      y0: Math.max(0, Math.floor((g.originY - Math.max.apply(null, ns)) / (g.pixelY * f)) - 1),
      y1: Math.min(img.height - 1, Math.ceil((g.originY - Math.min.apply(null, ns)) / (g.pixelY * f)) + 1)
    };
  }
  return Promise.all([tci.open(), scl.open()]).then(function () {
    var tl = tci.levelFor(pixelM), sl = scl.levelFor(Math.max(20, pixelM));
    var tw = windowFor(tci, tl), sw = windowFor(scl, sl);
    return Promise.all([
      tci.prefetch(tl, tw.x0, tw.y0, tw.x1, tw.y1),
      scl.prefetch(sl, sw.x0, sw.y0, sw.x1, sw.y1)
    ]).then(function () {
      function idx(w, u) {
        return [Math.floor((u.easting - w.g.originX) / (w.g.pixelX * w.f)), Math.floor((w.g.originY - u.northing) / (w.g.pixelY * w.f))];
      }
      function sampler(e, n) {
        var u = utmOf(e, n), p = idx(tw, u);
        // TCI nodata is 0 in all three bands; a single 0 band is a real dark pixel.
        var r = tci.sample(tl, p[0], p[1], 0, true), g = tci.sample(tl, p[0], p[1], 1, true), b = tci.sample(tl, p[0], p[1], 2, true);
        if (!isFinite(r) || !isFinite(g) || !isFinite(b) || (r === 0 && g === 0 && b === 0)) return null;
        return [r, g, b];
      }
      // AOI statistics on a 32x32 lattice. SCL classes: 0 no data,
      // 1 saturated/defective, 3 cloud shadow, 8/9 cloud, 10 cirrus.
      var n = 32, cloud = 0, nodata = 0, ah = aoiM / 2;
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          var e = -ah + (x + 0.5) * aoiM / n, no = ah - (y + 0.5) * aoiM / n;
          var c = scl.sample(sl, idx(sw, utmOf(e, no))[0], idx(sw, utmOf(e, no))[1], 0);
          if (!sampler(e, no) || c === 0 || c === 1 || !isFinite(c)) nodata++;
          else if (c === 3 || c === 8 || c === 9 || c === 10) cloud++;
        }
      }
      return { sampler: sampler, aoiCloudPct: cloud * 100 / (n * n), nodataPct: nodata * 100 / (n * n) };
    });
  });
}

module.exports = {
  demTileName: demTileName, parseDemXml: parseDemXml, openElevation: openElevation,
  s2TileBounds: s2TileBounds, chooseS2Square: chooseS2Square, listScenes: listScenes,
  openImagery: openImagery, DEM_BASE: DEM_BASE, S2_BUCKET: S2_BUCKET
};
