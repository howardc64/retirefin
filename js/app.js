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
  document.getElementById('scglInput').value = state.scgl||0;
  renderAumFee();
  renderFutureTaxPanel();
  renderIncomeForms();
  renderFooter();
  expandAllSections();   // build the charts in visible containers …
  recompute();
  syncSectionHide();     // … then put every section Hide checkbox/collapse into the state held in state.ui
}

window.addEventListener('DOMContentLoaded', function(){
  if(!loadAutosave()){ state=defaultState(); }
  renderAll();
});
