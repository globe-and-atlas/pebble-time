var Clay = require('@rebble/clay');
var config = require('./config.json');
// Only the Hemisphere edition's generated settings define location controls.
function hasSetting(items, key) {
  return items.some(function(item) { return item.messageKey === key || (item.items && hasSetting(item.items, key)); });
}
var meridian = hasSetting(config, 'LocationPreset');
// Migrate only the phone UI schema. Native legacy palette indices stay valid.
try {
  var savedColors=JSON.parse(localStorage.getItem('clay-settings') || '{}');
  var oldColors=[null,0x000000,0xffaa00,0xaa0000,0x0000aa,0x005500,0x5500aa,0x555555,0x005555];
  ['HandColor','MinuteColor'].forEach(function(key) {
    var old=Number(savedColors[key]);
    if(savedColors[key+'RGB']===undefined && old>=1 && old<=8 && old%1===0) savedColors[key+'RGB']=oldColors[old];
    // Old fields must not accompany future saves and reset native RGB colors.
    delete savedColors[key];
  });
  if(localStorage.getItem('clay-settings')) localStorage.setItem('clay-settings',JSON.stringify(savedColors));
} catch (_) { /* Retain existing native settings if phone storage is unavailable. */ }
var clay = new Clay(config, null, {autoHandleEvents: !meridian});
if (meridian) {
  var keys = require('message_keys');
  var generation = 0;
  function stored(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
  }
  function send(view, extra) {
    var payload = extra || {};
    payload[keys.Latitude] = view.lat;
    payload[keys.Longitude] = view.lon;
    payload[keys.LocationValid] = view.valid;
    Pebble.sendAppMessage(payload, function() {}, function() { console.log('Settings delivery failed; reopen settings and Save to retry.'); });
  }
  function coordinate(value) {
    return value === null || value === undefined || String(value).trim() === '' ? NaN : Number(value);
  }
  function manual(settings) {
    var cities = [[0,0],[51.5,-0.1],[41.9,-87.6],[35.7,139.7],[-33.9,151.2]];
    var preset = Number(settings.LocationPreset || 0);
    var point = cities[preset];
    // Number('') is 0, so blank custom fields must be rejected explicitly.
    if (preset === 5) point = [coordinate(settings.ManualLatitude),coordinate(settings.ManualLongitude)];
    if (!point || !isFinite(point[0]) || !isFinite(point[1]) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) return null;
    return {lat:Math.round(point[0]*10)*10,lon:Math.round(point[1]*10)*10,valid:preset ? 1 : 0};
  }
  function refresh(extra) {
    // A fresh/reset phone sandbox must not erase the watch's remembered view.
    if (!extra && !localStorage.getItem('clay-settings')) return;
    var ticket = ++generation;
    var settings = stored('clay-settings', {});
    var previous = stored('meridian-view', {lat:0,lon:0,valid:0});
    var automatic = settings.UsePhoneLocation === true || settings.UsePhoneLocation === 1;
    var view = automatic && previous.valid ? previous : manual(settings) || previous;
    localStorage.setItem('meridian-view',JSON.stringify(view));
    send(view, extra);
    if (!automatic) return;
    navigator.geolocation.getCurrentPosition(function(position) {
      if (ticket !== generation) return;
      var lat = position.coords.latitude, lon = position.coords.longitude;
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return;
      var next = {lat:Math.round(lat*10)*10,lon:Math.round(lon*10)*10,valid:1};
      localStorage.setItem('meridian-view',JSON.stringify(next));
      send(next);
    }, function() { console.log('Location unavailable; retained saved globe view.'); }, {enableHighAccuracy:false,maximumAge:3600000,timeout:15000});
  }
  Pebble.addEventListener('ready',function() { refresh(); });
  Pebble.addEventListener('showConfiguration',function() { Pebble.openURL(clay.generateUrl()); });
  Pebble.addEventListener('webviewclosed',function(event) {
    if (!event || !event.response || event.response==='CANCELLED') return;
    try {
      var payload = clay.getSettings(event.response);
      ['UsePhoneLocation','LocationPreset','ManualLatitude','ManualLongitude'].forEach(function(key) { delete payload[keys[key]]; });
      refresh(payload);
    } catch (_) { console.log('Invalid settings response; previous watch settings retained.'); }
  });
  setInterval(function() { refresh(); },3600000);
}
