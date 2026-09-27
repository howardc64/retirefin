'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / HOUSEHOLD — filing status, per-person name/birth date,
// current-age display, and the global passing-age & inflation
// sliders (spec §4.2, §4.5).
// ═══════════════════════════════════════════════════════════════
function renderPeopleSetup(){
  const married = state.filingStatus==='married';
  document.querySelectorAll('input[name=filingStatus]').forEach(r=>{ r.checked = r.value===state.filingStatus; });
  const wrap=document.getElementById('peopleSetup');
  wrap.classList.toggle('two-col', married);
  const n = married?2:1;
  let html='';
  for(let i=0;i<n;i++){
    const p=state.people[i];
    const age=currentAge(p).toFixed(1);
    html+=`<div class="person-col"><h3 id="personSetupHeader_${i}">${escHtml(p.name||('Person '+(i+1)))}</h3><div class="setup-grid">
    <div class="field"><label>Name</label>
      <input type="text" value="${escAttr(p.name)}" oninput="onFieldInput('people.${i}.name', this.value); relabel();"></div>
    <div class="field"><label>Birth year</label>
      <input type="number" min="1920" max="${THIS_YEAR}" value="${p.birthYear}" oninput="onBirthYearChange(${i}, this.value);"></div>
    <div class="field"><label>Birth month</label>
      <input type="number" min="1" max="12" value="${p.birthMonth}" oninput="onBirthMonthChange(${i}, this.value);"></div>
    <div class="field"><label>Current age</label>
      <input type="text" id="ageDisplay_${i}" value="${age}" disabled style="opacity:.65"></div>
    </div></div>`;
  }
  wrap.innerHTML=html;
}

function onFilingChange(){
  const v=document.querySelector('input[name=filingStatus]:checked').value;
  state.filingStatus=v;
  renderAll();
}

// Updates the read-only "current age" field and the passing-age slider bounds
// in place, without re-rendering the inputs the person may still be typing in.
function refreshAgeDependentUI(){
  const married=state.filingStatus==='married';
  const n=married?2:1;
  for(let i=0;i<n;i++){
    const p=state.people[i];
    const ageEl=document.getElementById('ageDisplay_'+i);
    if(ageEl) ageEl.value=currentAge(p).toFixed(1);
    const key='p'+(i+1);
    const minAge=Math.max(30,Math.ceil(currentAge(p)));
    const slider=document.getElementById('passSlider_'+key);
    if(slider){
      if(+slider.value<minAge){
        slider.value=minAge;
        state.passing[key]=minAge;
        const vEl=document.getElementById('passVal_'+key);
        if(vEl) vEl.textContent=minAge;
      }
    }
  }
}
function onBirthYearChange(i, val){
  const p=state.people[i];
  p.birthYear = val===''?0:+val;
  p.ss.fra = fraForBirthYear(p.birthYear);
  refreshAgeDependentUI();
  renderIncomeForms();
  recompute();
  saveDebounced();
}
function onBirthMonthChange(i, val){
  const p=state.people[i];
  p.birthMonth = val===''?0:+val;
  refreshAgeDependentUI();
  recompute();
  saveDebounced();
}

function renderPassingSliders(){
  const married = state.filingStatus==='married';
  const n = married?2:1;
  let html='';
  for(let i=0;i<n;i++){
    const p=state.people[i];
    const key='p'+(i+1);
    const minAge=Math.max(30,Math.ceil(currentAge(p)));
    let val=state.passing[key];
    if(val<minAge){ val=minAge; state.passing[key]=val; }
    if(val>100){ val=100; state.passing[key]=val; }
    html+=`<div class="slider-row">
      <div class="sl"><strong id="passLbl_${key}">${escHtml(p.name)}</strong> passes at age</div>
      <input type="range" id="passSlider_${key}" min="30" max="100" value="${val}" oninput="onPassingInput('${key}', this.value)">
      <div class="sv" id="passVal_${key}">${val}</div>
    </div>`;
  }
  document.getElementById('passingSliders').innerHTML=html;
}
function onPassingInput(key,val){
  state.passing[key]=+val;
  document.getElementById('passVal_'+key).textContent=val;
  recomputeDebounced();
  saveDebounced();
}
document.getElementById('inflationRate').addEventListener('input', function(){
  state.inflation=+this.value/100;
  document.getElementById('inflationValLbl').textContent=(state.inflation*100).toFixed(2)+'%';
  recomputeDebounced();
  saveDebounced();
});

function relabel(){
  // update passing-slider / person-column-header labels without a full re-render
  const married=state.filingStatus==='married';
  const n=married?2:1;
  for(let i=0;i<n;i++){
    const key='p'+(i+1);
    const el=document.getElementById('passLbl_'+key);
    if(el) el.textContent=state.people[i].name;
    const name=state.people[i].name||('Person '+(i+1));
    const setupHdr=document.getElementById('personSetupHeader_'+i);
    if(setupHdr) setupHdr.textContent=name;
    const incomeHdr=document.getElementById('personIncomeHeader_'+i);
    if(incomeHdr) incomeHdr.textContent=state.people[i].name;
  }
}
