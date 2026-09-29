'use strict';
// Phone companion logic: saved sites, the tile cache, the settings page
// round trip and watch messaging. Pebble globals are injected through
// `env`, so the whole flow runs under test (test/js/companion.test.js).
//
// env = {
//   storage: { getItem, setItem, removeItem },
//   sendAppMessage(dict, onAck, onNack), later(fn, ms), openURL(url),
//   io: sources.js io, now() -> Date, getLocation(onOk(lat, lon), onErr(msg)),
//   randomId() -> uint31, log(msg)
// }

var site = require('./site');
var tileLib = require('./tile');
var base64 = require('./base64');
var protocol = require('./protocol');
var transfer = require('./transfer');
var configPage = require('../config_page');

var CMD = protocol.CMD, PHONE = protocol.PHONE;
var MAX_SITES = 6;
var STALE_DAYS = 30;

function Companion(env) {
  this.env = env;
  this.queue = [];
  this.busy = false;
  var self = this;
  this.sender = new transfer.Sender({
    send: function (dict, ack, nack) { self.send(dict, ack, nack); },
    later: env.later
  });
  this.sites = this.load('fa.sites', []);
  this.currentId = this.load('fa.current', 0);
  this.consent = this.load('fa.consent', false);
  this.lastFix = this.load('fa.lastFix', null);
  this.netOffline = false;
  this.message = '';
  this.openForm = false;
}

Companion.prototype.load = function (key, dflt) {
  try {
    var v = this.env.storage.getItem(key);
    return v === null || v === undefined ? dflt : JSON.parse(v);
  } catch (e) { return dflt; }
};
Companion.prototype.save = function () {
  this.env.storage.setItem('fa.sites', JSON.stringify(this.sites));
  this.env.storage.setItem('fa.current', JSON.stringify(this.currentId));
  this.env.storage.setItem('fa.consent', JSON.stringify(this.consent));
  if (this.lastFix) this.env.storage.setItem('fa.lastFix', JSON.stringify(this.lastFix));
};
Companion.prototype.tileOf = function (id) {
  var b = this.env.storage.getItem('fa.tile.' + id);
  return b ? base64.decode(b) : null;
};
Companion.prototype.find = function (id) {
  return this.sites.filter(function (s) { return s.id === id; })[0] || null;
};

// ---- outbound queue: one AppMessage in flight ----
Companion.prototype.send = function (dict, ack, nack) {
  this.queue.push({ dict: dict, ack: ack, nack: nack });
  this.pump();
};
Companion.prototype.pump = function () {
  if (this.busy || !this.queue.length) return;
  var self = this, m = this.queue.shift();
  this.busy = true;
  this.env.sendAppMessage(m.dict, function () {
    self.busy = false;
    if (m.ack) m.ack();
    self.pump();
  }, function () {
    self.busy = false;
    if (m.nack) m.nack();
    self.pump();
  });
};
Companion.prototype.status = function (code, text) {
  this.send({ cmd: CMD.STATUS, status: code, text: String(text || '').slice(0, 40) });
};

// ---- watch side ----
Companion.prototype.readySites = function () {
  var self = this;
  return this.sites.filter(function (s) { return s.status === 'ready' && self.env.storage.getItem('fa.tile.' + s.id); });
};

Companion.prototype.onAppMessage = function (p) {
  switch (p.cmd) {
    case CMD.HELLO:
      if (p.chunk) this.sender.chunk = Math.max(64, Math.min(p.chunk, transfer.DEFAULT_CHUNK));
      this.announce(true);
      break;
    case CMD.REQ_SITE:
      this.sendIndex(p.index | 0);
      break;
    case CMD.NACK:
      this.sender.onWatchNack(p.offset, p.status);
      break;
    case CMD.DONE:
      this.sender.onWatchDone(p.site >>> 0, p.status);
      break;
    default:
      break;
  }
};

// Tell the watch what exists, then send the current site if there is one.
Companion.prototype.announce = function (sendCurrent) {
  var ready = this.readySites();
  this.send({ cmd: CMD.SITES, count: ready.length, index: 0, status: this.netOffline ? PHONE.NET_OFFLINE : 0 });
  if (!ready.length) {
    var pending = this.sites.filter(function (s) { return s.status === 'review' || s.status === 'preparing'; })[0];
    if (pending) this.status(pending.status === 'review' ? PHONE.REVIEW : PHONE.PREPARING, pending.name);
    else this.status(PHONE.NO_SITES, '');
    return;
  }
  if (!sendCurrent) return;
  var idx = 0;
  for (var i = 0; i < ready.length; i++) if (ready[i].id === this.currentId) idx = i;
  this.sendIndex(idx);
};

Companion.prototype.sendIndex = function (index) {
  var ready = this.readySites();
  if (!ready.length) return this.announce(false);
  index = ((index % ready.length) + ready.length) % ready.length;
  var s = ready[index], bytes = this.tileOf(s.id), self = this;
  this.currentId = s.id;
  this.save();
  this.sender.send(bytes, s.id, index, ready.length, {
    onDone: function (err) {
      if (err) return self.status(PHONE.SEND_FAILED, err.message);
      // The tile carries its preparation-time exaggeration; apply the current setting.
      self.send({ cmd: CMD.SETTINGS, exag: s.exagX10 });
      if (self.netOffline) self.status(PHONE.NET_OFFLINE, '');
    }
  });
};

// ---- settings page ----
Companion.prototype.pageState = function () {
  var self = this, previews = {};
  this.sites.forEach(function (s) {
    var bytes = self.tileOf(s.id);
    if (!bytes) return;
    try { previews[s.id] = previewOf(tileLib.decode(bytes), bytes); } catch (e) { self.env.log('bad cached tile ' + s.id); }
  });
  var selected = this.selectedId && previews[this.selectedId] ? this.selectedId :
    (previews[this.currentId] ? this.currentId : (Number(Object.keys(previews)[0]) || 0));
  return {
    consent: this.consent, sites: this.sites, previews: previews, selectedId: selected,
    currentId: this.currentId, lastFix: this.lastFix, message: this.message, openForm: this.openForm,
    nowUnix: Math.floor(this.env.now().getTime() / 1000), staleDays: STALE_DAYS
  };
};

function previewOf(t, bytes) {
  function b64(u8) { return base64.encode(u8); }
  var p = { siteId: t.siteId, flags: t.flags, meta: t.meta, geo: t.geo, bytes: bytes.length, tile: b64(bytes) };
  var step = t.geo.aoiM / (t.geo.gridN - 1), off = (t.geo.imageM - t.geo.aoiM) / 2;
  function px(q) { return [(q[0] / 4 * step + off) * 144 / t.geo.imageM, (q[1] / 4 * step + off) * 144 / t.geo.imageM]; }
  p.aPx = px(t.geo.aQ); p.bPx = px(t.geo.bQ);
  if (t.image) {
    var packed = new Uint8Array(Math.ceil(t.image.w * t.image.h / 2));
    for (var k = 0; k < t.image.pixels.length; k++) packed[k >> 1] |= t.image.pixels[k] << (k & 1 ? 0 : 4);
    p.image = { w: t.image.w, h: t.image.h, palette: t.image.palette, pixels: b64(packed) };
  }
  if (t.profile) p.profile = { lengthM: t.profile.lengthM, z: t.profile.z.map(function (z) { return isFinite(z) ? z : null; }) };
  return p;
}

Companion.prototype.showConfiguration = function () {
  var html = configPage.buildHtml(this.pageState());
  this.message = '';
  this.openForm = false;
  this.env.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
};

Companion.prototype.onWebviewClosed = function (response) {
  if (!response) return Promise.resolve();
  var r;
  try { r = JSON.parse(decodeURIComponent(response)); } catch (e) { return Promise.resolve(); }
  if (typeof r.consent === 'boolean') this.consent = r.consent;
  this.save();
  var s = r.id ? this.find(r.id >>> 0) : null;
  switch (r.action) {
    case 'prepare': return this.prepare(r.site);
    case 'endpoints':
      if (!s) return Promise.resolve();
      return this.prepare({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, aoiM: s.aoiM, exagX10: s.exagX10, profile: r.profile });
    case 'refresh':
      if (!s) return Promise.resolve();
      return this.prepare(s, true);
    case 'send':
      if (!s || !this.tileOf(s.id)) return Promise.resolve();
      if (r.exagX10 && site.EXAG_CHOICES.indexOf(r.exagX10) >= 0) s.exagX10 = r.exagX10;
      s.status = 'ready';
      this.currentId = s.id;
      this.save();
      this.announce(true);
      return Promise.resolve();
    case 'exag':
      if (!s || site.EXAG_CHOICES.indexOf(r.exagX10) < 0) return Promise.resolve();
      s.exagX10 = r.exagX10;
      this.selectedId = s.id;
      this.save();
      if (s.id === this.currentId && s.status === 'ready') this.send({ cmd: CMD.SETTINGS, exag: s.exagX10 });
      return Promise.resolve();
    case 'remove':
      if (!s) return Promise.resolve();
      this.sites = this.sites.filter(function (x) { return x.id !== s.id; });
      this.env.storage.removeItem('fa.tile.' + s.id);
      if (this.currentId === s.id) this.currentId = (this.readySites()[0] || {}).id || 0;
      this.save();
      this.announce(true);
      return Promise.resolve();
    case 'locate':
      return this.locate();
    default:
      return Promise.resolve();
  }
};

Companion.prototype.locate = function () {
  var self = this;
  return new Promise(function (resolve) {
    self.env.getLocation(function (lat, lon) {
      self.lastFix = { lat: lat, lon: lon, unix: Math.floor(self.env.now().getTime() / 1000) };
      self.save();
      self.message = 'Phone location saved on this phone. Open settings again to use it.';
      self.openForm = true;
      resolve();
    }, function (msg) {
      self.message = 'Could not read the phone location: ' + msg + '. Enter coordinates instead.';
      self.openForm = true;
      resolve();
    });
  });
};

// Prepare (or refresh) a site. The result waits for review on the phone;
// nothing reaches the watch until the user taps "Send to watch".
Companion.prototype.prepare = function (settings, isRefresh) {
  var self = this;
  if (!this.consent) {
    this.message = 'Accept the data notice before preparing a site.';
    return Promise.resolve();
  }
  var v;
  try {
    settings = JSON.parse(JSON.stringify(settings || {}));
    if (!settings.id) {
      if (this.sites.length >= MAX_SITES) throw new Error('At most ' + MAX_SITES + ' sites; remove one first');
      do { settings.id = this.env.randomId(); } while (!settings.id || this.find(settings.id));
    }
    v = site.validateSettings(settings);
  } catch (e) {
    this.message = e.message;
    this.openForm = true;
    return Promise.resolve();
  }
  var existing = this.find(v.id);
  var record = existing || { id: v.id };
  ['name', 'lat', 'lon', 'aoiM', 'exagX10', 'profile'].forEach(function (k) { record[k] = v[k]; });
  var previousStatus = record.status;
  record.status = 'preparing';
  record.error = '';
  if (!existing) this.sites.push(record);
  this.save();
  this.status(PHONE.PREPARING, record.name);
  return site.prepareSite(this.env.io, v, this.env.now()).then(function (r) {
    self.env.storage.setItem('fa.tile.' + record.id, base64.encode(r.bytes));
    record.status = 'review';
    record.preparedUnix = r.tile.geo.preparedUnix;
    self.netOffline = false;
    self.selectedId = record.id;
    self.message = 'Preview ready for ' + (record.name || 'the site') + '. Review it below, then send it to the watch.';
    self.save();
    self.status(PHONE.REVIEW, record.name);
  }, function (e) {
    var cached = !!self.tileOf(record.id);
    if (e.offline && isRefresh && cached) {
      // Keep serving the cached tile, and say so on both devices.
      record.status = previousStatus;
      record.error = 'Refresh failed (no network). Cached tile kept.';
      self.netOffline = true;
      self.status(PHONE.NET_OFFLINE, '');
    } else {
      record.status = cached ? previousStatus : 'failed';
      record.error = (e.offline ? 'No network: ' : 'Preparation failed: ') + e.message;
      self.status(PHONE.PREP_FAILED, e.offline ? 'NO NETWORK' : 'ERROR');
    }
    self.message = record.error;
    self.save();
  });
};

module.exports = { Companion: Companion, MAX_SITES: MAX_SITES, STALE_DAYS: STALE_DAYS, previewOf: previewOf };
