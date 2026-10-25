'use strict';
// Loads the planner's engine (no DOM, no browser) into a Node vm, together with the scenario / run-registry layers, and loads a saved plan file into it.
// Used by server/mcp.js; the file list mirrors tests/mc/mc_harness.js + tests/chat/harness.js.
const fs = require('fs'),
  vm = require('vm'),
  path = require('path');
const ROOT = path.resolve(__dirname, '..');
const {engineScripts} = require('./scripts.js');
const FILES = engineScripts(ROOT); // base engine + scenario layer: the data-engine tags of index.html (server/scripts.js)
function makeEngine(opts) {
  opts = opts || {};
  const el = () =>
    new Proxy(function () {}, {
      get: (t, p) => (p === 'style' ? {} : p === 'classList' ? {add() {}, remove() {}, toggle() {}} : el()),
      apply: () => el(),
      set: () => true
    });
  const doc = {
    getElementById: () => el(),
    createElement: () => el(),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => el(),
    querySelectorAll: () => [],
    body: el(),
    title: ''
  };
  const err = (...a) => process.stderr.write(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'); // stdout belongs to the protocol
  const ctx = {
    console: {log: err, error: err, warn: err, info: err},
    Math,
    JSON,
    Date,
    Number,
    String,
    Array,
    Object,
    Infinity,
    isFinite,
    parseFloat,
    parseInt,
    Set,
    Map,
    Promise,
    WeakMap,
    document: doc,
    location: {search: ''},
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {}
    },
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {}
    },
    navigator: {},
    URLSearchParams,
    setTimeout,
    clearTimeout
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, {filename: f});
  if (opts.names === false || opts.names === undefined) vm.runInContext('RR.toolNames=false', ctx); // names become "Person N" unless the operator asks otherwise
  const run = code => vm.runInContext(code, ctx);
  // Load a plan file (the JSON the app's Save writes). The 🆎 scenario set lives in the browser's storage, not in the file, so only the plan itself is loaded.
  function loadPlanObject(obj) {
    ctx.__plan = obj;
    run('{ const h=hydrateState(__plan); Object.keys(state).forEach(k=>{ delete state[k]; }); Object.assign(state,h); }');
  }
  function loadPlan(file) {
    loadPlanObject(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return {ctx, run, loadPlan, loadPlanObject, ROOT};
}
module.exports = {makeEngine, ROOT, FILES};
