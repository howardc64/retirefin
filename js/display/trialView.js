// ═══════════════════════════════════════════════════════════════
// trialView.js — the one place that says what the charts are showing
// ═══════════════════════════════════════════════════════════════
// A Monte Carlo or stress-test run can be loaded into the chart grid (display/mcPanel.js). While it is, the charts, overlays and the Excel
// export read the trial's own copy of the plan instead of `state`. Every reader asks viewContext() rather than touching mcTrialView, so
// the shape of the trial record is known to mcPanel.js and this file only.
//
// mcTrialView: null (the charts show the plan as entered), or {trial, proj, state, cap, key, pos, view, cur, scenarioProj, b, c, d, e, f}.
//   view: 'A' the plan as entered, 'B' a Monte Carlo trial, 'C' a successful trial, 'D' a stress-test scenario, 'E'/'F' stress test + Monte Carlo.
//   recompute() (app.js) feeds `proj` to the charts while it is set. Only mcPanel.js assigns it.
let mcTrialView = null;
const mcShowingTrial = () => !!mcTrialView && mcTrialView.view !== 'A';
// Chart title / file name for the loaded trial (null when none is on screen).
function trialLabel(v) {
  const n = v.trial + 1;
  if (v.view === 'D') return 'STRESS TEST "' + ((v.d && v.d.label) || '') + '"';
  if (v.view === 'E' || v.view === 'F') return 'STRESS TEST "' + ((v.sm && v.sm.label) || '') + '" + MONTE CARLO TRIAL #' + n;
  return 'MONTE CARLO TRIAL #' + n;
}
function trialFileName(v) {
  if (v.view === 'D') return 'retirement-plan-stress-test.xlsx';
  return (v.view === 'E' || v.view === 'F' ? 'retirement-plan-stress-mc-trial-' : 'retirement-plan-mc-trial-') + (v.trial + 1) + '.xlsx';
}
// → {loaded: a trial record exists (even while A is shown), showing: a trial (not A) is on screen, view, trial: the record or null,
//    state / ltc: what the charts are drawn from, label, fileName (null unless showing)}
function viewContext() {
  const v = mcTrialView,
    showing = mcShowingTrial(),
    st = showing ? v.state : state;
  return {
    loaded: !!v,
    showing,
    view: v ? v.view : 'A',
    trial: v,
    state: st,
    ltc: st.ltc,
    label: showing ? trialLabel(v) : null,
    fileName: showing ? trialFileName(v) : null
  };
}
