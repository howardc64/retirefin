'use strict';
// ═══════════════════════════════════════════════════════════════
// SCENARIOS / PRODUCER — what a tool (the chat, an MCP host) started, from compute/runJobs.js: the tool stress run (RJ.stress → 'stl:<scenarioId>') and the finished or cancelled
// Monte Carlo jobs (RJ.jobs → groups 'mcj:<job>' and 'mcj:<job>:<scenario>'). They plug into the stress and Monte Carlo producers as extra sources, so they follow the same rules.
// Load after scenarios/stressProducer.js and scenarios/monteCarloProducer.js. Headless hosts (no cards) get only these.
// ═══════════════════════════════════════════════════════════════
scRegisterStressSource(() =>
  typeof RJ === 'undefined'
    ? null
    : {
        owner: 'stressTool',
        prefix: 'stl',
        source: 'llm',
        sr: RJ.stress ? {results: RJ.stress.results, cfg: RJ.stress.cfg, scenarioKey: RJ.stress.scenarioKey} : null,
        _t: RJ.stress
      }
);
scRegisterMcSource(() => {
  if (typeof RJ === 'undefined') return null;
  const groups = [];
  RJ.jobs.forEach(j => {
    if (j.status !== 'done' && j.status !== 'cancelled') return;
    j.rows.forEach(row => {
      if (!row.res.length) return;
      const id = 'mcj:' + j.id + (row.id === 'none' ? '' : ':' + row.id);
      groups.push({
        id,
        kind: row.stressDef ? 'stress_mc_trial' : 'mc_trial',
        keyPrefix: id + ':trial:',
        label: (row.stressDef ? row.label + ' + ' : '') + 'Monte Carlo job ' + j.id,
        cfg: j.cfg,
        res: row.res,
        stressDef: row.stressDef || null,
        runKey: j.scenarioKey
      });
    });
  });
  return {owner: 'jobs', token: null, groups};
});
