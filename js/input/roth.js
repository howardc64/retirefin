'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / ROTH IRA — "Roth IRA" card (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildRothCard(pid, p, married){
  return `<div class="item">
      <div class="item-head" onclick="toggleItem(this)">
        <label onclick="event.stopPropagation()"><input type="checkbox" ${p.roth.enabled?'checked':''} onclick="onEnableToggle('${pid}.roth.enabled', this.checked, this.closest('.item'))"> Roth IRA</label>
      </div>
      <div class="item-body ${p.roth.enabled?'open':''}">
        <div class="field full"><label>Current balance (today's $)</label>
          <input type="number" class="money" min="0" step="5000" value="${p.roth.balance||0}" oninput="onNumberInput('${pid}.roth.balance', this.value)"></div>
        ${renderChangeRow(pid+'.roth.growth', p.roth.growth, 1)}
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.roth.bene?'checked':''} onchange="onBeneToggle('${pid}.roth.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
        <div class="item-note">Grows tax-free; no withdrawals or RMDs are modeled here, only balance growth plus any Annual Roth conversion set on the Pre-tax IRA above, which is added to this account's balance each year it occurs.</div>
      </div>
    </div>`;
}
