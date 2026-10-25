'use strict';
// DISPLAY / EXCEL — workbook plumbing: cell and sheet builders, number formats, column widths, tables (used by every excel*.js file).

function round1(n) {
  return Math.round((n || 0) * 10) / 10;
}
function pct(n) {
  return Math.round((n || 0) * 1000) / 1000;
} // stored as a fraction; formatted as % below
function sumAnnuities(r, field) {
  let s = 0;
  (r.annuitiesByPerson || []).forEach(list =>
    list.forEach(e => {
      s += e[field] || 0;
    })
  );
  return s;
}
function sumAnnuityPassing(r, field) {
  let s = 0;
  (r.annuitiesByPerson || []).forEach(list =>
    list.forEach(e => {
      if (e.passing) s += e.passing[field] || 0;
    })
  );
  return s;
}
function sumPortfolios(r, idgt, field) {
  let s = 0;
  r.portfoliosByPerson.forEach(list =>
    list.forEach(e => {
      if (!!e.idgt === idgt) s += e[field] || 0;
    })
  );
  return s;
}

// Excel sheet names: max 31 chars, none of  [ ] : * ? / \ , and unique within the workbook.
function xlsxSheetName(base, used) {
  let n =
    String(base)
      .replace(/[\[\]:*?\/\\]/g, '-')
      .trim()
      .slice(0, 31) || 'Sheet';
  let cand = n,
    k = 2;
  while (used.has(cand.toLowerCase())) {
    const suf = ' (' + k + ')';
    cand = n.slice(0, 31 - suf.length) + suf;
    k++;
  }
  used.add(cand.toLowerCase());
  return cand;
}

// ═══ Workbook plumbing ═══════════════════════════════════════════════════════════════════════════
function xlsxCol(n) {
  let s = '';
  n++;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function xlsxSheet() {
  return {ws: {}, maxR: 0, maxC: 0};
}
function xlsxPut(sh, r, c, cell) {
  if (cell == null || (cell.v === undefined && !cell.f)) return;
  sh.ws[XLSX.utils.encode_cell({r, c})] = cell;
  sh.maxR = Math.max(sh.maxR, r);
  sh.maxC = Math.max(sh.maxC, c);
}
const xlsxNum = (v, z) => {
  const c = {t: 'n', v: typeof v === 'number' && isFinite(v) ? v : 0};
  if (z) c.z = z;
  return c;
};
const xlsxTxt = v => ({t: 's', v: String(v == null ? '' : v)});
// Plain value cell from any JS value (numbers stay numbers, '' / null become empty text).
function xlsxVal(v, z) {
  if (typeof v === 'number') return xlsxNum(v, z);
  if (typeof v === 'boolean') return xlsxTxt(v ? 'Yes' : 'No');
  if (v == null || v === '') return null;
  return xlsxTxt(v);
}
// Formula cell. `cached` = the app's own value for that cell (shown by viewers that do not recalculate; Excel recalculates on open).
function xlsxFml(f, cached, z, text) {
  const c =
    text || cached === ''
      ? {t: 's', f, v: String(cached == null ? '' : cached)}
      : {t: 'n', f, v: typeof cached === 'number' && isFinite(cached) ? cached : 0};
  if (z) c.z = z;
  return c;
}
// Characters a number occupies once Excel applies format `z` (dollar sign, thousands commas, decimals, % sign, minus sign).
function xlsxFmtLen(v, z) {
  if (typeof v !== 'number' || !isFinite(v)) return 0;
  if (!z) return String(Math.round(v * 1000) / 1000).length;
  const dec = ((z.match(/\.(0+)/) || [])[1] || '').length,
    pctCell = z.includes('%'),
    pctScaled = pctCell && !z.includes('"%"');
  const x = Math.abs(pctScaled ? v * 100 : v);
  const body = z.includes(',') ? x.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec}) : x.toFixed(dec);
  return body.length + (z.includes('$') ? 1 : 0) + (pctCell ? 1 : 0) + (v < 0 ? 1 : 0);
}
// Column width = widest formatted number in the column (+ padding). A column with no numbers is sized to its longest text
// (capped at 70); in a mixed column, text up to `mixedText` characters also counts. Title and header rows (`sh.skipRows`, row 0)
// never set a width. `minW` keeps narrow columns usable.
function xlsxAutoWidths(sh, minW, mixedText) {
  const num = [],
    text = [],
    skip = sh.skipRows || new Set();
  Object.keys(sh.ws).forEach(a => {
    if (a[0] === '!') return;
    const {r, c} = XLSX.utils.decode_cell(a),
      cell = sh.ws[a];
    if (cell.t === 'n') num[c] = Math.max(num[c] || 0, xlsxFmtLen(cell.v, cell.z));
    else if (r > 0 && !skip.has(r) && cell.v != null) text[c] = Math.max(text[c] || 0, String(cell.v).length);
  });
  const out = [];
  for (let c = 0; c <= sh.maxC; c++) {
    const w = num[c] != null ? Math.max(num[c], Math.min(text[c] || 0, mixedText)) : Math.min(70, text[c] || 0);
    out.push(Math.max(minW, w + 2));
  }
  return out;
}
function xlsxFinish(sh, o) {
  o = o || {};
  sh.ws['!ref'] = XLSX.utils.encode_range({s: {r: 0, c: 0}, e: {r: Math.max(sh.maxR, 0), c: Math.max(sh.maxC, 0)}});
  sh.ws['!cols'] = xlsxAutoWidths(sh, o.minW || 10, o.mixedText || 0).map(w => ({wch: w}));
  return sh.ws;
}
// Number formats (width.decimals): dollars 9.2 ($1,234,567.89), ages and percents 3.1 (65.0, 12.5%), years / counts whole numbers.
// Dollars are the default for any numeric table column that does not name another format.
const XLSX_MONEY = '$#,##0.00',
  XLSX_PCT = '0.0%',
  XLSX_PCT2 = '0.00%',
  XLSX_AGE = '0.0',
  XLSX_YEAR = '0',
  XLSX_COUNT = '0',
  XLSX_PCTNUM = '0.0"%"';

// Generic table: row `top` = column type labels ("formula" / "app value"), top+1 = headers, data below.
// col = {key, head, kind:'v'|'f', fmt, text, tag, v:(row,idx)=>value, f:(X,idx,R,row)=>formula string or null (null → falls back to the value)}   (tag overrides the "formula" / "app value" label above the header)
function xlsxTable(sh, top, cols, rows, opts) {
  opts = opts || {};
  const letter = {};
  cols.forEach((c, i) => (letter[c.key] = xlsxCol(i)));
  const dataTop = top + 2;
  sh.skipRows = sh.skipRows || new Set();
  sh.skipRows.add(top);
  sh.skipRows.add(top + 1); // header rows never set a column's width
  cols.forEach((c, i) => {
    xlsxPut(sh, top, i, xlsxTxt(c.tag || (c.kind === 'f' ? 'formula' : 'app value')));
    xlsxPut(sh, top + 1, i, xlsxTxt(c.head));
  });
  rows.forEach((row, idx) => {
    const r = dataTop + idx,
      R = r + 1;
    const X = (key, off) => {
      if (!letter[key]) throw new Error('xlsx: unknown column ' + key);
      return letter[key] + (R + (off || 0));
    };
    cols.forEach((c, i) => {
      const val = c.v ? c.v(row, idx) : null,
        z = c.fmt || XLSX_MONEY;
      let f = null;
      if (c.kind === 'f' && c.f) f = c.f(X, idx, R, row);
      if (f) xlsxPut(sh, r, i, xlsxFml(f, val, z, c.text));
      else if (c.text) {
        const x = xlsxVal(val);
        if (x) xlsxPut(sh, r, i, x);
      } else {
        const x = typeof val === 'number' ? xlsxNum(val, z) : xlsxVal(val, z);
        if (x) xlsxPut(sh, r, i, x);
      }
    });
  });
  return {letter, dataTop, firstRow: dataTop + 1, lastRow: dataTop + rows.length};
}

// The state whose tax applies to this scenario: 'CA' / 'WA', or null when state income tax is off. The workbook carries ONLY this
// state's tables, inputs and projection columns.
function xlsxSelectedState() {
  const t = state.stateTax;
  if (!t || !t.enabled) return null;
  return t.state === 'WA' ? 'WA' : 'CA';
}
