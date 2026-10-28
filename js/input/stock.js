'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / STOCK OPTIONS — "Stock options" card: any number of grants per person (name, shares, grant price, market price, vest start / duration,
// release start, "gains count as wage", optional full release schedule). The release rules are in
// compute/stockOptions.js; the projection counts only releases dated today or later.
// ═══════════════════════════════════════════════════════════════
function stkMoney(v) {
  return '$' + Math.round(v).toLocaleString('en-US');
}
function stkShares(v) {
  return (Math.round(v * 100) / 100).toLocaleString('en-US');
}
function stkQ(r) {
  return 'Q' + r.q + ' ' + r.y;
}
// Summary of a grant's releases from today on (gain in today's $).
function stkSummary(g) {
  const sched = stockSchedule(g, stockToday());
  const live = sched.filter(r => !r.past);
  if (!sched.length) return 'No releases yet: enter the number of shares.';
  const gain = live.reduce(
    (a, r) => a + stockGain({shares: r.shares, market: Math.max(0, +g.marketPrice || 0), grant: Math.max(0, +g.grantPrice || 0), marketFuture: !!g.marketFuture}, Math.pow(1 + state.inflation, Math.max(0, r.y - THIS_YEAR))),
    0
  );
  const sh = live.reduce((a, r) => a + r.shares, 0);
  const skipped = sched.length - live.length;
  return (
    live.length +
    ' release' +
    (live.length === 1 ? '' : 's') +
    ' from today (' +
    stkShares(sh) +
    ' shares), gain ' +
    stkMoney(gain) +
    " in today's $" +
    (live.length ? ', first ' + stkQ(live[0]) + ', last ' + stkQ(live[live.length - 1]) : '') +
    (skipped ? '; ' + skipped + ' earlier release' + (skipped === 1 ? '' : 's') + ' skipped (dated before today)' : '') +
    '. ' +
    (g.wage !== false ? 'Counted as wage (ordinary income + payroll tax).' : 'Counted as a long-term capital gain.')
  );
}
function stkScheduleHtml(g) {
  const sched = stockSchedule(g, stockToday());
  if (!sched.length) return '';
  const rows = sched
    .map(r => {
      const gain = stockGain({shares: r.shares, market: Math.max(0, +g.marketPrice || 0), grant: Math.max(0, +g.grantPrice || 0), marketFuture: !!g.marketFuture}, Math.pow(1 + state.inflation, Math.max(0, r.y - THIS_YEAR)));
      return `<tr class="${r.past ? 'stk-past' : ''}"><td>${stkQ(r)} (${r.date.toLocaleDateString('en-US')})</td><td>${stkShares(r.shares)}</td><td>${stkShares(r.releasedTotal)}</td><td>${r.past ? 'n/a' : stkMoney(gain)}</td><td>${r.past ? 'before today: skipped' : 'counted'}</td></tr>`;
    })
    .join('');
  return `<table class="stk-table"><thead><tr><th>Release</th><th>Shares</th><th>Total released</th><th>Gain (today's $)</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
// One grant's fields. `o` = '' (kept for the handlers' prefix).
function stkGrantHtml(i, gi, g, o) {
  const id = i + '_' + gi,
    lbl = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px';
  const num = (field, label, step, val) =>
    `<div class="field"><label>${label}</label><input type="number" min="0" step="${step}" value="${val}" oninput="${o}stkSet(${i},${gi},'${field}',this.value)"></div>`;
  const qsel = (field, val) =>
    `<select onchange="${o}stkSet(${i},${gi},'${field}',this.value)">${[1, 2, 3, 4].map(q => `<option value="${q}" ${+val === q ? 'selected' : ''}>Q${q}</option>`).join('')}</select>`;
  return `<div class="item rental-card stk-grant" style="margin:0 0 8px;padding:10px 11px">
    <div class="item-head"><label><span class="ttl" style="font-size:12px" id="stk_title_${id}">${escHtml((g.name && g.name.trim()) || 'Grant ' + (gi + 1))}</span></label>
      <div class="item-head-right"><button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="${o}stkRemove(${i},${gi})">Delete</button></div></div>
    <div class="item-body open rental-fields">
      <div class="field full"><label>Grant name</label><input type="text" maxlength="40" placeholder="Grant ${gi + 1}" value="${escAttr(g.name || '')}" oninput="${o}stkSet(${i},${gi},'name',this.value)"></div>
      ${num('shares', 'Shares', 1, g.shares || 0)}
      ${num('grantPrice', 'Grant price / share ($)', 0.01, g.grantPrice || 0)}
      ${num('marketPrice', 'Market price / share ($)', 0.01, g.marketPrice || 0)}
      <div class="field"><label>Market price is in</label><label style="${lbl}"><input type="checkbox" ${g.marketFuture ? '' : 'checked'} onchange="${o}stkToggle(${i},${gi},'marketFuture',!this.checked)"> Today's $ (unchecked: future $, a fixed nominal price)</label></div>
      <div class="field"><label>Vest start (quarter, year)</label><div class="arow">${qsel('vestQ', g.vestQ)}<input type="number" min="1990" max="2100" step="1" value="${g.vestY}" oninput="${o}stkSet(${i},${gi},'vestY',this.value)"></div></div>
      ${num('vestN', 'Vest duration (# quarters)', 1, g.vestN || 1)}
      <div class="field"><label>Release start (quarter, year)</label><div class="arow">${qsel('relQ', g.relQ)}<input type="number" min="1990" max="2100" step="1" value="${g.relY}" oninput="${o}stkSet(${i},${gi},'relY',this.value)"></div></div>
      <div class="field"><label>Release schedule</label><div style="font-size:12px;padding:6px 0">1st year, then quarterly</div></div>
      <div class="field full"><label style="${lbl}"><input type="checkbox" ${g.wage !== false ? 'checked' : ''} onchange="${o}stkToggle(${i},${gi},'wage',this.checked)"> Gains count as wage (ordinary income and payroll tax); unchecked: long-term capital gain</label></div>
      <div class="field full"><label style="${lbl}"><input type="checkbox" ${g.showAll ? 'checked' : ''} onchange="${o}stkToggle(${i},${gi},'showAll',this.checked)"> Show the complete release schedule</label></div>
      <div class="field full"><div class="item-note" data-stk-sum="${id}" style="display:block;max-height:none;overflow:visible">${escHtml(stkSummary(g))}</div></div>
      <div class="field full" data-stk-sched="${id}">${g.showAll ? stkScheduleHtml(g) : ''}</div>
    </div></div>`;
}
const STK_NOTE =
  "Each grant vests in equal quarterly installments (the first at the end of the vest-start quarter). Nothing is released before the release start; the first release (end of that quarter) delivers everything vested by then, and every later quarter releases that quarter's installment. The gain of a release is shares × (market price − grant price) — the market price is held flat in today's $ (or, with the box unchecked, flat in future $: a fixed nominal price), and the grant price is a fixed nominal amount, so it shrinks with inflation. Releases dated before today are skipped. Cash-less exercise is assumed: the gain is the cash.";
function buildStockCard(pid, i, p, married) {
  const st = p.stock || {enabled: false, hidden: true, grants: []};
  return `<div class="item">
      ${cardHeader('Stock options', pid + '.stock.enabled', st.enabled, pid + '.stock.hidden', !!st.hidden)}
      <div class="item-body ${st.hidden ? '' : 'open'}">
        <div class="field full" style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" style="padding:3px 9px;font-size:10px" onclick="stkAdd(${i})">＋ Add grant</button>
        </div>
        <div class="field full">${st.grants.length ? st.grants.map((g, gi) => stkGrantHtml(i, gi, g, '')).join('') : '<div class="item-note">Add a grant to include stock-option releases.</div>'}</div>
        <div class="field full"><div class="item-note">${STK_NOTE}</div></div>
      </div>
    </div>`;
}
function stkGrant(i, gi) {
  const p = state.people[i];
  return p && p.stock && p.stock.grants[gi];
}
function stkRefresh(i, full) {
  if (full) renderIncomeForms();
}
// Numeric / text field edits: no redraw of the inputs (focus stays); only the summaries and the schedule are rewritten.
function stkSet(i, gi, field, val) {
  const g = stkGrant(i, gi);
  if (!g) return;
  if (field === 'name') g.name = val;
  else if (field === 'grantPrice' || field === 'marketPrice' || field === 'shares') g[field] = val === '' ? 0 : Math.max(0, +val || 0);
  else if (field === 'vestN') g.vestN = Math.max(1, Math.round(+val) || 1);
  else g[field] = Math.round(+val) || 0;
  if (field === 'vestQ' || field === 'relQ') g[field] = Math.min(4, Math.max(1, g[field]));
  [document].forEach(d => {
    const id = i + '_' + gi,
      sum = d.querySelector(`[data-stk-sum="${id}"]`),
      sch = d.querySelector(`[data-stk-sched="${id}"]`),
      ttl = d.getElementById('stk_title_' + id);
    if (sum) sum.textContent = stkSummary(g);
    if (sch) sch.innerHTML = g.showAll ? stkScheduleHtml(g) : '';
    if (ttl) ttl.textContent = (g.name && g.name.trim()) || 'Grant ' + (gi + 1);
  });
  recomputeDebounced();
  saveDebounced();
}
function stkToggle(i, gi, field, checked) {
  const g = stkGrant(i, gi);
  if (!g) return;
  g[field] = !!checked;
  stkRefresh(i, true);
  recompute();
  saveDebounced();
}
function stkAdd(i) {
  const p = state.people[i];
  if (!p.stock) p.stock = {enabled: false, hidden: true, grants: []};
  p.stock.grants.push(defaultStockGrant(p.stock.grants.length + 1));
  if (!p.stock.enabled) {
    p.stock.enabled = true;
    p.stock.hidden = false;
  }
  stkRefresh(i, true);
  recompute();
  saveDebounced();
}
function stkRemove(i, gi) {
  state.people[i].stock.grants.splice(gi, 1);
  stkRefresh(i, true);
  recompute();
  saveDebounced();
}
