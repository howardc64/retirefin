'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / REAL ESTATE — "Real estate" asset card: one or more properties per
// person, added/removed like brokerage portfolios. A property is a passive
// asset: name, value (after tax, counting exempt gains), optional cost basis ($),
// annual change (default: tracks inflation) and a joint-ownership flag. It has
// no dividends, tax-exempt yield, foreign credit, AUM fee, portfolio type or
// age range, and is never sold to pay expenses.
// ═══════════════════════════════════════════════════════════════
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
              <div class="field full"><label>Value (incl. exemptions, today's $)</label><input type="number" class="money" min="0" step="5000" value="${r.balance||0}" oninput="onNumberInput('${rp}.balance', this.value)">
                <div class="item-note" style="margin-top:4px">Enter what the property is worth to you after any tax on a sale. A gain covered by an exemption (for example the home-sale exclusion) counts in full. The app computes no tax on this value.</div></div>
              <div class="field full"><label>Cost basis (today's $) · optional</label><input type="number" class="money" min="0" step="5000" placeholder="Blank = no unrealized gain today" value="${reBasisEntered(r)?r.basis:''}" oninput="onRealEstateBasis('${pid}',${ri},this.value)"></div>
              ${renderChangeRow(rp+'.growth', r.growth, 0)}
              ${married?`<div class="field full"><label style="${lbl}"><input type="checkbox" style="flex:0 0 auto" ${r.bene?'checked':''} onchange="onBeneToggle('${rp}.bene', this.checked)"> Joint owned with spouse</label></div>`:''}
            </div>
          </div>`;}).join(''):`<div class="item-note">Add one or more properties to include real estate in the asset chart.</div>`}
      </div>
    </div>`;
}
