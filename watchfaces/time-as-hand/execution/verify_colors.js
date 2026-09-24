/* Run actual PKJS startup against isolated per-edition phone stores. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'watchface/src/pkjs/index.js'), 'utf8');
const configurations = JSON.parse(require('node:child_process').execFileSync('python3', ['-c',
  'import json,sys;sys.path.insert(0,"execution");from generate_settings import configuration;print(json.dumps([configuration(i) for i in range(3)]))'], {cwd:root,encoding:'utf8'}));
function migrate(raw, edition) {
  const data = {'clay-settings':raw};
  class Clay { constructor() { this.savedAtConstruction = data['clay-settings']; } }
  const context = {require:n=>n==='@rebble/clay'?Clay:n==='message_keys'?{}:configurations[edition],
    localStorage:{getItem:k=>data[k],setItem:(k,v)=>{data[k]=v;}},
    Pebble:{addEventListener:()=>{}},setInterval:()=>{}};
  vm.runInNewContext(source, context);
  assert.equal(context.clay.savedAtConstruction, data['clay-settings'], 'Migration must precede Clay construction');
  return data['clay-settings'];
}
const colors=[0x000000,0xffaa00,0xaa0000,0x0000aa,0x005500,0x5500aa,0x555555,0x005555];
for (let edition=0; edition<3; edition++) {
  function flatten(items) { return items.flatMap(item=>[item,...flatten(item.items || [])]); }
  const fields=flatten(configurations[edition]);
  const pickers=fields.filter(item=>item.type==='color');
  assert.deepEqual(pickers.map(item=>item.messageKey),edition?['HandColorRGB','MinuteColorRGB']:['HandColorRGB']);
  assert(pickers.every(item=>item.layout==='COLOR'),'Every hand picker must explicitly use the full color layout');
  assert(!fields.some(item=>['HandColor','MinuteColor'].includes(item.messageKey)),'Legacy selects must be absent');
  for(let index=1; index<=8; index++) {
    const saved=JSON.parse(migrate(JSON.stringify({HandColor:String(index),MinuteColor:9-index,TimeFont:7,ShowDay:true}),edition));
    assert.equal(saved.HandColorRGB,colors[index-1]);
    assert.equal(saved.MinuteColorRGB,colors[8-index]);
    assert.equal(saved.TimeFont,7); assert.equal(saved.ShowDay,true);
    assert(!('HandColor' in saved)); assert(!('MinuteColor' in saved));
  }
  for (const invalid of [-1,0,9,1.5,'junk',null]) {
    const saved=JSON.parse(migrate(JSON.stringify({HandColor:invalid}),edition));
    assert(!('HandColorRGB' in saved));
  }
  for (const rgb of [0,0xffffff,0x55aaff]) {
    const raw=JSON.stringify({HandColor:2,HandColorRGB:rgb,MinuteColorRGB:0});
    const once=migrate(raw,edition);
    assert.equal(JSON.parse(once).HandColorRGB,rgb,'Existing RGB must take precedence, including black');
    assert.equal(migrate(once,edition),once,'Migration must be idempotent');
  }
  assert.equal(migrate(undefined,edition),undefined,'Fresh store must stay empty');
  assert.equal(migrate('{broken',edition),'{broken','Malformed storage must not crash or be replaced');
}
console.log('PASS: legacy colors across 3 edition stores, integer RGB preservation, migration order/idempotence, invalid and absent storage');
