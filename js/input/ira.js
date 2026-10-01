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
        <div class="field full"><label>Annual Roth conversion ($/yr, today's $)</label>
          ${pairHtml('conv_'+idx, pid+'.ira.conv', 0, Math.max(0,Number(p.ira.balance)||0), 1000, p.ira.conv||0, {kind:'ira',i:idx}, true)}</div>
        <div class="field full"><label>Conversion start</label>
          <select onchange="onAgeRangeMode('${pid}.ira','convStartMode',this.value)">
            <option value="rmd" ${(p.ira.convStartMode||'rmd')==='rmd'?'selected':''}>RMD start (age ${Math.round(resolveAgeRange(p.ira.ar,p)[0])})</option>
            <option value="now" ${p.ira.convStartMode==='now'?'selected':''}>Now</option>
            <option value="custom" ${p.ira.convStartMode==='custom'?'selected':''}>Custom age</option>
          </select>
          ${p.ira.convStartMode==='custom'?pairHtml('convStart_'+idx, pid+'.ira.convStart', ab[0], ab[1], 1, Math.min(ab[1],Math.max(ab[0],Number(p.ira.convStart)||ab[0])), {kind:'person',i:idx}):''}</div>
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.ira.bene?'checked':''} onchange="onBeneToggle('${pid}.ira.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
        <div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.ira.stretch?'checked':''} onchange="onBeneToggle('${pid}.ira.stretch', this.checked)"> IRA stretch: keep growing until 10 years after ${married?'the 2nd':'this person\'s'} passing</label></div>
        <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${p.ira.aum?'checked':''} onchange="onBeneToggle('${pid}.ira.aum', this.checked)"> AUM (this balance counts toward the AUM balance the AUM fee is charged on)</label></div>
      </div>
    </div>`;
}

function onIraBalance(pid, val){
  onNumberInput(pid+'.ira.balance', val);
  const idx=+pid.split('.')[1], max=Math.max(0,+val||0);
  const r=document.getElementById('conv_'+idx+'_r');
  if(r){ r.max=max; if(+r.value>max){ setPair('conv_'+idx, max); setPath(pid+'.ira.conv', max); } }
}
