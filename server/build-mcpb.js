#!/usr/bin/env node
'use strict';
// Builds the Claude Desktop extension: dist/retirement-planner.mcpb  (node server/build-mcpb.js [out.mcpb])
// An .mcpb is a zip with manifest.json at its root plus everything the server needs. Double-click it (or drag it onto Claude Desktop → Settings → Extensions) to install; no JSON editing.
// No packages: a tiny zip writer is included. The bundle holds the server, the engine's script files (the list in server/engine.js, so it cannot drift), two sample plans and the licence.
// The manifest's `tools` list is generated from the live tool registry, so it always matches what the server offers.
const fs = require('fs'),
  path = require('path'),
  zlib = require('zlib');
const {makeEngine, FILES, ROOT} = require('./engine.js'),
  {engineScripts, TIERS} = require('./scripts.js');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = b => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(entries) {
  // entries: [{name, data:Buffer, mode?}] → Buffer
  const parts = [],
    central = [];
  let off = 0;
  const dosTime = 0x6000,
    dosDate = 0x5821; // fixed timestamp: the same input always gives the same bytes
  entries.forEach(e => {
    const name = Buffer.from(e.name, 'utf8'),
      raw = e.data,
      def = zlib.deflateRawSync(raw, {level: 9}),
      useDef = def.length < raw.length,
      body = useDef ? def : raw,
      method = useDef ? 8 : 0,
      crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    parts.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0x031e, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(dosTime, 12);
    ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((e.mode || 0o644) << 16) >>> 0, 38);
    ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + body.length;
  });
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, end]));
}

function build(outFile) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcpb', 'manifest.json'), 'utf8'));
  // tools: straight from the registry (plus the bridge tool, which exists when the bridge is on)
  const E = makeEngine({});
  const tools = JSON.parse(E.run('JSON.stringify(apiList("mcp","mcp"))')).map(t => ({
    name: t.name,
    description: String(t.description || '')
      .split(/(?<=\.)\s/)[0]
      .slice(0, 200)
  }));
  tools.push({
    name: 'bridge_status',
    description: 'Whether the planner page is connected through the live bridge, which scenario is in use, and how to connect.'
  });
  manifest.tools = tools;
  const files = [
    ['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')],
    ['icon.png', fs.readFileSync(path.join(ROOT, 'mcpb', 'icon.png'))],
    ['LICENSE', fs.readFileSync(path.join(ROOT, 'LICENSE'))]
  ];
  ['mcp.js', 'engine.js', 'bridge.js', 'scripts.js'].forEach(f =>
    files.push(['server/' + f, fs.readFileSync(path.join(ROOT, 'server', f))])
  );
  FILES.forEach(f => files.push(['js/' + f, fs.readFileSync(path.join(ROOT, 'js', f))]));
  // the bundle has no index.html: ship the engine's load order beside the scripts (server/scripts.js reads it there)
  files.push([
    'js/engine-files.json',
    Buffer.from(JSON.stringify(Object.fromEntries(TIERS.map(t => [t, engineScripts(ROOT, [t])])), null, 2) + '\n')
  ]);
  fs.readdirSync(path.join(ROOT, 'Samples'))
    .filter(f => /\.json$/.test(f) && f !== 'manifest.json')
    .forEach(f => files.push(['Samples/' + f, fs.readFileSync(path.join(ROOT, 'Samples', f))]));
  const buf = zip(files.map(([name, data]) => ({name, data})));
  fs.mkdirSync(path.dirname(outFile), {recursive: true});
  fs.writeFileSync(outFile, buf);
  return {outFile, bytes: buf.length, files: files.map(f => f[0]), tools: tools.length};
}
if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'retirement-planner.mcpb')),
    r = build(out);
  process.stdout.write(
    'wrote ' + r.outFile + ' (' + Math.round(r.bytes / 1024) + ' KB, ' + r.files.length + ' files, ' + r.tools + ' tools)\n'
  );
}
module.exports = {build, zip, crc32};
