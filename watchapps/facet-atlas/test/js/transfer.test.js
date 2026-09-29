'use strict';
var test = require('node:test');
var assert = require('node:assert');
var transfer = require('../../src/pkjs/lib/transfer');
var protocol = require('../../src/pkjs/lib/protocol');
var tile = require('../../src/pkjs/lib/tile');
var fx = require('./fixtures');

var CMD = protocol.CMD;

// JS model of the watch reassembler (the C one is tested in test/c). It
// NACKs out-of-order chunks with the offset it expects, as fa_xfer does.
function FakeWatch(opts) {
  opts = opts || {};
  this.log = [];
  this.drop = opts.drop || function () { return false; };
  this.skipChunk = opts.skipChunk || function () { return false; };
  this.corrupt = opts.corrupt || function () { return false; };
  this.accepted = null;
}
FakeWatch.prototype.receive = function (msg, sender) {
  this.log.push(msg.cmd);
  if (msg.cmd === CMD.BEGIN) { this.buf = new Uint8Array(msg.total); this.got = 0; this.site = msg.site; this.crc = msg.crc >>> 0; this.gap = false; return; }
  if (msg.cmd === CMD.CHUNK) {
    if (msg.offset !== this.got) {
      if (this.gap) return;   // one NACK per gap, as fa_xfer_chunk
      this.gap = true;
      var s = this; setImmediate(function () { sender.onWatchNack(s.got, protocol.FA_E_OFFSET); }); return;
    }
    this.gap = false;
    var data = msg.data.slice();
    if (this.corrupt(msg)) data[0] ^= 0xff;
    this.buf.set(data, msg.offset); this.got += data.length; return;
  }
  if (msg.cmd === CMD.END) {
    var ok = this.got === this.buf.length && tile.crc32(this.buf) === this.crc;
    var self = this;
    if (ok) { try { tile.decode(this.buf); self.accepted = this.buf; } catch (e) { ok = false; } }
    setImmediate(function () { sender.onWatchDone(msg.site, ok ? 0 : 5); });
  }
};

function run(watch, bytes, opts) {
  return new Promise(function (resolve) {
    var n = 0, sender;
    var io = {
      send: function (msg, ack, nack) {
        var k = n++;
        setImmediate(function () {
          if (watch.drop(k, msg)) return nack();
          if (watch.skipChunk(k, msg)) return ack();   // ACKed by the radio but lost before the app
          watch.receive(msg, sender);
          ack();
        });
      },
      later: function (fn) { setImmediate(fn); }
    };
    sender = new transfer.Sender(io, opts);
    sender.send(bytes, 77, 0, 1, { onDone: function (err) { resolve(err); } });
  });
}

var bytes = fx.build('XFER', 77, fx.VALLEY.sampler).bytes;

test('complete transfer delivers the exact tile in bounded chunks', async function () {
  var w = new FakeWatch();
  var err = await run(w, bytes);
  assert.strictEqual(err, null);
  assert.deepStrictEqual(Buffer.from(w.accepted), Buffer.from(bytes));
  assert.strictEqual(tile.decode(w.accepted).siteId, 77);
  assert.strictEqual(w.log.filter(function (c) { return c === CMD.CHUNK; }).length, Math.ceil(bytes.length / transfer.DEFAULT_CHUNK));
});

test('transport NACKs are retried', async function () {
  var w = new FakeWatch({ drop: function (k) { return k === 2 || k === 3; } });
  assert.strictEqual(await run(w, bytes), null);
  assert.ok(w.accepted);
});

test('a lost chunk is recovered by resuming from the watch offset', async function () {
  var lost = false;
  var w = new FakeWatch({ skipChunk: function (k, m) { if (m.cmd === CMD.CHUNK && m.offset > 0 && !lost) { lost = true; return true; } return false; } });
  assert.strictEqual(await run(w, bytes), null);
  assert.deepStrictEqual(Buffer.from(w.accepted), Buffer.from(bytes));
});

test('corruption in transit is caught by CRC and resent', async function () {
  var once = false;
  var w = new FakeWatch({ corrupt: function (m) { if (!once && m.offset === 0) { once = true; return true; } return false; } });
  assert.strictEqual(await run(w, bytes), null);
  assert.deepStrictEqual(Buffer.from(w.accepted), Buffer.from(bytes));
});

test('a watch that never acknowledges fails cleanly', async function () {
  var w = new FakeWatch({ drop: function () { return true; } });
  var err = await run(w, bytes);
  assert.match(String(err), /acknowledge/);
  assert.strictEqual(w.accepted, null);
});

test('persistent corruption gives up after bounded resumes', async function () {
  var w = new FakeWatch({ corrupt: function () { return true; } });
  var err = await run(w, bytes, { maxResumes: 2 });
  assert.match(String(err), /rejected/);
  assert.strictEqual(w.accepted, null);
});

test('chunk size honours the watch limit', async function () {
  var sizes = [];
  var w = new FakeWatch();
  var orig = w.receive.bind(w);
  w.receive = function (m, s) { if (m.cmd === CMD.CHUNK) sizes.push(m.data.length); orig(m, s); };
  assert.strictEqual(await run(w, bytes, { chunk: 500 }), null);
  assert.ok(Math.max.apply(null, sizes) <= 500);
});
