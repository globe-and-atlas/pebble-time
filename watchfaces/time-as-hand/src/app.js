const $ = id => document.getElementById(id);
let total = 210, live = false, timer = null, edition = Number($('edition').value);
const dateFields = ['weekday', 'day', 'month', 'year'];
const styleIds = ['timeFont','handColor','minuteColor','handWidth','minuteWidth'];
function fillOptions(id, options) {
  options.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; $(id).appendChild(option); });
}
WatchStyles.fonts.forEach(font => {
  let group = Array.from($('timeFont').children).find(g => g.label === font.group);
  if (!group) { group = document.createElement('optgroup'); group.label = font.group; $('timeFont').appendChild(group); }
  const option = document.createElement('option'); option.value = font.id; option.textContent = font.name; group.appendChild(option);
});
const legacyColors=['#ffffff','#000000','#ffaa00','#aa0000','#0000aa','#005500','#5500aa','#555555','#005555','#aaaaaa'];
function colorHex(value,id) {
  if(value===-1) value=id==='handColor' ? (edition ? 1 : 2) : (edition===3 ? 1 : edition===4 ? 46 : 2);
  if(value<10) return legacyColors[value];
  const n=value-10;
  return '#'+[n>>4,(n>>2)&3,n&3].map(v=>(v*85).toString(16).padStart(2,'0')).join('');
}
function pickColor(id) {
  const n=parseInt($(id).value.slice(1),16);
  const levels=[n>>16,(n>>8)&255,n&255].map(v=>Math.round(v/85));
  const value=10+levels[0]*16+levels[1]*4+levels[2];
  $(id).dataset.colorId=String(value);$(id).value=colorHex(value,id);
}
['handColor','minuteColor'].forEach(id=>$(id).addEventListener('change',()=>pickColor(id)));
fillOptions('handWidth', WatchStyles.widths); fillOptions('minuteWidth', WatchStyles.widths);
function styleSettings() { return styleIds.map(id => Number($(id).type==='color' ? $(id).dataset.colorId : $(id).value)); }
function restoreStyle() {
  let s = [0,-1,-1,0,0];
  try {
    const saved = JSON.parse(localStorage.getItem(`time-as-hand.style.${edition}`));
    if (Array.isArray(saved) && saved.length === 5 && saved.every((v,i) => (i===1 || i===2) ? Number.isInteger(v) && (v===-1 || (v>=1 && v<=73)) : Array.from($(styleIds[i]).options).some(o => String(v) === o.value))) s = saved;
  } catch (_) { /* Defaults work without browser storage. */ }
  styleIds.forEach((id,i) => {
    if($(id).type==='color') {$(id).dataset.colorId=String(s[i]);$(id).value=colorHex(s[i],id);}
    else $(id).value=String(s[i]);
  });
  $('minuteStyles').hidden = !edition;
  $('handColorLabel').textContent = edition ? 'Hour hand color' : 'Hand color';
  $('handWidthLabel').textContent = edition ? 'Hour hand width' : 'Hand width';
  updateStyleSummary();
}
function updateStyleSummary() {
  const font = WatchStyles.fonts[Number($('timeFont').value)];
  $('styleSummary').textContent = `${font.group} / ${font.name}. Numerals stay black for contrast.`;
}
function localDate(d = new Date()) {
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
$('sampleDate').value = localDate();
function calendarSettings() {
  return { mask: dateFields.reduce((mask, id, i) => mask | ($(id).checked ? 1 << i : 0), 0), position: Number($('datePosition').value) };
}
function imageURL(h, m) {
  const s = calendarSettings();
  const [font,color,minute_color,width,minute_width] = styleSettings();
  const instant = solarInstant(h,m);
  return `/face.png?h=${h}&m=${m}&edition=${edition}&mask=${s.mask}&position=${s.position}&date=${$('sampleDate').value || localDate()}&font=${font}&color=${color}&minute_color=${minute_color}&width=${width}&minute_width=${minute_width}&utc=${Math.floor(instant.getTime()/1000)}&lat=${globe.lat}&lon=${globe.lon}&marker=${globe.valid}`;
}
function calendarLabel() {
  const d = new Date(`${$('sampleDate').value || localDate()}T12:00:00`), s = calendarSettings();
  const parts = [['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()], String(d.getDate()).padStart(2,'0'), ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()], String(d.getFullYear()).padStart(4,'0')];
  return parts.filter((p, i) => s.mask & (1 << i)).join(' ');
}
function updateCalendar() {
  const text = calendarLabel();
  $('dateSummary').textContent = text ? `${text} · ${$('datePosition').value === '0' ? 'Top' : 'Bottom'}` : 'Date hidden.';
  document.querySelectorAll('[data-time]').forEach(b => {
    b.querySelector('img').src = imageURL(Math.floor(Number(b.dataset.time) / 60), 0);
  });
}
function restoreCalendar() {
  let s = { mask: 0, position: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(`time-as-hand.calendar.${edition}`));
    if (saved && Number.isInteger(saved.mask) && saved.mask >= 0 && saved.mask <= 15 && [0,1].includes(saved.position)) s = saved;
  } catch (_) { /* Browser storage can be unavailable; keep usable defaults. */ }
  dateFields.forEach((id, i) => { $(id).checked = Boolean(s.mask & (1 << i)); });
  $('datePosition').value = String(s.position);
  updateCalendar();
}
function show(value) {
  total = ((value % 1440) + 1440) % 1440;
  let h = Math.floor(total / 60), m = total % 60;
  if (edition === 2 && !live) {
    const normalized=solarInstant(h,m);
    h=normalized.getHours();m=normalized.getMinutes();total=h*60+m;
  }
  const minutes = String(m).padStart(2, '0');
  const text = String(h).padStart(2, '0') + ':' + minutes;
  $('time').value = text;
  $('timeLabel').textContent = text;
  $('scrub').value = total % 720;
  $('face').src = imageURL(h, m);
  const special = m === 0 && h % 3 === 0;
  $('face').alt = edition ? `Hour ${h % 12 || 12} on the short hand; minute ${minutes} on the long hand` : special ? `Only upright ${h % 12 || 12} at its hour position` : `${h % 12 || 12}:${minutes} along the rotating hour hand`;
  if (calendarLabel()) $('face').alt += `; ${calendarLabel()} at the ${$('datePosition').value === '0' ? 'top' : 'bottom'}`;
  $('description').textContent = edition ? `Hour ${h % 12 || 12} on the short hand. Minute ${minutes} on the long hand.` : special ? 'A single upright numeral. The full time returns next minute.' : 'The full time follows the hour-hand position.';
  $('mode').textContent = live ? 'LOCAL TIME' : timer ? '12-HOUR STUDY' : 'MANUAL STUDY';
  if (edition === 2) $('solarStatus').textContent = `Sunlight: ${solarInstant(h,m).toISOString().slice(0,16).replace('T',' ')} UTC. Display clock: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
}
function setEdition() {
  edition = Number($('edition').value);
  $('globeSettings').hidden = edition !== 2;
  restoreStyle();
  restoreCalendar();
  $('editionIntro').textContent = edition ? 'Two hands carry two numbers. The hour stays close; the minutes travel farther around the dial.' : 'A single digital hand moves once around the dial in twelve hours. At four moments, it becomes a number.';
  $('editionNote').textContent = edition ? 'Both numbers stay upright. Separate inner and outer tracks keep them readable when the hands align. Minutes always use two digits, including 00.' : 'At 3:00, 6:00, 9:00 and 12:00, the hand becomes one upright numeral for a minute. Your optional date line stays visible.';
  $('momentTitle').textContent = edition ? 'Two numbers, four positions.' : 'Four moments of stillness.';
  $('buildDownload').href = edition ? '/two-hands.pbw' : '/watchface.pbw';
  $('buildDownload').download = edition ? 'time-as-hand-two-hands.pbw' : 'time-as-hand-original.pbw';
  $('buildDownload').textContent = edition ? 'Download Two Hands for Pebble ↗' : 'Download Original for Pebble ↗';
  if (edition === 2) {
    $('editionIntro').textContent = 'Local time in your hands. Daylight moving across the world beneath them.';
    $('editionNote').textContent = 'A north-up globe centered on your chosen location. Gray land, a dotted night hemisphere, and two upright numbers. Sunlight is calculated from UTC and the season, even offline.';
    $('buildDownload').href = '/meridian.pbw';
    $('buildDownload').download = 'meridian-hemisphere.pbw';
    $('buildDownload').textContent = 'Download Meridian for Pebble ↗';
  }
  if(edition===3 || edition===4) {
    const name=edition===3 ? '4 Points' : 'Clear',file=edition===3 ? 'four-points' : 'clear';
    $('editionIntro').textContent=edition===3 ? 'Four quiet points. Two fine hands. The time stays upright.' : 'A stronger hour hand. A warm minute hand. Time made clear.';
    $('editionNote').textContent=edition===3 ? 'Four black cardinal marks orient the dial. Fine black hands keep the face spare.' : 'Four cardinal marks frame a heavy black hour hand and a lighter burnt-orange minute hand. Customize either hand below.';
    $('buildDownload').href=`/${file}.pbw`;$('buildDownload').download=`${file}.pbw`;
    $('buildDownload').textContent=`Download ${name} for Pebble ↗`;
  }
  document.querySelectorAll('[data-time]').forEach(button => {
    const t = Number(button.dataset.time), h = Math.floor(t / 60), img = button.querySelector('img');
    img.src = imageURL(h, 0);
    img.alt = edition ? `Hour ${h || 12} and minute 00 on separate hands` : `Upright ${h || 12} at its hour position`;
  });
  show(total);
}
function stop() { clearInterval(timer); timer = null; live = false; $('play').textContent = 'Play 12-hour study'; }
$('edition').addEventListener('change', setEdition);
styleIds.forEach(id => $(id).addEventListener('change', () => {
  try { localStorage.setItem(`time-as-hand.style.${edition}`, JSON.stringify(styleSettings())); } catch (_) { /* Use selected values for this session. */ }
  updateStyleSummary(); updateCalendar(); show(total);
}));
dateFields.concat('datePosition').forEach(id => $(id).addEventListener('change', () => {
  try { localStorage.setItem(`time-as-hand.calendar.${edition}`, JSON.stringify(calendarSettings())); } catch (_) { /* Preview remains usable without persistence. */ }
  updateCalendar(); show(total);
}));
$('sampleDate').addEventListener('change', () => {
  if (!$('sampleDate').value || !$('sampleDate').checkValidity()) return;
  stop(); updateCalendar(); show(total);
});
$('time').addEventListener('input', e => {
  if (!/^\d{2}:\d{2}$/.test(e.target.value)) return;
  stop(); const [h, m] = e.target.value.split(':').map(Number); show(h * 60 + m);
});
$('scrub').addEventListener('input', e => { stop(); show(Number(e.target.value)); });
document.querySelectorAll('[data-time]').forEach(b => b.addEventListener('click', () => { stop(); show(Number(b.dataset.time)); }));
$('play').addEventListener('click', () => {
  if (timer && !live) { stop(); show(total); return; }
  stop(); timer = setInterval(() => show(total + 1), 100); $('play').textContent = 'Pause study'; show(total);
});
$('live').addEventListener('click', () => {
  stop(); live = true;
  const update = () => { const d = new Date(); const date = localDate(d); if ($('sampleDate').value !== date) { $('sampleDate').value = date; updateCalendar(); } show(d.getHours() * 60 + d.getMinutes()); };
  timer = setInterval(update, 1000); update();
});
$('face').addEventListener('error', () => { $('description').textContent = 'Preview unavailable. Restart execution/preview.py.'; });
let globe = {lat:0,lon:0,valid:0,preset:0};
let locationRequest=0;
try {
  const saved = JSON.parse(localStorage.getItem('time-as-hand.globe.2'));
  if (saved && Number.isFinite(saved.lat) && Math.abs(saved.lat)<=90 && Number.isFinite(saved.lon) && Math.abs(saved.lon)<=180 && [0,1].includes(saved.valid)) globe=saved;
} catch (_) { /* A world view needs no permission or stored location. */ }
function solarInstant(h,m) {
  if (live && h*60+m===total) return new Date();
  const d = new Date(`${$('sampleDate').value || localDate()}T00:00:00`);
  d.setHours(h,m,0,0);
  return d;
}
function saveGlobe(message) {
  $('latitude').value=globe.lat; $('longitude').value=globe.lon;
  $('locationPreset').value=String(globe.preset);
  $('locationStatus').textContent=message || (globe.valid ? 'Chosen center saved in this browser. Coordinates rounded to 0.1°.' : 'World view. Location is optional.');
  try {localStorage.setItem('time-as-hand.globe.2',JSON.stringify(globe));} catch (_) {}
  updateCalendar();show(total);
}
$('locationPreset').addEventListener('change', () => {
  locationRequest++;
  const preset=Number($('locationPreset').value), cities=[[0,0],[51.5,-0.1],[41.9,-87.6],[35.7,139.7],[-33.9,151.2]];
  const point=cities[preset] || [globe.lat,globe.lon];
  globe={lat:point[0],lon:point[1],valid:preset ? 1 : 0,preset};saveGlobe();
});
['latitude','longitude'].forEach(id => $(id).addEventListener('change', () => {
  locationRequest++;
  if (!$('latitude').value || !$('longitude').value || !$('latitude').checkValidity() || !$('longitude').checkValidity()) { $('locationStatus').textContent='Enter latitude −90 to 90 and longitude −180 to 180.';return; }
  globe={lat:Math.round(Number($('latitude').value)*10)/10,lon:Math.round(Number($('longitude').value)*10)/10,valid:1,preset:5};saveGlobe();
}));
$('locate').addEventListener('click', () => {
  const request=++locationRequest;
  if (!navigator.geolocation) { $('locationStatus').textContent='Location unavailable. Choose a city or coordinates.';return; }
  $('locationStatus').textContent='Waiting for location permission…';
  navigator.geolocation.getCurrentPosition(p => {
    if(request!==locationRequest) return;
    globe={lat:Math.round(p.coords.latitude*10)/10,lon:Math.round(p.coords.longitude*10)/10,valid:1,preset:5};saveGlobe('Approximate location saved. It stays on this device.');
  }, () => { if(request===locationRequest) $('locationStatus').textContent='Location unavailable or declined. Your saved view is unchanged.'; }, {enableHighAccuracy:false,timeout:15000,maximumAge:3600000});
});
setEdition();saveGlobe();
