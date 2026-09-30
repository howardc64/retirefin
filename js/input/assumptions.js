'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / ASSUMPTIONS — speculative future tax-threshold scenario
// (spec §4.5). Inflation and passing-age sliders live in household.js
// since they're part of the same Assumptions panel; SCGL is a single
// plain field wired directly in the HTML via onNumberInput. The AUM fee (below SCGL) is a
// mode select + value, rendered by renderAumFee().
// ═══════════════════════════════════════════════════════════════
// Spec §4.5: a speculative, off-by-default "future tax threshold change" scenario. Currently only
// covers the NIIT exemption threshold (start year + today's-$ threshold per filing status); Social
// Security's taxation threshold is a deliberate placeholder ("Not implemented yet" in the spec).
function renderFutureTaxPanel(){
  const ft=state.futureTax||{};
  let html=`<div class="field full">
    <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4">
      <input type="checkbox" style="flex:0 0 auto" ${ft.enabled?'checked':''} onclick="onFutureTaxToggle(this.checked)"> Model a speculative future tax-threshold change
    </label>
  </div>`;
  if(ft.enabled){
    html+=`<div class="item-note" style="margin-top:-6px">Speculative — not current law. Lets you test how the projection would change if Congress enacted a new threshold.</div>
    <div class="field"><label>NIIT threshold change: start year</label>
      <input type="number" min="${THIS_YEAR}" max="${THIS_YEAR+80}" step="1" value="${ft.niitStartYear}" oninput="onNumberInput('futureTax.niitStartYear', this.value)"></div>
    <div class="field"><label>Single filing threshold (today's $)</label>
      <input type="number" class="money" min="0" step="5000" value="${ft.niitSingle}" oninput="onNumberInput('futureTax.niitSingle', this.value)"></div>
    <div class="field"><label>Married filing threshold (today's $)</label>
      <input type="number" class="money" min="0" step="5000" value="${ft.niitMarried}" oninput="onNumberInput('futureTax.niitMarried', this.value)"></div>`;
  }
  document.getElementById('futureTaxPanel').innerHTML=html;
}
function onFutureTaxToggle(checked){
  setPath('futureTax.enabled', checked);
  renderFutureTaxPanel();
  recompute();
  saveDebounced();
}

// AUM fee (household, Assumptions panel, below SCGL): charged on the AUM balance = the sum of the balances of every
// portfolio whose AUM box is checked. Mode '% AUM balance' (value = percent) or 'Fixed $ / yr' (today's $).
function renderAumFee(){
  const f=state.aumFee||{mode:'pct',value:0}, fixed=f.mode==='fixed';
  const sel=document.getElementById('aumFeeMode'), inp=document.getElementById('aumFeeValue');
  if(!sel||!inp) return;
  sel.value=fixed?'fixed':'pct';
  inp.step=fixed?100:0.05;
  inp.value=f.value!=null?f.value:0;
}
function onAumFeeMode(mode){
  setPath('aumFee.mode', mode);
  setPath('aumFee.value', 0);   // units change (% vs $), so start fresh
  renderAumFee(); recompute(); saveDebounced();
}

// Long Term Care (Assumptions panel): per person start age (own age) + cost + new living expenses once LTC starts.
function renderLtcPanel(){
  const l=state.ltc||{}, n=state.filingStatus==='married'?2:1;
  let html=`<div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4">
    <input type="checkbox" style="flex:0 0 auto" ${l.enabled?'checked':''} onclick="onLtcToggle(this.checked)"> Long Term Care (LTC)</label></div>`;
  if(l.enabled){
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
  document.getElementById('ltcPanel').innerHTML=html;
}
function onLtcToggle(checked){
  setPath('ltc.enabled', checked);
  renderLtcPanel(); recompute(); saveDebounced();
}

// Living expenses input: while the 1st LTC living expenses has not been set by the user it follows this value.
function onLivingInput(val){
  onNumberInput('living', val);
  const el=document.getElementById('ltcLiving1');
  if(el && state.ltc && state.ltc.living1==null) el.value=state.living||0;
}
