'use strict';
// Independent check of the generated files against the two published specs.
//
// This deliberately re-reads docs/ rather than trusting the build's own objects, so
// a mistake in the writers (bad escaping, a stray enum, a truncated row) is caught.
//
//   node tools/check-output.js

const fs = require('fs');
const path = require('path');
const { parseXml, child, children, textOf } = require('../src/xml.js');

const OUT = path.join(__dirname, '..', 'docs');
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// --- Meta enums, from the automotive inventory "Supported Fields - Vehicle" table
const META = {
  body_style: ['CONVERTIBLE', 'COUPE', 'HATCHBACK', 'MINIVAN', 'TRUCK', 'SUV', 'SEDAN', 'VAN', 'WAGON', 'CROSSOVER', 'SMALL_CAR', 'OTHER'],
  state_of_vehicle: ['New', 'Used', 'CPO'],
  transmission: ['Automatic', 'Manual'],
  drivetrain: ['4X2', '4X4', 'AWD', 'FWD', 'RWD', 'Other'],
  fuel_type: ['DIESEL', 'ELECTRIC', 'FLEX', 'GASOLINE', 'HYBRID', 'OTHER'],
  condition: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'OTHER'],
  availability: ['available', 'not_available'],
  vehicle_type: ['car_truck', 'boat', 'commercial', 'motorcycle', 'powersport', 'rv_camper', 'trailer', 'other'],
  status: ['active', 'archived'],
  'mileage.unit': ['MI', 'KM'],
};
const META_REQUIRED_COLS = [
  'vehicle_id', 'title', 'description', 'url', 'make', 'model', 'year',
  'mileage.value', 'mileage.unit', 'price', 'body_style', 'exterior_color',
  'state_of_vehicle', 'address', 'latitude', 'longitude',
];

// --- Google enums, from the vehicle ads data source spec
const GOOGLE = {
  condition: ['Used', 'New'],
  engine: ['gasoline', 'petrol', 'diesel', 'electric', 'hybrid', 'lpg', 'methane', 'natural_gas', 'plug-in_hybrid', 'other'],
  body_style: ['atv_sport', 'atv_touring', 'atv_utility', 'atv_youth', 'city_car', 'compact_suv', 'convertible', 'coupe', 'crossover', 'full_size_van', 'hatchback', 'limousine', 'minivan', 'notchback', 'sedan', 'side_by_side', 'station_wagon', 'suv', 'truck', 'ute', 'utv_recreational_utility', 'utv_sport', 'utv_utility', 'utv_youth', 'class_a_motorhome', 'class_b_motorhome', 'class_c_motorhome', 'travel_trailer', 'fifth_wheel', 'pop_up_camper', 'truck_camper'],
  'vehicle_fulfillment/option': ['in_store', 'online'],
};
const GOOGLE_REQUIRED_TAGS = [
  'g:id', 'g:VIN', 'g:google_product_category', 'g:vehicle_fulfillment',
  'g:image_link', 'g:price', 'g:condition', 'g:brand', 'g:model',
  'g:year', 'g:mileage', 'g:color',
];

// --- Minimal RFC 4180 CSV reader, so we parse the file the way a consumer would
function readCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function checkMeta(file) {
  console.log(`\n${file}`);
  const rows = readCsv(fs.readFileSync(path.join(OUT, file), 'utf8'));
  const header = rows[0];
  const body = rows.slice(1);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  for (const col of META_REQUIRED_COLS) {
    if (!(col in idx)) fail(`missing required column "${col}"`);
  }
  if (!header.includes('image[0].url')) fail('missing image[0].url column');

  // Image columns must be sequential with no gaps.
  const imgCols = header.filter((h) => /^image\[\d+\]\.url$/.test(h))
    .map((h) => +h.match(/\d+/)[0]).sort((a, b) => a - b);
  const sequential = imgCols.every((n, i) => n === i);
  sequential ? pass(`${imgCols.length} sequential image columns`) : fail('image column indices have gaps');

  let bad = 0;
  const ids = new Set();
  for (const r of body) {
    if (r.length !== header.length) { fail(`row has ${r.length} cells, header has ${header.length}`); bad++; continue; }
    const get = (c) => r[idx[c]];

    const id = get('vehicle_id');
    if (ids.has(id)) fail(`duplicate vehicle_id ${id}`);
    ids.add(id);

    for (const col of META_REQUIRED_COLS) {
      if (!String(get(col) || '').trim()) { fail(`${id}: empty required field ${col}`); bad++; }
    }
    for (const [col, allowed] of Object.entries(META)) {
      const v = get(col);
      if (v && !allowed.includes(v)) { fail(`${id}: ${col}="${v}" is not in the allowed set`); bad++; }
    }
    if (!/^\d+(\.\d{2})? [A-Z]{3}$/.test(get('price') || '')) { fail(`${id}: price "${get('price')}" is not "<amount> <ISO4217>"`); bad++; }
    if (!/^https:\/\//.test(get('url') || '')) { fail(`${id}: url is not https`); bad++; }
    if (!/^https:\/\//.test(get('image[0].url') || '')) { fail(`${id}: image[0].url missing or not https`); bad++; }
    const vin = get('vin');
    if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { fail(`${id}: vin "${vin}" is not 17 valid characters`); bad++; }
    if ((get('title') || '').length > 500) { fail(`${id}: title over 500 chars`); bad++; }
    if ((get('description') || '').length > 5000) { fail(`${id}: description over 5000 chars`); bad++; }
    if ((get('trim') || '').length > 50) { fail(`${id}: trim over 50 chars`); bad++; }
    // Address must be the combined blob only — mixing forms is a hard error for Meta.
    try {
      const a = JSON.parse(get('address'));
      for (const k of ['addr1', 'city', 'region', 'country']) {
        if (!a[k]) { fail(`${id}: address.${k} is empty`); bad++; }
      }
      if (a.country !== 'BE') { fail(`${id}: address.country is "${a.country}"`); bad++; }
    } catch { fail(`${id}: address is not valid JSON`); bad++; }
    if (header.some((h) => h.startsWith('address.'))) { fail('feed mixes the combined and split address forms'); bad++; }
    const lat = parseFloat(get('latitude')), lon = parseFloat(get('longitude'));
    if (!Number.isFinite(lat) || lat === 0 || !Number.isFinite(lon) || lon === 0) { fail(`${id}: latitude/longitude missing or zero`); bad++; }
  }
  if (!bad) pass(`${body.length} rows, all required fields present and every enum valid`);
  return body.length;
}

function checkGoogle(file) {
  console.log(`\n${file}`);
  const root = parseXml(fs.readFileSync(path.join(OUT, file), 'utf8'));
  if (root.name !== 'rss' || root.attrs['xmlns:g'] !== 'http://base.google.com/ns/1.0') {
    fail('root is not <rss xmlns:g="http://base.google.com/ns/1.0">');
  } else pass('RSS 2.0 root with the g: namespace');

  const channel = child(root, 'channel');
  const items = children(channel, 'item');
  const ids = new Set(), vins = new Set();
  let bad = 0;

  for (const it of items) {
    const id = textOf(it, 'g:id');
    for (const t of GOOGLE_REQUIRED_TAGS) {
      const present = t === 'g:vehicle_fulfillment'
        ? children(it, t).length > 0
        : !!textOf(it, t);
      if (!present) { fail(`${id}: missing ${t}`); bad++; }
    }
    if (!textOf(it, 'g:link') && !textOf(it, 'g:link_template')) { fail(`${id}: needs g:link or g:link_template`); bad++; }
    if (ids.has(id)) { fail(`duplicate g:id ${id}`); bad++; }
    ids.add(id);

    const vin = textOf(it, 'g:VIN');
    if (vin) {
      // Google disapproves every offer sharing a VIN, so this must be unique.
      if (vins.has(vin)) { fail(`duplicate g:VIN ${vin}`); bad++; }
      vins.add(vin);
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { fail(`${id}: VIN "${vin}" is not 17 valid characters`); bad++; }
    }

    for (const [t, allowed] of Object.entries(GOOGLE)) {
      if (t.includes('/')) continue;
      const v = textOf(it, 'g:' + t);
      if (v && !allowed.includes(v)) { fail(`${id}: ${t}="${v}" is not in the allowed set`); bad++; }
    }
    for (const f of children(it, 'g:vehicle_fulfillment')) {
      const opt = textOf(f, 'g:option');
      if (!GOOGLE['vehicle_fulfillment/option'].includes(opt)) { fail(`${id}: vehicle_fulfillment option "${opt}"`); bad++; }
      if (opt === 'in_store' && !textOf(f, 'g:store_code')) { fail(`${id}: in_store fulfillment without a store_code`); bad++; }
    }
    if (!/^\d+(\.\d{2})? [A-Z]{3}$/.test(textOf(it, 'g:price'))) { fail(`${id}: price "${textOf(it, 'g:price')}"`); bad++; }
    if (!/^\d+ (KM|MILES)$/.test(textOf(it, 'g:mileage'))) { fail(`${id}: mileage "${textOf(it, 'g:mileage')}"`); bad++; }
    const reg = textOf(it, 'g:date_first_registered');
    if (reg && !/^\d{4}-\d{2}$/.test(reg)) { fail(`${id}: date_first_registered "${reg}" is not YYYY-MM`); bad++; }
    if (children(it, 'g:additional_image_link').length > 10) { fail(`${id}: more than 10 additional images`); bad++; }
    const opts = textOf(it, 'g:vehicle_option');
    if (opts && opts.split(',').length > 200) { fail(`${id}: more than 200 vehicle_option values`); bad++; }
    if (textOf(it, 'g:google_product_category') !== '916') { fail(`${id}: unexpected google_product_category`); bad++; }
  }
  if (!bad) pass(`${items.length} items, all required attributes present and every enum valid`);
  return items.length;
}

console.log('Checking generated feeds against the published specs');
checkMeta('meta-vehicles-nl.csv');
checkMeta('meta-vehicles-fr.csv');
checkGoogle('google-vehicles-nl.xml');
checkGoogle('google-vehicles-fr.xml');

console.log(failures ? `\n${failures} problem(s) found.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
