'use strict';
var test = require('node:test');
var assert = require('node:assert');
var vm = require('node:vm');
var site = require('../../src/pkjs/lib/site');
var protocol = require('../../src/pkjs/lib/protocol');
var companionLib = require('../../src/pkjs/lib/companion');
var configPage = require('../../src/pkjs/config_page');
var fx = require('./fixtures');

var CMD = protocol.CMD, PHONE = protocol.PHONE;

function memStorage() {
  var m = {};
  return {
    getItem: function (k) { return k in m ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    keys: function () { return Object.keys(m); }
  };
}

function harness(opts) {
  opts = opts || {};
  var sent = [], urls = [];
  var env = {
    storage: opts.storage || memStorage(),
    sendAppMessage: function (d, ack) { sent.push(d); setImmediate(ack); },
    later: function (fn) { setImmediate(fn); },
    openURL: function (u) { urls.push(u); },
    io: {},
    now: function () { return new Date('2026-09-29T00:00:00Z'); },
    getLocation: function (ok) { ok(1.5, 2.5); },
    randomId: (function () { var n = 100; return function () { return ++n; }; })(),
    log: function () {}
  };
  var c = new companionLib.Companion(env);
  return { c: c, sent: sent, urls: urls, env: env };
}

function settle() { return new Promise(function (r) { setTimeout(r, 20); }); }
function cmds(sent) { return sent.map(function (d) { return d.cmd; }); }
function closeWith(obj) { return encodeURIComponent(JSON.stringify(obj)); }

var realPrepare = site.prepareSite;
function stubPrepare(mode) {
  site.prepareSite = function (io, s) {
    if (mode === 'offline') return Promise.reject(Object.assign(new Error('network down'), { offline: true }));
    var r = fx.build(s.name, s.id, fx.VALLEY.sampler);
    return Promise.resolve(r);
  };
}
test.afterEach(function () { site.prepareSite = realPrepare; });

var NEW_SITE = { action: 'prepare', consent: true, site: { id: 0, name: 'Test Valley', lat: 10, lon: 20, aoiM: 2000, exagX10: 20, profile: { preset: 'W-E' } } };

test('no sites: watch is told there is nothing to show', async function () {
  var h = harness();
  h.c.onAppMessage({ cmd: CMD.HELLO, chunk: 1984 });
  await settle();
  assert.deepStrictEqual(h.sent[0], { cmd: CMD.SITES, count: 0, index: 0, status: 0 });
  assert.strictEqual(h.sent[1].status, PHONE.NO_SITES);
});

test('preparing requires the data notice to be accepted', async function () {
  stubPrepare('ok');
  var h = harness();
  await h.c.onWebviewClosed(closeWith(Object.assign({}, NEW_SITE, { consent: false })));
  assert.strictEqual(h.c.sites.length, 0);
  assert.match(h.c.message, /Accept the data notice/);
});

test('prepare -> review -> send -> watch receives the tile and the exaggeration', async function () {
  stubPrepare('ok');
  var h = harness();
  await h.c.onWebviewClosed(closeWith(NEW_SITE));
  var s = h.c.sites[0];
  assert.strictEqual(s.status, 'review');
  assert.ok(h.env.storage.getItem('fa.tile.' + s.id), 'tile cached on the phone');
  // Before review, the watch hears "review on phone", not a tile.
  await settle();
  h.sent.length = 0;
  h.c.onAppMessage({ cmd: CMD.HELLO, chunk: 1984 });
  await settle();
  assert.ok(cmds(h.sent).indexOf(CMD.BEGIN) < 0, 'nothing sent before review');
  assert.strictEqual(h.sent[1].status, PHONE.REVIEW);
  // The page shows the preview with separate imagery/elevation provenance.
  h.c.showConfiguration();
  var html = decodeURIComponent(h.urls[0].slice('data:text/html;charset=utf-8,'.length));
  assert.match(html, /Satellite imagery \(context only\)/);
  assert.match(html, /Elevation \(terrain source\)/);
  // Send.
  h.sent.length = 0;
  await h.c.onWebviewClosed(closeWith({ action: 'send', id: s.id, exagX10: 15, consent: true }));
  await settle();
  var begin = h.sent.filter(function (d) { return d.cmd === CMD.BEGIN; })[0];
  assert.strictEqual(begin.site, s.id);
  assert.ok(cmds(h.sent).indexOf(CMD.END) > 0);
  h.c.onAppMessage({ cmd: CMD.DONE, site: s.id, status: 0 });
  await settle();
  var settings = h.sent.filter(function (d) { return d.cmd === CMD.SETTINGS; })[0];
  assert.deepStrictEqual(settings, { cmd: CMD.SETTINGS, exag: 15 });
});

test('offline refresh keeps the cached tile and reports it honestly', async function () {
  stubPrepare('ok');
  var h = harness();
  await h.c.onWebviewClosed(closeWith(NEW_SITE));
  var s = h.c.sites[0];
  await h.c.onWebviewClosed(closeWith({ action: 'send', id: s.id, consent: true }));
  await settle();
  var before = h.env.storage.getItem('fa.tile.' + s.id);
  stubPrepare('offline');
  h.sent.length = 0;
  await h.c.onWebviewClosed(closeWith({ action: 'refresh', id: s.id, consent: true }));
  await settle();
  assert.strictEqual(h.env.storage.getItem('fa.tile.' + s.id), before, 'cache untouched');
  assert.strictEqual(s.status, 'ready');
  assert.match(s.error, /no network/i);
  assert.ok(h.sent.some(function (d) { return d.cmd === CMD.STATUS && d.status === PHONE.NET_OFFLINE; }));
  // The watch can still get the site, flagged as served from cache.
  h.sent.length = 0;
  h.c.onAppMessage({ cmd: CMD.HELLO, chunk: 1984 });
  await settle();
  assert.strictEqual(h.sent[0].status, PHONE.NET_OFFLINE);
  assert.ok(cmds(h.sent).indexOf(CMD.BEGIN) > 0);
});

test('offline first preparation fails visibly without a tile', async function () {
  stubPrepare('offline');
  var h = harness();
  await h.c.onWebviewClosed(closeWith(NEW_SITE));
  await settle();
  assert.strictEqual(h.c.sites[0].status, 'failed');
  assert.ok(h.sent.some(function (d) { return d.cmd === CMD.STATUS && d.status === PHONE.PREP_FAILED; }));
});

test('remove deletes the site and its cached tile', async function () {
  stubPrepare('ok');
  var h = harness();
  await h.c.onWebviewClosed(closeWith(NEW_SITE));
  var id = h.c.sites[0].id;
  await h.c.onWebviewClosed(closeWith({ action: 'remove', id: id, consent: true }));
  assert.strictEqual(h.c.sites.length, 0);
  assert.strictEqual(h.env.storage.getItem('fa.tile.' + id), null);
});

test('invalid coordinates never reach the network', async function () {
  var called = false;
  site.prepareSite = function () { called = true; return Promise.resolve(/** @type {any} */ (null)); };
  var h = harness();
  var bad = JSON.parse(JSON.stringify(NEW_SITE));
  bad.site.lat = 123;
  await h.c.onWebviewClosed(closeWith(bad));
  assert.strictEqual(called, false);
  assert.match(h.c.message, /latitude/);
});

// ---- the settings page itself, run against a minimal fake DOM ----
function fakeDom() {
  var els = {};
  function el(id) {
    if (!els[id]) {
      els[id] = {
        id: id, style: {}, value: '', textContent: '', innerHTML: '',
        getAttribute: function () { return null; },
        scrollIntoView: function () {},
        getBoundingClientRect: function () { return { left: 0, top: 0, width: 288, height: 288 }; },
        getContext: function () {
          return new Proxy({}, { get: function (t, k) { return k in t ? t[k] : function () {}; }, set: function (t, k, v) { t[k] = v; return true; } });
        },
        width: 288, height: 288
      };
    }
    return els[id];
  }
  var sandbox = {
    document: { getElementById: el },
    location: { search: '', href: '' },
    navigator: {},
    confirm: function () { return true; },
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
    JSON: JSON, Math: Math, Date: Date, String: String, Number: Number, Uint8Array: Uint8Array, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent
  };
  return { sandbox: sandbox, el: el };
}

test('settings page runs self-contained and returns validated actions', async function () {
  stubPrepare('ok');
  var h = harness();
  await h.c.onWebviewClosed(closeWith(NEW_SITE));
  var state = JSON.parse(JSON.stringify(h.c.pageState()));
  var dom = fakeDom();
  // Serialised exactly as the phone does, in a context with no Node globals.
  vm.runInNewContext('(' + configPage.pageMain.toString() + ')(' + JSON.stringify(state) + ')', dom.sandbox);
  assert.match(dom.el('pv-meta').innerHTML, /UNKNOWN|SYNTHETIC/);
  // Bad coordinates are caught in the page.
  dom.el('add').onclick();
  dom.el('f-coords').value = 'north of here';
  dom.el('f-save').onclick();
  assert.match(dom.el('f-error').textContent, /latitude, longitude/);
  assert.strictEqual(dom.sandbox.location.href, '');
  // Good input returns a prepare action.
  dom.el('f-coords').value = '37.7459, -119.5332';
  dom.el('f-aoi').value = '4000';
  dom.el('f-preset').value = 'S-N';
  dom.el('f-exag').value = '10';
  dom.el('f-save').onclick();
  var ret = JSON.parse(decodeURIComponent(dom.sandbox.location.href.replace('pebblejs://close#', '')));
  assert.strictEqual(ret.action, 'prepare');
  assert.deepStrictEqual(ret.site.profile, { preset: 'S-N' });
  assert.strictEqual(ret.site.aoiM, 4000);
  assert.strictEqual(ret.consent, true);
});

test('page HTML escapes stored names', function () {
  var html = configPage.buildHtml({ consent: true, sites: [], previews: {}, message: '</script><b>x', nowUnix: 0, staleDays: 30 });
  assert.ok(html.indexOf('</script><b>x') < 0);
});
