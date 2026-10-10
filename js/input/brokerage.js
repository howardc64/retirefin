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
              <div class="field full"><label>Portfolio type</label><select onchange="onPortfolioType(${i},${bi},this.value)"><option value="living" ${b.type!=='idgt'?'selected':''}>Living expense &amp; income</option><option value="idgt" ${b.type==='idgt'?'selected':''}>IDGT</option></select><div class="item-note" style="margin-top:4px">${b.type==='idgt'?'IDGT: outside the taxable estate (charted separately, keeps carryover basis); does not pay household expenses, receive excess income or bear the AUM fee.':'Living expense &amp; income: its dividends, then asset sales, pay household expenses; excess household income is reinvested into it.'}</div></div>
              <div class="field full"><label>Portfolio name</label><input type="text" maxlength="40" placeholder="Portfolio ${bi+1}" value="${escAttr(b.name||'')}" oninput="onPortfolioName('${pid}',${bi},this.value,this)"></div>
              ${renderAgeRangeRow(pid+'.brokerage.'+bi+'.ar', b.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age'},{value:'passing',label:'Passing'}])}
              <div class="field full"><label>Start balance (today's $)</label><input type="number" class="money" min="0" step="5000" value="${b.balance||0}" oninput="onNumberInput('${pid}.brokerage.${bi}.balance', this.value)"></div>
              <div class="field full"><label>Cost basis (% of start balance) · optional</label><input type="number" min="0" max="100" step="1" placeholder="Blank = no unrealized gain today" value="${pfBasisEntered(b)?b.basisPct:''}" oninput="onBasisInput('${pid}',${bi},this.value)"></div>
              ${renderChangeRow(pid+'.brokerage.'+bi+'.growth', b.growth, 8)}
              <div class="field"><label>Annual ODIV yield %</label><input type="number" min="0" max="100" step="0.1" value="${b.yield!=null?b.yield:1.5}" oninput="onNumberInput('${pid}.brokerage.${bi}.yield', this.value)"></div>
              <div class="field"><label>QDIV as % of ODIV</label><input type="number" min="0" max="100" step="1" value="${b.qdivPct!=null?b.qdivPct:70}" oninput="onNumberInput('${pid}.brokerage.${bi}.qdivPct', this.value)"></div>
              <div class="field full"><label>Tax-exempt yield % (e.g. muni interest; untaxed income paid to the household)</label><input type="number" min="0" max="100" step="0.1" value="${b.teYield!=null?b.teYield:0}" oninput="onNumberInput('${pid}.brokerage.${bi}.teYield', this.value)"></div>
              <div class="field"><label>Foreign asset % of portfolio</label><input type="number" min="0" max="100" step="1" value="${b.foreignPct!=null?b.foreignPct:0}" oninput="onNumberInput('${pid}.brokerage.${bi}.foreignPct', this.value)"></div>
              <div class="field"><label>Foreign tax credit %</label><input type="number" min="0" max="100" step="0.05" value="${b.ftcPct!=null?b.ftcPct:0.25}" oninput="onNumberInput('${pid}.brokerage.${bi}.ftcPct', this.value)"></div>
              ${b.type==='idgt'?'':`<div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.aum?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.aum', this.checked)"> AUM (this balance counts toward the AUM balance the AUM fee is charged on)</label></div>`}
              ${married?`<div class="field full"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4"><input type="checkbox" style="flex:0 0 auto" ${b.bene?'checked':''} onchange="onBeneToggle('${pid}.brokerage.${bi}.bene', this.checked)"> Joint owned with spouse</label></div>`:''}
              ${b.type==='idgt'?'':buildWithdrawsHtml(pid,i,bi,b,married)}
            </div>
          </div>`).join(''):`<div class="item-note">Add one or more brokerage portfolios to include portfolio dividend income.</div>`}
      </div>
    </div>`;
}

// ── Withdraws: scheduled sales from a (non-IDGT) portfolio — start / end by age or spouse's age, sized by $ amount or by filling an LTCG bracket ──
function ltcgStopText(v){
  const married=state.filingStatus==='married', st=married?'Married':'Single', q=married?MFJ_QDIV:SGL_QDIV;
  if(v>=20) return 'Up to the 20% bracket \u00b7 no limit (sells the whole balance in range)';
  const j=v>=15?1:0;
  return `Fills the ${j===0?'0%':'15%'} bracket \u00b7 taxable income (ordinary + qualified) \u2264 $${Math.round(q[j].lim).toLocaleString()} (${st})`;
}
function buildWithdrawsHtml(pid,i,bi,b,married){
  const list=Array.isArray(b.withdraws)?b.withdraws:[];
  const sel=(cur,opts,fn)=>`<select onchange="${fn}(this.value)">${opts.map(o=>`<option value="${o[0]}" ${o[0]===cur?'selected':''}>${o[1]}</option>`).join('')}</select>`;
  const rows=list.map((w,wi)=>{
    const base=`${pid}.brokerage.${bi}.withdraws.${wi}`;
    const sm=(w.startMode==='spouse'&&married)?'spouse':'age', em=(w.endMode==='spouse'&&married)?'spouse':(w.endMode==='age'?'age':'pass');
    const startOpts=[['age','Age']].concat(married?[['spouse',"Spouse's age"]]:[]);
    const endOpts=[['age','Age']].concat(married?[['spouse',"Spouse's age"]]:[]).concat([['pass','Pass']]);
    const stops=LTCG_STOPS, idx=convStopIndex(stops, w.ltcgPct), val=stops[idx];
    const opts=(list,cur)=>list.map(o=>`<option value="${o[0]}" ${o[0]===cur?'selected':''}>${o[1]}</option>`).join('');
    return `<div class="item" style="margin:6px 0 0;padding:8px 9px;background:rgba(127,127,127,.06)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;font-size:11px;text-transform:none;letter-spacing:normal"><input type="checkbox" ${w.enabled!==false?'checked':''} onchange="onWithdrawField('${base}.enabled', this.checked, false)"> Withdraw ${wi+1}</label>
        <button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="removeWithdraw(${i},${bi},${wi})">Delete</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
      <div class="field"><label>Start</label>
        <div class="arow"><select onchange="onWithdrawField('${base}.startMode', this.value, true)">${opts(startOpts,sm)}</select>
        <input type="number" min="0" max="110" value="${Number(w.startAge)||0}" oninput="onNumberInput('${base}.startAge', this.value)"></div></div>
      <div class="field"><label>End</label>
        <div class="arow"><select onchange="onWithdrawField('${base}.endMode', this.value, true)">${opts(endOpts,em)}</select>
        <input type="number" min="0" max="110" style="display:${em==='pass'?'none':'inline-block'}" value="${Number(w.endAge)||0}" oninput="onNumberInput('${base}.endAge', this.value)"></div></div>
      </div>
      <div class="field full"><label>Size</label>
        <select onchange="onWithdrawField('${base}.mode', this.value, true)"><option value="amount" ${w.mode!=='bracket'?'selected':''}>Amount (today's $ / yr)</option><option value="bracket" ${w.mode==='bracket'?'selected':''}>Fill an LTCG bracket</option></select>
        ${w.mode==='bracket'
          ? `<div style="margin-top:8px"><label style="font-weight:400;font-size:11px">LTCG bracket</label>
              <input type="range" min="0" max="${stops.length-1}" step="1" value="${idx}" oninput="onWithdrawStop('${base}','${pid}_${bi}_${wi}',this.value)">
              <div class="cn" id="wdLbl_${pid}_${bi}_${wi}" style="margin-top:2px">${ltcgStopText(val)}</div></div>`
          : `<input type="number" class="money" min="0" step="1000" style="margin-top:6px" value="${Number(w.amount)||0}" oninput="onNumberInput('${base}.amount', this.value)">`}
      </div>
    </div>`;
  }).join('');
  return `<div class="field full" style="margin-top:4px">
      <div style="display:flex;align-items:center;justify-content:space-between"><label>Withdraws</label>
        <button type="button" class="btn" style="padding:2px 8px;font-size:10px" onclick="addWithdraw(${i},${bi})">＋ Add withdraw</button></div>
      ${rows||`<div class="item-note" style="margin-top:4px">None. A withdraw sells part of this portfolio on a schedule: the proceeds count as household cash income (paying expenses first, any excess reinvested), and the gain is realized LTCG.</div>`}
      ${list.some(w=>w.mode==='bracket')?`<div class="cn" style="margin-top:4px">Bracket withdraws sell as much as fits with taxable income (ordinary + qualified dividends + LTCG) staying within the chosen LTCG bracket, after any Roth conversion. They apply only while this portfolio is inside its own age range.</div>`:''}
    </div>`;
}
function addWithdraw(i,bi){
  const b=state.people[i].brokerage[bi];
  if(!Array.isArray(b.withdraws)) b.withdraws=[];
  const w=defaultWithdraw(currentAge(state.people[i]));
  w.endAge=Math.max(w.startAge, Math.round(Number(state.passing[state.people[i].id])||95));
  b.withdraws.push(w);
  renderIncomeForms(); recompute(); saveDebounced();
}
function removeWithdraw(i,bi,wi){
  state.people[i].brokerage[bi].withdraws.splice(wi,1);
  renderIncomeForms(); recompute(); saveDebounced();
}
// `rerender`: the mode selects change which fields are shown.
function onWithdrawField(path,val,rerender){
  setPath(path,val);
  if(rerender) renderIncomeForms();
  recompute(); saveDebounced();
}
function onWithdrawStop(path,key,idx){
  const v=LTCG_STOPS[+idx];
  setPath(path+'.ltcgPct', v);
  const el=document.getElementById('wdLbl_'+key); if(el) el.textContent=ltcgStopText(v);
  saveDebounced();
  window.liveDrag=true; recompute(); window.liveDrag=false;
}
