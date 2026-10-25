'use strict';
// ═══════════════════════════════════════════════════════════════
// SCENARIOS / PRODUCER — Monte Carlo trials. A run is a GROUP (settings, percentile summary and the per-trial records stay where they are: mcResults.results, stResults.mc.rows[i].res,
// a job's rows); thousands of trials are not thousands of scenarios. A trial becomes a scenario when
//   • it is an exemplar the app picks for every group (earliest failure, median failure, largest shortfall, typical success), or
//   • somebody asked for it: scPromoteTrial(trial, group) (a trial loaded into the charts, an LLM asking for trial 17).
// Sources (each its own owner): the Monte Carlo card → 'monteCarlo', keys 'mc:trial:<n>', group 'mc:run'; the stress + Monte Carlo table → 'stressMc', keys 'stmc:<scenarioId>:<n>',
// group 'stmc:<scenarioId>' ('none' = the same draws with no stress); tool-started jobs (scenarios/jobsProducer.js) → 'jobs', keys 'mcj:<job>[:<scenario>]:trial:<n>'.
// Input: a seeded draw {baseKey, baseFingerprint, draw:{type:'mc', cfg, trial, stressDef}}: only the settings and trial number are stored, the engine replays the rest (tested to equal the run).
// The run's own scenario key gives the base fingerprint, so a trial scenario is created stale if the store first sees the run after an edit. A re-run re-evaluates the same trial numbers; promoted
// trials are forgotten by scMcClearPromoted (called from mcResetCard / stResetCard); a promoted number beyond a new run's size is dropped. Delete: hides the scenario (tombstone) and un-promotes it.
// ═══════════════════════════════════════════════════════════════
const SC_MC_MAX_PROMOTED = 40,
  SC_MC_SOURCES = [];
let SC_MC_PROMOTED = new Map(); // scenario key → {groupId, trial}
function scRegisterMcSource(fn) {
  SC_MC_SOURCES.push(fn);
}
function scMcClearPromoted() {
  SC_MC_PROMOTED = new Map();
}

// Sources return {owner, token, groups:[{id, kind ('mc_trial'|'stress_mc_trial'), keyPrefix, label, cfg, res, stressDef, runKey}]} or null when they do not exist in this host.
scRegisterMcSource(() => {
  if (typeof mcResults === 'undefined') return null;
  const groups = [];
  if (mcResults && mcResults.results && mcResults.results.length)
    groups.push({
      id: 'mc:run',
      kind: 'mc_trial',
      keyPrefix: 'mc:trial:',
      label: 'Monte Carlo',
      cfg: mcResults.cfg,
      res: mcResults.results,
      stressDef: null,
      runKey: typeof mcStateAtRun !== 'undefined' ? mcStateAtRun : null
    });
  return {owner: 'monteCarlo', token: mcResults, groups};
});
scRegisterMcSource(() => {
  if (typeof stResults === 'undefined') return null;
  const groups = [],
    M = stResults && stResults.mc;
  if (M && M.rows)
    M.rows.forEach(r => {
      if (r.res && r.res.length)
        groups.push({
          id: 'stmc:' + r.id,
          kind: 'stress_mc_trial',
          keyPrefix: 'stmc:' + r.id + ':',
          label: r.stress ? r.label + ' + Monte Carlo' : 'Monte Carlo, same draws, no stress',
          cfg: M.cfg,
          res: r.res,
          stressDef: r.stressDef || null,
          runKey: stResults.scenarioKey
        });
    });
  return {owner: 'stressMc', token: M || null, groups};
});
function scMcGroups() {
  const out = [];
  SC_MC_SOURCES.forEach(f => {
    const d = f();
    if (d) d.groups.forEach(g => out.push(Object.assign({owner: d.owner}, g)));
  });
  return out;
}

// Exemplar trials of a group, with the reason (the registry's picker, so the app and the LLM agree on what "earliest failure" is).
function scMcExemplars(res) {
  if (typeof rrExemplars !== 'function') return [];
  const e = rrExemplars(res) || {},
    out = [];
  [
    ['earliestFailure', 'earliest failure'],
    ['medianFailure', 'median failure'],
    ['worstShortfall', 'largest shortfall'],
    ['typicalSuccess', 'typical success']
  ].forEach(([k, why]) => {
    if (e[k] && e[k].trial != null && !out.some(o => o.trial === e[k].trial)) out.push({trial: e[k].trial, why});
  });
  return out;
}
function scMcSpec(G, trial, why, pinned) {
  const base = scBaseFor(G.runKey);
  if (!base) return null;
  return {
    key: G.keyPrefix + trial,
    label: G.label + ' trial ' + trial + ' (#' + (trial + 1) + ')' + (why ? ' (' + why + ')' : ''),
    pinned: !!pinned,
    origin: {kind: G.kind, groupId: G.id, ref: {trial, exemplar: why || null}},
    input: {baseKey: base.baseKey, baseFingerprint: base.baseFingerprint, draw: {type: 'mc', cfg: G.cfg, trial, stressDef: G.stressDef}}
  };
}
function scSyncMonteCarlo() {
  SC_MC_SOURCES.forEach(f => {
    const d = f();
    if (!d) return;
    const specs = [];
    d.groups.forEach(G => {
      const seen = new Set(),
        add = (trial, why, pinned) => {
          if (seen.has(trial) || trial < 0 || trial >= G.res.length) return;
          seen.add(trial);
          const sp = scMcSpec(G, trial, why, pinned);
          if (sp) specs.push(sp);
        };
      scMcExemplars(G.res).forEach(e => add(e.trial, e.why, false));
      SC_MC_PROMOTED.forEach(v => {
        if (v.groupId === G.id) add(v.trial, null, true);
      });
    });
    scReconcile(d.owner, specs, {token: d.token});
  });
}
const scMcRemove = p => {
  SC_MC_PROMOTED.delete(p.key);
  scTombstone(p.owner, p.key);
  return {ok: true, note: 'hidden until the run is replaced'};
};
scRegisterProducer('monteCarlo', scSyncMonteCarlo, {remove: scMcRemove});
scRegisterProducer('stressMc', () => {}, {remove: scMcRemove});
scRegisterProducer('jobs', () => {}, {remove: scMcRemove});

// Group lookup with shorthands: 'mc' / undefined = the Monte Carlo card; 'lost' = 'stmc:lost'; anything else is a group id as listed (e.g. 'mcj:j1').
function scMcFindGroup(src) {
  const gs = scMcGroups(),
    want = src == null || src === 'mc' ? 'mc:run' : String(src);
  return gs.find(g => g.id === want) || gs.find(g => g.id === 'stmc:' + want) || null;
}
// Make a trial a scenario on request. → {scenario, why}: the scenario, or null and the reason.
function scPromoteTrial(trial, src) {
  trial = Number(trial);
  const G = scMcFindGroup(src);
  if (!G) return {scenario: null, why: 'no such Monte Carlo run' + (src ? ' ("' + src + '")' : '') + ' is available'};
  if (G.runKey !== scStateKey(state)) return {scenario: null, why: 'the scenario was edited since that run; re-run it first'};
  if (!Number.isInteger(trial) || trial < 0 || trial >= G.res.length)
    return {scenario: null, why: 'trial must be 0 to ' + (G.res.length - 1)};
  const key = G.keyPrefix + trial;
  if (SC_MC_PROMOTED.size >= SC_MC_MAX_PROMOTED && !SC_MC_PROMOTED.has(key))
    return {scenario: null, why: 'at most ' + SC_MC_MAX_PROMOTED + ' promoted trials; delete one first'};
  SC_MC_PROMOTED.set(key, {groupId: G.id, trial});
  scUnTombstone(G.owner, key);
  scSyncAll();
  return {scenario: scGet(key), why: null};
}
