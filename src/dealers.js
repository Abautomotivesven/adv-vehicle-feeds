'use strict';
// Dealer registry.
//
// MotorK's <dealer> block is the source of truth, but several records are wrong or
// incomplete. Everything listed here overrides the feed, keyed by the dealer name
// exactly as MotorK spells it. Verified 2026-09-02 — see notes per entry.
//
// Two names per site, deliberately:
//   name   what the customer sees on the ad. Every AB site sells under the ADV Used
//          Cars brand, so they share one name — only the showroom differs, and the
//          address, phone and coordinates on each listing are the real physical site.
//   label  internal only. Keeps the sites apart in the daily report and in the
//          product-set labels, so a broken source is still traceable to one showroom.

const PROVINCE = {
  VBR: { nl: 'Vlaams-Brabant', fr: 'Brabant flamand' },
  BRU: { nl: 'Brussels Hoofdstedelijk Gewest', fr: 'Région de Bruxelles-Capitale' },
  VOV: { nl: 'Oost-Vlaanderen', fr: 'Flandre-Orientale' },
  ANT: { nl: 'Antwerpen', fr: 'Anvers' },
};

const DEALERS = {
  'AB Automotive Vilvoorde': {
    storeCode: 'ADV-AB-VILVOORDE',
    name: 'ADV Used Cars',
    label: 'ADV Used Cars Vilvoorde (Mechelsesteenweg)',
    addr1: 'Mechelsesteenweg 295', zip: '1800', city: 'Vilvoorde', county: 'VBR',
    phone: '+3222540310', email: 'bdc.fr@ab-automotive.be',
    lat: '50.945310', lon: '4.442320',
  },
  'ADV Used Cars': {
    storeCode: 'ADV-USEDCARS-VILVOORDE',
    name: 'ADV Used Cars',
    label: 'ADV Used Cars Vilvoorde (Schaarbeeklei)',
    addr1: 'Schaarbeeklei 555', zip: '1800', city: 'Vilvoorde', county: 'VBR',
    phone: '+3222546995', email: 'bdc.fr@ab-automotive.be',
    lat: '50.910626', lon: '4.417513',
  },
  'AB Automotive Schaarbeek': {
    storeCode: 'ADV-AB-SCHAARBEEK',
    name: 'ADV Used Cars',
    label: 'ADV Used Cars Schaarbeek',
    addr1: 'Jacques Georginlaan 11-13', zip: '1030', city: 'Schaarbeek', county: 'BRU',
    phone: '+3222050971', email: 'bdc.fr@ab-automotive.be',
    lat: '50.856280', lon: '4.408640',
  },
  // Broken record in the AB feed: no city, no zip, lat/lon 0.0 and a phone carrying a
  // UK country code (+443222540310). It is the Vilvoorde site, so fold it in there.
  'AB AUTOMOTIVE': { alias: 'AB Automotive Vilvoorde' },

  'Waasland Automotive Beveren': {
    storeCode: 'ADV-WAASLAND-BEVEREN',
    name: 'Waasland Automotive Beveren',
    addr1: 'Pareinpark 4', zip: '9120', city: 'Beveren', county: 'VOV',
    phone: '+3237787960', email: 'sales@waaslandautomotive.be',
    lat: '51.2187909', lon: '4.2712614',
  },
  'Waasland Automotive Sint-Niklaas': {
    storeCode: 'ADV-WAASLAND-SINT-NIKLAAS',
    name: 'Waasland Automotive Sint-Niklaas',
    addr1: 'Europark Zuid 4', zip: '9100', city: 'Sint-Niklaas', county: 'VOV',
    phone: '+3237787910', email: 'sales@waaslandautomotive.be',
    lat: '51.1621977', lon: '4.1715563',
  },
  'VANSPRINGEL AUTOMOBILES': {
    storeCode: 'ADV-VANSPRINGEL-SAINT-GILLES',
    name: 'Vanspringel Automobiles',
    // Feed has "Rue Américaine ,12-14" and lat/lon 0.0.
    // Coordinates geocoded from OpenStreetMap on 2026-09-02.
    addr1: 'Rue Américaine 12-14', zip: '1060', city: 'Saint-Gilles', county: 'BRU',
    phone: '+3225382688', email: 'dealer@vanspringel.com',
    lat: '50.8246269', lon: '4.3550614',
  },
  'GARAGE NEYT E EN G': {
    storeCode: 'ADV-NEYT-LOKEREN',
    name: 'Garage Neyt',
    // Feed has "Gentse Steenweg ,39" and a phone missing its last digit
    // (+329365254). Correct number confirmed on the live vehicle pages.
    addr1: 'Gentse Steenweg 39', zip: '9160', city: 'Lokeren', county: 'VOV',
    phone: '+3293652540', email: 'info@neyt.be',
    lat: '51.111577', lon: '3.962965',
  },
};

// Normalise anything MotorK gives us ("03 / 778 79 60", "022540310") to E.164.
function normalisePhone(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('0032')) return '+' + d.slice(2);
  if (d.startsWith('32') && d.length >= 10) return '+' + d;
  if (d.startsWith('0')) return '+32' + d.slice(1);
  return d ? '+32' + d : '';
}

function resolveDealer(rawDealer, sourceKey) {
  const rawName = (rawDealer.name || '').trim();
  let entry = DEALERS[rawName];
  if (entry && entry.alias) entry = DEALERS[entry.alias];

  if (!entry) {
    // Unknown dealer — fall back to the feed's own data so a newly added site still
    // produces listings, and let validation flag it for a proper registry entry.
    return {
      storeCode: 'ADV-' + (rawName || sourceKey).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name: rawName || sourceKey,
      addr1: (rawDealer.address || '').replace(/\s*,\s*/g, ' ').trim(),
      zip: rawDealer.zip || '', city: rawDealer.city || '', county: rawDealer.county || '',
      phone: normalisePhone(rawDealer.phone), email: rawDealer.email || '',
      lat: rawDealer.latitude || '', lon: rawDealer.longitude || '',
      label: rawName || sourceKey,
      unknown: true,
    };
  }
  // Sites that do not share a name with another one need no separate label.
  return {
    ...entry,
    label: entry.label || entry.name,
    phone: normalisePhone(entry.phone),
    unknown: false,
  };
}

const provinceOf = (county, lang) => (PROVINCE[county] ? PROVINCE[county][lang] : county || '');

module.exports = { DEALERS, PROVINCE, resolveDealer, normalisePhone, provinceOf };
