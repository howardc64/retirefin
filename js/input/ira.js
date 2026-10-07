'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / PRE-TAX IRA — "Pre-tax IRA / 401(k)" card, including the
// RMD-age default and the annual Roth-conversion field (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildIraCard(pid, p, married){
  const idx=+pid.split('.')[1], ab=personAgeBounds(idx);
  const rmdAge=rmdAgeForBirthYear(p.birthYear);
  return `<div class="item">
      ${cardHeader('Pre-tax IRA / 401(k)', pid+'.ira.enabled', p.ira.enabled, pid+'.ira.hidden', !!p.ira.hidden)}
      <div class="item-body ${p.ira.hidden?'':'open'}">
        <div class="field full"><label>Current balance (today's $)</label>
          <input type="number" class="money" min="0" step="5000" value="${p.ira.balance}" oninput="onIraBalance('${pid}', this.value)"></div>
        ${renderAgeRangeRow(pid+'.ira.ar', p.ira.ar, [{value:'rmd',label:'RMD age ('+rmdAge+')'},{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'passing',label:'Passing'},{value:'custom',label:'Custom age'}])}
        ${renderChangeRow(pid+'.ira.growth', p.ira.growth, 1)}
        <div class="field full"><label>Annual Roth conversion</label>
          <select onchange="onConvMode('${pid}',this.value)">
            <option value="fixed" ${(p.ira.convMode||'fixed')==='fixed'?'selected':''}>$/yr, today's $</option>
            <option value="bracket" ${p.ira.convMode==='bracket'?'selected':''}>Below IRMAA &amp; ordinary income tax brackets</option>
          </select>
          ${p.ira.convMode==='bracket'
            ? `<div style="display:flex;gap:12px;align-items:flex-start;margin-top:8px">${convSliderHtml(pid,'ord',p)}${convSliderHtml(pid,'irmaa',p)}</div>
               <div class="cn" style="margin-top:4px">Converts as much pre-tax IRA as fits <strong>below both</strong> brackets: taxable ordinary income stays below the chosen ordinary bracket, and MAGI stays below the chosen IRMAA bracket (the line labeled with that Part B % on the MAGI chart). Slide to 0 to block conversions, or to the end for no limit. Dollar amounts follow the Single / Married setting.</div>`
            : pairHtml('conv_'+idx, pid+'.ira.conv', 0, Math.max(0,Number(p.ira.balance)||0), 1000, p.ira.conv||0, {kind:'ira',i:idx}, true)}</div>
        <div class="field full"><label>Conversion start</label>
          <select onchange="onAgeRangeMode('${pid}.ira','convStartMode',this.value)">
            <option value="rmd" ${(p.ira.convStartMode||'rmd')==='rmd'?'selected':''}>RMD start (age ${Math.round(resolveAgeRange(p.ira.ar,p)[0])})</option>
            <option value="now" ${p.ira.convStartMode==='now'?'selected':''}>Now</option>
            <option value="custom" ${p.ira.convStartMode==='custom'?'selected':''}>Custom age</option>
            <option value="bracket" ${p.ira.convStartMode==='bracket'?'selected':''}>When tax bracket is below x%</option>
            <option value="itemized" ${p.ira.convStartMode==='itemized'?'selected':''}>When itemized deductions &gt; a value</option>
            <option value="ltc" ${p.ira.convStartMode==='ltc'?'selected':''}>When LTC starts</option>
          </select>
          ${p.ira.convStartMode==='custom'?pairHtml('convStart_'+idx, pid+'.ira.convStart', ab[0], ab[1], 1, Math.min(ab[1],Math.max(ab[0],Number(p.ira.convStart)||ab[0])), {kind:'person',i:idx}):''}
          ${convStartTriggerHtml(pid, p)}</div>
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.ira.bene?'checked':''} onchange="onBeneToggle('${pid}.ira.bene', this.checked)"> Inherited by spouse</label></div>`:''}
        <div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.ira.stretch?'checked':''} onchange="onBeneToggle('${pid}.ira.stretch', this.checked)"> IRA stretch: keep growing until 10 years after ${married?'the 2nd':'this person\'s'} passing</label></div>
      </div>
    </div>`;
}

// Discrete slider for one "below bracket" limit. `which` = 'ord' (ordinary income tax bracket) or 'irmaa' (IRMAA bracket, Part B % over standard).
function convStopText(which, v){
  const married=state.filingStatus==='married', st=married?'Married':'Single';
  if(which==='ord'){
    if(v==null) return 'No ordinary income limit';
    if(!(v>0)) return 'Below the 0 bracket \u2014 no conversion';
    const top=convOrdTop(v, married?MFJ_ORD:SGL_ORD);
    return `Below the ${v}% bracket \u00b7 taxable ordinary income \u2264 $${Math.round(top).toLocaleString()} (${st})`;
  }
  if(v==null) return 'No IRMAA limit';
  if(!(v>0)) return 'Below the standard bracket \u2014 no conversion';
  const cap=convMagiCap(v, married?IRMAA_MFJ:IRMAA_SGL)+1;
  return `Below the +${v}% IRMAA bracket \u00b7 MAGI < $${Math.round(cap).toLocaleString()} (${st})`;
}
// Extra control under "Conversion start" for the three trigger starts. Each trigger is tested on the year's tax with no conversion; once it is
// met the IRA converts every later year too.
function convStartBracketText(v){
  const married=state.filingStatus==='married', st=married?'Married':'Single';
  const top=convOrdTop(v, married?MFJ_ORD:SGL_ORD);
  return `Starts when taxable ordinary income is below the ${v}% bracket \u00b7 \u2264 $${Math.round(top).toLocaleString()} (${st})`;
}
function convStartTriggerHtml(pid, p){
  const mode=p.ira.convStartMode;
  const note=t=>`<div class="cn" style="margin-top:4px">${t}</div>`;
  if(mode==='bracket'){
    const stops=CONV_START_BRACKET_STOPS, idx=convStopIndex(stops, p.ira.convStartBracket), v=stops[idx];
    return `<div style="margin-top:8px"><label style="font-weight:400;font-size:11px">Ordinary income tax bracket</label>
      <input type="range" min="0" max="${stops.length-1}" step="1" value="${idx}" oninput="onConvStartBracket('${pid}',this.value)">
      <div class="cn" id="convStartLbl_${pid}" style="margin-top:2px">${convStartBracketText(v)}</div></div>
      ${note('Conversions start the first year the household\'s taxable ordinary income (before any conversion) is that low, then continue every year. Dollar amounts follow the Single / Married setting.')}`;
  }
  if(mode==='itemized'){
    const std=state.filingStatus==='married'?STD_MFJ:STD_SGL;
    return `<div style="margin-top:8px"><label style="font-weight:400;font-size:11px">Itemized deductions exceed (today's $)</label>
      <input type="number" class="money" min="0" step="1000" value="${Number(p.ira.convStartItemized)||0}" oninput="onNumberInput('${pid}.ira.convStartItemized', this.value)"></div>
      ${note('Itemized deductions here are the Long Term Care cost above 7.5% of AGI (the standard deduction is $'+Math.round(std).toLocaleString()+'). Conversions start the first year it exceeds this value, then continue every year.')}`;
  }
  if(mode==='ltc'){
    const on=!!(state.ltc&&state.ltc.enabled);
    return note('Conversions start the year the first Long Term Care start age is reached, then continue every year.'+(on?'':' <strong>Long Term Care is not enabled in Assumptions, so conversions never start.</strong>'));
  }
  return '';
}
function onConvStartBracket(pid, idx){
  const v=CONV_START_BRACKET_STOPS[+idx];
  setPath(pid+'.ira.convStartBracket', v);
  const el=document.getElementById('convStartLbl_'+pid); if(el) el.textContent=convStartBracketText(v);
  saveDebounced();
  window.liveDrag=true; recompute(); window.liveDrag=false;
}
function convSliderHtml(pid, which, p){
  const stops=which==='ord'?CONV_ORD_STOPS:CONV_IRMAA_STOPS;
  const v=which==='ord'?p.ira.convOrdPct:p.ira.convIrmaaPct;
  const idx=convStopIndex(stops, v), val=stops[idx];
  const title=which==='ord'?'Ordinary income tax bracket':'IRMAA bracket (Part B %)';
  return `<div style="flex:1 1 0;min-width:0"><label style="font-weight:400;font-size:11px">${title}</label>
    <input type="range" min="0" max="${stops.length-1}" step="1" value="${idx}" oninput="onConvStop('${pid}','${which}',this.value)">
    <div class="cn" id="convLbl_${pid}_${which}" style="margin-top:2px">${convStopText(which,val)}</div></div>`;
}
function onConvStop(pid, which, idx){
  const stops=which==='ord'?CONV_ORD_STOPS:CONV_IRMAA_STOPS;
  const v=stops[+idx];
  setPath(pid+'.ira.'+(which==='ord'?'convOrdPct':'convIrmaaPct'), v);
  const el=document.getElementById('convLbl_'+pid+'_'+which); if(el) el.textContent=convStopText(which,v);
  saveDebounced();
  window.liveDrag=true; recompute(); window.liveDrag=false;
}
function onConvMode(pid, mode){
  setPath(pid+'.ira.convMode', mode);
  renderIncomeForms();
  recompute(); saveDebounced();
}
function onIraBalance(pid, val){
  onNumberInput(pid+'.ira.balance', val);
  const idx=+pid.split('.')[1], max=Math.max(0,+val||0);
  const r=document.getElementById('conv_'+idx+'_r');
  if(r){ r.max=max; if(+r.value>max){ setPair('conv_'+idx, max); setPath(pid+'.ira.conv', max); } }
}
