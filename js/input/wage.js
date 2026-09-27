'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / WAGE — "Wage / earned income" card (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildWageCard(pid, p){
  return `<div class="item">
      ${cardHeader('Wage / earned income', pid+'.wage.enabled', p.wage.enabled, pid+'.wage.hidden', !!p.wage.hidden)}
      <div class="item-body ${p.wage.hidden?'':'open'}">
        <div class="field"><label>Annual amount (today's $)</label>
          <input type="number" class="money" min="0" step="500" value="${p.wage.amount}" oninput="onNumberInput('${pid}.wage.amount', this.value)"></div>
        <div></div>
        ${renderAgeRangeRow(pid+'.wage.ar', p.wage.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age (default 65)'},{value:'passing',label:'Passing'}])}
        ${renderChangeRow(pid+'.wage.change', p.wage.change)}
      </div>
    </div>`;
}
