'use strict';
// ═══════════════════════════════════════════════════════════════
// APP — top-level wiring. Orchestrates compute (recompute) and
// display (renderCharts) on every state change, and boots the app
// on load. Nothing here contains input/compute/display logic itself.
// ═══════════════════════════════════════════════════════════════
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
let lastProjection=null;
function recompute(){
  if(typeof mcTrialView!=='undefined' && mcTrialView && !mcTrialStillValid()) mcTrialClear();   // the plan was edited: leave the Monte Carlo trial view (display/mcPanel.js)
  const inTrial=(typeof mcTrialView!=='undefined' && mcTrialView);
  lastProjection = inTrial ? mcTrialShown() : computeProjection();   // a loaded Monte Carlo trial stays on screen (Rescale, Same-scale etc. still work on it)
  renderCharts();
  refreshWithdrawOrderPanel();   // asset names in the withdrawal-order card (assumptions.js)
  renderScenarioCard();   // Scenario card (scenarios.js): refreshed after every edit while it is open
  if(typeof mcMarkStale==='function') mcMarkStale();   // Monte Carlo card (display/mcPanel.js): flag results that no longer match the plan
  if(!inTrial && typeof liveAfterRecompute==='function') liveAfterRecompute();   // live link (input/liveLink.js): publish this plan's inheritance snapshot when it changed
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
  buildIraChart();
  buildLtcgChart();
  buildInhIncomeChart();
  buildInflationChart();
  buildMarketChart();
}
function renderCharts(){
  // A plan with no saved scales (first draw, Reset, an older file) starts with the income, expense and tax charts on one common scale: a dry pre-pass
  // computes every chart's own maximum without drawing, applySameScale() raises that group to its largest, and the real pass then draws each chart once.
  // After that every chart's scale is its own (Rescale / the Same-scale buttons change it) and is saved with the plan.
  if(DEFAULT_SAME_SCALE.every(k=>chartYMax[k]==null)){
    window.dryPass=true; try{ buildAllCharts(); } finally{ window.dryPass=false; }
    applySameScale(DEFAULT_SAME_SCALE);
  }
  buildAllCharts();
  captureChartYMax();
}

function renderAll(){
  restoreChartYMax();   // the chart scales saved with this plan (null = fit on the next draw)
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
  syncAssumpHide();         // the General panel's Hide box (state.ui.assumpHide.general)
  syncChartPanels();        // … then put every chart panel's Hide / position and the Scale buttons into the state held in state.ui
}

window.addEventListener('DOMContentLoaded', async function(){
  await claimPlanSlot();   // which autosave slot this tab uses (core/state.js): two open apps never share one
  if(!loadAutosave()){ state=defaultState(); }
  scnRestore();      // the other scenarios, if any were saved (scenarios.js)
  renderAll();
  if(typeof initNoteClamp==='function') initNoteClamp();   // long help notes in the input cards: two lines + More (input/controls.js)
  if(typeof liveInit==='function') liveInit();   // live link between two open plans (input/liveLink.js)
});
