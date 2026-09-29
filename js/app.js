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
  // A file restore is a hard data boundary. Destroy the existing Chart.js
  // instances so no tooltip/plugin closure, active hover state, dataset, or
  // canvas pixels from the previous plan can survive into the newly loaded plan.
  [ssChart,incomeChart,tssChart,taxChart,assetCharts.asset,assetCharts.idgt].forEach(ch=>{
    try{ if(ch) ch.destroy(); }catch(e){}
  });
  ssChart=null; incomeChart=null; tssChart=null; taxChart=null; assetCharts.asset=null; assetCharts.idgt=null;
  lastProjection=null;
}

function renderCharts(){
  renderSSControls();
  buildSSSection();
  buildIncomeChart();
  buildTSSChart();
  buildTaxChart();
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
  recompute();
}

window.addEventListener('DOMContentLoaded', function(){
  if(!loadAutosave()){ state=defaultState(); }
  renderAll();
});
