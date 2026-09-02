'use strict';
// Minimal dependency-free XML parser, good enough for MotorK's stock XML.
// Produces nodes: { name, attrs, children[], text }

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X'
        ? parseInt(e.slice(2), 16)
        : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return e in ENTITIES ? ENTITIES[e] : m;
  });
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([:\w.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1]] = decode(m[3] !== undefined ? m[3] : m[4]);
  return attrs;
}

function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  // strip prolog, comments, CDATA handled inline
  const re = /<(\/)?([:\w.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/)?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![\s\S]*?>/g;
  let last = 0, m;
  while ((m = re.exec(xml))) {
    const text = xml.slice(last, m.index);
    if (text.trim()) stack[stack.length - 1].text += decode(text);
    last = re.lastIndex;
    if (m[5] !== undefined) { stack[stack.length - 1].text += m[5]; continue; }
    if (!m[2]) continue; // comment / prolog / doctype
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === m[2]) { stack.length = i; break; }
      }
    } else {
      const node = { name: m[2], attrs: parseAttrs(m[3] || ''), children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  return root.children.find((c) => c.name !== '#root') || root;
}

const child = (node, name) => node && node.children.find((c) => c.name === name);
const children = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const textOf = (node, name) => { const c = child(node, name); return c ? c.text.trim() : ''; };
const pathText = (node, ...names) => {
  let n = node;
  for (const name of names.slice(0, -1)) { n = child(n, name); if (!n) return ''; }
  return textOf(n, names[names.length - 1]);
};

module.exports = { parseXml, child, children, textOf, pathText, decode };
