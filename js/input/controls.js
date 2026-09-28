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
function agedItemCard(pid, key, title, item, checkboxPath, fixedLabel){
  const married = state.filingStatus==='married';
  return `<div class="item">
      ${cardHeader(title, checkboxPath+'.enabled', item.enabled, checkboxPath+'.hidden', !!item.hidden)}
      <div class="item-body ${item.hidden?'':'open'}">
        <div class="field"><label>Annual amount (today's $)</label>
          <input type="number" class="money" min="0" step="500" value="${item.amount}" oninput="onNumberInput('${checkboxPath}.amount', this.value)"></div>
        <div></div>
        ${renderAgeRangeRow(checkboxPath+'.ar', item.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age'},{value:'passing',label:'Passing'}])}
        ${renderChangeRow(checkboxPath+'.change', item.change, 0, fixedLabel)}
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${item.bene?'checked':''} onchange="onBeneToggle('${checkboxPath}.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
      </div>
    </div>`;
}
