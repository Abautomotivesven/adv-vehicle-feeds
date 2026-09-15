'use strict';
// Meta (Facebook/Instagram) automotive inventory feed — CSV.
//
// Spec: https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/reference
// Meta accepts CSV, TSV and its own flat XML. CSV is what Commerce Manager's own
// sample uses and the flattened `image[0].url` / `mileage.value` column syntax is
// unambiguous, so that is what we emit.
//
// Note: the vehicle fields and the dealership fields share one row. There is no
// separate dealership feed for inventory ads.

const { csvCell, csvLine } = require('./csv.js');

const COLUMNS = [
  'vehicle_id', 'title', 'description', 'url',
  'make', 'model', 'year', 'trim',
  'mileage.value', 'mileage.unit',
  'price', 'body_style', 'exterior_color', 'interior_color',
  'state_of_vehicle', 'vin', 'transmission', 'fuel_type', 'drivetrain',
  'availability', 'condition', 'vehicle_type', 'status',
  'date_first_on_lot', 'days_on_lot', 'stock_number',
  'address', 'latitude', 'longitude',
  'dealer_id', 'dealer_name', 'dealer_phone',
  'custom_label_0', 'custom_label_1', 'custom_label_2',
];

// Meta's combined address form is a JSON-ish blob in one column. The subfield is
// `addr1` (not street_address, which belongs to the Graph API object). Using both
// the combined and the split form in one feed is a hard error, so we use only this.
function addressBlob(v, lang) {
  const obj = {
    addr1: v.dealer.addr1,
    city: v.dealer.city,
    region: v.region[lang] || v.dealer.county,
    postal_code: v.dealer.zip,
    country: 'BE',
  };
  return JSON.stringify(obj);
}

const imagesFor = (v, config) => (config.images.keepWatermark.meta ? v.images : v.imagesClean);

function row(v, lang, config, maxImages) {
  const images = imagesFor(v, config).slice(0, config.images.metaMax);
  const cells = {
    vehicle_id: v.id,
    title: v.title[lang],
    description: v.description[lang],
    url: v.url[lang],
    make: v.make,
    model: v.model,
    year: v.year || '',
    trim: (v.trim || '').slice(0, 50),
    'mileage.value': v.mileage != null ? Math.round(v.mileage) : '',
    'mileage.unit': 'KM',
    price: v.price != null ? `${v.price.toFixed(2)} ${config.currency}` : '',
    body_style: v.bodyMeta,
    exterior_color: v.colorLabel[lang],
    interior_color: (v.interiorColor[lang] || '').slice(0, 50),
    state_of_vehicle: v.condition.meta,
    vin: v.vin,
    transmission: v.transmission,
    fuel_type: v.fuelMeta,
    drivetrain: v.drivetrain,
    availability: 'available',
    // Optional, and MotorK does not grade vehicles — see meta.defaultCondition.
    condition: config.meta.defaultCondition || '',
    vehicle_type: v.isCommercial ? 'commercial' : 'car_truck',
    status: 'active',
    date_first_on_lot: v.stockDate ? v.stockDate.toISOString().slice(0, 10) : '',
    days_on_lot: v.daysOnLot != null ? v.daysOnLot : '',
    stock_number: v.externalId || v.id,
    address: addressBlob(v, lang),
    latitude: v.dealer.lat,
    longitude: v.dealer.lon,
    dealer_id: v.dealer.storeCode,
    dealer_name: v.dealer.name,
    dealer_phone: v.dealer.phone,
    // Handy for building product sets in Commerce Manager — the physical showroom,
    // since every AB site shares one public name.
    custom_label_0: v.dealer.label,
    custom_label_1: v.make,
    custom_label_2: v.fuelLabel[lang],
  };

  const values = COLUMNS.map((c) => cells[c] ?? '');
  for (let i = 0; i < maxImages; i++) values.push(images[i] || '');
  return values;
}

function buildMetaCsv(vehicles, lang, config) {
  const list = vehicles.filter((v) => v.inMeta);
  const maxImages = Math.min(
    config.images.metaMax,
    list.reduce((m, v) => Math.max(m, imagesFor(v, config).length), 0) || 1,
  );

  const header = [...COLUMNS];
  for (let i = 0; i < maxImages; i++) header.push(`image[${i}].url`);

  const lines = [csvLine(header)];
  for (const v of list) lines.push(csvLine(row(v, lang, config, maxImages)));
  return lines.join('\r\n') + '\r\n';
}

// Meta's way of running one catalogue in two languages: a "language feed" that
// overlays the localised fields onto the main feed, matched on id. Beats keeping
// two full catalogues in step by hand.
//
// For vehicles the supported fields are title, description, price, sale_price, url,
// image[0].url and custom_label_0-2. Price is deliberately left out: Meta only
// accepts it in a country feed, and ours is the same in both languages anyway.
// The identifier column has to match the main feed's, so for a vehicle catalogue it
// is vehicle_id. Meta's own language-feed example says `id`, but that example is for
// the products vertical: using it here makes every row fail with "Add required
// product attribute: vehicle_id".
const LANGUAGE_CODES = { nl: 'nl_XX', fr: 'fr_XX' };
const LANGUAGE_COLUMNS = ['vehicle_id', 'override', 'title', 'description', 'url', 'custom_label_2'];

function buildMetaLanguageCsv(vehicles, lang, config) {
  const override = LANGUAGE_CODES[lang];
  if (!override) throw new Error(`no Meta language code for "${lang}"`);

  const lines = [csvLine(LANGUAGE_COLUMNS)];
  for (const v of vehicles.filter((x) => x.inMeta)) {
    lines.push(csvLine([
      v.id,
      override,
      v.title[lang],
      v.description[lang],
      v.url[lang],
      v.fuelLabel[lang],
    ]));
  }
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildMetaCsv, buildMetaLanguageCsv, COLUMNS, LANGUAGE_COLUMNS };
