'use strict';
// Site settings -> prepared tile. Shared by the phone (index.js) and the
// reproducible command-line preparer (tools/prepare_tile.js).

var geo = require('./geo');
var sources = require('./sources');
var prepare = require('./prepare');
var terrain = require('./terrain');

var AOI_CHOICES = [1000, 2000, 4000];
var EXAG_CHOICES = [10, 15, 20, 30];      // x10: 1.0x .. 3.0x

// Profile endpoints are given either as explicit lat/lon or as a preset
// line through the centre spanning the AOI.
var PRESETS = {
  'W-E': [[-0.5, 0], [0.5, 0]],
  'S-N': [[0, -0.5], [0, 0.5]],
  'SW-NE': [[-0.5, -0.5], [0.5, 0.5]],
  'NW-SE': [[-0.5, 0.5], [0.5, -0.5]]
};

// Returns a normalised copy or throws a user-facing Error.
function validateSettings(s) {
  if (!s || typeof s !== 'object') throw new Error('No site settings');
  var lat = Number(s.lat), lon = Number(s.lon);
  if (!geo.validLatLon(lat, lon)) throw new Error('Coordinates must be latitude -90..90 and longitude -180..180');
  if (Math.abs(lat) > 84) throw new Error('Sentinel-2 has no tiles beyond 84 degrees latitude');
  var aoi = Number(s.aoiM);
  if (AOI_CHOICES.indexOf(aoi) < 0) throw new Error('Area must be one of ' + AOI_CHOICES.join(', ') + ' m');
  var exag = Number(s.exagX10 || 10);
  if (EXAG_CHOICES.indexOf(exag) < 0) throw new Error('Unsupported vertical exaggeration');
  var name = String(s.name || '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 24);
  var out = { id: s.id >>> 0, name: name, lat: lat, lon: lon, aoiM: aoi, exagX10: exag };
  var frame = geo.localFrame(lat, lon), limit = aoi * prepare.IMAGE_SCALE / 2;
  if (s.profile && s.profile.preset) {
    var p = PRESETS[s.profile.preset];
    if (!p) throw new Error('Unknown profile preset');
    out.profile = { preset: s.profile.preset };
    out.a = { east: p[0][0] * aoi, north: p[0][1] * aoi };
    out.b = { east: p[1][0] * aoi, north: p[1][1] * aoi };
  } else if (s.profile && s.profile.a && s.profile.b) {
    if (!geo.validLatLon(s.profile.a.lat, s.profile.a.lon) || !geo.validLatLon(s.profile.b.lat, s.profile.b.lon)) {
      throw new Error('Profile endpoints need valid coordinates');
    }
    out.profile = { a: s.profile.a, b: s.profile.b };
    out.a = frame.toLocal(s.profile.a.lat, s.profile.a.lon);
    out.b = frame.toLocal(s.profile.b.lat, s.profile.b.lon);
  } else {
    throw new Error('Choose profile endpoints A and B');
  }
  [out.a, out.b].forEach(function (q) {
    if (Math.abs(q.east) > limit || Math.abs(q.north) > limit) throw new Error('Profile endpoints must lie inside the map preview');
  });
  var dx = out.a.east - out.b.east, dy = out.a.north - out.b.north;
  if (Math.sqrt(dx * dx + dy * dy) < 60) throw new Error('A and B must be at least 60 m apart');
  return out;
}

// io: see sources.js. now: Date. Returns Promise<{bytes, tile, report}>.
function prepareSite(io, settings, now) {
  var s = validateSettings(settings);
  var imageM = s.aoiM * prepare.IMAGE_SCALE;
  var step = s.aoiM / (terrain.GRID_N - 1);
  var report = { requests: [] };
  var trackedIo = {
    fetchRange: function (url, a, b) { report.requests.push(url.split('?')[0]); return io.fetchRange(url, a, b); },
    fetchText: function (url) { report.requests.push(url.split('?')[0]); return io.fetchText(url); }
  };
  var elevP = sources.openElevation(trackedIo, s.lat, s.lon, imageM, step).catch(function (e) {
    return { missing: 'ELEVATION FETCH FAILED', error: String(e && e.message || e) };
  });
  var imgP = sources.openImagery(trackedIo, s.lat, s.lon, imageM, s.aoiM, imageM / prepare.IMAGE_SIDE, now).catch(function (e) {
    return { missing: 'IMAGERY FETCH FAILED', error: String(e && e.message || e) };
  });
  return Promise.all([elevP, imgP]).then(function (r) {
    var elev = /** @type {any} */ (r[0]), img = /** @type {any} */ (r[1]);
    report.elevation = elev.missing ? { missing: elev.missing, error: elev.error } : { level: elev.level, meta: elev.meta };
    report.imagery = img.missing ? { missing: img.missing, error: img.error } : { scene: img.scene, meta: img.meta };
    if (elev.missing && img.missing && (elev.error || img.error)) {
      var err = /** @type {any} */ (new Error('Could not reach the data sources: ' + (elev.error || img.error)));
      err.offline = true;
      throw err;
    }
    var built = prepare.buildTile({
      siteId: s.id, name: s.name, lat: s.lat, lon: s.lon, aoiM: s.aoiM,
      a: s.a, b: s.b, exagX10: s.exagX10, nowUnix: Math.floor(now.getTime() / 1000),
      elevation: elev.missing ? null : elev,
      imagery: img.missing ? null : img,
      missingNotes: { elevation: elev.missing, imagery: img.missing }
    });
    built.report = report;
    built.settings = s;
    return built;
  });
}

module.exports = {
  AOI_CHOICES: AOI_CHOICES, EXAG_CHOICES: EXAG_CHOICES, PRESETS: PRESETS,
  validateSettings: validateSettings, prepareSite: prepareSite
};
