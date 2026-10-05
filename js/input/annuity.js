'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / ANNUITY — "Annuity" card: one or more annuity contracts per
// person, added/removed like brokerage portfolios. Each has a name, account
// value, premium (cost basis), credited growth (net of fees), payout
// Start–End age, payout (fixed $ or % of account value), payout tax treatment
// (incl. tax-exempt payouts) and a passing (death) benefit. The projection is
// in compute/projection.js (simulateAnnuity).
// ═══════════════════════════════════════════════════════════════
function buildAnnuityCard(pid, i, p, married){
  const annuities=Array.isArray(p.annuities)?p.annuities:[];
  const lbl='display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4';
  const opt=(v,cur,t)=>`<option value="${v}" ${v===cur?'selected':''}>${t}</option>`;
  return `<div class="item">
      <div class="item-head" onclick="toggleItem(this)">
        <label>Annuity</label>
        <button type="button" class="btn" style="padding:3px 9px;font-size:10px" onclick="event.stopPropagation(); addAnnuity(${i})">＋ Add</button>
      </div>
      <div class="item-body open annuity-list">
        ${annuities.length?annuities.map((a,ai)=>{
          const ap=pid+'.annuities.'+ai, tax=a.tax||'lifo', pm=a.payoutMode==='pct'?'pct':'fixed', pb=a.pb||'value';
          const hasPrem=a.premium!=null&&a.premium!=='';
          return `
          <div class="item annuity-card" style="margin:0;padding:10px 11px">
            ${cardHeader(`<span class="an-title" style="font-size:12px">${escHtml((a.name&&a.name.trim())||('Annuity '+(ai+1)))}</span>`, ap+'.enabled', a.enabled!==false, ap+'.hidden', !!a.hidden, `<button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="removeAnnuity(${i},${ai})">Remove</button>`)}
            <div class="item-body ${a.hidden?'':'open'} annuity-fields">
              <div class="field full"><label>Annuity name</label><input type="text" maxlength="40" placeholder="Annuity ${ai+1}" value="${escAttr(a.name||'')}" oninput="onAnnuityName('${pid}',${ai},this.value,this)"></div>
              <div class="field"><label>Account value (today's $)</label><input type="number" class="money" min="0" step="5000" value="${a.value||0}" oninput="onNumberInput('${ap}.value', this.value)"></div>
              <div class="field"><label>Premium paid / cost basis ($) · optional</label><input type="number" class="money" min="0" step="5000" placeholder="Blank = account value" value="${hasPrem?a.premium:''}" oninput="onAnnuityOptional('${ap}.premium', this.value)"></div>
              ${renderChangeRow(ap+'.growth', a.growth, 4).replace('<label>Annual change</label>','<label>Credited growth (nominal, net of fees)</label>')}
              ${renderAgeRangeRow(ap+'.ar', a.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age'},{value:'passing',label:'Passing'}])}
              <div class="field"><label>Annual payout</label>
                <select onchange="onAnnuitySelect('${ap}.payoutMode', this.value)">
                  ${opt('fixed',pm,'Fixed $ (not adjusted for inflation / COLA)')}
                  ${opt('pct',pm,'% of annual account value')}
                </select></div>
              ${pm==='pct'
                ?`<div class="field"><label>Payout % of account value / yr</label><input type="number" min="0" max="100" step="0.1" value="${a.payoutPct!=null?a.payoutPct:5}" oninput="onNumberInput('${ap}.payoutPct', this.value)"></div>`
                :`<div class="field"><label>Fixed annual payout ($)</label><input type="number" class="money" min="0" step="500" value="${a.payout||0}" oninput="onNumberInput('${ap}.payout', this.value)"></div>`}
              <div class="field full"><label>Payout tax treatment</label>
                <select onchange="onAnnuitySelect('${ap}.tax', this.value)">
                  ${opt('lifo',tax,'Non-qualified, withdrawals — gain taxed first, then premium tax-free')}
                  ${opt('exclusion',tax,'Non-qualified, annuitized — exclusion ratio (premium returned tax-free pro rata)')}
                  ${opt('taxable',tax,'Qualified / IRA annuity — fully taxable')}
                  ${opt('exempt',tax,'Tax-exempt payout (% of each payout)')}
                </select></div>
              ${tax==='exempt'?`<div class="field full"><label>Tax-exempt % of each payout and of the passing benefit (untaxed; payouts still count toward MAGI / SS taxation)</label><input type="number" min="0" max="100" step="1" value="${a.exemptPct!=null?a.exemptPct:100}" oninput="onNumberInput('${ap}.exemptPct', this.value)"></div>`:''}
              <div class="field"><label>Passing benefit (paid to heirs)</label>
                <select onchange="onAnnuitySelect('${ap}.pb', this.value)">
                  ${opt('fixed',pb,'Fixed $ (not adjusted for inflation / COLA)')}
                  ${opt('initial',pb,'Initial account value (not adjusted)')}
                  ${opt('value',pb,'Account value at passing')}
                </select></div>
              ${pb==='fixed'?`<div class="field"><label>Fixed passing benefit ($)</label><input type="number" class="money" min="0" step="5000" value="${a.pbFixed||0}" oninput="onNumberInput('${ap}.pbFixed', this.value)"></div>`:'<div></div>'}
              <div class="field full"><div class="item-note">Passing benefit is paid when the contract ends (this person's passing, or the spouse's if it continues). Taxable part: all of it if qualified; the amount above the remaining premium if non-qualified; the non-exempt % if tax-exempt.</div></div>
              ${married?`<div class="field full"><label style="${lbl}"><input type="checkbox" style="flex:0 0 auto" ${a.bene?'checked':''} onchange="onBeneToggle('${ap}.bene', this.checked)"> Joint owned with spouse</label></div>`:''}
            </div>
          </div>`;}).join(''):`<div class="item-note">Add one or more annuities to include annuity payouts and their account value.</div>`}
      </div>
    </div>`;
}
