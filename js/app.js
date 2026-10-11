'use strict';
// ═══════════════════════════════════════════════════════════════
// APP — top-level wiring. Orchestrates compute (recompute) and
// display (renderCharts) on every state change, and boots the app
// on load. Nothing here contains input/compute/display logic itself.
// ═══════════════════════════════════════════════════════════════
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
let lastProjection=null;
function recompute(){
  lastProjection = computeProjection();
  renderCharts();
  refreshWithdrawOrderPanel();   // asset names in the withdrawal-order card (assumptions.js)
  renderScenarioCard();   // Scenario card (scenarios.js): refreshed after every edit while it is open
}
const recomputeDebounced = debounce(recompute, 80);
const saveDebounced = debounce(autosave, 500);

function destroyCharts(){
  destroyAllCharts();      // display: discard every chart instance from the old plan
  lastProjection=null;
}

function buildAllCharts(){
  buildSSSection();
  buildIncomeChart();
  buildTSSChart();
  buildTaxChart();
  buildExpenseChart();
  buildAssetChart();
  buildIdgtChart();
}
function renderCharts(){
  // Charts that share a scale (the Same-scale buttons, chartHelpers.js) all take the group's largest maximum. When any locked maximum is missing (first
  // draw, Rescale, a scale button) a dry pre-pass computes every chart's own maximum without drawing, syncSharedScales() raises each group to its
  // largest, and the real pass then draws every chart once, at its final scale, so each animates a single time.
  const needSync=scaleGroups().some(g=>g.some(k=>chartYMax[k]==null));
  if(needSync){ window.dryPass=true; try{ buildAllCharts(); } finally{ window.dryPass=false; } syncSharedScales(); }
  buildAllCharts();
  if(syncSharedScales()) buildAllCharts();   // (a late change, e.g. a chart that only just got data)
}

function renderAll(){
  renderPeopleSetup();
  renderPassingSliders();
  document.getElementById('inflationRate').value = Math.round(state.inflation*400)/4;
  document.getElementById('inflationValLbl').textContent=(state.inflation*100).toFixed(2)+'%';
  document.getElementById('livingInput').value = state.living||0;
  renderScglPanel();
  renderAumFee();
  renderWithdrawOrderPanel();
  renderFutureTaxPanel();
  renderSwapPanel();
  renderPfWithdrawPanel();
  renderStateTaxPanel();
  renderLtcPanel();
  renderIncomeForms();
  renderFooter();
  expandAllChartPanels();   // build the charts in visible containers …
  recompute();
  syncAssumpHide();         // the three settings panels' Hide boxes (state.ui.assumpHide)
  syncChartPanels();        // … then put every chart panel's Hide / position and the Scale buttons into the state held in state.ui
}

window.addEventListener('DOMContentLoaded', function(){
  if(!loadAutosave()){ state=defaultState(); }
  scnRestore();      // the other scenarios, if any were saved (scenarios.js)
  renderAll();
});
