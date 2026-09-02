'use strict';
// Ad-hoc look at what MotorK is actually sending. Use it when a field starts
// arriving empty, or when a new brand or dealer joins and you want to see which
// values need a mapping.
//
//   node tools/inspect.js            fill rates and value vocabularies
//   node tools/inspect.js <id>       dump one vehicle as parsed

const fs = require('fs');
const path = require('path');
const { parseXml, children } = require('../src/xml.js');
const { parseSource } = require('../src/parse.js');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

function load() {
  const out = [];
  for (const src of config.sources) {
    const f = path.join(ROOT, 'raw', `${src.key}.xml`);
    if (!fs.existsSync(f)) {
      console.error(`missing ${path.relative(ROOT, f)} — run "npm run build" once first`);
      process.exit(1);
    }
    out.push({ src, text: fs.readFileSync(f, 'utf8') });
  }
  return out;
}

const wanted = process.argv[2];
const loaded = load();

if (wanted) {
  for (const { src, text } of loaded) {
    const v = parseSource(text, src, config).find((x) => x.id === wanted);
    if (v) { console.dir(v, { depth: 4 }); process.exit(0); }
  }
  console.error(`no vehicle with id ${wanted}`);
  process.exit(1);
}

// Fill rates over every leaf element, and the distinct values of the fields that
// drive the enum mappings.
const fill = new Map();
let total = 0;
function walk(node, prefix) {
  for (const c of node.children) {
    const p = prefix ? `${prefix}/${c.name}` : c.name;
    if (c.children.length) walk(c, p);
    else {
      if (!fill.has(p)) fill.set(p, 0);
      if (c.text.trim()) fill.set(p, fill.get(p) + 1);
    }
  }
}

const vocab = { bodyType: {}, fuelType: {}, tractionType: {}, 'gear/gearType': {}, 'exterior/color': {}, type: {}, status: {}, vehicleClass: {}, 'dealer/name': {} };
const at = (node, p) => p.split('/').reduce((n, k) => (n ? n.children.find((c) => c.name === k) : null), node);

for (const { text } of loaded) {
  for (const car of children(parseXml(text), 'car')) {
    total++;
    walk(car, '');
    for (const key of Object.keys(vocab)) {
      const n = at(car, key);
      const val = n ? n.text.trim() || '(empty)' : '(missing)';
      vocab[key][val] = (vocab[key][val] || 0) + 1;
    }
  }
}

console.log(`${total} vehicles across ${loaded.length} feeds\n`);
console.log('Field fill rate');
for (const [k, v] of [...fill.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(Math.round((v / total) * 100)).padStart(3)}%  ${String(v).padStart(4)}  ${k}`);
}
console.log('\nValue vocabularies');
for (const [k, counts] of Object.entries(vocab)) {
  console.log(`  ${k}`);
  for (const [val, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(4)}  ${val}`);
  }
}
