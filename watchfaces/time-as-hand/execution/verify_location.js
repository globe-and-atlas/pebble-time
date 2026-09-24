/* Deterministic phone sandbox: no real geolocation or Pebble device access. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const names=JSON.parse(fs.readFileSync(path.join(root,'watchface/package.json'),'utf8')).pebble.messageKeys;
const keys=Object.fromEntries(names.map((name,i)=>[name,i]));
const data={};let callbacks={},requests=[],messages=[];
class Clay {
  constructor() {}
  getSettings(raw) {const settings=JSON.parse(raw);data['clay-settings']=JSON.stringify(settings);return Object.fromEntries(Object.entries(settings).map(([k,v])=>[keys[k],v]));}
  generateUrl() {return 'mock-settings';}
}
// Use the real generated settings so edition detection is tested structurally.
const generated=edition=>JSON.parse(require('node:child_process').execFileSync('python3',['-c',
  'import json,sys;sys.path.insert(0,"execution");from generate_settings import configuration;print(json.dumps(configuration(int(sys.argv[1]))))',String(edition)],{cwd:root,encoding:'utf8'}));
const context={require:name=>name==='@rebble/clay'?Clay:name==='message_keys'?keys:generated(2),
  localStorage:{getItem:key=>data[key],setItem:(key,value)=>{data[key]=value;}},
  Pebble:{addEventListener:(name,fn)=>{callbacks[name]=fn;},sendAppMessage:(payload,ok)=>{messages.push({...payload});ok();},openURL:()=>{}},
  navigator:{geolocation:{getCurrentPosition:(ok,fail)=>{requests.push({ok,fail});}}},console,setInterval:()=>{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'watchface/src/pkjs/index.js'),'utf8'),context);
callbacks.ready();assert.equal(requests.length,0);assert.equal(messages.length,0,'Empty phone storage must preserve watch settings');
function save(s) {callbacks.webviewclosed({response:JSON.stringify(s)});}
save({LocationPreset:2,UsePhoneLocation:false});assert.equal(requests.length,0);assert.equal(messages.at(-1)[keys.Longitude],-8760);
save({LocationPreset:2,UsePhoneLocation:true,TimeFont:3});assert.equal(requests.length,1);assert.equal(messages.at(-1)[keys.TimeFont],3);
requests[0].ok({coords:{latitude:35.6895,longitude:139.6917}});
assert.equal(messages.at(-1)[keys.Latitude],3570);assert.equal(messages.at(-1)[keys.Longitude],13970);
callbacks.ready();requests.at(-1).fail();assert.equal(messages.at(-1)[keys.Longitude],13970);
const pending=requests.at(-1);
save({LocationPreset:1,UsePhoneLocation:false});pending.ok({coords:{latitude:0,longitude:0}});
assert.equal(messages.at(-1)[keys.Latitude],5150,'Late GPS callback cannot override manual mode');
save({LocationPreset:5,ManualLatitude:999,ManualLongitude:0});assert.equal(messages.at(-1)[keys.Latitude],5150);
save({LocationPreset:0,UsePhoneLocation:false});assert.equal(messages.at(-1)[keys.LocationValid],0);
// Blank custom coordinates must retain the previous view, not become 0,0 with a marker.
save({LocationPreset:2,UsePhoneLocation:false});assert.equal(messages.at(-1)[keys.LocationValid],1);
for(const blank of [{ManualLatitude:'',ManualLongitude:''},{ManualLatitude:'10',ManualLongitude:''},{ManualLatitude:' ',ManualLongitude:'5'},{}]) {
  const before=messages.length;save({LocationPreset:5,UsePhoneLocation:false,...blank});
  assert.equal(messages.at(-1)[keys.Latitude],4190,'Blank custom coordinates must retain saved view');assert.equal(messages.length,before+1);
}
save({LocationPreset:5,UsePhoneLocation:false,ManualLatitude:'-12.5',ManualLongitude:'0'});assert.equal(messages.at(-1)[keys.Latitude],-1250);
// Other editions have no location settings, so they must not install Meridian handlers.
for(const edition of [0,1]) {
  const other={};const ctx={...context,require:name=>name==='@rebble/clay'?Clay:name==='message_keys'?keys:generated(edition),Pebble:{...context.Pebble,addEventListener:(n,fn)=>{other[n]=fn;}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'watchface/src/pkjs/index.js'),'utf8'),ctx);
  assert.deepEqual(Object.keys(other),[],'Edition '+edition+' must not register Meridian listeners');
}
// Detection is structural: a nested LocationPreset enables Meridian under any heading; a Meridian heading alone does not.
const register=config=>{const seen={};vm.runInNewContext(fs.readFileSync(path.join(root,'watchface/src/pkjs/index.js'),'utf8'),{...context,require:name=>name==='@rebble/clay'?Clay:name==='message_keys'?keys:config,Pebble:{...context.Pebble,addEventListener:(n,fn)=>{seen[n]=fn;}}});return Object.keys(seen);};
assert.deepEqual(register([{type:'heading',defaultValue:'Renamed'},{type:'section',items:[{type:'section',items:[{type:'select',messageKey:'LocationPreset'}]}]}]).sort(),['ready','showConfiguration','webviewclosed']);
assert.deepEqual(register([{type:'heading',defaultValue:'G&A Meridian: Hemisphere'}]),[]);
console.log('PASS: opt-in, coarse coordinates, saved fallback, manual switch, stale callback, invalid/blank coordinates, world reset, structural edition detection');
