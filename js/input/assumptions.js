'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / ASSUMPTIONS — speculative future tax-threshold scenario
// (spec §4.5). Inflation and passing-age sliders live in household.js
// since they're part of the same Assumptions panel. SCGL, the AUM fee, LTC and the speculative
// scenario are each a card (assumpCard, controls.js) with an Enable checkbox on the left and a
// Hide checkbox on the right: renderScglPanel(), renderAumFee(), renderLtcPanel(), renderFutureTaxPanel().
// Enable (state.scglEnabled / aumFee.enabled / ltc.enabled / futureTax.enabled) decides whether the
// item is used in the projection; Hide (state.ui.assumpHide[key]) only collapses the card body.
// ═══════════════════════════════════════════════════════════════
// Spec §4.5: a speculative, off-by-default "future tax threshold change" scenario. Currently only
// covers the NIIT exemption threshold (start year + today's-$ threshold per filing status); Social
// Security's taxation threshold is a deliberate placeholder ("Not implemented yet" in the spec).
function renderFutureTaxPanel(){
  const ft=state.futureTax||{};
  // The body is always rendered; Hide alone decides whether it is shown (like every other card), Enable only whether it is used.
  let body='';
  {
    body=`<div class="item-note" style="margin-top:-2px">Speculative — not current law. Lets you test how the projection would change if Congress enacted a new threshold.</div>
    <div class="field"><label>NIIT threshold change: start year</label>
      <input type="number" min="${THIS_YEAR}" max="${THIS_YEAR+80}" step="1" value="${ft.niitStartYear}" oninput="onNumberInput('futureTax.niitStartYear', this.value)"></div>
    <div class="field"><label>Single filing threshold (today's $)</label>
      <input type="number" class="money" min="0" step="5000" value="${ft.niitSingle}" oninput="onNumberInput('futureTax.niitSingle', this.value)"></div>
    <div class="field"><label>Married filing threshold (today's $)</label>
      <input type="number" class="money" min="0" step="5000" value="${ft.niitMarried}" oninput="onNumberInput('futureTax.niitMarried', this.value)"></div>`;
  }
  document.getElementById('futureTaxPanel').innerHTML=assumpCard('future','Model a speculative future tax-threshold change','futureTax.enabled',!!ft.enabled,body);
}
// AUM fee (household, Assumptions panel, below SCGL): charged on the AUM balance = the sum of the balances of every
// portfolio whose AUM box is checked. Mode '% AUM balance' (value = percent) or 'Fixed $ / yr' (today's $).
function renderAumFee(){
  const f=state.aumFee||{mode:'pct',value:0}, fixed=f.mode==='fixed';
  const body=`<div class="field full">
      <div class="arow">
        <select id="aumFeeMode" onchange="onAumFeeMode(this.value)">
          <option value="pct">% AUM balance</option>
          <option value="fixed">Fixed $ / yr</option>
        </select>
        <input type="number" class="money" id="aumFeeValue" min="0" step="0.05" value="0" oninput="onNumberInput('aumFee.value', this.value)">
      </div>
    </div>
    <div class="item-note">Advisory / management fee. <strong>AUM balance</strong> = the sum of the balances of every <em>Living expense &amp; income</em> brokerage portfolio that has its <em>AUM</em> box checked (never an IDGT, pre-tax IRA or Roth IRA; the portfolio must also be enabled, inside its age range and funded). The fee is that balance × the percentage, or a fixed dollar amount per year (entered in today's $, held flat in nominal terms so it shrinks in today's $ with inflation). It is an expense paid like living expenses — household income, then dividends, then asset sales — and is charged on the AUM portfolios pro rata to balance, but as an expense it is paid only by the portfolios with <em>Pay expenses</em> checked, not by the account it is charged on. The Medicare IRMAA surcharge is also always paid as a household expense, so it needs no setting here.</div>`;
  document.getElementById('aumPanel').innerHTML=assumpCard('aum','AUM fee','aumFee.enabled',f.enabled!==false,body);
  const sel=document.getElementById('aumFeeMode'), inp=document.getElementById('aumFeeValue');
  sel.value=fixed?'fixed':'pct';
  inp.step=fixed?100:0.05;
  inp.value=f.value!=null?f.value:0;
  syncAssumpEnable();
}
// SCGL carryforward card (Enable / Hide like the others). The amount is kept while Enable is off but ignored by the projection.
function renderScglPanel(){
  const body=`<div class="field full"><label>Suspended Capital-Gain Loss carryforward (SCGL, today's $)</label>
      <input type="number" class="money" id="scglInput" min="0" step="1000" value="${Number(state.scgl)||0}" oninput="onNumberInput('scgl', this.value)"></div>`;
  document.getElementById('scglPanel').innerHTML=assumpCard('scgl','SCGL','scglEnabled',state.scglEnabled!==false,body);
  syncAssumpEnable();
}
// Grey out the SCGL / AUM inputs while their Enable box is unchecked (values are kept, just not used).
function syncAssumpEnable(){
  const set=(ids,on)=>ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled=!on; });
  set(['scglInput'], state.scglEnabled!==false);
  set(['aumFeeMode','aumFeeValue'], !(state.aumFee&&state.aumFee.enabled===false));
  set(['swapYears'], !!state.basisSwap);
  set(['stateTaxSel'], !!(state.stateTax&&state.stateTax.enabled));
}
function onAumFeeMode(mode){
  setPath('aumFee.mode', mode);
  setPath('aumFee.value', 0);   // units change (% vs $), so start fresh
  renderAumFee(); recompute(); saveDebounced();
}

// Expense shortfall withdrawal order (Assumptions panel, below the AUM fee). Off: the built-in order. On: an ordered list of steps, each naming ONE asset;
// when household income and dividends do not cover the year's expenses, the steps are tried top to bottom, each taking what is still needed from its asset
// (projection.js, runWaterfall). Assets not listed are never drawn on. Step keys: 'pf:<portfolio id>' | 'ira:<person id>' | 'roth:<person id>' | 're:<property id>'.
const WO_TAX_NOTE={
  pf:'Sold: the gain share of the sale is realized long-term capital gain (SCGL, qualified brackets, NIIT and Social Security taxation all apply). Not available for IDGT portfolios, which never pay expenses.',
  ira:'Withdrawn: taxed as ordinary income (the tax on it is itself an expense, so slightly more is drawn).',
  roth:'Withdrawn: tax-free.',
  re:'Sold whole at the start of the year (a sell event): the gain over the basis and exemption is realized long-term capital gain; whatever the shortfall does not use moves to the property\'s designated portfolio.'
};
function withdrawAssets(){
  const n=state.filingStatus==='married'?2:1, out=[];
  (state.people||[]).slice(0,n).forEach((p,i)=>{
    const who=displayPersonName(p,i);
    (p.brokerage||[]).forEach((b,bi)=>out.push({key:'pf:'+b.id, type:'pf', label:who+' — '+((b.name&&b.name.trim())||('Portfolio '+(bi+1)))+(b.idgt?' (IDGT)':''),
      warn:b.enabled===false?'This portfolio is not enabled — the step is skipped.':(!b.payExp?'An IDGT portfolio does not pay expenses — the step is skipped.':'')}));
    out.push({key:'ira:'+p.id, type:'ira', label:who+' — Pre-tax IRA / 401(k)', warn:(p.ira&&p.ira.enabled)?'':'This account is not enabled — the step is skipped.'});
    out.push({key:'roth:'+p.id, type:'roth', label:who+' — Roth IRA', warn:(p.roth&&p.roth.enabled)?'':'This account is not enabled — the step is skipped.'});
    (p.realEstate||[]).forEach((r,ri)=>out.push({key:'re:'+r.id, type:'re', label:who+' — '+((r.name&&r.name.trim())||('Property '+(ri+1)))+' (sell)',
      warn:r.enabled===false?'This property is not enabled — the step is skipped.':''}));
  });
  return out;
}
// The built-in order as steps: every portfolio that pays expenses, then the pre-tax IRAs, then the Roth IRAs (no real estate).
function defaultWithdrawKeys(){
  const list=withdrawAssets();
  const pf=list.filter(a=>a.type==='pf'&&!a.warn).map(a=>a.key);
  return pf.concat(list.filter(a=>a.type==='ira'&&!a.warn).map(a=>a.key), list.filter(a=>a.type==='roth'&&!a.warn).map(a=>a.key));
}
function woState(){ if(!state.withdrawOrder||!Array.isArray(state.withdrawOrder.steps)) state.withdrawOrder={enabled:!!(state.withdrawOrder&&state.withdrawOrder.enabled), steps:[]}; return state.withdrawOrder; }
function renderWithdrawOrderPanel(){
  const el=document.getElementById('withdrawPanel'); if(!el) return;
  const wo=woState(), assets=withdrawAssets(), byKey={}; assets.forEach(a=>{ byKey[a.key]=a; });
  const used={}; wo.steps.forEach(s=>{ used[s.asset]=(used[s.asset]||0)+1; });
  const dis=wo.enabled?'':' disabled';
  const rows=wo.steps.map((s,i)=>{
    const a=byKey[s.asset];
    const opts=(a?'':`<option value="${escAttr(s.asset)}" selected>(no longer available)</option>`)+
      assets.map(x=>`<option value="${escAttr(x.key)}" ${x.key===s.asset?'selected':''} ${(used[x.key]&&x.key!==s.asset)?'disabled':''}>${escHtml(x.label)}</option>`).join('');
    const note=a?(a.warn||WO_TAX_NOTE[a.type]):'This asset no longer exists, or belongs to a person not in the plan — the step is skipped. Pick another asset or delete the step.';
    const bad=!a||!!a.warn;
    return `<div class="field full" style="margin-bottom:6px">
      <div class="arow"><span style="flex:0 0 18px;font-weight:600;font-size:12px">${i+1}.</span>
        <select style="flex:1 1 0;width:auto;min-width:0" aria-label="Withdrawal step ${i+1}" onchange="onWithdrawStepAsset(${i},this.value)"${dis}>${opts}</select>
        <button type="button" class="btn" style="padding:2px 7px" title="Move up" ${(i===0||!wo.enabled)?'disabled':''} onclick="moveWithdrawStep(${i},-1)">▲</button>
        <button type="button" class="btn" style="padding:2px 7px" title="Move down" ${(i===wo.steps.length-1||!wo.enabled)?'disabled':''} onclick="moveWithdrawStep(${i},1)">▼</button>
        <button type="button" class="btn btn-danger" style="padding:2px 7px" title="Delete this step"${dis} onclick="removeWithdrawStep(${i})">✕</button></div>
      <div class="item-note" style="margin:2px 0 0 24px;${bad?'color:#b45309':''}">${escHtml(note)}</div></div>`;
  }).join('');
  const free=assets.some(a=>!used[a.key]);
  const body=`<div class="item-note" style="margin-top:-2px">When household income and dividends do not cover the year's expenses (living, LTC, IRMAA, AUM fee and income tax), the shortfall is taken from these assets <strong>in this order</strong>, each step taking what is still needed from its one asset until the shortfall is met. Assets not listed are never drawn on. With this box unchecked the built-in order is used: Living expense &amp; income portfolios (shared pro rata), then the pre-tax IRAs, then the Roth IRAs.</div>
    ${rows||'<div class="item-note">No steps yet — the shortfall would go unfunded. Add a step to choose where it comes from.</div>'}
    <div class="field full"><div class="arow">
      <button type="button" class="btn" ${(wo.enabled&&free)?'':'disabled'} onclick="addWithdrawStep()">＋ Add step</button>
      <button type="button" class="btn" ${wo.enabled?'':'disabled'} title="Replace the steps with the built-in order" onclick="resetWithdrawSteps()">Reset to built-in order</button></div></div>
    <div class="item-note"><strong>Selling real estate</strong> is a sale of the whole property, even if only a little is needed: its gain is taxed as long-term capital gain in the year of the sale, the sale happens at the start of the year at that year's value, and the property is gone afterwards.</div>`;
  el.innerHTML=assumpCard('order','Expense shortfall withdrawal order','withdrawOrder.enabled',!!wo.enabled,body);
}
// Re-draw unless the person is working inside the card (a re-draw would close the open drop-down); used after every recompute so asset names stay current.
function refreshWithdrawOrderPanel(){
  const el=document.getElementById('withdrawPanel'), a=document.activeElement;
  if(el&&a&&el.contains(a)&&a.tagName!=='BODY') return;
  renderWithdrawOrderPanel();
}
function woChanged(){ renderWithdrawOrderPanel(); recompute(); saveDebounced(); }
function onWithdrawOrderEnabled(){ const wo=woState(); if(wo.enabled&&!wo.steps.length) wo.steps=defaultWithdrawKeys().map(k=>({id:uid(),asset:k})); renderWithdrawOrderPanel(); }
function onWithdrawStepAsset(i,key){ const wo=woState(); if(wo.steps[i]){ wo.steps[i].asset=key; woChanged(); } }
function addWithdrawStep(){
  const wo=woState(), used={}; wo.steps.forEach(s=>{ used[s.asset]=1; });
  const next=withdrawAssets().find(a=>!used[a.key]); if(!next) return;
  wo.steps.push({id:uid(),asset:next.key}); woChanged();
}
function removeWithdrawStep(i){ woState().steps.splice(i,1); woChanged(); }
function moveWithdrawStep(i,d){ const st=woState().steps, j=i+d; if(j<0||j>=st.length) return; const t=st[i]; st[i]=st[j]; st[j]=t; woChanged(); }
function resetWithdrawSteps(){ woState().steps=defaultWithdrawKeys().map(k=>({id:uid(),asset:k})); woChanged(); }

// Asset / basis swap card (Enable / Hide like the others; off by default). One input: how many years before the last passing to swap (the swap after the
// first passing, for a married household, needs no value). See projection.js, "Asset / basis swap".
function renderSwapPanel(){
  const yrs=Math.max(1,Math.round(Number(state.basisSwapYears)||BASIS_SWAP_YEARS_DEFAULT));
  const body=`<div class="field full"><label>Swap this many years before the last passing</label>
      <input type="number" id="swapYears" min="1" max="60" step="1" value="${yrs}" oninput="onNumberInput('basisSwapYears', this.value)"></div>
    <div class="item-note">Swaps <em>Living expense &amp; income</em> portfolio assets, value for value, with <em>IDGT</em> assets, and the basis moves in proportion to the assets traded: the IDGT ends up with the high-basis assets and the living portfolio with the low-basis ones, which step up at the last passing. It is done once, that many years before the last person passes (single or married). If married, it is also done the year after the first person passes, when that person's portfolio steps up (no value needed). A swap only happens where the IDGT's assets have a lower basis % than the living portfolio's; the amount is the smaller of the two values. A swap is between portfolios held by the same person: a portfolio marked <em>Joint owned with spouse</em> is held by the spouse once its owner has passed (one without it is gone, so it cannot be swapped).</div>`;
  document.getElementById('swapPanel').innerHTML=assumpCard('swap','Asset / basis swap','basisSwap',!!state.basisSwap,body);
  syncAssumpEnable();
}
// State income tax card (Enable / Hide like the others; off by default). One choice: California or Washington. The tax is paid as a household
// expense (like federal tax) and is drawn on the Total Income Tax chart as a green dashed line stacked above the tax bands.
function renderStateTaxPanel(){
  const st=state.stateTax||{enabled:false,state:'CA'};
  const opts=STATE_TAX_OPTIONS.map(([c,n])=>`<option value="${c}" ${st.state===c?'selected':''}>${n}</option>`).join('');
  const body=`<div class="field full"><label>State</label>
      <select id="stateTaxSel" onchange="onStateTaxSelect(this.value)">${opts}</select></div>
    <div class="item-note"><strong>California</strong>: the 2025 state brackets (1%–12.3%, plus 1% over $1M) on federal AGI less taxable Social Security (California does not tax it) and the larger of the state standard deduction and the Long Term Care medical itemized deduction (cost above 7.5% of that income), less the personal and age-65 exemption credits; capital gains are taxed as ordinary income. <strong>Washington</strong>: no income tax, but a capital-gains excise tax of 7% on realized long-term gains from portfolio sales above $278,000 a year (one deduction per couple) and 9.9% on the part of the taxable gain above $1M; real estate and retirement accounts are exempt. State figures are held flat in today's $ (the states index them). The tax is paid as a household expense, like federal tax, and is not part of Total Tax (TT) or the effective rate.</div>`;
  document.getElementById('stateTaxPanel').innerHTML=assumpCard('state','State income tax','stateTax.enabled',!!st.enabled,body);
  syncAssumpEnable();
}
function onStateTaxSelect(code){ setPath('stateTax.state', code); chartYMax.tax=null; recompute(); saveDebounced(); }

// Long Term Care (Assumptions panel): per person start age (own age) + cost + new living expenses once LTC starts.
function renderLtcPanel(){
  const l=state.ltc||{}, n=state.filingStatus==='married'?2:1;
  let html='';   // always rendered; Hide alone decides whether it is shown (Enable only decides whether it is used)
  {
    for(let i=0;i<n;i++){
      const L=l.people[i], b=personAgeBounds(i), nm=escHtml(state.people[i].name||('Person '+(i+1)));
      html+=`${n>1?`<div class="field full"><label><strong id="ltcName_${i}">${nm}</strong></label></div>`:''}
      <div class="field full"><label>LTC start age</label>
        ${pairHtml('ltcStart_'+i,'ltc.people.'+i+'.startAge',b[0],b[1],1,Math.min(b[1],Math.max(b[0],Number(L.startAge)||b[0])),{kind:'person',i})}</div>
      <div class="field full"><label>LTC cost ($/yr, today's $)</label>
        <input type="number" class="money" min="0" step="1000" value="${L.cost||0}" oninput="onNumberInput('ltc.people.${i}.cost', this.value)"></div>`;
    }
    html+=`<div class="field full"><label>${n>1?'1st LTC living expenses':'LTC living expenses'} ($/yr, today's $)</label>
      <input type="number" class="money" id="ltcLiving1" min="0" step="1000" value="${l.living1!=null?l.living1:ltcLiving1Default(n>1)}" oninput="onNumberInput('ltc.living1', this.value)"></div>`;
    if(n>1) html+=`<div class="field full"><label>2nd LTC living expenses ($/yr, today's $)</label>
      <input type="number" class="money" min="0" step="1000" value="${l.living2!=null?l.living2:LTC_LIVING2_DEFAULT}" oninput="onNumberInput('ltc.living2', this.value)"></div>`;
  }
  document.getElementById('ltcPanel').innerHTML=assumpCard('ltc','Long Term Care (LTC)','ltc.enabled',!!l.enabled,html);
}

// Living expenses input: while the 1st LTC living expenses has not been set by the user it follows this value.
function onLivingInput(val){
  onNumberInput('living', val);
  const el=document.getElementById('ltcLiving1');
  if(el && state.ltc && state.ltc.living1==null) el.value=ltcLiving1Default(state.filingStatus==='married');
}
