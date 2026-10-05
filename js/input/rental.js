'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / RENTAL — "Rental income" card (spec §4.4): one or more rental
// properties per person, added/removed like brokerage portfolios. Each has a
// name, taxable annual amount, annual (non-cash) depreciation, age range,
// annual change and an optional survivor flag.
// ═══════════════════════════════════════════════════════════════
function buildRentalCard(pid, p){
  const idx=+pid.split('.')[1], married=state.filingStatus==='married';
  const rentals=Array.isArray(p.rentals)?p.rentals:[];
  const lbl='display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px';
  return `<div class="item">
      <div class="item-head" onclick="toggleItem(this)">
        <label>Rental income</label>
        <button type="button" class="btn" style="padding:3px 9px;font-size:10px" onclick="event.stopPropagation(); addRental(${idx})">＋ Add</button>
      </div>
      <div class="item-body open rental-list">
        ${rentals.length?rentals.map((r,ri)=>{
          const rp=pid+'.rentals.'+ri;
          return `
          <div class="item rental-card" style="margin:0;padding:10px 11px">
            ${cardHeader(`<span class="rt-title" style="font-size:12px">${escHtml((r.name&&r.name.trim())||('Rental '+(ri+1)))}</span>`, rp+'.enabled', r.enabled!==false, rp+'.hidden', !!r.hidden, `<button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="removeRental(${idx},${ri})">Remove</button>`)}
            <div class="item-body ${r.hidden?'':'open'} rental-fields">
              <div class="field full"><label>Rental name</label><input type="text" maxlength="40" placeholder="Rental ${ri+1}" value="${escAttr(r.name||'')}" oninput="onRentalName('${pid}',${ri},this.value,this)"></div>
              <div class="field"><label>Taxable annual amount (today's $)</label>
                <input type="number" class="money" min="0" step="500" value="${r.amount||0}" oninput="onNumberInput('${rp}.amount', this.value)"></div>
              <div class="field"><label>Annual depreciation (today's $) · non-cash</label>
                <input type="number" class="money" min="0" step="500" value="${r.depreciation||0}" oninput="onNumberInput('${rp}.depreciation', this.value)"></div>
              <div class="field full"><div class="item-note">The taxable amount is net of depreciation (Schedule E). Depreciation is cash to the household but untaxed; it is a fixed dollar amount (straight-line), so it shrinks in today's $, and follows this rental's age range.</div></div>
              ${renderAgeRangeRow(rp+'.ar', r.ar, [{value:'now',label:'Now'},{value:'custom',label:'Custom age'}], [{value:'custom',label:'Custom age'},{value:'passing',label:'Passing'}])}
              ${renderChangeRow(rp+'.change', r.change, 0)}
              ${married?`<div class="field full"><label style="${lbl}"><input type="checkbox" ${r.bene?'checked':''} onchange="onBeneToggle('${rp}.bene', this.checked)"> Joint owned with spouse</label></div>`:''}
            </div>
          </div>`;}).join(''):`<div class="item-note">Add one or more rental properties to include rental income.</div>`}
      </div>
    </div>`;
}
