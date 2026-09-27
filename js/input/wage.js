'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / WAGE — "Wage / earned income" card (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildWageCard(pid, p){
  return `<div class="item">
      <div class="item-head" onclick="toggleItem(this)">
        <label onclick="event.stopPropagation()"><input type="checkbox" ${p.wage.enabled?'checked':''} onclick="onEnableToggle('${pid}.wage.enabled', this.checked, this.closest('.item'))"> Wage / earned income</label>
      </div>
      <div class="item-body ${p.wage.enabled?'open':''}">
        <div class="field"><label>Annual amount (today's $)</label>
          <input type="number" class="money" min="0" step="500" value="${p.wage.amount}" oninput="onNumberInput('${pid}.wage.amount', this.value)"></div>
        <div></div>
        ${renderAgeRangeRow(pid+'.wage.ar', p.wage.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age (default 65)'},{value:'passing',label:'Passing'}])}
        ${renderChangeRow(pid+'.wage.change', p.wage.change)}
      </div>
    </div>`;
}
