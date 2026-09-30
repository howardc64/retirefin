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
  const rowCount = 1 /*name header*/ + 2 /*wage+ss*/ + 1 /*pension*/ + 1 /*rental*/ + 1 /*brokerage*/ + 1 /*ira*/ + 1 /*roth*/;

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
function onPortfolioName(pid,bi,val,inputEl){
  setPath(pid+'.brokerage.'+bi+'.name', val);
  // Update the card title in place (a full re-render would drop input focus), then refresh the charts.
  const title=inputEl.closest('.portfolio-card').querySelector('.pf-title');
  if(title) title.textContent=val.trim()||('Portfolio '+(bi+1));
  recomputeDebounced(); saveDebounced();
}
function addBrokerage(i){
  if(!Array.isArray(state.people[i].brokerage)) state.people[i].brokerage=[];
  state.people[i].brokerage.push(defaultBrokeragePortfolio(0, state.people[i].brokerage.length+1));
  renderIncomeForms(); recompute(); saveDebounced();
}
function removeBrokerage(i,bi){
  state.people[i].brokerage.splice(bi,1);
  renderIncomeForms(); recompute(); saveDebounced();
}
