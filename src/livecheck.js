'use strict';
// Confirms each vehicle actually has a detail page on advusedcars.be.
//
// Verified 2026-09-02: the site routes on the trailing vehicle id only — the slug
// segments are cosmetic. New vehicles and the F-150 range are not published on
// advusedcars.be at all, so without this check the feeds would carry landing pages
// that error, which Google penalises ("vehicle landing page error") and Meta rejects.
//
// The status code alone is not trustworthy. An unknown id usually answers 410 Gone
// but sometimes 200, seemingly depending on cache state. In every case the page
// itself is titled "Out of stock", so we read the body and use that as the signal.
//
// Fail-open by design: a vehicle is only removed on a definite "does not exist"
// answer. A timeout, a DNS blip or a 5xx keeps it in the feed, so an outage on the
// website can never silently empty the catalogue.

const OUT_OF_STOCK = /<title>\s*Out of stock\s*<\/title>/i;

async function fetchPage(url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctl.signal,
      headers: {
        'User-Agent': 'ADV-feed-builder/1.0 (+https://www.advautomotive.be)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    const body = await res.text().catch(() => '');
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(url, { timeoutMs, retries }) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { status, body } = await fetchPage(url, timeoutMs);
      if (status >= 500 && attempt < retries) { await sleep(500 * (attempt + 1)); continue; }
      const gone = status === 404 || status === 410 || OUT_OF_STOCK.test(body);
      return { status, gone, error: null };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  return { status: 0, gone: false, error: lastErr ? String(lastErr.message || lastErr) : 'unknown' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Checks the NL page for each vehicle. The FR page is the same record behind a
// different prefix, so one check per vehicle is enough.
async function checkVehicles(vehicles, config, log = () => {}) {
  if (!config.livecheck.enabled) {
    for (const v of vehicles) v.live = { checked: false, status: null, ok: true };
    return { checked: 0, gone: 0, unreachable: 0 };
  }

  const { concurrency, timeoutMs, retries } = config.livecheck;
  let done = 0, gone = 0, unreachable = 0;

  await mapLimit(vehicles, concurrency, async (v) => {
    const { status, gone: isGone, error } = await checkOne(v.url.nl, { timeoutMs, retries });
    const reachable = status > 0;
    if (isGone) gone++;
    if (!reachable) unreachable++;
    v.live = {
      checked: true,
      status,
      error,
      gone: isGone,
      // fail-open: anything that is not an explicit "does not exist" stays in
      ok: !isGone,
      reachable,
    };
    if (++done % 25 === 0) log(`   live-check ${done}/${vehicles.length}`);
  });

  return { checked: vehicles.length, gone, unreachable };
}

module.exports = { checkVehicles, mapLimit };
