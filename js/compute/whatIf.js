'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / WHAT-IF ENGINE — runs computeProjection() against a
// temporary clone of state (without disturbing the real state or
// the on-screen forms), used by the SS claim-age comparison chart.
// ═══════════════════════════════════════════════════════════════
function pickIdxP0FromState(s) {
  if (s.filingStatus !== 'married') return 0;
  return currentAge(s.people[0]) >= currentAge(s.people[1]) ? 0 : 1;
}
// The ONE place the engine's input is swapped. The engine (and everything it calls) reads the global `state`, so a what-if, a Monte Carlo trial, a stress test, another plan's
// projection … runs fn() with `state` replaced and always puts the real one back, even when fn throws. `st` is cloned first (a private copy nothing can leak out of) unless
// `adopt` is true: the caller hands over an object it has already copied and will not reuse (or, for another plan, one it only reads).
function withState(st, fn, adopt) {
  const backup = state;
  state = adopt ? st : JSON.parse(JSON.stringify(st));
  try {
    return fn();
  } finally {
    state = backup;
  }
}
// A private copy of the current `state`, changed by mutate(copy), in place while run() executes.
function withTempState(mutate, run) {
  return withState(state, () => {
    mutate(state);
    return run();
  });
}

function computeSSScenario(p0ClaimAge) {
  return withTempState(
    s => {
      const idxP0 = pickIdxP0FromState(s);
      const married = s.filingStatus === 'married';
      const people = married ? s.people : [s.people[0]];
      const p0 = people[idxP0];
      if (!p0.ss.started) p0.ss.claimAge = p0ClaimAge;
    },
    () => {
      const proj = computeProjection();
      let cum = 0;
      const ages = [],
        cumulative = [],
        perYear = [];
      const ssByAge = {}; // rounded age0 -> per-person monthly SS at that age
      proj.rows.forEach(r => {
        cum += r.totalSS;
        ages.push(r.age0);
        cumulative.push(cum);
        perYear.push(r.totalSS);
        ssByAge[Math.round(r.age0)] = r.ssByPerson.map(v => v / 12);
      });
      const p0 = proj.people[proj.idxP0];
      const monthly = p0.ss.started ? p0.ss.pia : p0.ss.pia * ssOwnFactor(p0ClaimAge, p0.ss.fra);
      return {
        ages,
        cumulative,
        perYear,
        totalHousehold: cum,
        monthly,
        started: p0.ss.started,
        ssByAge,
        idxP0: proj.idxP0,
        married: proj.married,
        peopleNames: proj.people.map((pp, i) => displayPersonName(pp, i))
      };
    }
  );
}
function ssROI(perYearCand, perYearBase) {
  const n = Math.min(perYearCand.length, perYearBase.length);
  const deltas = [];
  for (let k = 0; k < n; k++) deltas.push(perYearCand[k] - perYearBase[k]);
  const npv = r => deltas.reduce((s, d, k) => s + d / Math.pow(1 + r, k), 0);
  let lo = -0.5,
    hi = 1.0;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    npv(mid) * npv(lo) < 0 ? (hi = mid) : (lo = mid);
  }
  return (lo + hi) / 2;
}
