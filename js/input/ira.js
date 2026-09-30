'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / PRE-TAX IRA — "Pre-tax IRA / 401(k)" card, including the
// RMD-age default and the annual Roth-conversion field (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildIraCard(pid, p, married){
  const rmdAge=rmdAgeForBirthYear(p.birthYear);
  return `<div class="item">
      ${cardHeader('Pre-tax IRA / 401(k)', pid+'.ira.enabled', p.ira.enabled, pid+'.ira.hidden', !!p.ira.hidden)}
      <div class="item-body ${p.ira.hidden?'':'open'}">
        <div class="field full"><label>Current balance (today's $)</label>
          <input type="number" class="money" min="0" step="5000" value="${p.ira.balance}" oninput="onNumberInput('${pid}.ira.balance', this.value)"></div>
        ${renderAgeRangeRow(pid+'.ira.ar', p.ira.ar, [{value:'rmd',label:'RMD age ('+rmdAge+')'},{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'passing',label:'Passing'},{value:'custom',label:'Custom age'}])}
        ${renderChangeRow(pid+'.ira.growth', p.ira.growth, 1)}
        <div class="field full"><label>Annual Roth conversion ($/yr, today's $)</label>
          <input type="number" class="money" min="0" step="1000" value="${p.ira.conv||0}" oninput="onNumberInput('${pid}.ira.conv', this.value)"></div>
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.ira.bene?'checked':''} onchange="onBeneToggle('${pid}.ira.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
        <div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.ira.stretch?'checked':''} onchange="onBeneToggle('${pid}.ira.stretch', this.checked)"> IRA stretch: keep growing until 10 years after ${married?'the 2nd':'this person\'s'} passing</label></div>
        <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${p.ira.aum?'checked':''} onchange="onBeneToggle('${pid}.ira.aum', this.checked)"> AUM (this balance counts toward the AUM balance the AUM fee is charged on)</label></div>
      </div>
    </div>`;
}
