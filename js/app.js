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

function renderCharts(){
  renderSSControls();
  buildSSSection();
  buildIncomeChart();
  buildTSSChart();
  buildTaxChart();
  buildExpenseChart();
  buildAssetChart();
  buildIdgtChart();
}

function renderAll(){
  renderPeopleSetup();
  renderPassingSliders();
  document.getElementById('inflationRate').value = Math.round(state.inflation*400)/4;
  document.getElementById('inflationValLbl').textContent=(state.inflation*100).toFixed(2)+'%';
  document.getElementById('livingInput').value = state.living||0;
  syncDevalueSliders();
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
  expandAllSections();   // build the charts in visible containers …
  recompute();
  syncAssumpHide();      // the three settings panels' Hide boxes (state.ui.assumpHide)
  syncSectionHide();     // … then put every section Hide checkbox/collapse into the state held in state.ui
}

window.addEventListener('DOMContentLoaded', function(){
  if(!loadAutosave()){ state=defaultState(); }
  scnRestore();      // the other scenarios, if any were saved (scenarios.js)
  renderAll();
});
