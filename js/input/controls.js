'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / CONTROLS — small reusable UI pieces shared across several
// income-source cards (age-range selector, annual-change selector,
// item enable/collapse toggle) plus the two generic input handlers
// almost every field in the input column wires up to.
// ═══════════════════════════════════════════════════════════════
function onFieldInput(path,val){ setPath(path,val); recomputeDebounced(); saveDebounced(); }
function onNumberInput(path,val){ setPath(path, val===''?0:+val); recomputeDebounced(); saveDebounced(); }

// `fixedLabel` lets a card word the no-growth option for its own context (e.g. Pension: "no COLA").
function renderChangeRow(path, change, defaultPct, fixedLabel){
  const showNum = change.mode==='offset'||change.mode==='custom';
  return `
    <div class="field full"><label>Annual change</label>
      <div class="arow">
        <select onchange="onChangeMode('${path}', this.value)">
          <option value="fixed" ${change.mode==='fixed'?'selected':''}>${fixedLabel||'Fixed $ (no growth)'}</option>
          <option value="inflation" ${change.mode==='inflation'?'selected':''}>Tracks inflation</option>
          <option value="offset" ${change.mode==='offset'?'selected':''}>Inflation &plusmn; X%</option>
          <option value="custom" ${change.mode==='custom'?'selected':''}>Custom annual %</option>
        </select>
        <input type="number" step="0.25" style="display:${showNum?'inline-block':'none'}" value="${change.value!=null?change.value:(defaultPct||0)}" oninput="onNumberInput('${path}.value', this.value);" placeholder="%">
      </div>
    </div>`;
}
function onChangeMode(path, mode){
  setPath(path+'.mode', mode);
  renderIncomeForms();
  recompute(); saveDebounced();
}

function renderAgeRangeRow(path, ar, startOpts, endOpts){
  const showStartNum = ar.startMode==='custom';
  const showEndNum = ar.endMode==='custom';
  const opt=(list,cur)=>list.map(o=>`<option value="${o.value}" ${o.value===cur?'selected':''}>${o.label}</option>`).join('');
  return `
    <div class="field"><label>Start</label>
      <div class="arow">
        <select onchange="onAgeRangeMode('${path}','startMode',this.value)">${opt(startOpts,ar.startMode)}</select>
        <input type="number" min="0" max="110" style="display:${showStartNum?'inline-block':'none'}" value="${ar.startVal||0}" oninput="onNumberInput('${path}.startVal', this.value);">
      </div>
    </div>
    <div class="field"><label>End</label>
      <div class="arow">
        <select onchange="onAgeRangeMode('${path}','endMode',this.value)">${opt(endOpts,ar.endMode)}</select>
        <input type="number" min="0" max="110" style="display:${showEndNum?'inline-block':'none'}" value="${ar.endVal||0}" oninput="onNumberInput('${path}.endVal', this.value);">
      </div>
    </div>`;
}
function onAgeRangeMode(path, key, val){
  setPath(path+'.'+key, val);
  renderIncomeForms();
  recompute(); saveDebounced();
}

function toggleItem(headerEl){
  const body=headerEl.nextElementSibling;
  if(body) body.classList.toggle('open');
}
// Enable = whether this card's data is used for compute/display. Independent of Hide (below) —
// enabling/disabling never changes whether the card's body is visible.
function onEnableToggle(path, checked){
  setPath(path, checked);
  // SCGL / AUM fee / portfolio-withdraw inputs are greyed while their Enable box is off.
  if(path==='scglEnabled'||path==='aumFee.enabled'||path==='basisSwap'||path==='stateTax.enabled'||path==='pfWithdraw.enabled') syncAssumpEnable();
  if(path==='withdrawOrder.enabled') onWithdrawOrderEnabled();   // seeds the built-in order the first time it is switched on
  if(path==='stateTax.enabled') chartYMax.tax=null;   // re-fit the Total Income Tax chart so the new state-tax line is in view
  recompute(); saveDebounced();
}
// Hide = purely a display-space convenience: collapses the card body without touching whether
// its data is enabled/used. Enabled data keeps computing and appearing in every chart while its
// input card is hidden.
function onHideToggle(path, checked, itemEl){
  setPath(path, checked);
  const body=itemEl.querySelector('.item-body');
  if(body) body.classList.toggle('open', !checked);
  saveDebounced();
}
// Shared enable/hide header for an income-source card: an Enable checkbox (left, controls
// compute/display inclusion) and a Hide checkbox (right, controls only whether the body below
// is shown). `extraRight` is any further control (e.g. a brokerage portfolio's Remove button)
// placed between the two, so it always ends up next to Hide rather than crowding the title.
function cardHeader(title, enablePath, enabled, hidePath, hidden, extraRight){
  return `<div class="item-head">
      <label><input type="checkbox" ${enabled?'checked':''} onclick="onEnableToggle('${enablePath}', this.checked)"><span class="ttl">${title}</span></label>
      <div class="item-head-right">
        ${extraRight||''}
        <label class="hide-toggle" title="Collapse this card to save space — data is still used for compute and display if Enabled"><input type="checkbox" ${hidden?'checked':''} onclick="onHideToggle('${hidePath}', this.checked, this.closest('.item'))"> Hide</label>
      </div>
    </div>`;
}

// One feature of the Expenses and Tax & Optimizations panels (Long Term Care, withdrawal order, AUM fee, State income tax, SCGL, Asset / basis swap, Portfolio withdraw,
// Speculative future exemptions): a card with the same header as an income card — Enable (left: decides whether the feature is used in the projection) and
// Hide (right: collapses the card's body, never read by compute). `hideKey` names the flag in state.ui.assumpHide; a feature with no saved flag starts hidden.
function assumpHidden(hideKey){
  const h=state.ui&&state.ui.assumpHide;
  return (h&&h[hideKey]!==undefined)?!!h[hideKey]:(ASSUMP_HIDE_DEFAULT[hideKey]!==undefined?!!ASSUMP_HIDE_DEFAULT[hideKey]:true);
}
function featureBlock(hideKey, title, enablePath, enabled, bodyHtml){
  const hidden=assumpHidden(hideKey);
  return `<div class="item" data-assump="${hideKey}">
      ${cardHeader(title, enablePath, enabled, 'ui.assumpHide.'+hideKey, hidden)}
      <div class="item-body ${hidden?'':'open'}">${bodyHtml||''}</div>
    </div>`;
}
// Put the General, Expenses and Tax & Optimizations panels' Hide checkboxes and open/closed body into the state held in state.ui.assumpHide.general. (The Expenses / Tax & Optimizations
// features draw their own Hide state when they are rendered, featureBlock above.)
function syncAssumpHide(){
  if(!state.ui) state.ui={};
  if(!state.ui.assumpHide) state.ui.assumpHide={...ASSUMP_HIDE_DEFAULT};
  [['general','assumpGeneral','hideGeneral'],['expenses','assumpExpenses','hideExpenses'],['taxOpt','assumpTax','hideTaxOpt']].forEach(([k,cardId,cbId])=>{
    const card=document.getElementById(cardId), cb=document.getElementById(cbId); if(!card||!cb) return;
    const hidden=!!state.ui.assumpHide[k];
    cb.checked=hidden;
    const body=card.querySelector(':scope > .item-body'); if(body) body.classList.toggle('open',!hidden);
  });
}

// Reusable "simple" card for an income item with age range + annual change (pension/rental style)
function agedItemCard(pid, key, title, item, checkboxPath, fixedLabel, extraFieldsHtml){
  const married = state.filingStatus==='married';
  return `<div class="item">
      ${cardHeader(title, checkboxPath+'.enabled', item.enabled, checkboxPath+'.hidden', !!item.hidden)}
      <div class="item-body ${item.hidden?'':'open'}">
        <div class="field"><label>Annual amount (today's $)</label>
          <input type="number" class="money" min="0" step="500" value="${item.amount}" oninput="onNumberInput('${checkboxPath}.amount', this.value)"></div>
        <div></div>
        ${extraFieldsHtml||''}
        ${renderAgeRangeRow(checkboxPath+'.ar', item.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age'},{value:'passing',label:'Passing'}])}
        ${renderChangeRow(checkboxPath+'.change', item.change, 0, fixedLabel)}
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${item.bene?'checked':''} onchange="onBeneToggle('${checkboxPath}.bene', this.checked)"> Inherited by spouse</label></div>`:''}
      </div>
    </div>`;
}

// ── Paired slider + value input (the two always track each other) ──
// `bounds` = {kind:'person',i} | {kind:'ltc'} | {kind:'ira',i} marks a range whose min/max are recomputed from state
// (refreshPairBounds) whenever ages, passing ages or the IRA balance change.
function pairHtml(id, path, min, max, step, value, bounds, moneyCls){
  const b=bounds?` data-bkind="${bounds.kind}" data-bi="${bounds.i==null?0:bounds.i}"${bounds.ii!=null?` data-bii="${bounds.ii}"`:''}`:'';
  return `<div class="pair">
    <input type="range" id="${id}_r" min="${min}" max="${max}" step="${step}" value="${value}"${b} oninput="onPair('${id}','${path}',this.value,this)">
    <input type="number" id="${id}_n" class="${moneyCls?'money':''}" min="${min}" step="${step}" value="${value}" oninput="onPair('${id}','${path}',this.value,this)">
  </div>`;
}
function onPair(id, path, val, src){
  const v=val===''?0:+val;
  const r=document.getElementById(id+'_r'), n=document.getElementById(id+'_n');
  if(src!==r && r) r.value=v;
  if(src!==n && n) n.value=v;
  setPath(path, v); saveDebounced();
  if(src===r){ window.liveDrag=true; recompute(); window.liveDrag=false; } else recomputeDebounced();
}
function setPair(id, v){
  const r=document.getElementById(id+'_r'), n=document.getElementById(id+'_n');
  if(r) r.value=v; if(n) n.value=v;
}
function personAgeBounds(i){
  const p=state.people[i]; if(!p) return [0,100];
  const min=Math.ceil(currentAge(p)), max=Math.max(min, Math.round(Number(state.passing[p.id])||min));
  return [min,max];
}
function pairBounds(el){
  const kind=el.dataset.bkind, i=+el.dataset.bi;
  if(kind==='person') return personAgeBounds(i);
  if(kind==='ira') return [0, Math.max(0, Number(state.people[i].ira.balance)||0)];
  if(kind==='inhira'){ const x=state.people[i]&&state.people[i].inhIras&&state.people[i].inhIras[+el.dataset.bii]; return [0, Math.max(0, Number(x&&x.balance)||0)]; }   // an inherited pre-tax IRA: 0 … its balance
  return null;
}
function refreshPairBounds(){
  document.querySelectorAll('input[type=range][data-bkind]').forEach(el=>{
    const b=pairBounds(el); if(!b) return;
    el.min=b[0]; el.max=b[1];
    const n=document.getElementById(el.id.replace(/_r$/,'_n'));
    if(n) n.min=b[0];
    if(n && +n.value>=0 && +el.value!==+n.value && el.dataset.bkind!=='ira' && el.dataset.bkind!=='inhira') el.value=n.value;
    if((el.dataset.bkind==='ira'||el.dataset.bkind==='inhira') && n) el.value=n.value;
  });
}


// Long grey help notes inside cards (.item-note / .cn, 170+ characters) show two lines and a More / Less toggle, so the cards stay compact; the full text is one click away
// (and the Input Element hover helper still describes every control). One MutationObserver per input panel re-applies it after every re-render; it is idempotent.
function clampNotes(root){
  root.querySelectorAll('.item-note:not([data-clamp]), .cn:not([data-clamp])').forEach(n=>{
    n.setAttribute('data-clamp','1');
    if((n.textContent||'').trim().length<170) return;
    n.classList.add('clamp');
    const b=document.createElement('button');
    b.type='button'; b.className='note-more'; b.textContent='More';
    b.onclick=e=>{ e.stopPropagation(); const open=n.classList.toggle('open'); b.textContent=open?'Less':'More'; };
    n.after(b);
  });
}
function initNoteClamp(){
  const targets=['perPersonIncome','assumpGeneral','assumpExpenses','assumpTax'].map(id=>document.getElementById(id)).filter(Boolean);
  let raf=0;
  const run=()=>{ raf=0; targets.forEach(clampNotes); };
  const mo=new MutationObserver(()=>{ if(!raf) raf=requestAnimationFrame(run); });
  targets.forEach(el=>mo.observe(el,{childList:true,subtree:true}));
  run();
}
