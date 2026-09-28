'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / BROKERAGE — "Brokerage portfolio income" card: one or more
// portfolios, each with balance, growth, dividends, and an optional
// Expenses sub-panel (tax drag, fee drag, withdrawal, realized LTCG)
// (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildBrokerageCard(pid, i, p, married){
  const portfolios=Array.isArray(p.brokerage)?p.brokerage:[];
  return `<div class="item">
      <div class="item-head" onclick="toggleItem(this)">
        <label>Brokerage portfolio income</label>
        <button type="button" class="btn" style="padding:3px 9px;font-size:10px" onclick="event.stopPropagation(); addBrokerage(${i})">＋ Add</button>
      </div>
      <div class="item-body open portfolio-list">
        ${portfolios.length?portfolios.map((b,bi)=>`
          <div class="item portfolio-card" style="margin:0;padding:10px 11px">
            ${cardHeader(`<span class="pf-title" style="font-size:12px">${escHtml((b.name&&b.name.trim())||('Portfolio '+(bi+1)))}</span>`, pid+'.brokerage.'+bi+'.enabled', b.enabled!==false, pid+'.brokerage.'+bi+'.hidden', !!b.hidden, `<button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="removeBrokerage(${i},${bi})">Remove</button>`)}
            <div class="item-body ${b.hidden?'':'open'} portfolio-fields">
              <div class="field full"><label>Portfolio name</label><input type="text" maxlength="40" placeholder="Portfolio ${bi+1}" value="${escAttr(b.name||'')}" oninput="onPortfolioName('${pid}',${bi},this.value,this)"></div>
              ${renderAgeRangeRow(pid+'.brokerage.'+bi+'.ar', b.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age'},{value:'passing',label:'Passing'}])}
              <div class="field full"><label>Start balance (today's $)</label><input type="number" class="money" min="0" step="5000" value="${b.balance||0}" oninput="onNumberInput('${pid}.brokerage.${bi}.balance', this.value)"></div>
              <div class="field full"><label>Cost basis (today's $) · optional</label><input type="number" class="money" min="0" step="5000" placeholder="Blank = unrealized gain not tracked" value="${pfBasisEntered(b)?b.basis:''}" oninput="onBasisInput('${pid}',${bi},this.value)"></div>
              ${renderChangeRow(pid+'.brokerage.'+bi+'.growth', b.growth, 8)}
              <div class="field"><label>Annual ODIV yield %</label><input type="number" min="0" max="100" step="0.1" value="${b.yield!=null?b.yield:1.5}" oninput="onNumberInput('${pid}.brokerage.${bi}.yield', this.value)"></div>
              <div class="field"><label>QDIV as % of ODIV</label><input type="number" min="0" max="100" step="1" value="${b.qdivPct!=null?b.qdivPct:70}" oninput="onNumberInput('${pid}.brokerage.${bi}.qdivPct', this.value)"></div>
              <div class="field"><label>Foreign asset % of portfolio</label><input type="number" min="0" max="100" step="1" value="${b.foreignPct!=null?b.foreignPct:0}" oninput="onNumberInput('${pid}.brokerage.${bi}.foreignPct', this.value)"></div>
              <div class="field"><label>Foreign tax credit %</label><input type="number" min="0" max="100" step="0.05" value="${b.ftcPct!=null?b.ftcPct:0.25}" oninput="onNumberInput('${pid}.brokerage.${bi}.ftcPct', this.value)"></div>
              <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${pfExpense(b)?'checked':''} onchange="onExpenseToggle('${pid}',${bi},this.checked)"> Expenses &amp; realized gains (tax drag, fees, withdrawal, LTCG)</label></div>
              ${pfExpense(b)?`
              <div class="field"><label>Tax drag · % of annual total tax</label><input type="number" min="0" max="100" step="1" value="${b.taxDrag!=null?b.taxDrag:0}" oninput="onNumberInput('${pid}.brokerage.${bi}.taxDrag', this.value)"></div>
              <div class="field full"><label>Fee drag</label>
                <div class="arow">
                  <select onchange="onFeeMode('${pid}',${bi},this.value)">
                    <option value="pct" ${(!b.fee||b.fee.mode!=='fixed')?'selected':''}>% of balance</option>
                    <option value="fixed" ${(b.fee&&b.fee.mode==='fixed')?'selected':''}>Fixed $ / yr</option>
                  </select>
                  <input type="number" class="money" min="0" step="${(b.fee&&b.fee.mode==='fixed')?100:0.05}" value="${b.fee&&b.fee.value!=null?b.fee.value:0}" oninput="onFeeValue('${pid}',${bi},this.value)">
                </div>
              </div>
              <div class="field"><label>Withdrawal ($/yr, today's $)</label><input type="number" class="money" min="0" step="1000" value="${b.living||0}" oninput="onNumberInput('${pid}.brokerage.${bi}.living', this.value)"></div>
              <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.irmaa?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.irmaa', this.checked)"> Include IRMAA surcharge as an expense (Medicare Part B/D, per enrolled person 65+)</label></div>
              <div class="item-note">Expenses (withdrawal, fees, tax drag, and the IRMAA surcharge if checked) are paid ONLY from this portfolio's own money — never from household income (wages, Social Security, pension, rental, IRA withdrawals): first by this portfolio's own dividends (any leftover is reinvested, adding cost basis), then any shortfall is covered by selling shares. Realized LTCG is automatic: selling realizes gain in proportion to the portfolio's unrealized-gain share (tracked from the cost basis above; blank = no gain today). Cost basis steps up to full value when the owner passes and the portfolio continues to a spouse (not for IDGTs).</div>
              `:''}
              ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.bene?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
              <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.idgt?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.idgt', this.checked)"> IDGT (charted separately from the taxable estate)</label></div>
              <div class="item-note">ODIV = portfolio balance × yield. QDIV is the entered percentage of ODIV. Each year the balance changes by growth − tax drag − fee drag − IRMAA surcharge (if checked) − withdrawal, paid only from this portfolio's own dividends and any shares sold — never from household income: tax drag is this % of the household's total tax (TT) paid from the portfolio; fee drag is a % of balance, or a fixed $ amount per year that stays flat in future dollars (so it shrinks in today's $ as inflation rises). Realized LTCG is computed from the cost basis (see the Expenses panel). Foreign tax credit = portfolio value × foreign asset % × foreign tax credit %, subtracted from the household's Total Tax (spec §9.4) — always active, independent of the Expenses toggle and the IDGT flag below. All in today's-dollar terms.</div>
            </div>
          </div>`).join(''):`<div class="item-note">Add one or more brokerage portfolios to include portfolio dividend income.</div>`}
      </div>
    </div>`;
}
