'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / REAL ESTATE — "Real estate" asset card: one or more properties per
// person, added/removed like brokerage portfolios. A property is a passive
// asset: name, value (market value), optional cost basis ($),
// annual change (default: tracks inflation) and a joint-ownership flag. It has
// no dividends, tax-exempt yield, foreign credit, AUM fee, portfolio type or
// age range, and is never sold to pay expenses (it can be sold on a chosen date, see the Sell option below).
// ═══════════════════════════════════════════════════════════════
// Sell option: never (default) | the year the last person starts LTC | the year of the last passing | when the owner reaches an age. A sale moves the
// property's value and cost basis into a brokerage portfolio (the one picked here, else the owner's first non-IDGT portfolio, else the spouse's).
function reSellFields(pid, rp, ri, r){
  const mode=r.sellMode||'never';
  const opt=(v,t)=>`<option value="${v}" ${mode===v?'selected':''}>${t}</option>`;
  let h=`<div class="field full"><label>Sell</label><select onchange="onRealEstateSell('${pid}',${ri},'sellMode',this.value)">${opt('never','Never')}${opt('ltc','When the last person starts LTC')}${opt('passing','At the last person\'s passing')}${opt('age','At an age (owner\'s age)')}</select></div>`;
  if(mode==='age') h+=`<div class="field full"><label>Sell when the owner reaches age</label><input type="number" min="0" max="120" step="1" value="${r.sellAge!=null?r.sellAge:''}" oninput="onNumberInput('${rp}.sellAge', this.value)"></div>`;
  if(mode!=='never'){
    const opts=[`<option value="" ${!r.sellTo?'selected':''}>Automatic (owner's first portfolio)</option>`];
    (state.people||[]).forEach((q,ti)=>(q.brokerage||[]).forEach(b=>{ if(b&&!b.idgt) opts.push(`<option value="${escAttr(b.id)}" ${r.sellTo===b.id?'selected':''}>${escHtml(displayPersonName(q,ti)+' — '+((b.name&&b.name.trim())||'Portfolio'))}</option>`); }));
    h+=`<div class="field full"><label>Move value and cost basis to</label><select onchange="onRealEstateSell('${pid}',${ri},'sellTo',this.value)">${opts.join('')}</select></div>`;
  }
  return h;
}
function buildRealEstateCard(pid, i, p, married){
  const props=Array.isArray(p.realEstate)?p.realEstate:[];
  const lbl='display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px;line-height:1.4';
  return `<div class="item">
      <div class="item-head" onclick="toggleItem(this)">
        <label>Real estate</label>
        <button type="button" class="btn" style="padding:3px 9px;font-size:10px" onclick="event.stopPropagation(); addRealEstate(${i})">＋ Add</button>
      </div>
      <div class="item-body open portfolio-list">
        ${props.length?props.map((r,ri)=>{
          const rp=pid+'.realEstate.'+ri;
          return `
          <div class="item portfolio-card realestate-card" style="margin:0;padding:10px 11px">
            ${cardHeader(`<span class="re-title" style="font-size:12px">${escHtml((r.name&&r.name.trim())||('Property '+(ri+1)))}</span>`, rp+'.enabled', r.enabled!==false, rp+'.hidden', !!r.hidden, `<button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="removeRealEstate(${i},${ri})">Remove</button>`)}
            <div class="item-body ${r.hidden?'':'open'} portfolio-fields">
              <div class="field full"><label>Property name</label><input type="text" maxlength="40" placeholder="Property ${ri+1}" value="${escAttr(r.name||'')}" oninput="onRealEstateName('${pid}',${ri},this.value,this)"></div>
              <div class="field full"><label>Value (today's $)</label><input type="number" class="money" min="0" step="5000" value="${r.balance||0}" oninput="onNumberInput('${rp}.balance', this.value)"></div>
              <div class="field full"><label>Cost basis (today's $) · optional</label><input type="number" class="money" min="0" step="5000" placeholder="Blank = no unrealized gain today" value="${reBasisEntered(r)?r.basis:''}" oninput="onRealEstateBasis('${pid}',${ri},this.value)"></div>
              <div class="field full"><label>Exemption per owner (today's $) · optional</label><input type="number" class="money" min="0" step="5000" placeholder="0" value="${Number(r.exempt)||''}" oninput="onNumberInput('${rp}.exempt', this.value)"></div>
              ${renderChangeRow(rp+'.growth', r.growth, 0)}
              ${married?`<div class="field full"><label style="${lbl}"><input type="checkbox" style="flex:0 0 auto" ${r.bene?'checked':''} onchange="onBeneToggle('${rp}.bene', this.checked)"> Joint owned with spouse</label></div>`:''}
              ${reSellFields(pid, rp, ri, r)}
            </div>
          </div>`;}).join(''):`<div class="item-note">Add one or more properties to include real estate in the asset chart.</div>`}
      </div>
    </div>`;
}
