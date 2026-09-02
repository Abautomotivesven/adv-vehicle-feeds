'use strict';
// The dashboard published alongside the feeds, so a broken source is visible at a
// glance without opening a CSV.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAVY = '#041028';
const GREY = '#f3f3f5';

function renderReport(report, config) {
  const t = report.totals;
  const when = new Date(report.generatedAt);
  const stamp = when.toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', dateStyle: 'full', timeStyle: 'short' });

  const dealerRows = Object.entries(report.byDealer)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, a]) => `
      <tr>
        <td class="name">${esc(name)}</td>
        <td class="num">${a.total}</td>
        <td class="num ${a.inMeta === a.total ? 'ok' : 'warn'}">${a.inMeta}</td>
        <td class="num ${a.inGoogle === a.total ? 'ok' : 'warn'}">${a.inGoogle}</td>
        <td class="num ${a.excluded ? 'warn' : 'muted'}">${a.excluded}</td>
        <td class="num ${a.noImages ? 'bad' : 'muted'}">${a.noImages}</td>
        <td class="num ${a.noVin ? 'bad' : 'muted'}">${a.noVin}</td>
      </tr>`).join('');

  const gapRows = (obj) => {
    const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<tr><td colspan="2" class="muted">Nothing missing.</td></tr>';
    return rows.map(([f, n]) => `<tr><td><code>${esc(f)}</code></td><td class="num">${n}</td></tr>`).join('');
  };

  const excludedRows = report.excludedVehicles.length
    ? report.excludedVehicles.map((v) => `
      <tr>
        <td class="num">${esc(v.id)}</td>
        <td>${esc(v.vehicle)}</td>
        <td>${esc(v.dealer)}</td>
        <td><span class="pill">${esc(v.condition)}</span></td>
        <td class="muted">${esc(v.reason)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="muted">None.</td></tr>';

  const dupRows = report.duplicates.length
    ? report.duplicates.map((d) => `
      <tr>
        <td><code>${esc(d.key)}</code></td>
        <td>${esc(d.vehicle)}</td>
        <td class="ok">${esc(d.kept)}</td>
        <td class="muted">${esc(d.dropped)}</td>
        <td class="muted">${esc(d.reason)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="muted">No overlap between the four sources.</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ADV vehicle feeds</title>
<style>
  :root {
    --navy: ${NAVY}; --grey: ${GREY};
    --ink: #101828; --muted: #667085; --line: #e4e7ec;
    --ok: #067647; --warn: #b54708; --bad: #b42318;
    --card: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 20px 64px;
    font: 15px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    background:
      radial-gradient(1100px 480px at 12% -8%, #16305c 0%, transparent 60%),
      linear-gradient(180deg, var(--navy) 0 340px, var(--grey) 340px 100%);
    background-attachment: fixed;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  header { padding: 44px 0 28px; color: #fff; }
  h1 { margin: 0 0 6px; font-size: 30px; letter-spacing: -0.02em; }
  header p { margin: 0; opacity: .75; font-size: 14px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 26px; }
  .card {
    background: var(--card); border-radius: 14px; padding: 18px 18px 16px;
    box-shadow: 0 8px 24px rgba(4,16,40,.10), 0 1px 2px rgba(4,16,40,.06);
  }
  .card .k { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .card .v { font-size: 30px; font-weight: 650; letter-spacing: -0.02em; margin-top: 4px; }
  section {
    background: var(--card); border-radius: 14px; padding: 22px 24px; margin-bottom: 18px;
    box-shadow: 0 8px 24px rgba(4,16,40,.08), 0 1px 2px rgba(4,16,40,.05);
  }
  h2 { margin: 0 0 4px; font-size: 17px; letter-spacing: -0.01em; }
  .sub { margin: 0 0 16px; color: var(--muted); font-size: 13.5px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; white-space: nowrap; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.name { font-weight: 550; }
  tr:last-child td { border-bottom: 0; }
  .ok { color: var(--ok); } .warn { color: var(--warn); } .bad { color: var(--bad); font-weight: 600; }
  .muted { color: var(--muted); }
  code { font: 12.5px/1.4 ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace; background: var(--grey); padding: 1px 5px; border-radius: 5px; }
  .pill { display: inline-block; font-size: 12px; padding: 1px 8px; border-radius: 999px; background: var(--grey); color: var(--muted); }
  .files { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
  .file { display: block; padding: 13px 15px; border: 1px solid var(--line); border-radius: 11px; text-decoration: none; color: inherit; transition: .15s; }
  .file:hover { border-color: var(--navy); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(4,16,40,.10); }
  .file b { display: block; font-size: 14px; }
  .file span { font-size: 12.5px; color: var(--muted); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 720px) { .two { grid-template-columns: 1fr; } header { padding-top: 30px; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>ADV vehicle feeds</h1>
    <p>Generated ${esc(stamp)} · Brussels time</p>
  </header>

  <div class="cards">
    <div class="card"><div class="k">Meta</div><div class="v">${t.inMeta}</div></div>
    <div class="card"><div class="k">Google</div><div class="v">${t.inGoogle}</div></div>
    <div class="card"><div class="k">Merged stock</div><div class="v">${t.merged}</div></div>
    <div class="card"><div class="k">Excluded</div><div class="v ${t.excluded ? 'warn' : ''}">${t.excluded}</div></div>
    <div class="card"><div class="k">Duplicates</div><div class="v">${t.duplicatesDropped}</div></div>
  </div>

  <section>
    <h2>Feed files</h2>
    <p class="sub">These are the URLs to paste into Commerce Manager and Merchant Center.</p>
    <div class="files">
      <a class="file" href="meta-vehicles-nl.csv"><b>meta-vehicles-nl.csv</b><span>Meta catalogue, Dutch</span></a>
      <a class="file" href="meta-vehicles-fr.csv"><b>meta-vehicles-fr.csv</b><span>Meta catalogue, French</span></a>
      <a class="file" href="google-vehicles-nl.xml"><b>google-vehicles-nl.xml</b><span>Merchant Center, Dutch</span></a>
      <a class="file" href="google-vehicles-fr.xml"><b>google-vehicles-fr.xml</b><span>Merchant Center, French</span></a>
      <a class="file" href="stores.csv"><b>stores.csv</b><span>Store data source</span></a>
      <a class="file" href="report.json"><b>report.json</b><span>Full machine-readable report</span></a>
    </div>
  </section>

  <section>
    <h2>Per dealer</h2>
    <p class="sub">If a number drops to zero overnight, that source has broken.</p>
    <div class="scroll">
      <table>
        <thead><tr>
          <th>Dealer</th><th class="num">Stock</th><th class="num">Meta</th><th class="num">Google</th>
          <th class="num">Excluded</th><th class="num">No photos</th><th class="num">No VIN</th>
        </tr></thead>
        <tbody>${dealerRows}</tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Not published on advusedcars.be</h2>
    <p class="sub">These have no detail page on the website, so they are left out rather than given a link that errors.</p>
    <div class="scroll">
      <table>
        <thead><tr><th class="num">ID</th><th>Vehicle</th><th>Dealer</th><th>Type</th><th>Reason</th></tr></thead>
        <tbody>${excludedRows}</tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Same car in two feeds</h2>
    <p class="sub">Matched on VIN. Both platforms reject an offer whose VIN appears twice, so one record is kept.</p>
    <div class="scroll">
      <table>
        <thead><tr><th>VIN</th><th>Vehicle</th><th>Kept</th><th>Dropped</th><th>Why</th></tr></thead>
        <tbody>${dupRows}</tbody>
      </table>
    </div>
  </section>

  <div class="two">
    <section>
      <h2>Missing for Meta</h2>
      <p class="sub">Required fields still empty, counted over the merged stock.</p>
      <table><thead><tr><th>Field</th><th class="num">Vehicles</th></tr></thead><tbody>${gapRows(report.fieldGaps.meta)}</tbody></table>
    </section>
    <section>
      <h2>Missing for Google</h2>
      <p class="sub">Required attributes still empty, counted over the merged stock.</p>
      <table><thead><tr><th>Attribute</th><th class="num">Vehicles</th></tr></thead><tbody>${gapRows(report.fieldGaps.google)}</tbody></table>
    </section>
  </div>
</div>
</body>
</html>
`;
}

module.exports = { renderReport };
