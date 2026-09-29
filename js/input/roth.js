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
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.roth.bene?'checked':''} onchange="onBeneToggle('${pid}.roth.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
        <div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.roth.stretch?'checked':''} onchange="onBeneToggle('${pid}.roth.stretch', this.checked)"> IRA stretch: keep growing until 10 years after ${married?'the 2nd':'this person\'s'} passing</label></div>
        <div class="item-note">Grows tax-free; no withdrawals or RMDs are modeled here, only balance growth plus any Annual Roth conversion set on the Pre-tax IRA above, which is added to this account's balance each year it occurs. IRA stretch: if checked, this account is not dropped when its owner passes (unless a surviving spouse inherits it); it keeps growing, with no withdrawals, until 10 years after the last household member passes (shown on the Asset Value chart).</div>
      </div>
    </div>`;
}
