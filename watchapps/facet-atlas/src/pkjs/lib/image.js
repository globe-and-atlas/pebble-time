'use strict';
// Reduce a satellite RGB window to the watch's colour model. Pebble Time 2
// shows 64 colours (2 bits per channel, "GColor8"). The tile carries a
// 16-entry palette of GColor8 values and 4-bit pixels. Palette index 0 is
// reserved for "no imagery here" so the watch can draw it as a hatch rather
// than as a colour that could be mistaken for real ground.

var PALETTE_SIZE = 16;
var NODATA_INDEX = 0;

function level(v) { return Math.max(0, Math.min(3, Math.round(v / 85))); }
function gcolor8(r, g, b) { return 0xC0 | (level(r) << 4) | (level(g) << 2) | level(b); }
function gcolorRgb(c) { return [((c >> 4) & 3) * 85, ((c >> 2) & 3) * 85, (c & 3) * 85]; }

// Median cut over the valid pixels; returns up to `k` GColor8 values,
// deterministic for a given input.
function medianCut(rgb, valid, k) {
  var px = [];
  for (var i = 0; i < valid.length; i++) if (valid[i]) px.push(i);
  if (!px.length) return [];
  var boxes = [px];
  function range(box, ch) {
    var lo = 255, hi = 0;
    for (var j = 0; j < box.length; j++) { var v = rgb[box[j] * 3 + ch]; if (v < lo) lo = v; if (v > hi) hi = v; }
    return hi - lo;
  }
  while (boxes.length < k) {
    var bi = -1, bestScore = 0, bestCh = 0;
    for (var b = 0; b < boxes.length; b++) {
      if (boxes[b].length < 2) continue;
      for (var ch = 0; ch < 3; ch++) {
        var score = range(boxes[b], ch) * boxes[b].length;
        if (score > bestScore) { bestScore = score; bi = b; bestCh = ch; }
      }
    }
    if (bi < 0) break;
    var box = boxes[bi].slice().sort(function (p, q) {
      return (rgb[p * 3 + bestCh] - rgb[q * 3 + bestCh]) || (p - q);
    });
    var half = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, half), box.slice(half));
  }
  var out = [];
  boxes.forEach(function (box) {
    var s = [0, 0, 0];
    box.forEach(function (p) { s[0] += rgb[p * 3]; s[1] += rgb[p * 3 + 1]; s[2] += rgb[p * 3 + 2]; });
    var c = gcolor8(s[0] / box.length, s[1] / box.length, s[2] / box.length);
    if (out.indexOf(c) < 0) out.push(c);
  });
  return out;
}

// rgb: Uint8Array w*h*3; valid: Uint8Array w*h (0 = no imagery).
// Returns { palette: [16 GColor8], pixels: Uint8Array w*h of indices }.
function quantize(rgb, valid, w, h) {
  var colors = medianCut(rgb, valid, PALETTE_SIZE - 1);
  var palette = [0xC0].concat(colors);
  while (palette.length < PALETTE_SIZE) palette.push(0xC0);
  var pal = palette.map(gcolorRgb);
  var pixels = new Uint8Array(w * h);
  // Floyd-Steinberg error diffusion to the palette, in serpentine order.
  var err = new Float64Array(w * h * 3);
  var er = [0, 0, 0];
  for (var y = 0; y < h; y++) {
    var ltr = (y & 1) === 0;
    for (var xi = 0; xi < w; xi++) {
      var x = ltr ? xi : w - 1 - xi, i = y * w + x;
      if (!valid[i]) { pixels[i] = NODATA_INDEX; continue; }
      var r = rgb[i * 3] + err[i * 3], g = rgb[i * 3 + 1] + err[i * 3 + 1], b = rgb[i * 3 + 2] + err[i * 3 + 2];
      var best = 1, bestD = Infinity;
      for (var p = 1; p <= colors.length; p++) {
        var d = (r - pal[p][0]) * (r - pal[p][0]) + (g - pal[p][1]) * (g - pal[p][1]) + (b - pal[p][2]) * (b - pal[p][2]);
        if (d < bestD) { bestD = d; best = p; }
      }
      pixels[i] = best;
      er = [r - pal[best][0], g - pal[best][1], b - pal[best][2]];
      var dir = ltr ? 1 : -1;
      spread(x + dir, y, 7 / 16);
      spread(x - dir, y + 1, 3 / 16);
      spread(x, y + 1, 5 / 16);
      spread(x + dir, y + 1, 1 / 16);
    }
  }
  function spread(sx, sy, wgt) {
    if (sx < 0 || sx >= w || sy >= h) return;
    var j = sy * w + sx;
    if (!valid[j]) return;
    err[j * 3] += er[0] * wgt; err[j * 3 + 1] += er[1] * wgt; err[j * 3 + 2] += er[2] * wgt;
  }
  return { palette: palette, pixels: pixels };
}

module.exports = { quantize: quantize, gcolor8: gcolor8, gcolorRgb: gcolorRgb, PALETTE_SIZE: PALETTE_SIZE, NODATA_INDEX: NODATA_INDEX };
