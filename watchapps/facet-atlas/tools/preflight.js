#!/usr/bin/env node
'use strict';
// Release preflight. Default mode checks consistency and repository hygiene;
// `--release` additionally requires the artefacts only the Pebble SDK and
// emulator can produce (see RELEASE.md), so it fails until they exist.

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.join(__dirname, '..');
var release = process.argv.indexOf('--release') > 0;
var failures = [], warnings = [];

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function fail(msg) { failures.push(msg); }
function check(cond, msg) { if (!cond) fail(msg); }

// ---- Pebble project ----
var pkg = JSON.parse(read('package.json'));
var pb = pkg.pebble || {};
check(JSON.stringify(pb.targetPlatforms) === '["emery"]', 'targetPlatforms must be exactly ["emery"] (Pebble Time 2)');
check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(pb.uuid || ''), 'pebble.uuid must be a v4 UUID');
check(pb.enableMultiJS === true, 'enableMultiJS must be true (pkjs uses require)');
check(pb.watchapp && pb.watchapp.watchface === false, 'must be a watchapp, not a watchface');
check(!pkg.devDependencies, 'keep dev tooling in tools/dev, not the Pebble package.json');

var mainC = read('src/c/main.c');
var usedKeys = {};
(mainC.match(/MESSAGE_KEY_(\w+)/g) || []).forEach(function (k) { usedKeys[k.slice(12)] = 'C'; });
['src/pkjs/lib/companion.js', 'src/pkjs/lib/transfer.js'].forEach(function (f) {
  (read(f).match(/\{ cmd: CMD\.[A-Z_]+[^}]*\}/g) || []).forEach(function (lit) {
    (lit.match(/(\w+):/g) || []).forEach(function (k) { usedKeys[k.slice(0, -1)] = f; });
  });
});
Object.keys(usedKeys).forEach(function (k) {
  check((pb.messageKeys || []).indexOf(k) >= 0, 'message key "' + k + '" used in ' + usedKeys[k] + ' is missing from package.json');
});

// ---- C and JS agree ----
var protoH = read('src/c/fa_proto.h'), tileH = read('src/c/fa_tile.h');
var protocol = require('../src/pkjs/lib/protocol');
var tile = require('../src/pkjs/lib/tile');
var terrain = require('../src/pkjs/lib/terrain');
var transfer = require('../src/pkjs/lib/transfer');
function cEnum(src, prefix, name) {
  var m = src.match(new RegExp(prefix + name + '\\s*=\\s*(\\d+)'));
  return m ? parseInt(m[1], 10) : null;
}
Object.keys(protocol.CMD).forEach(function (k) {
  check(cEnum(protoH, 'FA_CMD_', k) === protocol.CMD[k], 'CMD.' + k + ' differs between fa_proto.h and protocol.js');
});
Object.keys(protocol.PHONE).forEach(function (k) {
  check(cEnum(protoH, 'FA_PHONE_', k) === protocol.PHONE[k], 'PHONE.' + k + ' differs between fa_proto.h and protocol.js');
});
function cDefine(src, name) {
  var m = src.match(new RegExp('#define ' + name + ' \\(?(-?\\d+)'));
  return m ? parseInt(m[1], 10) : null;
}
[['FA_MAX_TILE_BYTES', tile.LIMITS.maxTileBytes], ['FA_MAX_VERTS', tile.LIMITS.maxVerts],
  ['FA_MAX_TRIS', tile.LIMITS.maxTris], ['FA_MAX_BREAK_POLYS', tile.LIMITS.maxBreakPolys],
  ['FA_MAX_BREAK_POINTS', tile.LIMITS.maxBreakPoints], ['FA_MAX_GRID_N', tile.LIMITS.maxGridN],
  ['FA_MAX_PROFILE', tile.LIMITS.maxProfile], ['FA_MAX_IMAGE_SIDE', tile.LIMITS.maxImageSide],
  ['FA_MAX_META_LEN', tile.LIMITS.maxMetaLen], ['FA_PROFILE_NODATA', tile.PROFILE_NODATA]
].forEach(function (p) { check(cDefine(tileH, p[0]) === p[1], p[0] + ' differs between fa_tile.h and tile.js'); });
check(terrain.MAX_TRIS === tile.LIMITS.maxTris && terrain.MAX_VERTS === tile.LIMITS.maxVerts, 'terrain.js mesh budget differs from tile.js');
check(terrain.GRID_N <= tile.LIMITS.maxGridN, 'grid larger than the tile format allows');
var errNames = tileH.slice(tileH.indexOf('FA_OK = 0'), tileH.indexOf('} FaStatus;')).match(/FA_(OK|E_\w+)/g);
check(errNames.indexOf('FA_E_OFFSET') === protocol.FA_E_OFFSET, 'FA_E_OFFSET value differs between fa_tile.h and protocol.js');
var inbox = cDefine(protoH, 'FA_INBOX_BYTES');
var chunk = inbox - (1 + 3 * 7 + 4 + 4) - cDefine(protoH, 'FA_CHUNK_MARGIN');
check(chunk === transfer.DEFAULT_CHUNK, 'FA_CHUNK_BYTES (' + chunk + ') differs from transfer.DEFAULT_CHUNK');

// ---- repository hygiene ----
var tracked = [];
try {
  tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
} catch (e) { warnings.push('not a git checkout; hygiene checks skipped'); }
var forbidden = [/(^|\/)build\//, /\.pbw$/, /\.fat$/, /(^|\/)node_modules\//, /(^|\/)\.env$/, /credential/i, /token\.json$/, /\.pem$/, /\.key$/];
tracked.forEach(function (f) {
  forbidden.forEach(function (re) { if (re.test(f)) fail('must not be committed: ' + f); });
});
// Coordinates: only synthetic fixtures (0,0) and documented public
// reference points may appear in the repository.
var PUBLIC_POINTS = {
  '37.7459,-119.5332': 'Half Dome, Yosemite (public landmark, README example)',
  '47.32042,11.11062': 'Sentinel-2 tile 32TPT centroid (from public metadata)',
  '47.3,11.0': 'test point near a Sentinel-2 grid edge',
  '40.7128,-74.006': 'MGRS test: New York City Hall area',
  '-33.86,151.21': 'MGRS test: Sydney',
  '60.39,5.32': 'MGRS test: Bergen',
  '78.22,15.65': 'MGRS test: Longyearbyen',
  '47.2692,11.4041': 'input-parsing example: Innsbruck centre',
  '46.5,7.9': 'local-frame test point'
};
var coordRe = /(-?\d{1,2}\.\d{2,})\s*,\s*(-?\d{1,3}\.\d{2,})/g;
tracked.filter(function (f) { return /\.(js|c|h|md|json|html|py)$/.test(f) && fs.existsSync(path.join(ROOT, f)); }).forEach(function (f) {
  if (/package-lock\.json$/.test(f)) return;
  var s = fs.readFileSync(path.join(ROOT, f), 'utf8'), m;
  while ((m = coordRe.exec(s))) {
    var key = parseFloat(m[1]) + ',' + parseFloat(m[2]);
    if (!PUBLIC_POINTS[key] && Math.abs(parseFloat(m[1])) <= 90) fail('unlisted coordinates ' + m[0] + ' in ' + f + ' (add to PUBLIC_POINTS only if public)');
  }
  if (/AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=]\s*['"][^'"]{12,}/i.test(s)) fail('possible credential in ' + f);
});

// ---- release-only artefacts ----
var shots = ['satellite', 'tin', 'slope', 'profile'].map(function (v) { return 'docs/screenshots/emery-' + v + '.png'; });
function pngSize(p) {
  var b = fs.readFileSync(path.join(ROOT, p));
  return b.length > 24 && b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null;
}
shots.forEach(function (p) {
  if (!fs.existsSync(path.join(ROOT, p))) {
    (release ? failures : warnings).push('missing emulator capture ' + p + ' (pebble screenshot on emery; see RELEASE.md)');
  } else {
    var sz = pngSize(p);
    check(sz && sz[0] === 200 && sz[1] === 228, p + ' must be 200x228, got ' + (sz ? sz.join('x') : 'not a PNG'));
  }
});
if (!fs.existsSync(path.join(ROOT, 'build', 'facet-atlas.pbw'))) {
  (release ? failures : warnings).push('no build/facet-atlas.pbw: run `pebble build` with the Pebble SDK');
}
var rel = read('RELEASE.md');
if (release && /- \[ \] .*\(emulator\)/.test(rel)) failures.push('RELEASE.md has unchecked emulator items');

warnings.forEach(function (w) { console.log('warn: ' + w); });
failures.forEach(function (f) { console.log('FAIL: ' + f); });
console.log(failures.length ? 'preflight failed (' + failures.length + ')' : 'preflight ok' + (release ? ' (release)' : ''));
process.exit(failures.length ? 1 : 0);
