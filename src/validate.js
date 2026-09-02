'use strict';
// Validation.
//
// Two jobs: decide whether a vehicle may go into each feed, and produce a per-dealer
// report so a broken source is obvious the morning it breaks.

// Required by Meta for an automotive inventory listing.
const META_REQUIRED = [
  ['vehicle_id',      (v) => !!v.id],
  ['title',           (v) => !!v.title.nl],
  ['description',     (v) => !!v.description.nl],
  ['url',             (v) => !!v.url.nl],
  ['make',            (v) => !!v.make],
  ['model',           (v) => !!v.model],
  ['year',            (v) => !!v.year],
  ['mileage.value',   (v) => v.mileage != null],
  ['image',           (v) => v.images.length > 0],
  ['price',           (v) => v.price != null && v.price > 0],
  ['body_style',      (v) => !!v.bodyMeta],
  ['exterior_color',  (v) => !!v.colorLabel.nl],
  ['state_of_vehicle',(v) => !!v.condition.meta],
  ['address',         (v) => !!v.dealer.addr1 && !!v.dealer.city],
  ['address.region',  (v) => !!v.region.nl],
  ['latitude',        (v) => isCoord(v.dealer.lat)],
  ['longitude',       (v) => isCoord(v.dealer.lon)],
];

// Required by Google Merchant Center for a vehicle listing.
const GOOGLE_REQUIRED = [
  ['id',                      (v) => !!v.id],
  ['VIN',                     (v) => !!v.vin],
  ['google_product_category', () => true],
  ['vehicle_fulfillment',     () => true],
  ['link',                    (v) => !!v.url.nl],
  ['image_link',              (v) => v.images.length > 0],
  ['price',                   (v) => v.price != null && v.price > 0],
  ['condition',               (v) => !!v.condition.google],
  ['brand',                   (v) => !!v.make],
  ['model',                   (v) => !!v.model],
  ['year',                    (v) => !!v.year],
  ['mileage',                 (v) => v.mileage != null],
  ['color',                   (v) => !!v.colorLabel.nl],
];

function isCoord(x) {
  const n = parseFloat(x);
  return Number.isFinite(n) && n !== 0;
}

function missingFor(v, rules) {
  return rules.filter(([, ok]) => !ok(v)).map(([name]) => name);
}

function validate(vehicles, duplicates, config) {
  const rows = [];

  for (const v of vehicles) {
    const metaMissing = missingFor(v, META_REQUIRED);
    const googleMissing = missingFor(v, GOOGLE_REQUIRED);

    const excluded = [];
    if (v.live && v.live.checked && !v.live.ok) {
      excluded.push({
        feed: 'both',
        reason: 'no detail page on advusedcars.be',
        detail: `the page at ${v.url.nl} shows "Out of stock" (HTTP ${v.live.status})`,
      });
    }
    if (v.status && v.status !== 'FREE') {
      excluded.push({ feed: 'both', reason: `stock status is ${v.status}, not FREE` });
    }

    const blockedBoth = excluded.length > 0;

    // Google will not accept commercial vehicles (vans, buses, tippers).
    const commercialBlock = config.google.excludeCommercial && v.isCommercial;

    const row = {
      id: v.id,
      source: v.source,
      dealer: v.dealer.label,
      dealerName: v.dealer.name,
      storeCode: v.dealer.storeCode,
      vehicle: [v.year, v.make, v.model, v.trim].filter(Boolean).join(' '),
      condition: v.condition.meta,
      price: v.price,
      images: v.images.length,
      mileage: v.mileage,
      live: v.live && v.live.checked ? (v.live.gone ? 'gone' : 'ok') : null,
      metaMissing,
      googleMissing,
      excluded,
      commercialBlock,
      inMeta: !blockedBoth && metaMissing.length === 0,
      inGoogle: !blockedBoth && !commercialBlock && googleMissing.length === 0,
    };
    if (row.inMeta) v.inMeta = true;
    if (row.inGoogle) v.inGoogle = true;
    rows.push(row);
  }

  // Per-dealer and per-source rollups.
  const byDealer = rollup(rows, (r) => r.dealer);
  const bySource = rollup(rows, (r) => r.source);

  // Which required fields bite most often — this is the list to take to MotorK.
  const fieldGaps = { meta: {}, google: {} };
  for (const r of rows) {
    for (const f of r.metaMissing) fieldGaps.meta[f] = (fieldGaps.meta[f] || 0) + 1;
    for (const f of r.googleMissing) fieldGaps.google[f] = (fieldGaps.google[f] || 0) + 1;
  }

  const problems = [];
  for (const [key, agg] of Object.entries(bySource)) {
    if (agg.total < config.validation.minCarsPerSource) {
      problems.push(`source "${key}" returned ${agg.total} vehicles (minimum ${config.validation.minCarsPerSource})`);
    }
  }
  for (const r of rows) {
    if (r.metaMissing.length && !r.excluded.length) {
      problems.push(`${r.source}:${r.id} (${r.dealer}) missing for Meta: ${r.metaMissing.join(', ')}`);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      merged: rows.length,
      inMeta: rows.filter((r) => r.inMeta).length,
      inGoogle: rows.filter((r) => r.inGoogle).length,
      excluded: rows.filter((r) => r.excluded.length).length,
      commercialBlocked: rows.filter((r) => r.commercialBlock).length,
      duplicatesDropped: duplicates.length,
    },
    byDealer,
    bySource,
    fieldGaps,
    duplicates: duplicates.map((d) => ({
      kind: d.kind, key: d.key, kept: d.kept, dropped: d.dropped, reason: d.reason || '',
      vehicle: [d.vehicle.year, d.vehicle.make, d.vehicle.model].filter(Boolean).join(' '),
    })),
    excludedVehicles: rows.filter((r) => r.excluded.length).map((r) => ({
      id: r.id, source: r.source, dealer: r.dealer, vehicle: r.vehicle,
      condition: r.condition, mileage: r.mileage, reason: r.excluded.map((e) => e.reason).join('; '),
      detail: r.excluded.map((e) => e.detail).filter(Boolean).join('; '),
    })),
    rows,
    problems,
  };
}

function rollup(rows, keyFn) {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r);
    const a = (out[k] ||= {
      total: 0, inMeta: 0, inGoogle: 0, excluded: 0, commercialBlocked: 0,
      noImages: 0, noVin: 0, noYear: 0, noMileage: 0,
    });
    a.total++;
    if (r.inMeta) a.inMeta++;
    if (r.inGoogle) a.inGoogle++;
    if (r.excluded.length) a.excluded++;
    if (r.commercialBlock) a.commercialBlocked++;
    if (r.images === 0) a.noImages++;
    if (r.googleMissing.includes('VIN')) a.noVin++;
    if (r.googleMissing.includes('year')) a.noYear++;
    if (r.googleMissing.includes('mileage')) a.noMileage++;
  }
  return out;
}

module.exports = { validate, META_REQUIRED, GOOGLE_REQUIRED };
