'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / STOCK OPTIONS — the release schedule of a stock option / RSU grant (Stock options card, input/stock.js) and the releases the projection counts.
// Pure functions, no DOM. A grant is {shares, grantPrice, marketPrice, vestQ, vestY, vestN, relQ, relY, wage, showAll} (see defaultStockGrant).
//
// Vesting: `shares` vest in `vestN` equal quarterly installments; installment j (0…vestN−1) vests on the last day of the quarter that is j quarters after the vest-start quarter.
// Release: nothing is released before the release-start quarter. The first release (on the last day of the release-start quarter) delivers everything that has vested by then
// — the "1st year" catch-up — and from then on one release a quarter delivers the installment that vested in that quarter, until all shares are out. A release is dated the last
// day of its quarter. The gain of a release is shares × (market price − grant price) in today's $ (the market price is held flat in today's $, or flat in nominal $ when the grant's "future $" box is checked; the grant price is a fixed nominal amount,
// so it shrinks with inflation — projection.js).
// The projection skips every release dated before today.
// ═══════════════════════════════════════════════════════════════
function stockQuarterIndex(q, y) {
  return (Math.round(Number(y)) || 0) * 4 + ((Math.min(4, Math.max(1, Math.round(Number(q)) || 1)) || 1) - 1);
}
// Last day (local date, 00:00) of the quarter with this index.
function stockQuarterEnd(qi) {
  const y = Math.floor(qi / 4),
    q = qi - y * 4;
  return new Date(y, q * 3 + 3, 0);
}
function stockToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
// Every release of one grant, in date order: [{qi, q, y, date, shares, vestedTotal, past}]. `today` (a Date) marks the releases that are already past (dated before it).
function stockSchedule(g, today) {
  const out = [];
  if (!g) return out;
  const total = Math.max(0, Number(g.shares) || 0),
    n = Math.max(1, Math.round(Number(g.vestN) || 1));
  if (!(total > 0)) return out;
  const v0 = stockQuarterIndex(g.vestQ, g.vestY),
    r0 = stockQuarterIndex(g.relQ, g.relY),
    per = total / n,
    t0 = today || stockToday();
  const last = Math.max(v0 + n - 1, r0);
  let released = 0;
  const push = (qi, sh) => {
    if (!(sh > 1e-9)) return;
    const y = Math.floor(qi / 4),
      date = stockQuarterEnd(qi);
    released += sh;
    out.push({qi, q: qi - y * 4 + 1, y, date, shares: sh, vestedTotal: Math.min(total, per * Math.max(0, Math.min(n, qi - v0 + 1))), releasedTotal: released, past: date < t0});
  };
  // first release: everything vested up to and including the release-start quarter
  push(r0, per * Math.max(0, Math.min(n, r0 - v0 + 1)));
  for (let qi = r0 + 1; qi <= last; qi++) if (qi >= v0 && qi < v0 + n) push(qi, per);
  return out;
}
// What the projection counts for one person: byRow[k] = list of {shares, market, grant, isWage, name} for the releases in calendar year THIS_YEAR + k that are not dated before today.
// Releases of a grant with no shares or a disabled card are not included.
function stockReleasesByRow(person, today) {
  const byRow = {};
  const st = person && person.stock;
  if (!st || !st.enabled || !Array.isArray(st.grants)) return byRow;
  st.grants.forEach((g, gi) => {
    const nm = (g && g.name && g.name.trim()) || 'Grant ' + (gi + 1);
    stockSchedule(g, today).forEach(r => {
      if (r.past) return;
      const k = r.y - THIS_YEAR;
      if (k < 0) return;
      (byRow[k] || (byRow[k] = [])).push({
        shares: r.shares,
        market: Math.max(0, Number(g.marketPrice) || 0),
        grant: Math.max(0, Number(g.grantPrice) || 0),
        isWage: g.wage !== false,
        marketFuture: !!g.marketFuture,
        name: nm
      });
    });
  });
  return byRow;
}
// A release's gain in today's $ in year row k: shares × max(0, market price − grant price deflated by `cpi` (the price level of that year)).
// The market price is in today's $ (held flat in real terms) unless `rel.marketFuture`: then it is a price in the dollars of the release date (held flat in nominal terms), so in today's $ it is market / cpi.
function stockGain(rel, cpi) {
  const c = cpi > 0 ? cpi : 1;
  return rel.shares * Math.max(0, (rel.marketFuture ? rel.market / c : rel.market) - rel.grant / c);
}
