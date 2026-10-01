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
      <label><input type="checkbox" ${enabled?'checked':''} onclick="onEnableToggle('${enablePath}', this.checked)"> ${title}</label>
      <div class="item-head-right">
        ${extraRight||''}
        <label class="hide-toggle" title="Collapse this card to save space — data is still used for compute and display if Enabled"><input type="checkbox" ${hidden?'checked':''} onclick="onHideToggle('${hidePath}', this.checked, this.closest('.item'))"> Hide</label>
      </div>
    </div>`;
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
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${item.bene?'checked':''} onchange="onBeneToggle('${checkboxPath}.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
      </div>
    </div>`;
}

// ── Section Hide checkbox (chart sections + Assumptions panel) ──
// Display-only, but part of `state` (`state.ui.hiddenSections[key]`, key = the checkbox's `data-hide-key`), so it is saved to
// file / autosave, restored on load and reset to the default (core/state.js) on Reset. Ticking Hide collapses everything below
// the header (up to the next .sec-head) so only the header and its checkbox remain. Compute and charts keep updating while hidden.
// The checkbox and the collapsed/expanded section are ALWAYS derived from state (syncSectionHide) — never from what the browser
// happens to have restored into the checkbox — so "checked" and "hidden" cannot disagree.
function sectionHeadOf(cb){ return cb.closest('.sec-head, .panel-title'); }
function applySectionHide(head, hidden){
  head.classList.toggle('is-hidden',hidden);
  for(let el=head.nextElementSibling; el && !el.classList.contains('sec-head'); el=el.nextElementSibling)
    el.classList.toggle('sec-hidden',hidden);
}
function onSectionHide(cb){
  const head=sectionHeadOf(cb), key=cb.dataset.hideKey; if(!head||!key) return;
  if(!state.ui) state.ui={hiddenSections:defaultHiddenSections()};
  state.ui.hiddenSections[key]=cb.checked;
  applySectionHide(head,cb.checked);
  if(!cb.checked && typeof resizeAllCharts==='function') resizeAllCharts();
  saveDebounced();
}
// Expand every section without touching state or the checkboxes. renderAll() uses this so charts are (re)built while their
// containers are visible (a chart built inside a display:none container has no size), then calls syncSectionHide().
function expandAllSections(){
  document.querySelectorAll('.hide-cb input[data-hide-key]').forEach(cb=>{ const h=sectionHeadOf(cb); if(h) applySectionHide(h,false); });
}
// Put every section Hide checkbox and its collapsed/expanded section into the state held in `state.ui.hiddenSections`.
function syncSectionHide(){
  const hs=(state.ui&&state.ui.hiddenSections)||defaultHiddenSections();
  document.querySelectorAll('.hide-cb input[data-hide-key]').forEach(cb=>{
    const head=sectionHeadOf(cb); if(!head) return;
    const hidden=!!hs[cb.dataset.hideKey];
    cb.checked=hidden;
    applySectionHide(head,hidden);
  });
  if(typeof resizeAllCharts==='function') resizeAllCharts();
}

// ── Paired slider + value input (the two always track each other) ──
// `bounds` = {kind:'person',i} | {kind:'ltc'} | {kind:'ira',i} marks a range whose min/max are recomputed from state
// (refreshPairBounds) whenever ages, passing ages or the IRA balance change.
function pairHtml(id, path, min, max, step, value, bounds, moneyCls){
  const b=bounds?` data-bkind="${bounds.kind}" data-bi="${bounds.i==null?0:bounds.i}"`:'';
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
  return null;
}
function refreshPairBounds(){
  document.querySelectorAll('input[type=range][data-bkind]').forEach(el=>{
    const b=pairBounds(el); if(!b) return;
    el.min=b[0]; el.max=b[1];
    const n=document.getElementById(el.id.replace(/_r$/,'_n'));
    if(n) n.min=b[0];
    if(n && +n.value>=0 && +el.value!==+n.value && el.dataset.bkind!=='ira') el.value=n.value;
    if(el.dataset.bkind==='ira' && n) el.value=n.value;
  });
}

// ── Asset Value chart "devalue" sliders (state.ui.ltcgDevalue / ordDevalue, % 0–100) ──
// Display-only haircuts, but saved with the plan. Only the two asset charts depend on them, so a drag redraws just those
// (no projection recompute).
function onDevalueInput(key,val){
  if(!state.ui) state.ui={hiddenSections:defaultHiddenSections()};
  state.ui[key]=+val;
  const lbl=document.getElementById(key+'Lbl'); if(lbl) lbl.textContent=(+val)+'%';
  window.liveDrag=true; buildAssetChart(); buildIdgtChart(); window.liveDrag=false;
  saveDebounced();
}
// Put both sliders and their labels into the state held in `state.ui` (renderAll, after load/reset).
function syncDevalueSliders(){
  const ui=state.ui||{};
  [['ltcgDevalue',DEFAULT_LTCG_DEVALUE],['ordDevalue',DEFAULT_ORD_DEVALUE],['ltcgDevalue2',DEFAULT_LTCG_DEVALUE2],['ordDevalue2',DEFAULT_ORD_DEVALUE2]].forEach(([key,dflt])=>{
    const v=Number.isFinite(Number(ui[key]))&&ui[key]!=null?Number(ui[key]):dflt;
    const el=document.getElementById(key), lbl=document.getElementById(key+'Lbl');
    if(el) el.value=v; if(lbl) lbl.textContent=v+'%';
  });
}
