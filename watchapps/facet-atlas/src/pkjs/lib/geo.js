'use strict';
// Geodesy helpers on the WGS84 ellipsoid. The AOI is at most a few km wide,
// so a local tangent frame (east/north metres from the site centre, using
// the ellipsoid's meridional and prime-vertical radii) is accurate to well
// under a pixel at watch resolution.

var A = 6378137.0;
var F = 1 / 298.257223563;
var E2 = F * (2 - F);
var D2R = Math.PI / 180;

function radii(latDeg) {
  var s = Math.sin(latDeg * D2R);
  var w = Math.sqrt(1 - E2 * s * s);
  return { m: A * (1 - E2) / (w * w * w), n: A / w };
}

// Local frame around (lat0, lon0): returns converters in both directions.
function localFrame(lat0, lon0) {
  var r = radii(lat0);
  var cosLat = Math.cos(lat0 * D2R);
  return {
    toLatLon: function (east, north) {
      return { lat: lat0 + north / r.m / D2R, lon: lon0 + east / (r.n * cosLat) / D2R };
    },
    toLocal: function (lat, lon) {
      return { east: (lon - lon0) * D2R * r.n * cosLat, north: (lat - lat0) * D2R * r.m };
    }
  };
}

function validLatLon(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// Parse "47.2692, 11.4041" style input. Returns null if invalid.
function parseLatLon(text) {
  if (typeof text !== 'string') return null;
  var m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  return validLatLon(lat, lon) ? { lat: lat, lon: lon } : null;
}

// --- UTM (Krüger series, as in Snyder / Karney's 6th-order form truncated
// to 4th order: sub-millimetre inside a zone). ---
var N_ = F / (2 - F);
var A_ = A / (1 + N_) * (1 + N_ * N_ / 4 + Math.pow(N_, 4) / 64);
var ALPHA = [
  N_ / 2 - 2 * N_ * N_ / 3 + 5 * Math.pow(N_, 3) / 16 + 41 * Math.pow(N_, 4) / 180,
  13 * N_ * N_ / 48 - 3 * Math.pow(N_, 3) / 5 + 557 * Math.pow(N_, 4) / 1440,
  61 * Math.pow(N_, 3) / 240 - 103 * Math.pow(N_, 4) / 140,
  49561 * Math.pow(N_, 4) / 161280
];

function utmZone(lat, lon) {
  var z = Math.floor((lon + 180) / 6) + 1;
  if (z > 60) z = 60;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32;
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) z = 31;
    else if (lon >= 9 && lon < 21) z = 33;
    else if (lon >= 21 && lon < 33) z = 35;
    else if (lon >= 33 && lon < 42) z = 37;
  }
  return z;
}

function toUtm(lat, lon, zone) {
  var lon0 = (zone - 1) * 6 - 180 + 3;
  var phi = lat * D2R, lam = (lon - lon0) * D2R;
  var e = Math.sqrt(E2);
  var t = Math.sinh(atanh(Math.sin(phi)) - e * atanh(e * Math.sin(phi)));
  var xi = Math.atan2(t, Math.cos(lam));
  var eta = atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  var x = eta, y = xi;
  for (var j = 1; j <= 4; j++) {
    x += ALPHA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    y += ALPHA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  var k0 = 0.9996;
  var easting = 500000 + k0 * A_ * x;
  var northing = k0 * A_ * y;
  if (lat < 0) northing += 10000000;
  return { zone: zone, easting: easting, northing: northing };
}

function atanh(x) { return 0.5 * Math.log((1 + x) / (1 - x)); }

var BANDS = 'CDEFGHJKLMNPQRSTUVWX';
function latBand(lat) {
  if (lat < -80 || lat > 84) return null;
  return BANDS[Math.min(19, Math.floor((lat + 80) / 8))];
}

// MGRS 100 km grid-square id, e.g. {zone:32, band:'T', square:'PT'}.
// Sentinel-2 tiles are named by this id.
function mgrsSquare(lat, lon, zoneOverride) {
  var zone = zoneOverride || utmZone(lat, lon);
  var u = toUtm(lat, lon, zone);
  var colSets = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
  var col = colSets[(zone - 1) % 3][Math.floor(u.easting / 100000) - 1];
  var rows = 'ABCDEFGHJKLMNPQRSTUV';
  var r = Math.floor(u.northing / 100000) % 20;
  if (zone % 2 === 0) r = (r + 5) % 20;
  return { zone: zone, band: latBand(lat), square: col + rows[r], utm: u };
}

module.exports = {
  radii: radii, localFrame: localFrame, parseLatLon: parseLatLon, validLatLon: validLatLon,
  utmZone: utmZone, toUtm: toUtm, latBand: latBand, mgrsSquare: mgrsSquare
};
