'use strict';
// Shared parsing layer.
//
// Turns MotorK stock XML into one normalised Vehicle shape. Both the Meta and the
// Google mapping read only from this — neither touches the raw XML. Anything that
// is a judgement call about the source data (which price, which images, how to
// build a title) belongs here, once.

const { parseXml, child, children, textOf } = require('./xml.js');
const { resolveDealer, provinceOf } = require('./dealers.js');
const { bodyOf, fuelOf, gearOf, driveOf, colorOf, conditionOf } = require('./mappings.js');

// MotorK dates: "06/2022" (MM/YYYY) or "2024-09-20 13:11:27".
function parseMonthYear(v) {
  const m = /^(\d{2})\/(\d{4})$/.exec((v || '').trim());
  return m ? { year: +m[2], month: +m[1] } : null;
}
function parseTimestamp(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((v || '').trim());
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`) : null;
}

const cleanNumber = (v) => {
  const n = parseFloat(String(v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// The AB feed burns ADV's watermark in through the query string. Dropping the
// query gives the same photo without it. Both variants are kept so each platform
// can take the one its policy allows.
function stripWatermark(url) {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

function buildTitle(v, lang) {
  // Meta wants year, make, model and trim in the title.
  const parts = [v.year, v.make, v.model, v.trim].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// Dealers type their note in their own language, and MotorK does not record which.
// A Dutch note in the French feed reads badly, so we guess from a handful of words
// that only occur in one of the two languages and keep the note only where it fits.
const NL_HINTS = /\b(en|met|van|het|een|voor|deze|zeer|wagen|garantie|onderhoud|nieuw|staat|banden|prijs|incl|btw)\b/gi;
const FR_HINTS = /\b(et|avec|de|du|des|le|la|les|une|pour|cette|très|voiture|garantie|entretien|neuf|état|pneus|prix|tva)\b/gi;

function guessLang(text) {
  if (!text || text.length < 12) return null;
  const nl = (text.match(NL_HINTS) || []).length;
  const fr = (text.match(FR_HINTS) || []).length;
  if (nl === fr) return null;
  return nl > fr ? 'nl' : 'fr';
}

// Only 38% of vehicles carry a description, and Meta requires one. Compose a
// factual sentence from the specs we do have rather than shipping an empty field.
function buildDescription(v, lang) {
  const raw = (v.rawDescription || '').trim();
  const rawLang = guessLang(raw);
  // Keep the dealer's own words only when they are clearly in this feed's language.
  // Otherwise fall through to the composed text, which is always correct for it.
  const keepRaw = raw !== '' && rawLang === lang;
  if (keepRaw && raw.length > 120) return raw.slice(0, 5000);

  const nf = new Intl.NumberFormat(lang === 'fr' ? 'fr-BE' : 'nl-BE');
  const specs = [v.bodyLabel[lang], v.fuelLabel[lang], v.gearLabel[lang]].filter(Boolean);
  const km = v.mileage != null ? nf.format(v.mileage) + ' km' : null;
  const year = v.year || null;
  const top = v.equipment.slice(0, 8).join(', ');

  if (lang === 'fr') {
    const bits = [
      `${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''} chez ${v.dealer.name}.`,
      specs.length ? specs.join(', ') + '.' : '',
      [year ? `Année ${year}` : '', km].filter(Boolean).join(', ') + '.',
      top ? `Équipements: ${top}.` : '',
      'Voiture d\'occasion contrôlée, garantie minimum 1 an. Réservez votre essai en ligne.',
    ];
    return [keepRaw ? raw : '', ...bits].filter((b) => b && b !== '.').join(' ').slice(0, 5000);
  }
  const bits = [
    `${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''} bij ${v.dealer.name}.`,
    specs.length ? specs.join(', ') + '.' : '',
    [year ? `Bouwjaar ${year}` : '', km].filter(Boolean).join(', ') + '.',
    top ? `Uitrusting: ${top}.` : '',
    'Gecontroleerde occasie met minimum 1 jaar garantie. Boek je testrit online.',
  ];
  return [keepRaw ? raw : '', ...bits].filter((b) => b && b !== '.').join(' ').slice(0, 5000);
}

// The live site routes purely on the trailing vehicle id — the slug segments are
// cosmetic (verified 2026-09-02: a junk slug with a real id still resolves, a real
// slug with an unknown id returns 410). We still build a readable slug for SEO and
// for humans reading the feed.
const slugify = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

function buildUrl(v, lang, site) {
  const cfg = site[lang];
  const seg = [
    slugify(v.dealer.city),
    slugify(v.make),
    slugify(v.model),
    slugify(lang === 'fr' ? v.fuelLabel.fr : v.fuelLabel.nl),
    slugify(v.trim || v.model),
    v.id,
  ].join('/');
  return `${cfg.host}/${cfg.segment}/${seg}/`;
}

function parseCar(car, source, config) {
  const id = car.attrs.id;
  const rawDealer = child(car, 'dealer') || { children: [] };
  const dealer = resolveDealer({
    name: textOf(rawDealer, 'name'), city: textOf(rawDealer, 'city'),
    address: textOf(rawDealer, 'address'), zip: textOf(rawDealer, 'zip'),
    email: textOf(rawDealer, 'email'), phone: textOf(rawDealer, 'phone'),
    county: textOf(rawDealer, 'county'),
    latitude: textOf(rawDealer, 'latitude'), longitude: textOf(rawDealer, 'longitude'),
  }, source.key);

  const trim = textOf(car, 'version').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  const reg = parseMonthYear(textOf(car, 'registrationDate'));
  const man = parseMonthYear(textOf(car, 'manufactureDate'));
  const body = bodyOf(textOf(car, 'bodyType'));
  const fuel = fuelOf(textOf(car, 'fuelType'), trim);
  const gear = gearOf(textOf(child(car, 'gear'), 'gearType'));
  const color = colorOf(textOf(child(car, 'exterior'), 'color'));
  const cond = conditionOf(textOf(car, 'type'));

  const images = children(child(car, 'images'), 'image')
    .slice()
    .sort((a, b) => (a.attrs.main === 'true' ? -1 : b.attrs.main === 'true' ? 1 : 0)
      || (+a.attrs.index || 0) - (+b.attrs.index || 0))
    .map((i) => i.text.trim())
    .filter(Boolean);

  const vin = textOf(car, 'vin').trim();

  const v = {
    // provenance
    id,
    source: source.key,
    sourceLabel: source.label,
    externalId: car.attrs.externalId || '',
    dealer,
    region: { nl: provinceOf(dealer.county, 'nl'), fr: provinceOf(dealer.county, 'fr') },

    // identity
    vin: /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin) ? vin.toUpperCase() : '',
    vinRaw: vin,
    make: textOf(car, 'make'),
    model: textOf(car, 'model'),
    trim,
    year: reg ? reg.year : man ? man.year : null,
    registeredYearMonth: reg ? `${reg.year}-${String(reg.month).padStart(2, '0')}` : '',

    // classification
    vehicleClass: textOf(car, 'vehicleClass'),
    condition: cond,
    bodyMeta: body.meta,
    bodyGoogle: body.google,
    bodyLabel: { nl: body.nl, fr: body.fr },
    isCommercial: !!body.commercial || textOf(car, 'vehicleClass') === 'lcv',
    fuelMeta: fuel.meta,
    fuelGoogle: fuel.google,
    fuelLabel: { nl: fuel.nl, fr: fuel.fr },
    transmission: gear.meta,
    gearLabel: { nl: gear.nl, fr: gear.fr },
    drivetrain: driveOf(textOf(car, 'tractionType')),
    colorLabel: { nl: color.nl, fr: color.fr },
    interiorColor: colorOf(textOf(child(car, 'interior'), 'color')),

    // numbers
    mileage: cleanNumber(textOf(car, 'km')),
    price: cleanNumber(textOf(child(car, 'prices'), 'priceB2c')),
    listPrice: cleanNumber(textOf(child(car, 'prices'), 'listPrice')),
    kw: cleanNumber(textOf(car, 'kw')),
    hp: cleanNumber(textOf(car, 'hp')),
    doors: cleanNumber(textOf(car, 'doors')),
    seats: cleanNumber(textOf(car, 'seats')),
    co2: cleanNumber(textOf(car, 'emissionCo2')),

    // content
    rawDescription: textOf(car, 'description'),
    equipment: children(child(car, 'equipments'), 'equipment').map((e) => e.text.trim()).filter(Boolean),
    images,
    imagesClean: images.map(stripWatermark),
    plate: textOf(car, 'plate'),

    // housekeeping
    status: textOf(car, 'status'),
    stockDate: parseTimestamp(textOf(car, 'enteredInStockDate')),
    modifiedAt: parseTimestamp(textOf(car, 'modificationDate')),
    motorkLink: textOf(car, 'vehicleLink'),
  };

  v.title = { nl: buildTitle(v, 'nl'), fr: buildTitle(v, 'fr') };
  v.description = { nl: buildDescription(v, 'nl'), fr: buildDescription(v, 'fr') };
  v.url = { nl: buildUrl(v, 'nl', config.site), fr: buildUrl(v, 'fr', config.site) };
  v.daysOnLot = v.stockDate
    ? Math.max(0, Math.round((Date.now() - v.stockDate.getTime()) / 86400000))
    : null;

  return v;
}

function parseSource(xmlText, source, config) {
  const root = parseXml(xmlText);
  const cars = children(root, 'car');
  return cars.map((c) => parseCar(c, source, config));
}

// Merge all sources into one list.
//
// Car ids are globally unique across the four feeds today, so the id pass is a
// safety net. The real overlap is by VIN: the same physical car listed by two
// dealers. We keep the record that will actually advertise well — one with photos,
// then the most recently updated — because both platforms reject an offer whose VIN
// appears twice.
function mergeVehicles(lists) {
  const byId = new Map();
  const duplicates = [];

  for (const v of lists.flat()) {
    const prev = byId.get(v.id);
    if (!prev) { byId.set(v.id, v); continue; }
    duplicates.push({ kind: 'id', key: v.id, kept: prev.source, dropped: v.source, vehicle: v });
  }

  const byVin = new Map();
  const kept = [];
  for (const v of byId.values()) {
    if (!v.vin) { kept.push(v); continue; }
    const prev = byVin.get(v.vin);
    if (!prev) { byVin.set(v.vin, v); continue; }
    const winner = pickBetter(prev, v);
    const loser = winner === prev ? v : prev;
    byVin.set(v.vin, winner);
    duplicates.push({
      kind: 'vin', key: v.vin,
      kept: `${winner.source}:${winner.id}`, dropped: `${loser.source}:${loser.id}`,
      reason: dedupeReason(winner, loser),
      vehicle: loser,
    });
  }
  kept.push(...byVin.values());
  kept.sort((a, b) => a.source.localeCompare(b.source) || (+a.id - +b.id));
  return { vehicles: kept, duplicates };
}

function pickBetter(a, b) {
  if ((a.images.length > 0) !== (b.images.length > 0)) return a.images.length ? a : b;
  const at = a.modifiedAt ? a.modifiedAt.getTime() : 0;
  const bt = b.modifiedAt ? b.modifiedAt.getTime() : 0;
  if (at !== bt) return at > bt ? a : b;
  if (a.images.length !== b.images.length) return a.images.length > b.images.length ? a : b;
  return a.id <= b.id ? a : b;
}

function dedupeReason(winner, loser) {
  if ((winner.images.length > 0) !== (loser.images.length > 0)) return 'kept the record with photos';
  const wt = winner.modifiedAt ? winner.modifiedAt.getTime() : 0;
  const lt = loser.modifiedAt ? loser.modifiedAt.getTime() : 0;
  if (wt !== lt) return 'kept the more recently updated record';
  return 'kept the record with more photos';
}

module.exports = { parseSource, parseCar, mergeVehicles, slugify };
