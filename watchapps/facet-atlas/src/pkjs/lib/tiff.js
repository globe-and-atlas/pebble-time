'use strict';
// Minimal Cloud-Optimized GeoTIFF reader: reads IFDs and only the internal
// tiles a caller needs, via HTTP range requests. Supports what the two
// chosen sources use: tiled, DEFLATE (8/32946) or uncompressed, predictor
// 1/2/3, chunky planar layout, uint8/uint16/int16/float32 samples.

var zlib = require('./inflate');

var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
var TAG = {
  NewSubfileType: 254, ImageWidth: 256, ImageLength: 257, BitsPerSample: 258,
  Compression: 259, SamplesPerPixel: 277, PlanarConfiguration: 284,
  Predictor: 317, TileWidth: 322, TileLength: 323, TileOffsets: 324,
  TileByteCounts: 325, SampleFormat: 339, ModelPixelScale: 33550,
  ModelTiepoint: 33922, GeoKeyDirectory: 34735, GDALNoData: 42113
};

function readerFor(bytes, little) {
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    u8: function (o) { return dv.getUint8(o); },
    u16: function (o) { return dv.getUint16(o, little); },
    u32: function (o) { return dv.getUint32(o, little); },
    f32: function (o) { return dv.getFloat32(o, little); },
    f64: function (o) { return dv.getFloat64(o, little); },
    length: bytes.length
  };
}

// fetchRange(url, start, endExclusive) -> Promise<Uint8Array>
function CogReader(url, fetchRange) {
  this.url = url;
  this.fetchRange = fetchRange;
  this.head = null;
  this.little = true;
  this.images = [];
}

var HEAD_BYTES = 65536;

CogReader.prototype.open = function () {
  var self = this;
  return self.fetchRange(self.url, 0, HEAD_BYTES).then(function (head) {
    self.head = head;
    if (head.length < 8) throw new Error('tiff: file too short');
    var bo = String.fromCharCode(head[0], head[1]);
    if (bo !== 'II' && bo !== 'MM') throw new Error('tiff: bad byte order');
    self.little = bo === 'II';
    var r = readerFor(head, self.little);
    if (r.u16(2) !== 42) throw new Error('tiff: BigTIFF or not TIFF');
    return self.readIfds(r.u32(4));
  });
};

// Ensure bytes [start, end) are present in this.head, fetching more if needed.
CogReader.prototype.headRange = function (start, end) {
  var self = this;
  if (end <= self.head.length) return Promise.resolve();
  return self.fetchRange(self.url, 0, Math.max(end, self.head.length * 2)).then(function (h) {
    if (h.length < end) throw new Error('tiff: header range unavailable');
    self.head = h;
  });
};

CogReader.prototype.readIfds = function (offset) {
  var self = this;
  if (!offset) return Promise.resolve(self);
  if (self.images.length > 16) throw new Error('tiff: too many IFDs');
  return self.headRange(offset, offset + 2).then(function () {
    var n = readerFor(self.head, self.little).u16(offset);
    return self.headRange(offset, offset + 2 + n * 12 + 4);
  }).then(function () {
    var r = readerFor(self.head, self.little);
    var n = r.u16(offset), entries = [], i;
    for (i = 0; i < n; i++) {
      var e = offset + 2 + i * 12;
      entries.push({ tag: r.u16(e), type: r.u16(e + 2), count: r.u32(e + 4), at: e + 8 });
    }
    var next = r.u32(offset + 2 + n * 12);
    var tags = {};
    var chain = Promise.resolve();
    entries.forEach(function (ent) {
      chain = chain.then(function () {
        return self.readValue(ent).then(function (v) { tags[ent.tag] = v; });
      });
    });
    return chain.then(function () {
      self.images.push(self.describe(tags));
      return self.readIfds(next);
    });
  });
};

CogReader.prototype.readValue = function (ent) {
  var self = this;
  var size = TYPE_SIZE[ent.type];
  if (!size) return Promise.resolve(null);
  var total = size * ent.count;
  var r0 = readerFor(self.head, self.little);
  var at = total <= 4 ? ent.at : r0.u32(ent.at);
  return self.headRange(at, at + total).then(function () {
    var r = readerFor(self.head, self.little);
    if (ent.type === 2) {
      var s = '';
      for (var c = 0; c < ent.count; c++) {
        var ch = r.u8(at + c);
        if (ch) s += String.fromCharCode(ch);
      }
      return s;
    }
    var out = [];
    for (var i = 0; i < ent.count; i++) {
      var o = at + i * size;
      switch (ent.type) {
        case 1: case 7: out.push(r.u8(o)); break;
        case 3: out.push(r.u16(o)); break;
        case 4: out.push(r.u32(o)); break;
        case 8: out.push((r.u16(o) << 16) >> 16); break;
        case 9: out.push(r.u32(o) | 0); break;
        case 11: out.push(r.f32(o)); break;
        case 12: out.push(r.f64(o)); break;
        default: out.push(null);
      }
    }
    return out;
  });
};

function first(tags, t, dflt) {
  var v = tags[t];
  return v === undefined || v === null ? dflt : (typeof v === 'string' ? v : v[0]);
}

CogReader.prototype.describe = function (tags) {
  var img = {
    width: first(tags, TAG.ImageWidth, 0),
    height: first(tags, TAG.ImageLength, 0),
    tileWidth: first(tags, TAG.TileWidth, 0),
    tileHeight: first(tags, TAG.TileLength, 0),
    bits: first(tags, TAG.BitsPerSample, 8),
    samples: first(tags, TAG.SamplesPerPixel, 1),
    compression: first(tags, TAG.Compression, 1),
    predictor: first(tags, TAG.Predictor, 1),
    planar: first(tags, TAG.PlanarConfiguration, 1),
    sampleFormat: first(tags, TAG.SampleFormat, 1),
    overview: (first(tags, TAG.NewSubfileType, 0) & 1) === 1,
    tileOffsets: tags[TAG.TileOffsets] || [],
    tileByteCounts: tags[TAG.TileByteCounts] || [],
    noData: tags[TAG.GDALNoData] ? parseFloat(tags[TAG.GDALNoData]) : null,
    pixelScale: tags[TAG.ModelPixelScale] || null,
    tiepoint: tags[TAG.ModelTiepoint] || null,
    geoKeys: tags[TAG.GeoKeyDirectory] || null
  };
  if (!img.tileWidth || !img.tileHeight) throw new Error('tiff: only tiled TIFFs are supported');
  if (img.planar !== 1 && img.samples > 1) throw new Error('tiff: planar separate unsupported');
  if ([1, 8, 32946].indexOf(img.compression) < 0) {
    throw new Error('tiff: unsupported compression ' + img.compression);
  }
  return img;
};

// GeoKey lookup; returns the SHORT value or null.
function geoKey(img, key) {
  var g = img.geoKeys;
  if (!g) return null;
  for (var i = 4; i + 3 < g.length; i += 4) {
    if (g[i] === key && g[i + 1] === 0) return g[i + 3];
  }
  return null;
}

// Affine georeference of the full-resolution image, as the model
// coordinate of pixel (0,0)'s corner and the pixel size.
CogReader.prototype.georef = function () {
  var img = this.images[0];
  if (!img.pixelScale || !img.tiepoint) throw new Error('tiff: missing georeference tags');
  var sx = img.pixelScale[0], sy = img.pixelScale[1];
  var t = img.tiepoint;
  var x0 = t[3] - t[0] * sx, y0 = t[4] + t[1] * sy;
  // GTRasterTypeGeoKey (1025): 2 = PixelIsPoint, tiepoint names a pixel centre.
  if (geoKey(img, 1025) === 2) { x0 -= sx / 2; y0 += sy / 2; }
  return {
    originX: x0, originY: y0, pixelX: sx, pixelY: sy,
    epsg: geoKey(img, 3072) || geoKey(img, 2048),
    width: img.width, height: img.height
  };
};

// Pick the coarsest image whose pixel is no larger than maxPixel (model
// units). Falls back to full resolution.
CogReader.prototype.levelFor = function (maxPixel) {
  var g = this.georef(), best = 0;
  for (var i = 1; i < this.images.length; i++) {
    var f = this.images[0].width / this.images[i].width;
    if (g.pixelX * f <= maxPixel * 1.0001) best = i;
  }
  return best;
};

function bytesPerSample(img) { return img.bits / 8; }

// Undo predictor in place on one decompressed tile.
function unpredict(img, buf) {
  var w = img.tileWidth, h = img.tileHeight, spp = img.samples;
  var bps = bytesPerSample(img);
  var x, y, row;
  if (img.predictor === 2) {
    if (bps === 1) {
      for (y = 0; y < h; y++) {
        row = y * w * spp;
        for (x = spp; x < w * spp; x++) buf[row + x] = (buf[row + x] + buf[row + x - spp]) & 255;
      }
    } else if (bps === 2) {
      var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      var le = true;
      for (y = 0; y < h; y++) {
        row = y * w * spp * 2;
        for (x = spp; x < w * spp; x++) {
          var o = row + x * 2;
          dv.setUint16(o, (dv.getUint16(o, le) + dv.getUint16(o - spp * 2, le)) & 0xffff, le);
        }
      }
    } else {
      throw new Error('tiff: predictor 2 on ' + img.bits + '-bit samples unsupported');
    }
  } else if (img.predictor === 3) {
    // Floating-point predictor: bytes differenced along the row, then stored
    // as byte planes, most significant plane first (libtiff fpAcc).
    var rowBytes = w * spp * bps;
    var tmp = new Uint8Array(rowBytes);
    var n = w * spp;
    for (y = 0; y < h; y++) {
      row = y * rowBytes;
      for (x = 1; x < rowBytes; x++) buf[row + x] = (buf[row + x] + buf[row + x - 1]) & 255;
      tmp.set(buf.subarray(row, row + rowBytes));
      for (var s = 0; s < n; s++) {
        for (var b = 0; b < bps; b++) {
          // Little-endian output: byte b of the sample holds plane (bps-1-b).
          buf[row + s * bps + b] = tmp[(bps - 1 - b) * n + s];
        }
      }
    }
  }
}

// Fetch and decode one internal tile. Returns a typed array of samples,
// row-major, tileWidth*tileHeight*samples long, or null for a sparse tile.
CogReader.prototype.readTile = function (level, tx, ty) {
  var img = this.images[level];
  var across = Math.ceil(img.width / img.tileWidth);
  var idx = ty * across + tx;
  var off = img.tileOffsets[idx], len = img.tileByteCounts[idx];
  if (off === undefined) return Promise.reject(new Error('tiff: tile index out of range'));
  if (!len) return Promise.resolve(null);
  var self = this;
  return self.fetchRange(self.url, off, off + len).then(function (raw) {
    if (raw.length !== len) throw new Error('tiff: short tile read');
    var buf = img.compression === 1 ? raw.slice() : zlib.inflate(raw);
    var expect = img.tileWidth * img.tileHeight * img.samples * bytesPerSample(img);
    if (buf.length < expect) throw new Error('tiff: tile decompressed to ' + buf.length + ' < ' + expect);
    buf = buf.subarray(0, expect);
    unpredict(img, buf);
    if (!self.little && bytesPerSample(img) > 1) throw new Error('tiff: big-endian samples unsupported');
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + expect);
    if (img.sampleFormat === 3 && img.bits === 32) return new Float32Array(ab);
    if (img.bits === 16) return img.sampleFormat === 2 ? new Int16Array(ab) : new Uint16Array(ab);
    if (img.bits === 8) return new Uint8Array(ab);
    throw new Error('tiff: unsupported sample type');
  });
};

// Window reader with a per-reader tile cache. sample(level, px, py, band)
// works after prefetch() has loaded every tile covering the window.
CogReader.prototype.prefetch = function (level, px0, py0, px1, py1) {
  var img = this.images[level];
  var self = this;
  self.cache = self.cache || {};
  var tx0 = Math.max(0, Math.floor(px0 / img.tileWidth));
  var ty0 = Math.max(0, Math.floor(py0 / img.tileHeight));
  var tx1 = Math.min(Math.ceil(img.width / img.tileWidth) - 1, Math.floor(px1 / img.tileWidth));
  var ty1 = Math.min(Math.ceil(img.height / img.tileHeight) - 1, Math.floor(py1 / img.tileHeight));
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 16) return Promise.reject(new Error('tiff: window spans too many tiles'));
  var jobs = [];
  for (var ty = ty0; ty <= ty1; ty++) {
    for (var tx = tx0; tx <= tx1; tx++) {
      (function (key, x, y) {
        if (key in self.cache) return;
        jobs.push(self.readTile(level, x, y).then(function (t) { self.cache[key] = t; }));
      })(level + ':' + tx + ':' + ty, tx, ty);
    }
  }
  return Promise.all(jobs);
};

// Returns the sample, or NaN when outside the image, in a sparse tile, or
// equal to the file's nodata value. With raw=true the nodata comparison is
// left to the caller (for RGB, nodata means all bands equal it).
CogReader.prototype.sample = function (level, px, py, band, raw) {
  var img = this.images[level];
  if (px < 0 || py < 0 || px >= img.width || py >= img.height) return NaN;
  var tx = Math.floor(px / img.tileWidth), ty = Math.floor(py / img.tileHeight);
  var t = this.cache && this.cache[level + ':' + tx + ':' + ty];
  if (t === undefined) throw new Error('tiff: tile not prefetched');
  if (t === null) return NaN;
  var i = ((py - ty * img.tileHeight) * img.tileWidth + (px - tx * img.tileWidth)) * img.samples + (band || 0);
  var v = t[i];
  if (!raw && this.images[0].noData !== null && v === this.images[0].noData) return NaN;
  return v;
};

module.exports = { CogReader: CogReader, unpredict: unpredict, TAG: TAG };
