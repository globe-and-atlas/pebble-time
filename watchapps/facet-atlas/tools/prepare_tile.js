#!/usr/bin/env node
'use strict';
// Reproducible tile preparation from the command line, using the same
// library code as the phone. Writes the tile and a JSON provenance report.
//
//   node tools/prepare_tile.js --lat 37.7459 --lon -119.5332 --aoi 2000 \
//     --profile W-E --name "Half Dome" --out build/halfdome
//
// Network access goes through curl so the system proxy/CA settings apply.

var execFileSync = require('child_process').execFileSync;
var fs = require('fs');
var path = require('path');
var site = require('../src/pkjs/lib/site');

function arg(name, dflt) {
  var i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
}

function curl(args) {
  try {
    return execFileSync('curl', ['-sS', '-f', '--retry', '2'].concat(args), { maxBuffer: 1 << 28 });
  } catch (e) {
    var m = String(e.stderr || '').match(/error: (\d{3})/);
    var err = /** @type {any} */ (new Error('curl failed: ' + String(e.stderr || e.message).trim()));
    err.status = m ? parseInt(m[1], 10) : 0;
    throw err;
  }
}

var io = {
  fetchRange: function (url, start, end) {
    return new Promise(function (resolve) {
      var b = curl(['-r', start + '-' + (end - 1), url]);
      resolve(new Uint8Array(b.buffer, b.byteOffset, b.length));
    });
  },
  fetchText: function (url) {
    return new Promise(function (resolve) { resolve(curl([url]).toString('utf8')); });
  }
};

var settings = {
  id: parseInt(arg('id', '1'), 10),
  name: arg('name', ''),
  lat: parseFloat(arg('lat')),
  lon: parseFloat(arg('lon')),
  aoiM: parseInt(arg('aoi', '2000'), 10),
  exagX10: parseInt(arg('exag', '10'), 10),
  profile: { preset: arg('profile', 'W-E') }
};
var out = arg('out', 'build/tile');
var now = arg('now') ? new Date(arg('now')) : new Date();

site.prepareSite(io, settings, now).then(function (r) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out + '.fat', Buffer.from(r.bytes));
  var uniq = r.report.requests.filter(function (u, i, a) { return a.indexOf(u) === i; });
  fs.writeFileSync(out + '.json', JSON.stringify({
    settings: r.settings, flags: r.tile.flags, meta: r.tile.meta, geo: r.tile.geo,
    bytes: r.bytes.length, elevation: r.report.elevation, imagery: r.report.imagery,
    requestedUrls: uniq
  }, null, 2));
  console.log('wrote ' + out + '.fat (' + r.bytes.length + ' bytes)');
  console.log(JSON.stringify({ meta: r.tile.meta, flags: r.tile.flags }, null, 1));
}).catch(function (e) {
  console.error(e.message);
  process.exit(1);
});
