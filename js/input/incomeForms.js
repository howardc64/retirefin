'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / INCOME FORMS — orchestrates the per-person income-source
// column, calling one builder function per income type (spec §4.4),
// plus the shared onchange/onclick handlers those cards wire up to.
// ═══════════════════════════════════════════════════════════════
function renderIncomeForms(){
  const married = state.filingStatus==='married';
  const n = married?2:1;
  // Every person-column renders the exact same sequence of item types (wage,
  // SS, pension, rental, ODIV, QDIV, LTCG, IRA), so both columns
  // always have the same row count; this lets the two-column grid below use
  // CSS subgrid to keep every income type's top edge aligned across people.
  const rowCount = 1 /*name header*/ + 2 /*wage+ss*/ + 1 /*pension*/ + 1 /*rental*/ + 1 /*annuity*/ + 1 /*brokerage*/ + 1 /*ira*/ + 1 /*roth*/;

  let html='';
  for(let i=0;i<n;i++){
    const p=state.people[i];
    const pid='people.'+i;
    html+=`<div class="person-col"><h3 id="personIncomeHeader_${i}">${escHtml(p.name)}</h3>`;
    html+=buildWageCard(pid, p);
    html+=buildSSCard(pid, p, i, married);
    html+=buildPensionCard(pid, p);
    html+=buildRentalCard(pid, p);
    html+=buildBrokerageCard(pid, i, p, married);
    html+=buildAnnuityCard(pid, i, p, married);
    html+=buildIraCard(pid, p, married);
    html+=buildRothCard(pid, p, married);
    html+='</div>';
  }
  const incomeEl = document.getElementById('perPersonIncome');
  incomeEl.className = 'income-grid' + (married ? ' two-col' : '');
  incomeEl.style.gridTemplateRows = married ? `repeat(${rowCount}, auto)` : '';
  // autocomplete="off": stops a browser's form-state restore (reload / back) from putting a stale checkbox or value on top of the
  // state-derived one — e.g. a Hide box that is checked while its card is open.
  incomeEl.innerHTML=html.replace(/<input /g,'<input autocomplete="off" ');
}

function onSSStartedToggle(i,checked){ state.people[i].ss.started=checked; renderIncomeForms(); recompute(); saveDebounced(); }
function onSSClaimAge(i,val){
  state.people[i].ss.claimAge=+val;
  document.getElementById('ssClaimVal_'+i).textContent=val;
  recomputeDebounced(); saveDebounced();
}
// Cost basis (spec §4.6, cost basis), entered as a % of the portfolio's start balance: blank means
// "not entered" (stored as null), which is different from 0 (a real 0% basis, i.e. 100% unrealized gain).
// Clamped to 0–100. Only the projection depends on it, so no re-render.
function onBasisInput(pid,bi,val){
  setPath(pid+'.brokerage.'+bi+'.basisPct', val===''||val==null?null:Math.min(100,Math.max(0,+val||0)));
  recomputeDebounced(); saveDebounced();
}
function onBeneToggle(path,checked){ setPath(path,checked); recompute(); saveDebounced(); }
function applyPortfolioType(b, type){
  b.type = type==='idgt' ? 'idgt' : 'living';
  b.idgt = b.type==='idgt';
  b.payExp = !b.idgt;
  b.reinvest = !b.idgt;
}
function onPortfolioType(i,bi,type){
  applyPortfolioType(state.people[i].brokerage[bi], type);
  renderIncomeForms(); recompute(); saveDebounced();
}
function onPortfolioName(pid,bi,val,inputEl){
  setPath(pid+'.brokerage.'+bi+'.name', val);
  // Update the card title in place (a full re-render would drop input focus), then refresh the charts.
  const title=inputEl.closest('.portfolio-card').querySelector('.pf-title');
  if(title) title.textContent=val.trim()||('Portfolio '+(bi+1));
  recomputeDebounced(); saveDebounced();
}
function onRentalName(pid,ri,val,inputEl){
  setPath(pid+'.rentals.'+ri+'.name', val);
  const title=inputEl.closest('.rental-card').querySelector('.rt-title');
  if(title) title.textContent=val.trim()||('Rental '+(ri+1));
  recomputeDebounced(); saveDebounced();
}
function addRental(i){
  if(!Array.isArray(state.people[i].rentals)) state.people[i].rentals=[];
  state.people[i].rentals.push(defaultRental(state.people[i].rentals.length+1));
  renderIncomeForms(); recompute(); saveDebounced();
}
function removeRental(i,ri){
  state.people[i].rentals.splice(ri,1);
  renderIncomeForms(); recompute(); saveDebounced();
}
function addBrokerage(i){
  if(!Array.isArray(state.people[i].brokerage)) state.people[i].brokerage=[];
  state.people[i].brokerage.push(defaultBrokeragePortfolio(0, state.people[i].brokerage.length+1));
  renderIncomeForms(); recompute(); saveDebounced();
}
function addAnnuity(i){
  if(!Array.isArray(state.people[i].annuities)) state.people[i].annuities=[];
  state.people[i].annuities.push(defaultAnnuity(state.people[i].annuities.length+1));
  renderIncomeForms(); recompute(); saveDebounced();
}
function removeAnnuity(i,ai){
  state.people[i].annuities.splice(ai,1);
  renderIncomeForms(); recompute(); saveDebounced();
}
function onAnnuityName(pid,ai,val,inputEl){
  setPath(pid+'.annuities.'+ai+'.name', val);
  const title=inputEl.closest('.annuity-card').querySelector('.an-title');
  if(title) title.textContent=val.trim()||('Annuity '+(ai+1));
  recomputeDebounced(); saveDebounced();
}
// Optional dollar inputs (premium paid): blank is stored as null, which is different from 0.
function onAnnuityOptional(path,val){
  setPath(path, val===''||val==null?null:Math.max(0,+val||0));
  recomputeDebounced(); saveDebounced();
}
// Selects that change which fields are shown (tax treatment) or passing-benefit option re-render the cards.
function onAnnuitySelect(path,val){ setPath(path,val); renderIncomeForms(); recompute(); saveDebounced(); }
function removeBrokerage(i,bi){
  state.people[i].brokerage.splice(bi,1);
  renderIncomeForms(); recompute(); saveDebounced();
}
