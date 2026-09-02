# ADV vehicle feeds

Merges the four MotorK stock feeds into one Meta (Facebook/Instagram) vehicle
catalogue and one Google Merchant Center vehicle feed, and publishes them on
GitHub Pages so both platforms can poll them once a day.

No dependencies. Plain Node, no `npm install` needed.

```bash
npm run build          # fetch, merge, check the website, write docs/
npm run build:cached   # same, but reuse the XML already in raw/
npm run check          # verify docs/ against both published specs
npm run inspect        # look at what MotorK is actually sending
```

## What it does

1. **Fetches** the four MotorK feeds (AB Automotive, Waasland, Vanspringel, Neyt).
   They share one schema, so one parser handles all four.
2. **Merges and de-duplicates.** Vehicle ids are unique across the four sources, so
   the real overlap is by VIN: the same physical car listed by two dealers. Both
   platforms reject every offer sharing a VIN, so one record is kept — the one with
   photos, then the more recently updated.
3. **Checks every vehicle has a detail page** on advusedcars.be. New vehicles and the
   F-150 range are not published there, so without this the feeds would carry links
   that error.
4. **Writes** the two feeds in Dutch and French, plus a validation report.

## Output

Everything lands in `docs/`, which is what GitHub Pages serves.

| File | Use |
| --- | --- |
| `meta-vehicles-nl.csv` | Meta catalogue, Dutch |
| `meta-vehicles-fr.csv` | Meta catalogue, French |
| `google-vehicles-nl.xml` | Merchant Center, Dutch |
| `google-vehicles-fr.xml` | Merchant Center, French |
| `stores.csv` | Store data source, if you switch Google to `in_store` |
| `index.html` | The dashboard: counts per dealer, what was excluded and why |
| `report.json` | The same thing, machine-readable |

Meta and Google each want one feed per language, pointing at that language's
landing pages, so there are two files per platform rather than one.

## Layout

```
src/
  xml.js         minimal XML parser (MotorK's XML only, no dependencies)
  parse.js       shared parsing layer — MotorK XML to one normalised vehicle
  mappings.js    French MotorK vocabulary to each platform's enums, plus NL/FR labels
  dealers.js     dealer registry: addresses, phones, coordinates, store codes
  livecheck.js   confirms each vehicle has a page on advusedcars.be
  validate.js    required-field checks and the per-dealer report
  meta.js        Meta CSV writer
  google.js      Google RSS/XML writer
  build.js       ties it together
tools/
  check-output.js  re-reads docs/ and checks it against both specs
  inspect.js       field fill rates and value vocabularies from the raw XML
```

`parse.js` is the only file that reads MotorK's XML. `meta.js` and `google.js` both
read the normalised vehicle, so a change to the source shape is a one-file change.

## Configuration

Everything tunable lives in `config.json`.

- `livecheck.enabled` — set to `false` to skip the website check (faster, but you
  may publish dead links).
- `images.stripQueryParams` — the AB feed adds a watermark through the query string.
  Google disapproves watermarked images, so by default we request the clean original.
- `google.fulfillment` — `online` (default), `in_store`, or `both`. See below.
- `google.excludeCommercial` — Google's vehicle ads policy does not allow vans,
  buses or tippers. On by default; they stay in the Meta feed.

## Adding a dealer or a brand

- **New MotorK feed:** add it to `sources` in `config.json`.
- **New dealer site:** add it to `DEALERS` in `src/dealers.js`. Give it a `name`
  (what customers see on the ad) and, if it shares that name with another site, a
  `label` to keep the two apart in the report. Without an entry the
  build still works — it falls back to MotorK's own dealer block and marks it
  `unknown` in the report — but MotorK's addresses and phone numbers have gaps, so
  add a proper entry.
- **New body style, fuel or colour:** add it to the tables in `src/mappings.js`.
  `npm run inspect` lists every value currently coming in, so anything unmapped
  shows up there.

## Switching Google to in-store

Vehicle ads normally run as in-store offers tied to a Google Business Profile
location. That needs the store codes in `stores.csv` to exist in the Business
Profile linked to Merchant Center, matching exactly and case-sensitively. Until
that is set up, `online` fulfilment validates immediately and is the safe default.

Once the store codes exist:

1. Upload `stores.csv` as the store data source in Merchant Center.
2. Set `google.fulfillment` to `in_store` (or `both`) in `config.json`.
3. Run `npm run build && npm run check`.

## The daily run

`.github/workflows/build-feeds.yml` runs at 05:15 UTC, builds the feeds, checks
them against both specs and publishes `docs/` to GitHub Pages. It also runs on
every push that touches the code, and can be started by hand from the Actions tab.

The run summary shows the per-dealer counts. The build fails if a source returns no
vehicles or if the output stops matching either spec, so a broken feed is a red
cross rather than a silently empty catalogue.
