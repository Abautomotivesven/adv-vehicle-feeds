'use strict';
// Google Merchant Center vehicle ads feed — RSS 2.0 with the g: namespace.
//
// Spec: https://support.google.com/merchants/answer/11192663
//
// Two things worth knowing about this spec:
//  * The free/organic "vehicle listings" programme was shut down in June 2025.
//    What remains is the paid vehicle ads spec, which is what this builds.
//  * It has no transmission, drivetrain or fuel_type attribute. Fuel goes in
//    `engine`; transmission and drivetrain are folded into `vehicle_option` and
//    the description.

const XML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g');

const esc = (s) => String(s == null ? '' : s)
  .replace(CONTROL_CHARS, '')
  .replace(/[&<>"']/g, (c) => XML_ESCAPE[c]);

const tag = (name, value) => {
  const v = esc(value);
  return v === '' ? '' : `      <${name}>${v}</${name}>`;
};

function fulfillment(v, config) {
  const mode = config.google.fulfillment;
  const blocks = [];
  if (mode === 'online' || mode === 'both') {
    blocks.push('      <g:vehicle_fulfillment>\n        <g:option>online</g:option>\n      </g:vehicle_fulfillment>');
  }
  if (mode === 'in_store' || mode === 'both') {
    blocks.push(
      '      <g:vehicle_fulfillment>\n' +
      '        <g:option>in_store</g:option>\n' +
      `        <g:store_code>${esc(v.dealer.storeCode)}</g:store_code>\n` +
      '      </g:vehicle_fulfillment>',
    );
  }
  return blocks;
}

// vehicle_option has no controlled vocabulary: up to 200 free-text values, each up
// to 256 characters. Transmission and drivetrain have no attribute of their own in
// this spec, so they lead the list.
function vehicleOptions(v, lang) {
  const opts = [];
  if (v.gearLabel[lang]) opts.push(v.gearLabel[lang]);
  if (v.drivetrain && v.drivetrain !== 'Other') opts.push(v.drivetrain);
  if (v.hp) opts.push(`${Math.round(v.hp)} pk`);
  opts.push(...v.equipment);
  return opts
    .filter(Boolean)
    // The list is comma-separated, so a comma inside an option name would split it
    // into two values and can push the offer past Google's 200-value limit.
    .map((o) => o.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 256))
    .filter(Boolean)
    .slice(0, 200);
}

function item(v, lang, config) {
  const parts = [
    tag('g:id', v.id),
    tag('g:VIN', v.vin),
    tag('g:google_product_category', config.google.productCategory),
    ...fulfillment(v, config),
    tag('g:link', v.url[lang]),
    tag('g:image_link', v.images[0]),
    ...v.images.slice(1, 1 + config.images.googleAdditionalMax)
      .map((u) => tag('g:additional_image_link', u)),
    tag('g:price', v.price != null ? `${v.price.toFixed(2)} ${config.currency}` : ''),
    tag('g:condition', v.condition.google),
    tag('g:brand', v.make),
    // Google wants the model without the trim.
    tag('g:model', v.model),
    tag('g:trim', v.trim),
    tag('g:year', v.year),
    tag('g:mileage', v.mileage != null ? `${Math.round(v.mileage)} KM` : ''),
    tag('g:color', v.colorLabel[lang]),
    tag('g:engine', v.fuelGoogle),
    tag('g:body_style', v.bodyGoogle),
    tag('g:date_first_registered', v.registeredYearMonth),
    // ADV Used Cars ships every car with at least a one-year warranty, which is what
    // certified pre-owned means here.
    tag('g:certified_pre-owned', v.condition.google === 'Used' ? 'yes' : 'no'),
    tag('g:vehicle_option', vehicleOptions(v, lang).join(',')),
    tag('g:description', v.description[lang]),
    tag('g:custom_label_0', v.dealer.label),
    tag('g:custom_label_1', v.make),
    tag('g:custom_label_2', v.fuelLabel[lang]),
    tag('g:custom_label_3', v.source),
  ].filter(Boolean);

  return '    <item>\n' + parts.join('\n') + '\n    </item>';
}

function buildGoogleXml(vehicles, lang, config) {
  const list = vehicles.filter((v) => v.inGoogle);
  const site = config.site[lang];
  const head =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n' +
    '  <channel>\n' +
    `    <title>ADV Used Cars${lang === 'fr' ? ' (FR)' : ' (NL)'}</title>\n` +
    `    <link>${esc(site.host)}</link>\n` +
    `    <description>${esc(lang === 'fr'
      ? 'Voitures d’occasion ADV Automotive'
      : 'Tweedehandswagens ADV Automotive')}</description>\n` +
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;
  const body = list.map((v) => item(v, lang, config)).join('\n');
  return head + body + '\n  </channel>\n</rss>\n';
}

// Google matches store codes against the linked Business Profile. This is the
// companion store data source to upload when switching fulfillment to in_store.
function buildStoresCsv(vehicles) {
  const seen = new Map();
  for (const v of vehicles) if (!seen.has(v.dealer.storeCode)) seen.set(v.dealer.storeCode, v.dealer);
  const { csvLine } = require('./csv.js');
  const rows = [csvLine(['store_code', 'store_name', 'address', 'phone', 'latitude', 'longitude'])];
  for (const d of seen.values()) {
    rows.push(csvLine([
      d.storeCode, d.label,
      `${d.addr1}, ${d.zip} ${d.city}, BE`,
      d.phone, d.lat, d.lon,
    ]));
  }
  return rows.join('\r\n') + '\r\n';
}

module.exports = { buildGoogleXml, buildStoresCsv };
