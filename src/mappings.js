'use strict';
// MotorK's vocabulary is French, regardless of the dealer's own language.
// These tables translate it into each platform's enum, plus NL/FR display text.
//
// Meta enums:   https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/reference
// Google enums: https://support.google.com/merchants/answer/11192663

const norm = (s) => (s || '').toLowerCase().trim();

// --- Body style -------------------------------------------------------------
// `commercial` marks vehicles Google's vehicle-ads policy does not allow
// (vans, buses, tippers). They stay in the Meta feed.
const BODY = {
  'berline':         { meta: 'SEDAN',       google: 'sedan',         nl: 'Berline',            fr: 'Berline' },
  'berline à hayon': { meta: 'HATCHBACK',   google: 'hatchback',     nl: 'Hatchback',          fr: 'Berline à hayon' },
  'break':           { meta: 'WAGON',       google: 'station_wagon', nl: 'Break',              fr: 'Break' },
  'suv vp':          { meta: 'SUV',         google: 'suv',           nl: 'SUV',                fr: 'SUV' },
  'monospace':       { meta: 'MINIVAN',     google: 'minivan',       nl: 'Monovolume',         fr: 'Monospace' },
  'mini monospace':  { meta: 'MINIVAN',     google: 'minivan',       nl: 'Kleine monovolume',  fr: 'Mini monospace' },
  'coupé':           { meta: 'COUPE',       google: 'coupe',         nl: 'Coupé',              fr: 'Coupé' },
  'cabriolet':       { meta: 'CONVERTIBLE', google: 'convertible',   nl: 'Cabrio',             fr: 'Cabriolet' },
  'pick-up':         { meta: 'TRUCK',       google: 'truck',         nl: 'Pick-up',            fr: 'Pick-up' },
  'fourgon tôlé':    { meta: 'VAN',   google: 'full_size_van', nl: 'Bestelwagen',        fr: 'Fourgon tôlé',     commercial: true },
  'fourgon':         { meta: 'VAN',   google: 'full_size_van', nl: 'Bestelwagen',        fr: 'Fourgon',          commercial: true },
  'fourgonnette':    { meta: 'VAN',   google: 'full_size_van', nl: 'Kleine bestelwagen', fr: 'Fourgonnette',     commercial: true },
  'bus':             { meta: 'VAN',   google: null,            nl: 'Bus',                fr: 'Bus',              commercial: true },
  'benne basculante':{ meta: 'TRUCK', google: 'truck',         nl: 'Kipper',             fr: 'Benne basculante', commercial: true },
  'other':           { meta: 'OTHER',       google: null,            nl: 'Andere',             fr: 'Autre' },
};
const bodyOf = (v) => BODY[norm(v)] || { meta: 'OTHER', google: null, nl: v || 'Andere', fr: v || 'Autre' };

// --- Fuel -------------------------------------------------------------------
const FUEL = {
  'électrique':        { meta: 'ELECTRIC', google: 'electric',    nl: 'Elektrisch',        fr: 'Électrique' },
  'essence':           { meta: 'GASOLINE', google: 'gasoline',    nl: 'Benzine',           fr: 'Essence' },
  'diesel':            { meta: 'DIESEL',   google: 'diesel',      nl: 'Diesel',            fr: 'Diesel' },
  'hybride - essence': { meta: 'HYBRID',   google: 'hybrid',      nl: 'Hybride (benzine)', fr: 'Hybride (essence)' },
  'hybride':           { meta: 'HYBRID',   google: 'hybrid',      nl: 'Hybride',           fr: 'Hybride' },
  'hybride - diesel':  { meta: 'HYBRID',   google: 'hybrid',      nl: 'Hybride (diesel)',  fr: 'Hybride (diesel)' },
  'lpg':               { meta: 'OTHER',    google: 'lpg',         nl: 'LPG',               fr: 'LPG' },
  'cng':               { meta: 'OTHER',    google: 'natural_gas', nl: 'CNG',               fr: 'CNG' },
};
// MotorK has no separate PHEV value, so plug-in hybrids arrive as "Hybride - Essence".
// The trim name is the only place it is spelled out.
const PHEV_RE = /\b(phev|plug[- ]?in)\b/i;

function fuelOf(raw, trim) {
  const base = FUEL[norm(raw)] || { meta: 'OTHER', google: 'other', nl: raw || 'Andere', fr: raw || 'Autre' };
  if (base.google === 'hybrid' && PHEV_RE.test(trim || '')) {
    return { ...base, google: 'plug-in_hybrid', nl: 'Plug-in hybride', fr: 'Hybride rechargeable' };
  }
  return base;
}

// --- Transmission & drivetrain ---------------------------------------------
const GEAR = {
  'automatique': { meta: 'Automatic', nl: 'Automaat', fr: 'Automatique' },
  'manuelle':    { meta: 'Manual',    nl: 'Manueel',  fr: 'Manuelle' },
};
const gearOf = (v) => GEAR[norm(v)] || { meta: '', nl: v || '', fr: v || '' };

const DRIVE = {
  FRONT: 'FWD', RWD: 'RWD', PERMANENT_4WD: 'AWD', INSERTABLE_4WD: '4X4', OTHER: 'Other',
};
const driveOf = (v) => DRIVE[(v || '').toUpperCase()] || 'Other';

// --- Colour -----------------------------------------------------------------
const COLOR = {
  'anthracite': { nl: 'Antraciet', fr: 'Anthracite' },
  'argent':     { nl: 'Zilver',    fr: 'Argent' },
  'autre':      { nl: 'Andere',    fr: 'Autre' },
  'beige':      { nl: 'Beige',     fr: 'Beige' },
  'blanc':      { nl: 'Wit',       fr: 'Blanc' },
  'bleu':       { nl: 'Blauw',     fr: 'Bleu' },
  'bordeaux':   { nl: 'Bordeaux',  fr: 'Bordeaux' },
  'gris':       { nl: 'Grijs',     fr: 'Gris' },
  'jaune':      { nl: 'Geel',      fr: 'Jaune' },
  'mauve':      { nl: 'Paars',     fr: 'Mauve' },
  'noir':       { nl: 'Zwart',     fr: 'Noir' },
  'orange':     { nl: 'Oranje',    fr: 'Orange' },
  'rouge':      { nl: 'Rood',      fr: 'Rouge' },
  'vert':       { nl: 'Groen',     fr: 'Vert' },
  'brun':       { nl: 'Bruin',     fr: 'Brun' },
  'or':         { nl: 'Goud',      fr: 'Or' },
};
const colorOf = (v) => COLOR[norm(v)] || { nl: v || '', fr: v || '' };

// --- Condition --------------------------------------------------------------
// MotorK type: USED | NEW | KM0. KM0 is a registered zero-kilometre demo car,
// which both platforms treat as used.
const CONDITION = {
  USED: { meta: 'Used', google: 'Used' },
  KM0:  { meta: 'Used', google: 'Used' },
  NEW:  { meta: 'New',  google: 'New' },
};
const conditionOf = (v) => CONDITION[(v || '').toUpperCase()] || CONDITION.USED;

module.exports = { bodyOf, fuelOf, gearOf, driveOf, colorOf, conditionOf, BODY, FUEL };
