'use strict';
var test = require('node:test');
var assert = require('node:assert');
var geo = require('../../src/pkjs/lib/geo');
var site = require('../../src/pkjs/lib/site');
var sources = require('../../src/pkjs/lib/sources');

test('MGRS squares match published Sentinel-2 tile ids', function () {
  // Tile ids taken from the sentinel-cogs bucket listing (see docs/DATA_SOURCES.md).
  [[47.32042, 11.11062, '32TPT'], [40.7128, -74.006, '18TWL'], [-33.86, 151.21, '56HLH'],
    [60.39, 5.32, '32VKN'], [78.22, 15.65, '33XWG']].forEach(function (c) {
    var m = geo.mgrsSquare(c[0], c[1]);
    assert.strictEqual(m.zone + m.band + m.square, c[2]);
  });
});

test('local frame round-trips to millimetres', function () {
  var f = geo.localFrame(46.5, 7.9);
  var p = f.toLatLon(1234.5, -987.25), q = f.toLocal(p.lat, p.lon);
  assert.ok(Math.abs(q.east - 1234.5) < 1e-3 && Math.abs(q.north + 987.25) < 1e-3);
});

test('coordinate input validation', function () {
  assert.deepStrictEqual(geo.parseLatLon('47.2692, 11.4041'), { lat: 47.2692, lon: 11.4041 });
  assert.deepStrictEqual(geo.parseLatLon('-33.9 151.2'), { lat: -33.9, lon: 151.2 });
  ['', '91, 0', '0, 181', 'abc', '47.2692', '1e3, 2', '47,11,3'].forEach(function (s) {
    assert.strictEqual(geo.parseLatLon(s), null, JSON.stringify(s));
  });
});

test('settings validation refuses unusable sites', function () {
  var ok = { id: 1, name: 'Test', lat: 10, lon: 10, aoiM: 2000, exagX10: 10, profile: { preset: 'W-E' } };
  assert.strictEqual(site.validateSettings(ok).aoiM, 2000);
  function bad(patch, re) {
    var s = JSON.parse(JSON.stringify(ok));
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    assert.throws(function () { site.validateSettings(s); }, re);
  }
  bad({ lat: 95 }, /latitude/);
  bad({ lat: 85 }, /84/);
  bad({ aoiM: 50000 }, /Area/);
  bad({ exagX10: 99 }, /exaggeration/);
  bad({ profile: null }, /endpoints/);
  bad({ profile: { a: { lat: 10, lon: 10 }, b: { lat: 10, lon: 10.0001 } } }, /60 m/);
  bad({ profile: { a: { lat: 10, lon: 10 }, b: { lat: 10.5, lon: 10 } } }, /inside/);
  assert.strictEqual(site.validateSettings({ id: 1, name: 'x☃y', lat: 1, lon: 1, aoiM: 1000, profile: { preset: 'S-N' } }).name, 'xy');
});

test('DEM tile naming and metadata parsing', function () {
  assert.strictEqual(sources.demTileName(47, 11), 'Copernicus_DSM_COG_10_N47_00_E011_00_DEM');
  assert.strictEqual(sources.demTileName(-34, -71), 'Copernicus_DSM_COG_10_S34_00_W071_00_DEM');
  var xml = '<tsxx:tsxx_startTime>2011-02-07T17:06:47Z</tsxx:tsxx_startTime><tsxx:tsxx_stopTime>2014-08-06T17:08Z</tsxx:tsxx_stopTime>' +
    '<tsxx:horizontalDatumCode>WGS84-G1150</tsxx:horizontalDatumCode><gml:VerticalCRS gml:id="x"><gml:identifier codeSpace="EPSG::3855" />';
  assert.deepStrictEqual(sources.parseDemXml(xml), { start: '2011-02-07', stop: '2014-08-06', hDatum: 'WGS84-G1150', vEpsg: '3855' });
});

test('Sentinel-2 tile choice covers the whole map extent', function () {
  // Near the west edge of square 32TPT the east-adjacent overlap cannot
  // help, so the chooser must pick the neighbouring square's tile.
  var sq = sources.chooseS2Square(47.3, 11.0, 3000);
  var b = sources.s2TileBounds(sq);
  var f = geo.localFrame(47.3, 11.0);
  [[-1500, -1500], [1500, 1500], [-1500, 1500], [1500, -1500]].forEach(function (c) {
    var p = f.toLatLon(c[0], c[1]), u = geo.toUtm(p.lat, p.lon, sq.zone);
    assert.ok(u.easting >= b.e0 && u.easting < b.e1 && u.northing > b.n0 && u.northing <= b.n1);
  });
});

test('offline: fetch failures yield an explicit offline error, not a tile', async function () {
  var io = {
    fetchRange: function () { return Promise.reject(Object.assign(new Error('network down'), { status: 0 })); },
    fetchText: function () { return Promise.reject(Object.assign(new Error('network down'), { status: 0 })); }
  };
  await assert.rejects(site.prepareSite(io, { id: 1, lat: 10, lon: 10, aoiM: 1000, profile: { preset: 'W-E' } }, new Date()), function (e) {
    return /** @type {any} */ (e).offline === true;
  });
});

test('ocean: missing DEM tile and no scenes produce a labelled tile', async function () {
  var io = {
    fetchRange: function () { return Promise.reject(Object.assign(new Error('404'), { status: 404 })); },
    fetchText: function (url) {
      if (url.indexOf('list-type') >= 0) return Promise.resolve('<ListBucketResult></ListBucketResult>');
      return Promise.reject(Object.assign(new Error('404'), { status: 404 }));
    }
  };
  var r = await site.prepareSite(io, { id: 2, lat: 0.5, lon: -30.5, aoiM: 1000, profile: { preset: 'W-E' } }, new Date('2026-09-01'));
  assert.strictEqual(r.tile.flags, 0);
  assert.strictEqual(r.tile.meta[11], 'NO COP-DEM TILE HERE');
  assert.match(r.tile.meta[10], /NO SCENE/);
});
