'use strict';
// Phone settings page, opened as a self-contained data: URI (no network,
// no third-party scripts). pkjs embeds the current state; the page returns
// one action to pkjs through the Pebble return URL.
//
// pageMain is serialised with Function.prototype.toString(), so it must not
// reference anything outside its own body (test/js/config.test.js checks).

function pageMain(state) {
  var $ = function (id) { return /** @type {any} */ (document.getElementById(id)); };
  var AOI_LABEL = { 1000: '1 km', 2000: '2 km', 4000: '4 km' };
  var edit = null;          // site being edited, or null
  var pendingAB = null;     // endpoints drawn on the preview
  var tapStep = 0;

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function parseLatLon(text) {
    var m = String(text || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) return null;
    var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat: lat, lon: lon } : null;
  }
  function done(result) {
    result.consent = state.consent;
    var m = location.search.match(/[?&]return_to=([^&]*)/);
    var base = m ? decodeURIComponent(m[1]) : 'pebblejs://close#';
    location.href = base + encodeURIComponent(JSON.stringify(result));
  }
  function fmtDate(unix) { return unix ? new Date(unix * 1000).toISOString().slice(0, 10) : 'UNKNOWN'; }
  function ageDays(unix) { return unix ? Math.floor((state.nowUnix - unix) / 86400) : null; }

  // ---- privacy ----
  function renderConsent() {
    $('consent').style.display = state.consent ? 'none' : 'block';
    $('app').style.display = state.consent ? 'block' : 'none';
  }
  $('accept').onclick = function () { state.consent = true; renderConsent(); render(); };
  $('privacy-again').onclick = function () { state.consent = false; renderConsent(); };

  // ---- sites ----
  function render() {
    var list = $('sites');
    if (!state.sites.length) {
      list.innerHTML = '<p class="muted">No sites yet. Add one below.</p>';
    } else {
      list.innerHTML = state.sites.map(function (s) {
        var age = ageDays(s.preparedUnix);
        var badges = [];
        if (s.status === 'review') badges.push('<span class="b warn">REVIEW</span>');
        if (s.status === 'failed') badges.push('<span class="b bad">FAILED</span>');
        if (s.id === state.currentId) badges.push('<span class="b">ON WATCH</span>');
        if (age !== null && age > state.staleDays) badges.push('<span class="b warn">STALE ' + age + ' d</span>');
        return '<div class="site' + (s.id === state.selectedId ? ' sel' : '') + '">' +
          '<div><b>' + esc(s.name || 'Unnamed') + '</b> ' + badges.join(' ') + '</div>' +
          '<div class="muted">' + s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) + ' &middot; ' + AOI_LABEL[s.aoiM] +
          ' &middot; prepared ' + fmtDate(s.preparedUnix) + '</div>' +
          (s.error ? '<div class="bad">' + esc(s.error) + '</div>' : '') +
          '<div class="row">' +
          '<button data-a="view" data-id="' + s.id + '">Preview</button>' +
          '<button data-a="edit" data-id="' + s.id + '">Edit</button>' +
          '<button data-a="refresh" data-id="' + s.id + '">Refresh</button>' +
          '<button data-a="remove" data-id="' + s.id + '" class="danger">Remove</button>' +
          '</div></div>';
      }).join('');
    }
    renderPreview();
  }
  $('sites').onclick = function (ev) {
    var a = ev.target.getAttribute('data-a'), id = Number(ev.target.getAttribute('data-id'));
    if (!a) return;
    var site = state.sites.filter(function (s) { return s.id === id; })[0];
    if (a === 'view') { state.selectedId = id; pendingAB = null; tapStep = 0; $('export').style.display = 'none'; render(); $('preview').scrollIntoView(); }
    else if (a === 'edit') openForm(site);
    else if (a === 'refresh') done({ action: 'refresh', id: id });
    else if (a === 'remove' && confirm('Remove ' + (site.name || 'this site') + ' and its cached tile from this phone?')) done({ action: 'remove', id: id });
  };

  // ---- preview ----
  function b64(str) {
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function gc(c) { return 'rgb(' + ((c >> 4) & 3) * 85 + ',' + ((c >> 2) & 3) * 85 + ',' + (c & 3) * 85 + ')'; }

  function cur() { return state.previews[state.selectedId] || null; }

  function renderPreview() {
    var p = cur(), box = $('preview');
    if (!p) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    var site = state.sites.filter(function (s) { return s.id === p.siteId; })[0] || {};
    $('pv-title').textContent = (site.name || 'Site') + (site.status === 'review' ? ' - review before sending' : '');
    var cv = $('pv-img'), ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    var S = cv.width / 144;
    if (p.image) {
      var px = b64(p.image.pixels);
      for (var k = 0; k < p.image.w * p.image.h; k++) {
        var idx = (px[k >> 1] >> (k & 1 ? 0 : 4)) & 15;
        ctx.fillStyle = idx ? gc(p.image.palette[idx]) : ((k % 144 + Math.floor(k / 144)) % 4 ? '#000' : '#555');
        ctx.fillRect((k % p.image.w) * S, Math.floor(k / p.image.w) * S, S, S);
      }
    } else {
      ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif';
      ctx.fillText('NO SATELLITE IMAGE', 20, cv.height / 2);
    }
    var side = 144 * p.geo.aoiM / p.geo.imageM * S, off = (cv.width - side) / 2;
    ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(off, off, side, side);
    var ab = pendingAB || { a: p.aPx, b: p.bPx };
    [['A', ab.a], ['B', ab.b]].forEach(function (m) {
      ctx.fillStyle = '#0ff'; ctx.fillRect(m[1][0] * S - 4, m[1][1] * S - 4, 8, 8);
      ctx.font = 'bold 14px sans-serif'; ctx.fillText(m[0], m[1][0] * S + 6, m[1][1] * S - 6);
    });
    ctx.strokeStyle = '#0ff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ab.a[0] * S, ab.a[1] * S); ctx.lineTo(ab.b[0] * S, ab.b[1] * S); ctx.stroke();
    $('pv-ab').style.display = pendingAB ? 'block' : 'none';

    // Profile chart.
    var pc = $('pv-prof'), g = pc.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, pc.width, pc.height);
    if (p.profile) {
      var z = p.profile.z.filter(function (v) { return v !== null; });
      var lo = Math.min.apply(null, z), hi = Math.max.apply(null, z);
      if (hi - lo < 10) { lo -= 5; hi += 5; }
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath();
      var pen = false;
      p.profile.z.forEach(function (v, i) {
        if (v === null) { pen = false; return; }
        var x = 30 + (pc.width - 40) * i / (p.profile.z.length - 1), y = pc.height - 20 - (pc.height - 30) * (v - lo) / (hi - lo);
        if (pen) g.lineTo(x, y); else g.moveTo(x, y);
        pen = true;
      });
      g.stroke();
      g.fillStyle = '#ccc'; g.font = '11px sans-serif';
      g.fillText(hi + ' m', 2, 12); g.fillText(lo + ' m', 2, pc.height - 22);
      g.fillText('A', 30, pc.height - 4); g.fillText('B  ' + (p.profile.lengthM / 1000).toFixed(2) + ' km', pc.width - 70, pc.height - 4);
    } else {
      g.fillStyle = '#fff'; g.fillText('NO ELEVATION DATA', 20, 40);
    }

    var m = p.meta, warn = [];
    if (!(p.flags & 1)) warn.push('No satellite image: ' + (m[10] || 'unavailable'));
    if (!(p.flags & 2)) warn.push('No terrain mesh: ' + (m[11] || m[7] || 'elevation unavailable'));
    if (p.flags & 16) warn.push('Imagery does not cover the whole map (hatched areas).');
    if (p.flags & 32) warn.push('Imagery is cloudy over the area.');
    var age = ageDays(p.geo.preparedUnix);
    if (age !== null && age > state.staleDays) warn.push('Prepared ' + age + ' days ago: refresh to check for newer imagery.');
    function row(k, v) { return '<tr><th>' + k + '</th><td>' + esc(v || 'UNKNOWN') + '</td></tr>'; }
    $('pv-meta').innerHTML =
      (warn.length ? '<div class="warnbox">' + warn.map(esc).join('<br>') + '</div>' : '') +
      '<h3>Satellite imagery (context only)</h3><table>' + row('Source', m[8]) + row('Acquired', m[9]) + row('Note', m[10]) + '</table>' +
      '<h3>Elevation (terrain source)</h3><table>' + row('Source', m[2]) + row('Acquired', m[3]) + row('Horizontal', m[4]) +
      row('Vertical', m[5]) + row('Resolution', m[6]) + row('Note', m[11]) + row('Breaklines', m[12]) + '</table>' +
      '<h3>Derived on this phone</h3><table>' + row('Mesh', m[7]) + row('Slope', 'Horn 3x3 on 65x65 grid') +
      row('Prepared', fmtDate(p.geo.preparedUnix)) + row('Tile size', p.bytes + ' bytes') + '</table>' +
      '<p class="muted">Imagery and elevation come from different sensors and dates; the mesh is a simplified model of the elevation grid, not surveyed points.</p>';
    $('pv-exag').value = String(p.geo.exagX10);
  }

  $('pv-img').onclick = function (ev) {
    var p = cur();
    if (!p) return;
    var r = ev.target.getBoundingClientRect(), S = r.width / 144;
    var pt = [(ev.clientX - r.left) / S, (ev.clientY - r.top) / S];
    if (!pendingAB || tapStep === 0) { pendingAB = { a: pt, b: pendingAB ? pendingAB.b : p.bPx }; tapStep = 1; }
    else { pendingAB.b = pt; tapStep = 0; }
    renderPreview();
  };
  $('pv-send').onclick = function () { done({ action: 'send', id: cur().siteId, exagX10: Number($('pv-exag').value) }); };
  $('pv-exag').onchange = function () { done({ action: 'exag', id: cur().siteId, exagX10: Number($('pv-exag').value) }); };
  $('pv-ab-apply').onclick = function () {
    var p = cur();
    function toLL(pt) {
      var east = (pt[0] / 144 - 0.5) * p.geo.imageM, north = (0.5 - pt[1] / 144) * p.geo.imageM;
      var a = 6378137, e2 = 0.00669437999014, s = Math.sin(p.geo.lat * Math.PI / 180), w = Math.sqrt(1 - e2 * s * s);
      var mR = a * (1 - e2) / (w * w * w), nR = a / w;
      return { lat: p.geo.lat + north / mR * 180 / Math.PI, lon: p.geo.lon + east / (nR * Math.cos(p.geo.lat * Math.PI / 180)) * 180 / Math.PI };
    }
    done({ action: 'endpoints', id: p.siteId, profile: { a: toLL(pendingAB.a), b: toLL(pendingAB.b) } });
  };
  $('pv-ab-reset').onclick = function () { pendingAB = null; tapStep = 0; renderPreview(); };
  $('pv-export').onclick = function () {
    $('export').style.display = 'block';
    var p = cur();
    $('export-text').value = JSON.stringify({ format: 'Facet Atlas tile FAT1', provenance: p.meta, geo: p.geo, tileBase64: p.tile }, null, 1);
  };

  // ---- form ----
  function openForm(site) {
    edit = site || null;
    $('form').style.display = 'block';
    $('f-title').textContent = site ? 'Edit site' : 'New site';
    $('f-name').value = site ? site.name : '';
    $('f-coords').value = site ? site.lat + ', ' + site.lon : (state.lastFix ? state.lastFix.lat.toFixed(5) + ', ' + state.lastFix.lon.toFixed(5) : '');
    $('f-aoi').value = String(site ? site.aoiM : 2000);
    $('f-exag').value = String(site ? site.exagX10 : 10);
    var pre = site && site.profile && site.profile.preset;
    $('f-preset').value = site && !pre ? 'custom' : (pre || 'W-E');
    $('f-a').value = site && site.profile && site.profile.a ? site.profile.a.lat + ', ' + site.profile.a.lon : '';
    $('f-b').value = site && site.profile && site.profile.b ? site.profile.b.lat + ', ' + site.profile.b.lon : '';
    toggleCustom();
    $('f-error').textContent = '';
    $('form').scrollIntoView();
  }
  function toggleCustom() { $('f-custom').style.display = $('f-preset').value === 'custom' ? 'block' : 'none'; }
  $('f-preset').onchange = toggleCustom;
  $('add').onclick = function () { openForm(null); };
  $('f-cancel').onclick = function () { $('form').style.display = 'none'; };
  $('f-locate').onclick = function () {
    $('f-error').textContent = 'Asking this phone for its location...';
    if (!navigator.geolocation) return done({ action: 'locate' });
    navigator.geolocation.getCurrentPosition(function (pos) {
      $('f-coords').value = pos.coords.latitude.toFixed(5) + ', ' + pos.coords.longitude.toFixed(5);
      $('f-error').textContent = 'Location filled in (accuracy about ' + Math.round(pos.coords.accuracy) + ' m). It stays on this phone.';
    }, function () {
      // The settings web view may not be allowed to use location; ask pkjs instead.
      done({ action: 'locate' });
    }, { timeout: 10000, maximumAge: 60000 });
  };
  $('f-save').onclick = function () {
    var ll = parseLatLon($('f-coords').value);
    if (!ll) { $('f-error').textContent = 'Enter coordinates as "latitude, longitude", e.g. 37.7459, -119.5332.'; return; }
    if (Math.abs(ll.lat) > 84) { $('f-error').textContent = 'Sentinel-2 imagery is not available beyond 84 degrees latitude.'; return; }
    var profile;
    if ($('f-preset').value === 'custom') {
      var a = parseLatLon($('f-a').value), b = parseLatLon($('f-b').value);
      if (!a || !b) { $('f-error').textContent = 'Enter valid coordinates for both A and B.'; return; }
      profile = { a: a, b: b };
    } else {
      profile = { preset: $('f-preset').value };
    }
    done({
      action: 'prepare',
      site: {
        id: edit ? edit.id : 0, name: $('f-name').value.slice(0, 24), lat: ll.lat, lon: ll.lon,
        aoiM: Number($('f-aoi').value), exagX10: Number($('f-exag').value), profile: profile
      }
    });
  };

  if (state.message) { $('msg').textContent = state.message; $('msg').style.display = 'block'; }
  renderConsent();
  render();
  if (state.openForm) openForm(null);
}

var CSS = [
  'body{font:16px/1.4 -apple-system,Roboto,sans-serif;margin:0;background:#111;color:#eee}',
  'main{padding:12px 16px;max-width:560px;margin:auto}h1{font-size:22px;margin:4px 0 12px}',
  'h2{font-size:17px;margin:20px 0 8px;border-bottom:1px solid #444}h3{font-size:14px;margin:12px 0 4px;color:#9cf}',
  'button,select,input{font:inherit;border-radius:6px;border:1px solid #666;background:#222;color:#fff;padding:8px 10px;margin:3px 0}',
  'button.primary{background:#0a5;border-color:#0a5}button.danger{border-color:#a33;color:#f99}',
  'input,select{width:100%;box-sizing:border-box}label{display:block;margin-top:8px;font-size:14px;color:#bbb}',
  '.row{display:flex;flex-wrap:wrap;gap:6px}.site{border:1px solid #333;border-radius:8px;padding:8px;margin:8px 0}',
  '.site.sel{border-color:#0a5}.muted{color:#999;font-size:13px}.b{font-size:11px;background:#333;border-radius:4px;padding:1px 5px}',
  '.warn{background:#660;color:#ff8}.bad{color:#f88}.b.bad{background:#600}.warnbox{background:#330;border:1px solid #660;padding:8px;border-radius:6px}',
  'canvas{width:100%;image-rendering:pixelated;background:#000;border-radius:6px}table{width:100%;font-size:13px;border-collapse:collapse}',
  'th{text-align:left;color:#999;font-weight:normal;width:34%;vertical-align:top}td{word-break:break-word}',
  '#msg{display:none;background:#123;border:1px solid #369;padding:8px;border-radius:6px}textarea{width:100%;height:160px;background:#000;color:#9f9;font:11px monospace}'
].join('');

var BODY = [
  '<main><h1>Facet Atlas</h1><div id="msg"></div>',
  '<section id="consent"><h2>Before you start: what leaves this phone</h2>',
  '<p>To prepare a site, this phone downloads public data directly from two Amazon S3 buckets (AWS Open Data):</p>',
  '<ul><li><b>copernicus-dem-30m.s3.amazonaws.com</b>: Copernicus DEM elevation. Requests name the 1&deg;&times;1&deg; tile and byte ranges covering your area.</li>',
  '<li><b>sentinel-cogs.s3.us-west-2.amazonaws.com</b>: Sentinel-2 imagery. Requests name the 100&nbsp;km grid square, recent dates and byte ranges.</li></ul>',
  '<p>Your exact coordinates are never sent to anyone, but these requests, like any web request, reveal your IP address and the approximate region of the site to Amazon. No account, key, analytics or other service is used.</p>',
  '<p><b>Stored on this phone:</b> site settings and prepared tiles (Pebble app storage). <b>Stored on the watch:</b> the last site name and view. Location is read only when you tap "Use this phone\'s location".</p>',
  '<button id="accept" class="primary">I understand, continue</button></section>',
  '<section id="app"><h2>Saved sites</h2><div id="sites"></div><button id="add" class="primary">+ Add a site</button>',
  '<section id="preview"><h2 id="pv-title">Preview</h2>',
  '<p class="muted">Satellite map, 1.5&times; the terrain area (yellow). Tap twice to draw new profile endpoints A then B.</p>',
  '<canvas id="pv-img" width="288" height="288"></canvas>',
  '<div id="pv-ab" style="display:none"><button id="pv-ab-apply" class="primary">Re-prepare with new A&ndash;B</button> <button id="pv-ab-reset">Reset</button></div>',
  '<h3>Profile A&ndash;B</h3><canvas id="pv-prof" width="288" height="110"></canvas>',
  '<label>Vertical exaggeration on the watch<select id="pv-exag"><option value="10">1.0&times; (true scale)</option><option value="15">1.5&times;</option><option value="20">2.0&times;</option><option value="30">3.0&times;</option></select></label>',
  '<div id="pv-meta"></div>',
  '<div class="row"><button id="pv-send" class="primary">Send to watch</button><button id="pv-export">Export tile</button></div>',
  '<div id="export" style="display:none"><p class="muted">Tile (base64) with its provenance. Copy to keep or share it.</p><textarea id="export-text" readonly></textarea></div>',
  '</section>',
  '<section id="form" style="display:none"><h2 id="f-title">New site</h2>',
  '<label>Name (optional)<input id="f-name" maxlength="24" placeholder="e.g. Half Dome"></label>',
  '<label>Centre coordinates (latitude, longitude)<input id="f-coords" inputmode="decimal" placeholder="37.7459, -119.5332"></label>',
  '<button id="f-locate">Use this phone\'s location</button>',
  '<label>Area<select id="f-aoi"><option value="1000">1 km &times; 1 km</option><option value="2000">2 km &times; 2 km</option><option value="4000">4 km &times; 4 km</option></select></label>',
  '<label>Profile A&ndash;B<select id="f-preset"><option value="W-E">West to east through the centre</option><option value="S-N">South to north</option>',
  '<option value="SW-NE">Southwest to northeast</option><option value="NW-SE">Northwest to southeast</option><option value="custom">Custom coordinates</option></select></label>',
  '<div id="f-custom"><label>A (lat, lon)<input id="f-a" inputmode="decimal"></label><label>B (lat, lon)<input id="f-b" inputmode="decimal"></label></div>',
  '<label>Vertical exaggeration<select id="f-exag"><option value="10">1.0&times; (true scale)</option><option value="15">1.5&times;</option><option value="20">2.0&times;</option><option value="30">3.0&times;</option></select></label>',
  '<p id="f-error" class="bad"></p>',
  '<div class="row"><button id="f-save" class="primary">Prepare preview</button><button id="f-cancel">Cancel</button></div>',
  '<p class="muted">Preparing downloads roughly 1&ndash;6 MB. Nothing is sent to the watch until you review the preview and tap "Send to watch".</p></section>',
  '<p class="muted"><a href="#" id="privacy-again" style="color:#9cf">What leaves this phone?</a></p>',
  '<p class="muted">Terrain produced using Copernicus WorldDEM-30 &copy; DLR e.V. 2010-2014 and &copy; Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. ',
  'The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30. ',
  'Imagery contains modified Copernicus Sentinel data (acquisition year shown per site). Facet Atlas is not endorsed by ESA, the European Union or Airbus.</p>',
  '</section></main>'
].join('');

function buildHtml(state) {
  var json = JSON.stringify(state).replace(/</g, '\\u003c');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Facet Atlas</title><style>' + CSS + '</style></head><body>' + BODY +
    '<script>(' + pageMain.toString() + ')(' + json + ');</script></body></html>';
}

module.exports = { buildHtml: buildHtml, pageMain: pageMain };
