'use strict';
// PebbleKit JS entry point: binds the companion to Pebble's globals.

var Companion = require('./lib/companion').Companion;

function xhr(url, opts) {
  return new Promise(function (resolve, reject) {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.timeout = 30000;
    if (opts.range) req.setRequestHeader('Range', 'bytes=' + opts.range[0] + '-' + (opts.range[1] - 1));
    if (opts.binary) req.responseType = 'arraybuffer';
    req.onload = function () {
      if (req.status === 200 || req.status === 206) {
        return resolve(opts.binary ? new Uint8Array(req.response) : req.responseText);
      }
      var e = /** @type {any} */ (new Error('HTTP ' + req.status + ' for ' + url.split('?')[0]));
      e.status = req.status;
      reject(e);
    };
    req.onerror = req.ontimeout = function () {
      var e = /** @type {any} */ (new Error('network error'));
      e.status = 0;
      reject(e);
    };
    req.send();
  });
}

var io = {
  fetchRange: function (url, start, end) {
    return xhr(url, { binary: true, range: [start, end] }).then(function (b) {
      // A server that ignores Range returns the whole file (200); slice it.
      return b.length > end - start ? b.subarray(start, end) : b;
    });
  },
  fetchText: function (url) { return xhr(url, {}); }
};

var companion = new Companion({
  storage: localStorage,
  sendAppMessage: function (dict, ack, nack) { Pebble.sendAppMessage(dict, ack, nack); },
  later: function (fn, ms) { setTimeout(fn, ms); },
  openURL: function (url) { Pebble.openURL(url); },
  io: io,
  now: function () { return new Date(); },
  getLocation: function (ok, fail) {
    navigator.geolocation.getCurrentPosition(function (pos) {
      ok(pos.coords.latitude, pos.coords.longitude);
    }, function (err) {
      fail(err && err.message ? err.message : 'unavailable');
    }, { timeout: 15000, maximumAge: 60000, enableHighAccuracy: false });
  },
  randomId: function () { return 1 + Math.floor(Math.random() * 0x7ffffffe); },
  log: function (msg) { console.log('facet-atlas: ' + msg); }
});

Pebble.addEventListener('ready', function () {
  // The watchapp starts the conversation with HELLO; nothing to do here.
});
Pebble.addEventListener('appmessage', function (e) { companion.onAppMessage(e.payload || {}); });
Pebble.addEventListener('showConfiguration', function () { companion.showConfiguration(); });
Pebble.addEventListener('webviewclosed', function (e) { companion.onWebviewClosed(e && e.response); });
