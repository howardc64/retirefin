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
    <div class="item-note">Advisory / management fee. <strong>AUM balance</strong> = the sum of the balances of every brokerage portfolio, pre-tax IRA and Roth IRA that has its <em>AUM</em> box checked (portfolios must also be enabled, inside their age range and funded). The fee is that balance × the percentage, or a fixed dollar amount per year (entered in today's $, held flat in nominal terms so it shrinks in today's $ with inflation). It is an expense paid like living expenses — household income, then dividends, then asset sales — and is charged on the AUM accounts pro rata to balance, but as an expense it is paid only by the portfolios with <em>Pay expenses</em> checked, not by the account it is charged on. The Medicare IRMAA surcharge is also always paid as a household expense, so it needs no setting here.</div>`;
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
}
function onAumFeeMode(mode){
  setPath('aumFee.mode', mode);
  setPath('aumFee.value', 0);   // units change (% vs $), so start fresh
  renderAumFee(); recompute(); saveDebounced();
}

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
      <input type="number" class="money" id="ltcLiving1" min="0" step="1000" value="${l.living1!=null?l.living1:(state.living||0)}" oninput="onNumberInput('ltc.living1', this.value)"></div>`;
    if(n>1) html+=`<div class="field full"><label>2nd LTC living expenses ($/yr, today's $)</label>
      <input type="number" class="money" min="0" step="1000" value="${l.living2||0}" oninput="onNumberInput('ltc.living2', this.value)"></div>`;
  }
  document.getElementById('ltcPanel').innerHTML=assumpCard('ltc','Long Term Care (LTC)','ltc.enabled',!!l.enabled,html);
}

// Living expenses input: while the 1st LTC living expenses has not been set by the user it follows this value.
function onLivingInput(val){
  onNumberInput('living', val);
  const el=document.getElementById('ltcLiving1');
  if(el && state.ltc && state.ltc.living1==null) el.value=state.living||0;
}
