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
  const rowCount = 1 /*name header*/ + 2 /*wage+ss*/ + 1 /*pension*/ + 1 /*rental*/ + 1 /*annuity*/ + 1 /*brokerage*/ + 1 /*real estate*/ + 1 /*ira*/ + 1 /*roth*/;

  let html='';
  for(let i=0;i<n;i++){
    const p=state.people[i];
    const pid='people.'+i;
    html+=`<div class="person-col"><h3 id="personIncomeHeader_${i}">${escHtml(p.name)}</h3>`;
    const builders={
      wage:()=>buildWageCard(pid, p), ss:()=>buildSSCard(pid, p, i, married), pension:()=>buildPensionCard(pid, p),
      rental:()=>buildRentalCard(pid, p), brokerage:()=>buildBrokerageCard(pid, i, p, married), realestate:()=>buildRealEstateCard(pid, i, p, married), annuity:()=>buildAnnuityCard(pid, i, p, married),
      ira:()=>buildIraCard(pid, p, married), roth:()=>buildRothCard(pid, p, married)
    };
    // Card order is state.ui.incomeOrder, the same for every person column (drag a card's ⋮⋮ handle to reorder; see below).
    normalizeIncomeOrderInState().forEach(key=>{ html+=dndCard(key, builders[key]()); });
    html+='</div>';
  }
  const incomeEl = document.getElementById('perPersonIncome');
  incomeEl.className = 'income-grid' + (married ? ' two-col' : '');
  incomeEl.style.gridTemplateRows = married ? `repeat(${rowCount}, auto)` : '';
  // autocomplete="off": stops a browser's form-state restore (reload / back) from putting a stale checkbox or value on top of the
  // state-derived one — e.g. a Hide box that is checked while its card is open.
  incomeEl.innerHTML=html.replace(/<input /g,'<input autocomplete="off" ');
  initIncomeDnd(incomeEl);
}

// ── Drag to reorder the income-source cards ──
// Each top-level card carries data-card="<key>" and a ⋮⋮ drag handle. The order lives in state.ui.incomeOrder and is shared by all
// person columns, so in a married plan dragging either spouse's card moves both spouses' cards of that type together (both are
// highlighted while dragging). The order is part of the saved plan. Display-only: no recompute. (HTML5 drag and drop: mouse / pen.)
function normalizeIncomeOrderInState(){
  if(!state.ui) state.ui={};
  state.ui.incomeOrder=normalizeIncomeOrder(state.ui.incomeOrder);
  return state.ui.incomeOrder;
}
function dndCard(key, html){
  html=html.replace('<div class="item"', `<div class="item" data-card="${key}"`);
  return html.replace(/(<div class="item-head"[^>]*>)/, '$1<span class="drag-handle" draggable="true" title="Drag to reorder (moves both spouses\' cards together)" onclick="event.stopPropagation()">⋮⋮</span>');
}
// Pure reorder: move `key` before / after `targetKey`; returns the new order.
function moveIncomeCard(order, key, targetKey, before){
  if(key===targetKey||!order.includes(key)||!order.includes(targetKey)) return order.slice();
  const out=order.filter(k=>k!==key), idx=out.indexOf(targetKey);
  out.splice(before?idx:idx+1, 0, key);
  return out;
}
let _dnd={key:null, target:null, before:true, wired:null};
function dndClear(root){
  root.querySelectorAll('.dnd-dragging,.dnd-over-top,.dnd-over-bottom').forEach(el=>el.classList.remove('dnd-dragging','dnd-over-top','dnd-over-bottom'));
}
function dndMark(root, key, cls){ root.querySelectorAll('.item[data-card="'+key+'"]').forEach(el=>el.classList.add(cls)); }
// The card under the pointer or, over a gap / column padding / heading, the vertically nearest card in that person column.
function dndCardAt(root,e){
  const t=e.target&&e.target.closest?e.target:null; if(!t) return null;
  const hit=t.closest('.item[data-card]'); if(hit) return hit;
  const col=t.closest('.person-col')||root.querySelector('.person-col'); if(!col) return null;
  let best=null, bd=Infinity;
  col.querySelectorAll(':scope > .item[data-card]').forEach(c=>{
    const r=c.getBoundingClientRect(), d=e.clientY<r.top?r.top-e.clientY:(e.clientY>r.bottom?e.clientY-r.bottom:0);
    if(d<bd){ bd=d; best=c; }
  });
  return best;
}
function initIncomeDnd(root){
  if(_dnd.wired===root) return;   // the container persists across re-renders; wire it once
  _dnd.wired=root;
  root.addEventListener('dragstart',e=>{
    const h=e.target.closest&&e.target.closest('.drag-handle'); if(!h) return;
    const card=h.closest('.item[data-card]'); if(!card) return;
    _dnd.key=card.dataset.card; _dnd.target=null;
    e.dataTransfer.effectAllowed='move';
    try{ e.dataTransfer.setData('text/plain',_dnd.key); e.dataTransfer.setDragImage(card,12,12); }catch(_){}
    requestAnimationFrame(()=>dndMark(root,_dnd.key,'dnd-dragging'));
  });
  root.addEventListener('dragover',e=>{
    if(!_dnd.key) return;
    const card=dndCardAt(root,e); if(!card) return;   // anywhere in the income grid counts — the gaps between cards snap to the nearest card
    e.preventDefault(); e.dataTransfer.dropEffect='move';
    const r=card.getBoundingClientRect(), before=e.clientY<r.top+r.height/2, key=card.dataset.card;
    if(_dnd.target===key&&_dnd.before===before) return;
    root.querySelectorAll('.dnd-over-top,.dnd-over-bottom').forEach(el=>el.classList.remove('dnd-over-top','dnd-over-bottom'));
    _dnd.target=key; _dnd.before=before;
    if(key!==_dnd.key) dndMark(root,key,before?'dnd-over-top':'dnd-over-bottom');
  });
  root.addEventListener('drop',e=>{
    if(!_dnd.key) return;
    e.preventDefault();
    const key=_dnd.key, target=_dnd.target, before=_dnd.before;
    _dnd.key=null; _dnd.target=null; dndClear(root);
    if(!target||target===key) return;
    state.ui.incomeOrder=moveIncomeCard(normalizeIncomeOrderInState(), key, target, before);
    renderIncomeForms(); saveDebounced();
  });
  root.addEventListener('dragend',()=>{ _dnd.key=null; _dnd.target=null; dndClear(root); });
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
  if(b.idgt) b.aum = false;   // the AUM fee is charged only on Living expense & income portfolios
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
// Real estate cards: cost basis in $ (blank = null = no unrealized gain), live-updating card title, add / remove.
function onRealEstateBasis(pid,ri,val){
  setPath(pid+'.realEstate.'+ri+'.basis', val===''||val==null?null:Math.max(0,+val||0));   // dollars; the projection caps it at the value
  recomputeDebounced(); saveDebounced();
}
function onRealEstateName(pid,ri,val,inputEl){
  setPath(pid+'.realEstate.'+ri+'.name', val);
  const title=inputEl.closest('.realestate-card').querySelector('.re-title');
  if(title) title.textContent=val.trim()||('Property '+(ri+1));
  recomputeDebounced(); saveDebounced();
}
function addRealEstate(i){
  if(!Array.isArray(state.people[i].realEstate)) state.people[i].realEstate=[];
  state.people[i].realEstate.push(defaultRealEstate(state.people[i].realEstate.length+1));
  renderIncomeForms(); recompute(); saveDebounced();
}
function removeRealEstate(i,ri){
  state.people[i].realEstate.splice(ri,1);
  renderIncomeForms(); recompute(); saveDebounced();
}
function removeBrokerage(i,bi){
  state.people[i].brokerage.splice(bi,1);
  renderIncomeForms(); recompute(); saveDebounced();
}
