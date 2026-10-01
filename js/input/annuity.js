'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / ANNUITY — "Annuity" card: one or more annuity contracts per
// person, added/removed like brokerage portfolios. Each has a name, account
// value, premium (cost basis), credited growth, contract fee, payout
// Start–End age, payout amount, payout tax treatment (incl. tax-exempt
// payouts) and an optional Living Benefit Rider (guaranteed lifetime
// withdrawal). The projection is in compute/projection.js (simulateAnnuity).
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
          const ap=pid+'.annuities.'+ai, tax=a.tax||'lifo';
          const hasPrem=a.premium!=null&&a.premium!=='';
          const hasBase=a.riderBase!=null&&a.riderBase!=='';
          return `
          <div class="item annuity-card" style="margin:0;padding:10px 11px">
            ${cardHeader(`<span class="an-title" style="font-size:12px">${escHtml((a.name&&a.name.trim())||('Annuity '+(ai+1)))}</span>`, ap+'.enabled', a.enabled!==false, ap+'.hidden', !!a.hidden, `<button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="removeAnnuity(${i},${ai})">Remove</button>`)}
            <div class="item-body ${a.hidden?'':'open'} annuity-fields">
              <div class="field full"><label>Annuity name</label><input type="text" maxlength="40" placeholder="Annuity ${ai+1}" value="${escAttr(a.name||'')}" oninput="onAnnuityName('${pid}',${ai},this.value,this)"></div>
              <div class="field"><label>Account value (today's $)</label><input type="number" class="money" min="0" step="5000" value="${a.value||0}" oninput="onNumberInput('${ap}.value', this.value)"></div>
              <div class="field"><label>Premium paid / cost basis ($) · optional</label><input type="number" class="money" min="0" step="5000" placeholder="Blank = account value" value="${hasPrem?a.premium:''}" oninput="onAnnuityOptional('${ap}.premium', this.value)"></div>
              ${renderChangeRow(ap+'.growth', a.growth, 4).replace('<label>Annual change</label>','<label>Credited growth (nominal, before fees)</label>')}
              <div class="field"><label>Annual contract fee % (of account value)</label><input type="number" min="0" max="100" step="0.05" value="${a.feePct!=null?a.feePct:0}" oninput="onNumberInput('${ap}.feePct', this.value)"></div>
              <div></div>
              ${renderAgeRangeRow(ap+'.ar', a.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age'},{value:'passing',label:'Passing'}])}
              ${a.rider?'':`<div class="field full"><label>Annual payout (today's $)</label><input type="number" class="money" min="0" step="500" value="${a.payout||0}" oninput="onNumberInput('${ap}.payout', this.value)"></div>
              ${renderChangeRow(ap+'.change', a.change, 0, 'Fixed $ (no COLA)').replace('<label>Annual change</label>','<label>Payout annual change</label>')}`}
              <div class="field full"><label>Payout tax treatment</label>
                <select onchange="onAnnuitySelect('${ap}.tax', this.value)">
                  ${opt('lifo',tax,'Non-qualified, withdrawals — gain taxed first, then premium tax-free')}
                  ${opt('exclusion',tax,'Non-qualified, annuitized — exclusion ratio (premium returned tax-free pro rata)')}
                  ${opt('taxable',tax,'Qualified / IRA annuity — fully taxable')}
                  ${opt('exempt',tax,'Tax-exempt payout (% of each payout)')}
                </select></div>
              ${tax==='exempt'?`<div class="field full"><label>Tax-exempt % of each payout (untaxed; still counts toward MAGI / SS taxation)</label><input type="number" min="0" max="100" step="1" value="${a.exemptPct!=null?a.exemptPct:100}" oninput="onNumberInput('${ap}.exemptPct', this.value)"></div>`:''}
              <div class="field full"><label style="${lbl}"><input type="checkbox" style="flex:0 0 auto" ${a.rider?'checked':''} onchange="onAnnuitySelect('${ap}.rider', this.checked)"> Living Benefit Rider (guaranteed lifetime withdrawals; replaces the payout amount above)</label></div>
              ${a.rider?`
              <div class="field"><label>Benefit base (today's $) · optional</label><input type="number" class="money" min="0" step="5000" placeholder="Blank = account value" value="${hasBase?a.riderBase:''}" oninput="onAnnuityOptional('${ap}.riderBase', this.value)"></div>
              <div class="field"><label>Benefit base roll-up % / yr (until payouts start)</label><input type="number" min="0" max="100" step="0.25" value="${a.riderRollup!=null?a.riderRollup:5}" oninput="onNumberInput('${ap}.riderRollup', this.value)"></div>
              <div class="field"><label>Guaranteed payout rate % of base</label><input type="number" min="0" max="100" step="0.1" value="${a.riderRate!=null?a.riderRate:5}" oninput="onNumberInput('${ap}.riderRate', this.value)"></div>
              <div class="field"><label>Rider fee % of benefit base / yr</label><input type="number" min="0" max="100" step="0.05" value="${a.riderFee!=null?a.riderFee:1}" oninput="onNumberInput('${ap}.riderFee', this.value)"></div>
              <div class="field full"><label style="${lbl}"><input type="checkbox" style="flex:0 0 auto" ${a.riderStepUp?'checked':''} onchange="onBeneToggle('${ap}.riderStepUp', this.checked)"> Annual step-up (benefit base resets to the account value if higher, before payouts start)</label></div>
              <div class="field full"><div class="item-note">The guaranteed payout = rate × benefit base in the first payout year, level in nominal $ (it shrinks in today's $). It is paid from the account value first; once that is gone the insurer keeps paying through the End age. The rider fee comes out of the account value.</div></div>`:''}
              ${married?`<div class="field full"><label style="${lbl}"><input type="checkbox" style="flex:0 0 auto" ${a.bene?'checked':''} onchange="onBeneToggle('${ap}.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
            </div>
          </div>`;}).join(''):`<div class="item-note">Add one or more annuities to include annuity payouts and their account value.</div>`}
      </div>
    </div>`;
}
