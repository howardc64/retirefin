'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / BROKERAGE — "Brokerage portfolio income" card: one or more
// portfolios, each with balance, growth, dividends, and an optional
// AUM checkbox (counts toward the household AUM fee). Living expenses, the AUM fee and
// IRMAA are household items (Assumptions panel); realized LTCG is automatic (spec §4.4, §4.6).
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
              <div class="field full"><label>Cost basis (% of start balance) · optional</label><input type="number" min="0" max="100" step="1" placeholder="Blank = no unrealized gain today" value="${pfBasisEntered(b)?b.basisPct:''}" oninput="onBasisInput('${pid}',${bi},this.value)"></div>
              ${renderChangeRow(pid+'.brokerage.'+bi+'.growth', b.growth, 8)}
              <div class="field"><label>Annual ODIV yield %</label><input type="number" min="0" max="100" step="0.1" value="${b.yield!=null?b.yield:1.5}" oninput="onNumberInput('${pid}.brokerage.${bi}.yield', this.value)"></div>
              <div class="field"><label>QDIV as % of ODIV</label><input type="number" min="0" max="100" step="1" value="${b.qdivPct!=null?b.qdivPct:70}" oninput="onNumberInput('${pid}.brokerage.${bi}.qdivPct', this.value)"></div>
              <div class="field"><label>Foreign asset % of portfolio</label><input type="number" min="0" max="100" step="1" value="${b.foreignPct!=null?b.foreignPct:0}" oninput="onNumberInput('${pid}.brokerage.${bi}.foreignPct', this.value)"></div>
              <div class="field"><label>Foreign tax credit %</label><input type="number" min="0" max="100" step="0.05" value="${b.ftcPct!=null?b.ftcPct:0.25}" oninput="onNumberInput('${pid}.brokerage.${bi}.ftcPct', this.value)"></div>
              <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.aum?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.aum', this.checked)"> AUM (this balance counts toward the AUM balance the AUM fee is charged on)</label></div>
              <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.payExp!==false?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.payExp', this.checked)"> Pay expenses (this portfolio's dividends, then asset sales, pay household expenses — living costs, IRMAA, AUM fee, income tax)</label></div>
              ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.bene?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.bene', this.checked)"> Continues to spouse after this person passes</label></div>`:''}
              <div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.idgt?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.idgt', this.checked)"> IDGT (charted separately from the taxable estate)</label></div>
              <div class="item-note">ODIV = portfolio balance × yield. QDIV is the entered percentage of ODIV. Each year the balance changes by growth − (dividends used for expenses + shares sold). Household expenses (living expenses, the IRMAA surcharge, the AUM fee and income tax — see the Assumptions panel) are funded from household income first, then the dividends of the portfolios with Pay expenses checked, then their asset sales. Pay expenses is off by default. A portfolio without it reinvests all of its dividends and is never sold to fund expenses, so its balance is only drawn down when it pays expenses and income and dividends fall short. Selling realizes LTCG in proportion to this portfolio's unrealized-gain share (from the cost basis above; blank = no gain today). Cost basis steps up to full value when the owner passes and the portfolio continues to a spouse (not for IDGTs). The AUM fee is charged on the sum of the balances of portfolios (and IRAs) with AUM checked, split across them pro rata to balance; the AUM fee is an expense, so it is paid only by the portfolios with Pay expenses checked — not by the portfolio it is charged on unless that portfolio also has Pay expenses checked. A portfolio outside its age range just compounds — it pays no dividends and is not sold. Foreign tax credit = portfolio value × foreign asset % × foreign tax credit %, subtracted from the household's Total Tax (spec §9.4) — always active, independent of the AUM box and the IDGT flag. All in today's-dollar terms.</div>
            </div>
          </div>`).join(''):`<div class="item-note">Add one or more brokerage portfolios to include portfolio dividend income.</div>`}
      </div>
    </div>`;
}
