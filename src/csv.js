'use strict';
// CSV writing per Meta's rule: a double quote inside a quoted field is escaped by
// doubling it. We quote every non-empty cell so the JSON address blob, commas in
// descriptions and stray quotes in trim names all survive intact.

// Control characters that must not appear in a cell. Newlines are allowed (Meta
// permits line breaks in description) but are normalised to a bare LF first.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g');
const CR_LF = new RegExp('\\r\\n?', 'g');

function csvCell(value) {
  const s = value == null ? '' : String(value);
  if (s === '') return '';
  const clean = s.replace(CR_LF, '\n').replace(CONTROL_CHARS, '');
  return '"' + clean.replace(/"/g, '""') + '"';
}

const csvLine = (values) => values.map(csvCell).join(',');

module.exports = { csvCell, csvLine };
