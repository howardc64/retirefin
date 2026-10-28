'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / WAGE — "Wage / earned income" card (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildWageCard(pid, p) {
  return `<div class="item">
      ${cardHeader('Wage / earned income', pid + '.wage.enabled', p.wage.enabled, pid + '.wage.hidden', !!p.wage.hidden)}
      <div class="item-body ${p.wage.hidden ? '' : 'open'}">
        <div class="field"><label>Annual gross wage (today's $)</label>
          <input type="number" class="money" min="0" step="500" value="${p.wage.amount}" oninput="onNumberInput('${pid}.wage.amount', this.value)"></div>
        <div></div>
        <div class="field"><label>Pre-tax IRA/401(k) contribution (today's $/yr)</label>
          <input type="number" class="money" min="0" step="500" value="${p.wage.pretax || 0}" oninput="onWageContrib('${pid}','pretax', this.value)"></div>
        <div class="field"><label>Roth IRA/401(k) contribution (today's $/yr)</label>
          <input type="number" class="money" min="0" step="500" value="${p.wage.roth || 0}" oninput="onWageContrib('${pid}','roth', this.value)"></div>
        <div class="field full"><div class="item-note" id="${pid}_wageNote">The pre-tax contribution comes out of the wage and is added to this person's Pre-tax IRA/401(k) card; the Roth contribution is paid from after-tax money as a household expense and is added to the Roth IRA/401(k) card. Both stop when the wage stops (and are capped at the wage); IRS limits are not checked. Payroll tax (Social Security, Medicare, Additional Medicare Tax, FUTA, and California SDI or Washington PFML / WA Cares when State income tax is on for that state) is paid as a household expense (shown on the Household Expenses chart) and does not reduce the wage income tax is computed on: the taxable wage is the gross wage less the pre-tax contribution. A contribution is ignored while its card is off.</div></div>
        ${renderAgeRangeRow(
          pid + '.wage.ar',
          p.wage.ar,
          [
            {value: 'now', label: 'Now'},
            {value: 'custom', label: 'Custom age'}
          ],
          [
            {value: 'custom', label: 'Custom age'},
            {value: 'passing', label: 'Passing'}
          ]
        )}
        ${renderChangeRow(pid + '.wage.change', p.wage.change)}
      </div>
    </div>`;
}
