'use strict';
// The planner's script list, kept in ONE place: the <script> tags of index.html, in load order.
// A tag that the headless engine (MCP server, tests) also needs carries data-engine="base" (the calculation engine) or data-engine="scenario" (the
// scenario / run-registry layer on top of it). Everything else is browser-only (inputs, charts, panels).
//
//   browserScripts(root)  every local script, in index.html order            (the DOM-stub tests load these)
//   engineScripts(root, tiers)  the data-engine scripts of the given tiers, base first, then scenario   (default both)
//
// A packaged bundle (MCPB) has no index.html: build-mcpb.js writes js/engine-files.json from this list, and engineScripts reads that instead.
// Paths are relative to js/ for engine scripts ('core/state.js') and to the app root for browser scripts ('js/core/state.js').
const fs = require('fs'),
  path = require('path');
const TIERS = ['base', 'scenario'];

function parseIndex(root) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    out = [];
  for (const m of html.matchAll(/<script\b([^>]*)><\/script>/g)) {
    const src = /\bsrc="([^"]+)"/.exec(m[1]);
    if (!src || /^https?:/.test(src[1])) continue;
    const eng = /\bdata-engine="([^"]+)"/.exec(m[1]);
    out.push({src: src[1], engine: eng ? eng[1] : null});
  }
  return out;
}
function browserScripts(root) {
  return parseIndex(root).map(s => s.src);
}
function engineScripts(root, tiers) {
  tiers = tiers || TIERS;
  const idx = path.join(root, 'index.html');
  if (!fs.existsSync(idx)) {
    // packaged bundle
    const all = JSON.parse(fs.readFileSync(path.join(root, 'js', 'engine-files.json'), 'utf8'));
    return tiers.reduce((a, t) => a.concat(all[t] || []), []);
  }
  const list = parseIndex(root);
  return tiers.reduce((a, t) => a.concat(list.filter(s => s.engine === t).map(s => s.src.replace(/^js\//, ''))), []);
}
module.exports = {browserScripts, engineScripts, TIERS};
