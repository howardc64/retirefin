'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / ROTH IRA — "Roth IRA" card (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildRothCard(pid, p, married){
  return `<div class="item">
      ${cardHeader('Roth IRA', pid+'.roth.enabled', p.roth.enabled, pid+'.roth.hidden', !!p.roth.hidden)}
      <div class="item-body ${p.roth.hidden?'':'open'}">
        <div class="field full"><label>Current balance (today's $)</label>
          <input type="number" class="money" min="0" step="5000" value="${p.roth.balance||0}" oninput="onNumberInput('${pid}.roth.balance', this.value)"></div>
        ${renderChangeRow(pid+'.roth.growth', p.roth.growth, 1)}
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.roth.bene?'checked':''} onchange="onBeneToggle('${pid}.roth.bene', this.checked)"> Inherited by spouse</label></div>`:''}
        <div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.roth.stretch?'checked':''} onchange="onBeneToggle('${pid}.roth.stretch', this.checked)"> IRA stretch: keep growing until 10 years after ${married?'the 2nd':'this person\'s'} passing</label></div>
        <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${p.roth.aum?'checked':''} onchange="onBeneToggle('${pid}.roth.aum', this.checked)"> AUM (this balance counts toward the AUM balance the AUM fee is charged on)</label></div>
      </div>
    </div>`;
}
