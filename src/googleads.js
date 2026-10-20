'use strict';
// Google Ads dynamic remarketing feed — "Custom" business data feed (CSV).
//
// Spec: https://support.google.com/google-ads/answer/6053288 (Custom feed).
// ID matches the dynx_itemid that advusedcars.be pushes on every car page (same as
// vehicle_id in the Meta feed). ID2 is the page language, so a French visitor gets
// the fr.advusedcars.be link back. Item title and subtitle are kept to 25 characters,
// which is what the display layouts show. Clean photos only: Google disapproves a
// superimposed logo.

const { csvLine } = require('./csv.js');

const COLUMNS = ['ID', 'ID2', 'Item title', 'Item subtitle', 'Final URL', 'Image URL',
  'Item category', 'Price', 'Formatted price', 'Item address'];

const cut = (s, n) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return [...t].length <= n ? t : [...t].slice(0, n - 1).join('').trimEnd() + '…';
};

function row(v, lang, config) {
  const nf = new Intl.NumberFormat(lang === 'fr' ? 'fr-BE' : 'nl-BE');
  const km = v.mileage != null ? nf.format(Math.round(v.mileage)) + ' km' : '';
  const price = Math.round(v.price);
  return csvLine([
    v.id,
    lang,
    cut(`${v.make} ${v.model}`, 25),
    cut([v.year, km].filter(Boolean).join(' · '), 25),
    v.url[lang],
    v.imagesClean[0],
    v.bodyLabel ? v.bodyLabel[lang] || '' : '',
    `${price.toFixed(2)} ${config.currency}`,
    lang === 'fr' ? `${nf.format(price)} €` : `€ ${nf.format(price)}`,
    [v.dealer.addr1, `${v.dealer.zip} ${v.dealer.city}`, 'BE'].filter(Boolean).join(', '),
  ]);
}

// Same selection as the Meta catalogue (private-buyer stock with a live page),
// plus a photo and a price, which a display ad cannot do without.
function buildGoogleAdsCsv(vehicles, config) {
  const ok = vehicles.filter((v) => v.inMeta && v.price != null && v.imagesClean && v.imagesClean[0]);
  const lines = [COLUMNS.join(',')];
  for (const v of ok) for (const lang of ['nl', 'fr']) lines.push(row(v, lang, config));
  return lines.join('\n') + '\n';
}

module.exports = { buildGoogleAdsCsv };
