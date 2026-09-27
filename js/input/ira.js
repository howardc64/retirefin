'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / PRE-TAX IRA — "Pre-tax IRA / 401(k)" card, including the
// RMD-age default and the annual Roth-conversion field (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildIraCard(pid, p, married){
  const rmdAge=rmdAgeForBirthYear(p.birthYear);
  return `<div class="item">
      <div class="item-head" onclick="toggleItem(this)">
        <label onclick="event.stopPropagation()"><input type="checkbox" ${p.ira.enabled?'checked':''} onclick="onEnableToggle('${pid}.ira.enabled', this.checked, this.closest('.item'))"> Pre-tax IRA / 401(k)</label>
      </div>
      <div class="item-body ${p.ira.enabled?'open':''}">
        <div class="field full"><label>Current balance (today's $)</label>
          <input type="number" class="money" min="0" step="5000" value="${p.ira.balance}" oninput="onNumberInput('${pid}.ira.balance', this.value)"></div>
        ${renderAgeRangeRow(pid+'.ira.ar', p.ira.ar, [{value:'rmd',label:'RMD age ('+rmdAge+')'},{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'passing',label:'Passing'},{value:'custom',label:'Custom age'}])}
        ${renderChangeRow(pid+'.ira.growth', p.ira.growth, 1)}
        <div class="field full"><label>Annual Roth conversion ($/yr, today's $)</label>
          <input type="number" class="money" min="0" step="1000" value="${p.ira.conv||0}" oninput="onNumberInput('${pid}.ira.conv', this.value)"></div>
        ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${p.ira.bene?'checked':''} onchange="onBeneToggle('${pid}.ira.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
        <div class="item-note">Withdrawals use the IRS Uniform Lifetime Table divisor for the account owner's attained age each year (required starting at age ${rmdAge} under current law; an earlier start is treated as a voluntary withdrawal using the same table, approximated below age 72). Dividend yield within the account isn't tracked separately — it's folded into the annual growth rate above, since it isn't taxed until withdrawn; only the RMD/withdrawal amount is counted as (ordinary) income. Annual Roth conversion is a real withdrawal from this account on top of the RMD — a flat today's-$ amount moved into the Roth IRA below each year this account still has a balance, until it reaches $0 — taxed as ordinary income exactly like the RMD, and shown as its own "Pre-tax IRA withdraw" band on the income chart (spec §8.3) so it isn't invisible. Requires the Roth IRA below to be enabled.</div>
      </div>
    </div>`;
}
