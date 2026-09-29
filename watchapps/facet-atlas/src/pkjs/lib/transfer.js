'use strict';
// Phone-side tile sender. One AppMessage in flight at a time; each message
// waits for the transport ACK before the next goes out. Transport failures
// retry the same message; watch NACKs resume from the offset the watch
// asks for (or restart), a bounded number of times.

var protocol = require('./protocol');
var tileLib = require('./tile');
var CMD = protocol.CMD;

var DEFAULT_CHUNK = 1984;

// io = { send(dict, onAck, onNack), later(fn, ms) }
function Sender(io, opts) {
  opts = opts || {};
  this.io = io;
  this.chunk = Math.max(64, Math.min(opts.chunk || DEFAULT_CHUNK, DEFAULT_CHUNK));
  this.maxRetries = opts.maxRetries === undefined ? 3 : opts.maxRetries;
  this.maxResumes = opts.maxResumes === undefined ? 3 : opts.maxResumes;
  this.state = 'idle';
  this.job = null;
}

// Returns the job; job.onProgress(sent,total) and job.onDone(err) are
// optional callbacks set by the caller before messages start flowing.
Sender.prototype.send = function (bytes, siteId, index, count, cb) {
  if (this.job) this.job.cancelled = true;
  var job = {
    bytes: bytes, siteId: siteId >>> 0, index: index, count: count,
    crc: tileLib.crc32(bytes), offset: 0, phase: 'begin', retries: 0, resumes: 0, gen: 0,
    cancelled: false, cb: cb || {}
  };
  this.job = job;
  this.state = 'sending';
  this.next(job);
  return job;
};

Sender.prototype.message = function (job) {
  if (job.phase === 'begin') {
    return { cmd: CMD.BEGIN, site: job.siteId, total: job.bytes.length, crc: job.crc | 0, index: job.index, count: job.count };
  }
  if (job.phase === 'chunk') {
    var end = Math.min(job.offset + this.chunk, job.bytes.length);
    return { cmd: CMD.CHUNK, offset: job.offset, data: Array.prototype.slice.call(job.bytes.subarray(job.offset, end)) };
  }
  return { cmd: CMD.END, site: job.siteId };
};

Sender.prototype.next = function (job) {
  var self = this;
  if (job.cancelled || job.phase === 'await_done') return;
  var msg = self.message(job), gen = job.gen;
  function stale() { return job.cancelled || job.gen !== gen; }
  self.io.send(msg, function () {
    if (stale()) return;
    job.retries = 0;
    if (job.phase === 'begin') {
      job.phase = 'chunk';
    } else if (job.phase === 'chunk') {
      job.offset += msg.data.length;
      if (job.cb.onProgress) job.cb.onProgress(job.offset, job.bytes.length);
      if (job.offset >= job.bytes.length) job.phase = 'end';
    } else {
      job.phase = 'await_done';
      self.state = 'await_done';
      return;
    }
    self.next(job);
  }, function () {
    if (stale()) return;
    if (++job.retries > self.maxRetries) return self.finish(job, new Error('Watch did not acknowledge (Bluetooth)'));
    self.io.later(function () { if (!stale()) self.next(job); }, 250 * job.retries);
  });
};

// Watch said NACK {offset, status}: resume at offset for an ordering
// problem, restart for anything else (checksum, length).
Sender.prototype.onWatchNack = function (offset, status) {
  var job = this.job;
  if (!job || job.cancelled || this.state === 'idle') return;
  if (++job.resumes > this.maxResumes) return this.finish(job, new Error('Watch rejected the tile (' + status + ')'));
  if (status === protocol.FA_E_OFFSET && offset >= 0 && offset <= job.offset && offset < job.bytes.length) {
    job.offset = offset;
    job.phase = 'chunk';
  } else {
    job.offset = 0;
    job.phase = 'begin';
  }
  job.retries = 0;
  this.state = 'sending';
  var self = this;
  // A new generation makes any in-flight ACK for the old position a no-op.
  var gen = ++job.gen;
  this.io.later(function () { if (job.gen === gen) self.next(job); }, 100);
};

Sender.prototype.onWatchDone = function (siteId, status) {
  var job = this.job;
  if (!job || job.cancelled || (siteId >>> 0) !== job.siteId) return;
  if (status === 0) return this.finish(job, null);
  this.onWatchNack(0, status);
};

Sender.prototype.finish = function (job, err) {
  if (this.job !== job) return;
  this.job = null;
  this.state = 'idle';
  job.cancelled = true;
  if (job.cb.onDone) job.cb.onDone(err);
};

module.exports = { Sender: Sender, DEFAULT_CHUNK: DEFAULT_CHUNK };
