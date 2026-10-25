'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / MARKET PATH — the one data model for "what if the market and inflation did THIS, year by year".
// No DOM, never writes the live scenario. Loaded after stressTest.js's data is not needed: this file only needs projection.js (hooks), whatIf.js (withTempState)
// and monteCarlo.js (mcMeasure). stressTest.js, scenarioSpec.js (marketStress lever), scenarioApi.js (tools) and the display all go through it.
//
// A MarketPath is plain JSON (it can be typed by a user, written by a chat model, or sent by an outside MCP client, and it is saved in `state.ui.marketPaths`):
//   { schema:1, id, label, note, source:'builtin'|'chat'|'user'|'mcp',
//     from:{ mode:'retire'|'now'|'year', year? },        // where value[0] lands: first year without wages, this year, or a calendar year
//     returns:[ nominal equity return per year, FRACTION ],   // 1..MS_MAX_YEARS values, every one a number
//     inflation:[ nominal inflation per year, fraction ] | null,   // same length as returns, or null = the plan's own rate
//     tail:{ returnPct:number|null, inflationPct:number|null },     // what every LATER year up to the end of the scenario gets (null = the plan's own rate)
//     equityShare:0..100 }                                // % of each non-property asset that earns the path's return
// "Full future values": msResolve() places the path on the scenario and returns DENSE per-row vectors for the whole projection (row 0 = this year … the last row):
//   eq[k] (NaN = the plan's own rate), pi[k] (always a number: the path's, or the plan's constant rate) and the price level cpi[k]. Everything downstream (the engine hook,
//   the Monte Carlo stress overlay, the charts) reads only these vectors, so there is exactly one place where "which year gets which return" is decided.
// Units: the engine is in today's $; a nominal return r in a year of inflation π enters as the real rate (1+r)/(1+π)−1 (see msHook).
// ═══════════════════════════════════════════════════════════════
const MS_SCHEMA = 1,
  MS_MAX_YEARS = 60,
  MS_ROWS = 120,
  MS_MAX_PATHS = 24;
const MS_RET_LIM = [-0.95, 2.0],
  MS_INF_LIM = [-0.1, 1.0]; // fractions: a year's return between −95% and +200%, inflation between −10% and +100%
const msIsNum = v => typeof v === 'number' && isFinite(v);
const msClone = o => JSON.parse(JSON.stringify(o));
const msSlug = s =>
  String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

// ── authoring: validate any input shape → a clean MarketPath ──────────────
// Accepts the stored form (returns / inflation as fractions) AND the friendly form a chat model or API client sends (returnsPct / inflationPct in percent,
// startsAt, startYear, afterReturnPct, afterInflationPct). → {errors:[string], path}
function msValidate(raw, opts) {
  opts = opts || {};
  const errors = [],
    r = raw || {};
  if (typeof r !== 'object' || Array.isArray(r)) return {errors: ['a market scenario must be an object'], path: null};
  const pct = (a, name) =>
    Array.isArray(a)
      ? a.map(v => (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : v)).map(v => (msIsNum(v) ? v / 100 : v))
      : null;
  const fr = a => (Array.isArray(a) ? a.map(v => (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : v)) : null);
  const ret = r.returns != null ? fr(r.returns) : pct(r.returnsPct, 'returnsPct');
  let inf = r.inflation != null ? fr(r.inflation) : pct(r.inflationPct, 'inflationPct');
  if (!ret || !ret.length)
    errors.push('returnsPct must list 1 to ' + MS_MAX_YEARS + ' yearly nominal stock returns, in percent (e.g. [-20,-10,5])');
  else if (ret.length > MS_MAX_YEARS)
    errors.push('at most ' + MS_MAX_YEARS + ' yearly returns (use afterReturnPct for the years after the list)');
  else
    ret.forEach((v, i) => {
      if (!msIsNum(v)) errors.push('returnsPct[' + i + '] must be a number');
      else if (v < MS_RET_LIM[0] || v > MS_RET_LIM[1])
        errors.push(
          'returnsPct[' + i + '] must be between ' + MS_RET_LIM[0] * 100 + ' and ' + MS_RET_LIM[1] * 100 + ' (got ' + v * 100 + ')'
        );
    });
  if (inf != null) {
    if (ret && ret.length && inf.length !== ret.length)
      errors.push(
        'inflationPct must have the same number of values as returnsPct (' +
          (ret ? ret.length : 0) +
          "), or be omitted to keep the scenario's inflation"
      );
    inf.forEach((v, i) => {
      if (!msIsNum(v)) errors.push('inflationPct[' + i + '] must be a number');
      else if (v < MS_INF_LIM[0] || v > MS_INF_LIM[1])
        errors.push(
          'inflationPct[' + i + '] must be between ' + MS_INF_LIM[0] * 100 + ' and ' + MS_INF_LIM[1] * 100 + ' (got ' + v * 100 + ')'
        );
    });
  }
  // where the first value lands
  let from = r.from && typeof r.from === 'object' ? {mode: r.from.mode, year: r.from.year} : null;
  if (!from) {
    const s = r.startsAt != null ? r.startsAt : r.startYear != null ? 'year' : 'retire';
    from = {mode: s === 'retirement' ? 'retire' : s, year: r.startYear};
  }
  if (!['retire', 'now', 'year'].includes(from.mode)) errors.push('startsAt must be retirement, now or year (with startYear)');
  if (from.mode === 'year') {
    const y = Number(from.year);
    if (!Number.isInteger(y) || y < THIS_YEAR || y > THIS_YEAR + 90)
      errors.push('startYear must be a calendar year from ' + THIS_YEAR + ' to ' + (THIS_YEAR + 90));
    else from.year = y;
  } else delete from.year;
  // years after the list
  const t = r.tail && typeof r.tail === 'object' ? r.tail : {returnPct: r.afterReturnPct, inflationPct: r.afterInflationPct};
  const tail = {
    returnPct: t.returnPct == null ? null : Number(t.returnPct),
    inflationPct: t.inflationPct == null ? null : Number(t.inflationPct)
  };
  if (
    tail.returnPct != null &&
    !(msIsNum(tail.returnPct) && tail.returnPct / 100 >= MS_RET_LIM[0] && tail.returnPct / 100 <= MS_RET_LIM[1])
  )
    errors.push('afterReturnPct must be a number between ' + MS_RET_LIM[0] * 100 + ' and ' + MS_RET_LIM[1] * 100);
  if (
    tail.inflationPct != null &&
    !(msIsNum(tail.inflationPct) && tail.inflationPct / 100 >= MS_INF_LIM[0] && tail.inflationPct / 100 <= MS_INF_LIM[1])
  )
    errors.push('afterInflationPct must be a number between ' + MS_INF_LIM[0] * 100 + ' and ' + MS_INF_LIM[1] * 100);
  const share = r.equityShare == null ? 100 : Number(r.equityShare);
  if (!msIsNum(share) || share < 0 || share > 100) errors.push('equityShare must be between 0 and 100');
  const label = String(r.label != null && String(r.label).trim() !== '' ? r.label : opts.defaultLabel || 'Custom market path').slice(0, 80);
  const id = String(r.id != null && String(r.id).trim() !== '' ? r.id : opts.defaultId || 'path-' + (msSlug(label) || 'custom'))
    .replace(/[^A-Za-z0-9_.:-]/g, '-')
    .slice(0, 48);
  if (errors.length) return {errors, path: null};
  return {
    errors: [],
    path: {
      schema: MS_SCHEMA,
      id,
      label,
      note: String(r.note || '').slice(0, 400),
      source: ['builtin', 'chat', 'user', 'mcp'].includes(r.source) ? r.source : opts.source || 'user',
      from,
      returns: ret.slice(),
      inflation: inf ? inf.slice() : null,
      tail,
      equityShare: share
    }
  };
}

// ── placement: which row gets value 0 ────────────────────────────
// `ctx.retireRow` is only needed for from.mode 'retire' (the first row without wages of the scenario as entered; see stRetireRow). → row index (may be ≥ the number of rows: no effect)
function msStartRow(path, ctx) {
  if (ctx && ctx.startRow != null) return Math.max(0, ctx.startRow); // the caller already placed it (the Stress card's start, a replay)
  const m = path.from.mode;
  if (m === 'now') return 0;
  if (m === 'year') return Math.max(0, path.from.year - THIS_YEAR);
  return Math.max(0, (ctx && ctx.retireRow) || 0);
}
// Dense, full-horizon vectors for the whole projection. → {path, start, n, eq:Float64Array (NaN = plan's own rate), pi:Float64Array, cpi:Float64Array(n+1), share, window:[firstRow,lastRow]|null}
// `mean` = the plan's constant inflation. A year the path does not set inflation for uses `mean` (or the tail's inflation after the list).
function msResolve(path, ctx) {
  ctx = ctx || {};
  const n = ctx.n || MS_ROWS,
    mean = ctx.mean != null ? ctx.mean : state.inflation,
    start = msStartRow(path, ctx),
    L = path.returns.length;
  const eq = new Float64Array(n),
    pi = new Float64Array(n),
    cpi = new Float64Array(n + 1);
  cpi[0] = 1;
  const tr = path.tail && path.tail.returnPct != null ? path.tail.returnPct / 100 : NaN,
    ti = path.tail && path.tail.inflationPct != null ? path.tail.inflationPct / 100 : null;
  let first = -1,
    last = -1;
  for (let k = 0; k < n; k++) {
    const j = k - start;
    let e = NaN,
      p = mean;
    if (j >= 0 && j < L) {
      e = path.returns[j];
      if (path.inflation) p = path.inflation[j];
    } else if (j >= L) {
      e = tr;
      if (ti != null) p = ti;
    }
    eq[k] = e;
    pi[k] = p;
    cpi[k + 1] = cpi[k] * (1 + p);
    if (!Number.isNaN(e)) {
      if (first < 0) first = k;
      last = k;
    }
  }
  return {
    path,
    start,
    n,
    eq,
    pi,
    cpi,
    mean,
    share: Math.max(0, Math.min(1, (Number(path.equityShare) || 0) / 100)),
    window: first < 0 ? null : [first, last]
  };
}
// The engine's inflation object for MC_INFL
const msInflation = res => ({pi: res.pi, cpi: res.cpi});
const MS_NO_SHOCK = key => key.charCodeAt(0) === 114 && key.charCodeAt(1) === 101; // 're:…' (household property) keeps the plan's own rate

// The engine's growth hook (projection.js gk()). g = the plan's real rate, ch = the Change spec it came from.
// fixed / custom growth are nominal promises (worth less when prices rise); 'inflation ± x' follows the year's inflation, so it keeps its real rate.
function msHook(res) {
  const {eq, pi, mean, share} = res;
  return (g, key, k, ch) => {
    const p = pi[k],
      nominalFixed = !!ch && (ch.mode === 'fixed' || ch.mode === 'custom');
    const scenarioNom = nominalFixed ? (1 + g) * (1 + mean) - 1 : (1 + g) * (1 + p) - 1;
    let nom = scenarioNom;
    const e = eq[k];
    if (e === e && !MS_NO_SHOCK(key)) nom = share * e + (1 - share) * scenarioNom;
    return (1 + nom) / (1 + p) - 1;
  };
}
// Legacy window form {eq:[...], infl:[...]|null} placed at `start` → a MarketPath-compatible resolved object (used by stressTest.js and the Monte Carlo stress overlay)
function msFromWindow(scen, start, share, mean, n) {
  const path = {
    schema: MS_SCHEMA,
    id: scen.id || 'scenario',
    label: scen.label || '',
    note: scen.note || '',
    source: 'builtin',
    from: {mode: 'row'},
    returns: scen.eq.slice(),
    inflation: scen.infl ? scen.infl.slice() : null,
    tail: {returnPct: null, inflationPct: null},
    equityShare: Math.round(share * 100)
  };
  return msResolve(path, {n: n || MS_ROWS, mean: mean != null ? mean : state.inflation, retireRow: start}); // mode 'row' falls through msStartRow's default branch = ctx.retireRow
}
// The legacy {scen,start,share} object mcRunTrial()'s `stress` argument takes, from a path (interior inflation gaps cannot occur: inflation is all-or-nothing)
function msToStress(path, ctx) {
  const res = msResolve(path, ctx),
    L = path.returns.length;
  return {
    scen: {id: path.id, label: path.label, eq: path.returns.slice(), infl: path.inflation ? path.inflation.slice() : null},
    start: res.start,
    share: res.share * 100
  };
}

// ── running ──────────────────────────────────────────────────────
// Row index of the first year without wages in the scenario as entered (0 if it has no wages), the anchor of from.mode 'retire'.
function msRetireRow() {
  let last = -1;
  REC_RATES = false;
  try {
    computeProjection().rows.forEach((r, k) => {
      if ((r.wageTotal || 0) > 0.5) last = k;
    });
  } finally {
    REC_RATES = true;
  }
  return last + 1;
}
// Run the scenario under one path (or as entered with path=null) on a private clone. `record` also records each asset's yearly rate (the Market return chart); batch runs skip it.
// → {proj, m (mcMeasure), res (the resolved vectors | null), start}
function msRun(path, opts) {
  opts = opts || {};
  return withTempState(
    s => {
      if (opts.mutate) opts.mutate(s);
    },
    () => {
      let res = null;
      if (path) {
        res = msResolve(path, {
          retireRow: path.from.mode === 'retire' ? (opts.retireRow != null ? opts.retireRow : msRetireRow()) : 0,
          mean: state.inflation
        });
      }
      const proj = withEngineHooks(res ? msHook(res) : null, res ? msInflation(res) : null, !!opts.record, () => computeProjection());
      return {proj, m: mcMeasure(proj, {pass: [0, 0], ltcYears: [0, 0]}), res, start: res ? res.start : 0};
    }
  );
}
// Headline numbers of a path, for the model and for banners: years, compounded stock return of the window, peak / average inflation.
function msDescribe(path) {
  const L = path.returns.length,
    comp = path.returns.reduce((a, v) => a * (1 + v), 1) - 1,
    inf = path.inflation;
  const o = {
    id: path.id,
    label: path.label,
    source: path.source,
    years: L,
    startsAt: path.from.mode === 'year' ? 'year ' + path.from.year : path.from.mode === 'now' ? 'now' : 'retirement',
    compoundedReturnPct: Math.round(comp * 1000) / 10,
    worstYearPct: Math.round(Math.min.apply(null, path.returns) * 1000) / 10,
    equityShare: path.equityShare,
    inflation: inf
      ? {avgPct: Math.round((inf.reduce((a, v) => a + v, 0) / L) * 1000) / 10, peakPct: Math.round(Math.max.apply(null, inf) * 1000) / 10}
      : "scenario's own rate"
  };
  if (path.tail && (path.tail.returnPct != null || path.tail.inflationPct != null))
    o.afterTheList = {returnPct: path.tail.returnPct, inflationPct: path.tail.inflationPct};
  return o;
}

// ── registry: built-in + saved + session paths, behind one interface ──
// Saved paths live in the plan (`state.ui.marketPaths`, written only by a user action); session paths (a chat model's or an MCP client's definitions) live in memory until the user adds them.
const msSession = {}; // id → MarketPath (never saved)
function msSaved() {
  return typeof state !== 'undefined' && state && state.ui && Array.isArray(state.ui.marketPaths) ? state.ui.marketPaths : [];
}
function msSessionAdd(path) {
  if (Object.keys(msSession).length >= MS_MAX_PATHS && !msSession[path.id]) delete msSession[Object.keys(msSession)[0]];
  msSession[path.id] = msClone(path);
  return msSession[path.id];
}
function msUniqueId(base, taken) {
  let id = base,
    i = 2;
  while (taken[id]) id = base + '-' + i++;
  return id;
}
function msGet(id) {
  return msSession[id] || msSaved().find(p => p && p.id === id) || null;
}
function msList() {
  const seen = {},
    out = [];
  msSaved()
    .concat(Object.keys(msSession).map(k => msSession[k]))
    .forEach(p => {
      if (p && !seen[p.id]) {
        seen[p.id] = 1;
        out.push(p);
      }
    });
  return out;
}
// Save a path into the plan (state.ui.marketPaths). Called by a user click only (card button / Stress card), never by a tool. → the stored path
function msSave(path) {
  if (!state.ui) state.ui = {};
  if (!Array.isArray(state.ui.marketPaths)) state.ui.marketPaths = [];
  const L = state.ui.marketPaths,
    i = L.findIndex(p => p.id === path.id),
    c = msClone(path);
  c.source = c.source || 'user';
  if (i >= 0) L[i] = c;
  else {
    if (L.length >= MS_MAX_PATHS) throw new Error('at most ' + MS_MAX_PATHS + ' saved market scenarios');
    L.push(c);
  }
  delete msSession[path.id];
  return c;
}
function msRemove(id) {
  const L = msSaved(),
    i = L.findIndex(p => p.id === id);
  if (i >= 0) L.splice(i, 1);
  delete msSession[id];
}
// Sanitize what a loaded file holds (hydrateState): keep valid paths only
function msSanitizeList(list) {
  const out = [],
    seen = {};
  (Array.isArray(list) ? list : []).forEach(p => {
    const v = msValidate(p, {source: p && p.source});
    if (!v.errors.length && !seen[v.path.id] && out.length < MS_MAX_PATHS) {
      seen[v.path.id] = 1;
      out.push(v.path);
    }
  });
  return out;
}

if (typeof module !== 'undefined')
  module.exports = {msValidate, msResolve, msHook, msRun, msDescribe, msStartRow, msFromWindow, msToStress};
