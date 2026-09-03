'use strict';
// Fetches all four MotorK feeds, merges and de-duplicates them, checks every
// vehicle has a live detail page, then writes the Meta and Google feeds plus a
// validation report into docs/ for GitHub Pages.

const fs = require('fs');
const path = require('path');

const { parseSource, mergeVehicles } = require('./parse.js');
const { checkVehicles } = require('./livecheck.js');
const { validate } = require('./validate.js');
const { buildMetaCsv, buildMetaLanguageCsv } = require('./meta.js');
const { buildGoogleXml, buildStoresCsv } = require('./google.js');
const { renderReport } = require('./report.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const CACHE = path.join(ROOT, 'raw');

const log = (...a) => console.log(...a);

async function fetchSource(src, useCache) {
  const cacheFile = path.join(CACHE, `${src.key}.xml`);
  if (useCache && fs.existsSync(cacheFile)) {
    log(`   ${src.key}: using cached ${path.relative(ROOT, cacheFile)}`);
    return fs.readFileSync(cacheFile, 'utf8');
  }
  const res = await fetch(src.url, {
    headers: { 'User-Agent': 'ADV-feed-builder/1.0 (+https://www.advautomotive.be)' },
  });
  if (!res.ok) throw new Error(`${src.key}: MotorK returned HTTP ${res.status}`);
  const text = await res.text();
  if (!/<car\b/.test(text)) throw new Error(`${src.key}: response contains no <car> elements`);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cacheFile, text);
  log(`   ${src.key}: ${(text.length / 1024).toFixed(0)} kB`);
  return text;
}

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const useCache = process.argv.includes('--cached');
  const noLive = process.argv.includes('--no-livecheck');
  if (noLive) config.livecheck.enabled = false;

  log('1. Fetching MotorK feeds');
  const texts = [];
  for (const src of config.sources) texts.push([src, await fetchSource(src, useCache)]);

  log('2. Parsing');
  const lists = texts.map(([src, text]) => {
    const list = parseSource(text, src, config);
    log(`   ${src.key}: ${list.length} vehicles`);
    if (list.length < config.validation.minCarsPerSource && config.validation.failOnEmptySource) {
      throw new Error(`${src.key}: only ${list.length} vehicles, source looks broken`);
    }
    return list;
  });

  log('3. Merging and de-duplicating');
  const { vehicles, duplicates } = mergeVehicles(lists);
  log(`   ${lists.flat().length} in, ${vehicles.length} unique, ${duplicates.length} duplicate(s) dropped`);
  for (const d of duplicates) {
    log(`   - ${d.kind.toUpperCase()} ${d.key}: kept ${d.kept}, dropped ${d.dropped} (${d.reason})`);
  }

  log('4. Checking detail pages on advusedcars.be');
  const live = await checkVehicles(vehicles, config, log);
  if (live.checked) {
    log(`   ${live.checked} checked, ${live.gone} with no page, ${live.unreachable} unreachable (kept)`);
  } else {
    log('   skipped');
  }

  log('5. Validating');
  const report = validate(vehicles, duplicates, config);
  log(`   Meta: ${report.totals.inMeta} | Google: ${report.totals.inGoogle} | excluded: ${report.totals.excluded}`);

  log('6. Writing feeds');
  fs.mkdirSync(OUT, { recursive: true });
  const files = {
    'meta-vehicles-nl.csv': buildMetaCsv(vehicles, 'nl', config),
    'meta-vehicles-fr.csv': buildMetaCsv(vehicles, 'fr', config),
    // Overlay for running one Meta catalogue in both languages.
    'meta-language-fr.csv': buildMetaLanguageCsv(vehicles, 'fr', config),
    'google-vehicles-nl.xml': buildGoogleXml(vehicles, 'nl', config),
    'google-vehicles-fr.xml': buildGoogleXml(vehicles, 'fr', config),
    'stores.csv': buildStoresCsv(vehicles.filter((v) => v.inMeta || v.inGoogle)),
    'report.json': JSON.stringify(report, null, 2),
    'index.html': renderReport(report, config),
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT, name), content);
    log(`   docs/${name} (${(Buffer.byteLength(content) / 1024).toFixed(1)} kB)`);
  }

  if (report.problems.length) {
    log('\nWarnings:');
    for (const p of report.problems.slice(0, 40)) log(`   ! ${p}`);
    if (report.problems.length > 40) log(`   ... and ${report.problems.length - 40} more`);
  }

  // Surface the headline numbers in the GitHub Actions run summary.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '## ADV vehicle feeds',
      '',
      `Meta: **${report.totals.inMeta}** vehicles · Google: **${report.totals.inGoogle}** vehicles · excluded: ${report.totals.excluded}`,
      '',
      '| Dealer | Total | Meta | Google | Excluded | No photos |',
      '| --- | ---: | ---: | ---: | ---: | ---: |',
      ...Object.entries(report.byDealer).map(([k, a]) =>
        `| ${k} | ${a.total} | ${a.inMeta} | ${a.inGoogle} | ${a.excluded} | ${a.noImages} |`),
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }

  log('\nDone.');
}

main().catch((err) => {
  console.error('\nBuild failed:', err.message);
  process.exit(1);
});
