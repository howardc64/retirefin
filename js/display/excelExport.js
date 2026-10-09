'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / EXCEL EXPORT — "Export to Excel" button (next to Notes)
// downloads the plan as a .xlsx workbook that is a LIVE model, not just a table of numbers:
//   • "Inputs" sheet — every assumption and input value (household, Social Security, pension, portfolios, IRAs, LTC, fees…).
//     Inflation, first year, passing ages, SCGL and the future-NIIT assumption are named cells the formulas use.
//   • "Tax tables" sheet — brackets, standard / senior deductions, qualified-dividend tiers, SS thresholds, NIIT, IRMAA tiers (named ranges).
//   • "Projection by year" — one row per year. Income sources, expense funding and other waterfall results are the app's
//     computed values (they come out of the app's iterative expense / LTCG / Roth-conversion solver); everything downstream
//     of them — totals, taxable SS, AGI, deductions, ordinary / qualified tax, NIIT, total tax, IRMAA, effective rate,
//     expense totals, balances — is an Excel formula, so editing a value or a tax-table entry flows through.
//   • One sheet per portfolio / annuity / IRA / Roth with roll-forward formulas.
// Read-only: never writes back into `state`. Uses the
// SheetJS ("xlsx") library, loaded the same way Chart.js is (a
// pinned CDN <script src> in index.html), so this file, like every
// other display file, only touches the DOM/browser APIs — no new
// financial logic lives here, it only formats numbers `projection.js`
// already computed.
// ═══════════════════════════════════════════════════════════════


function round1(n){ return Math.round((n||0)*10)/10; }
function pct(n){ return Math.round((n||0)*1000)/1000; } // stored as a fraction; formatted as % below
function sumAnnuities(r,field){
  let s=0; (r.annuitiesByPerson||[]).forEach(list=>list.forEach(e=>{ s+=(e[field]||0); })); return s;
}
function sumAnnuityPassing(r,field){
  let s=0; (r.annuitiesByPerson||[]).forEach(list=>list.forEach(e=>{ if(e.passing) s+=(e.passing[field]||0); })); return s;
}
function sumPortfolios(r,idgt,field){
  let s=0; r.portfoliosByPerson.forEach(list=>list.forEach(e=>{ if(!!e.idgt===idgt) s+=(e[field]||0); }));
  return s;
}

// Excel sheet names: max 31 chars, none of  [ ] : * ? / \ , and unique within the workbook.
function xlsxSheetName(base, used){
  let n=String(base).replace(/[\[\]:*?\/\\]/g,'-').trim().slice(0,31)||'Sheet';
  let cand=n, k=2;
  while(used.has(cand.toLowerCase())){
    const suf=' ('+k+')'; cand=n.slice(0,31-suf.length)+suf; k++;
  }
  used.add(cand.toLowerCase());
  return cand;
}


// ═══ Workbook plumbing ═══════════════════════════════════════════════════════════════════════════
function xlsxCol(n){ let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
function xlsxSheet(){ return {ws:{}, maxR:0, maxC:0}; }
function xlsxPut(sh,r,c,cell){
  if(cell==null||cell.v===undefined&&!cell.f) return;
  sh.ws[XLSX.utils.encode_cell({r,c})]=cell; sh.maxR=Math.max(sh.maxR,r); sh.maxC=Math.max(sh.maxC,c);
}
const xlsxNum=(v,z)=>{ const c={t:'n',v:(typeof v==='number'&&isFinite(v))?v:0}; if(z) c.z=z; return c; };
const xlsxTxt=v=>({t:'s',v:String(v==null?'':v)});
// Plain value cell from any JS value (numbers stay numbers, '' / null become empty text).
function xlsxVal(v,z){ if(typeof v==='number') return xlsxNum(v,z); if(typeof v==='boolean') return xlsxTxt(v?'Yes':'No'); if(v==null||v==='') return null; return xlsxTxt(v); }
// Formula cell. `cached` = the app's own value for that cell (shown by viewers that do not recalculate; Excel recalculates on open).
function xlsxFml(f,cached,z,text){
  const c=(text||cached==='')?{t:'s',f,v:String(cached==null?'':cached)}:{t:'n',f,v:(typeof cached==='number'&&isFinite(cached))?cached:0};
  if(z) c.z=z; return c;
}
// Characters a number occupies once Excel applies format `z` (dollar sign, thousands commas, decimals, % sign, minus sign).
function xlsxFmtLen(v,z){
  if(typeof v!=='number'||!isFinite(v)) return 0;
  if(!z) return String(Math.round(v*1000)/1000).length;
  const dec=((z.match(/\.(0+)/)||[])[1]||'').length, pctCell=z.includes('%'), pctScaled=pctCell&&!z.includes('"%"');
  const x=Math.abs(pctScaled?v*100:v);
  const body=z.includes(',')?x.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}):x.toFixed(dec);
  return body.length+(z.includes('$')?1:0)+(pctCell?1:0)+(v<0?1:0);
}
// Column width = widest formatted number in the column (+ padding). A column with no numbers is sized to its longest text
// (capped at 70); in a mixed column, text up to `mixedText` characters also counts. Title and header rows (`sh.skipRows`, row 0)
// never set a width. `minW` keeps narrow columns usable.
function xlsxAutoWidths(sh,minW,mixedText){
  const num=[], text=[], skip=sh.skipRows||new Set();
  Object.keys(sh.ws).forEach(a=>{
    if(a[0]==='!') return;
    const {r,c}=XLSX.utils.decode_cell(a), cell=sh.ws[a];
    if(cell.t==='n') num[c]=Math.max(num[c]||0,xlsxFmtLen(cell.v,cell.z));
    else if(r>0&&!skip.has(r)&&cell.v!=null) text[c]=Math.max(text[c]||0,String(cell.v).length);
  });
  const out=[];
  for(let c=0;c<=sh.maxC;c++){
    const w=(num[c]!=null)?Math.max(num[c],Math.min(text[c]||0,mixedText)):Math.min(70,text[c]||0);
    out.push(Math.max(minW,w+2));
  }
  return out;
}
function xlsxFinish(sh,o){
  o=o||{};
  sh.ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(sh.maxR,0),c:Math.max(sh.maxC,0)}});
  sh.ws['!cols']=xlsxAutoWidths(sh,o.minW||10,o.mixedText||0).map(w=>({wch:w}));
  return sh.ws;
}
// Number formats (width.decimals): dollars 9.2 ($1,234,567.89), ages and percents 3.1 (65.0, 12.5%), years / counts whole numbers.
// Dollars are the default for any numeric table column that does not name another format.
const XLSX_MONEY='$#,##0.00', XLSX_PCT='0.0%', XLSX_AGE='0.0', XLSX_YEAR='0', XLSX_COUNT='0', XLSX_PCTNUM='0.0"%"';

// Generic table: row `top` = column type labels ("formula" / "app value"), top+1 = headers, data below.
// col = {key, head, kind:'v'|'f', fmt, text, v:(row,idx)=>value, f:(X,idx,R)=>formula string or null (null → falls back to the value)}
function xlsxTable(sh, top, cols, rows, opts){
  opts=opts||{};
  const letter={}; cols.forEach((c,i)=>letter[c.key]=xlsxCol(i));
  const dataTop=top+2;
  sh.skipRows=sh.skipRows||new Set(); sh.skipRows.add(top); sh.skipRows.add(top+1);   // header rows never set a column's width
  cols.forEach((c,i)=>{
    xlsxPut(sh,top,i,xlsxTxt(c.kind==='f'?'formula':'app value'));
    xlsxPut(sh,top+1,i,xlsxTxt(c.head));
  });
  rows.forEach((row,idx)=>{
    const r=dataTop+idx, R=r+1;
    const X=(key,off)=>{ if(!letter[key]) throw new Error('xlsx: unknown column '+key); return letter[key]+(R+(off||0)); };
    cols.forEach((c,i)=>{
      const val=c.v?c.v(row,idx):null, z=c.fmt||XLSX_MONEY;
      let f=null;
      if(c.kind==='f'&&c.f) f=c.f(X,idx,R,row);
      if(f) xlsxPut(sh,r,i,xlsxFml(f,val,z,c.text));
      else if(c.text) { const x=xlsxVal(val); if(x) xlsxPut(sh,r,i,x); }
      else { const x=(typeof val==='number')?xlsxNum(val,z):xlsxVal(val,z); if(x) xlsxPut(sh,r,i,x); }
    });
  });
  return {letter, dataTop, firstRow:dataTop+1, lastRow:dataTop+rows.length};
}

// The state whose tax applies to this plan: 'CA' / 'WA', or null when state income tax is off. The workbook carries ONLY this
// state's tables, inputs and projection columns.
function xlsxSelectedState(){
  const t=state.stateTax;
  if(!t||!t.enabled) return null;
  return t.state==='WA'?'WA':'CA';
}

// ═══ Tax tables sheet ════════════════════════════════════════════════════════════════════════════
// Returns {ws, names[]} — every scalar and bracket array is a defined name the Projection formulas use.
function xlsxTaxSheet(){
  const sh=xlsxSheet(), names=[]; let r=0;
  const title=t=>{ xlsxPut(sh,r,0,xlsxTxt(t)); r++; };
  const scalar=(label,name,v,z,note)=>{ xlsxPut(sh,r,0,xlsxTxt(label)); xlsxPut(sh,r,1,xlsxNum(v,z)); if(note) xlsxPut(sh,r,2,xlsxTxt(note)); names.push({Name:name,Ref:`'Tax tables'!$B$${r+1}`}); r++; };
  title('Tax tables used by the Projection sheet formulas (edit a value and the whole projection recalculates). Source: the app\'s 2026 simplified federal model (js/core/constants.js).');
  r++;
  title('Standard deduction, senior deduction, NIIT, Social Security taxability');
  scalar('Standard deduction, married (MFJ)','Std_MFJ',STD_MFJ,XLSX_MONEY);
  scalar('Standard deduction, single','Std_SGL',STD_SGL,XLSX_MONEY);
  scalar('Itemized floor (LTC cost above this % of AGI)','ItemFloor',0.075,XLSX_PCT);
  scalar('Senior deduction per eligible person','SenDed',SENIOR_DED,XLSX_MONEY,'Fixed amount, deflated to today\'s $ in the projection');
  scalar('Senior deduction phase-out starts, MFJ MAGI','SenThrMFJ',SENIOR_THRESH_MFJ,XLSX_MONEY);
  scalar('Senior deduction phase-out starts, single MAGI','SenThrSGL',SENIOR_THRESH_SGL,XLSX_MONEY);
  scalar('Senior deduction phase-out rate','SenRate',SENIOR_RATE,XLSX_PCT);
  scalar('Marginal-rate step: extra non-SS ordinary income used to measure the marginal rate on ordinary income','MargBump',100,XLSX_MONEY);
  scalar('NIIT rate','NIIT_Rate',NIIT_RATE,XLSX_PCT);
  scalar('NIIT threshold, MFJ MAGI (current law, not indexed)','NIIT_MFJ',NIIT_THRESH_MFJ,XLSX_MONEY);
  scalar('NIIT threshold, single MAGI (current law, not indexed)','NIIT_SGL',NIIT_THRESH_SGL,XLSX_MONEY);
  scalar('SS taxability tier 1 starts, MFJ provisional income','SS_MFJ_1',32000,XLSX_MONEY,'Not indexed: deflated to today\'s $ in the projection');
  scalar('SS taxability tier 2 starts, MFJ','SS_MFJ_2',44000,XLSX_MONEY);
  scalar('SS tier 2 base amount, MFJ','SS_MFJ_Amt',6000,XLSX_MONEY);
  scalar('SS taxability tier 1 starts, single','SS_SGL_1',25000,XLSX_MONEY);
  scalar('SS taxability tier 2 starts, single','SS_SGL_2',34000,XLSX_MONEY);
  scalar('SS tier 2 base amount, single','SS_SGL_Amt',4500,XLSX_MONEY);
  scalar('SS taxable share, tier 1','SS_Lo',0.5,XLSX_PCT);
  scalar('SS taxable share, tier 2','SS_Hi',0.85,XLSX_PCT);
  r++;
  title('Qualified dividend / LTCG tiers (taxable income where each rate stops)');
  scalar('0% tier ends, MFJ','QD_MFJ_1',MFJ_QDIV[0].lim,XLSX_MONEY);
  scalar('15% tier ends, MFJ','QD_MFJ_2',MFJ_QDIV[1].lim,XLSX_MONEY);
  scalar('0% tier ends, single','QD_SGL_1',SGL_QDIV[0].lim,XLSX_MONEY);
  scalar('15% tier ends, single','QD_SGL_2',SGL_QDIV[1].lim,XLSX_MONEY);
  scalar('Middle tier rate','QD_R2',MFJ_QDIV[1].r,XLSX_PCT);
  scalar('Top tier rate','QD_R3',MFJ_QDIV[2].r,XLSX_PCT);
  r++;
  title('Ordinary brackets: lower edge of each bracket and the rate step (rate − previous rate) the tax formula sums');
  const hdr=r; ['MFJ bracket starts','MFJ rate','MFJ rate step','','Single bracket starts','Single rate','Single rate step'].forEach((h,i)=>{ if(h) xlsxPut(sh,r,i,xlsxTxt(h)); }); r++;
  const n=MFJ_ORD.length, top=r;
  for(let j=0;j<n;j++){
    const R=r+1;
    xlsxPut(sh,r,0,xlsxNum(j===0?0:MFJ_ORD[j-1].lim,XLSX_MONEY)); xlsxPut(sh,r,1,xlsxNum(MFJ_ORD[j].r,XLSX_PCT));
    xlsxPut(sh,r,2,j===0?xlsxFml(`B${R}`,MFJ_ORD[j].r,XLSX_PCT):xlsxFml(`B${R}-B${R-1}`,MFJ_ORD[j].r-MFJ_ORD[j-1].r,XLSX_PCT));
    xlsxPut(sh,r,4,xlsxNum(j===0?0:SGL_ORD[j-1].lim,XLSX_MONEY)); xlsxPut(sh,r,5,xlsxNum(SGL_ORD[j].r,XLSX_PCT));
    xlsxPut(sh,r,6,j===0?xlsxFml(`F${R}`,SGL_ORD[j].r,XLSX_PCT):xlsxFml(`F${R}-F${R-1}`,SGL_ORD[j].r-SGL_ORD[j-1].r,XLSX_PCT));
    r++;
  }
  const rng=(c)=>`'Tax tables'!$${c}$${top+1}:$${c}$${top+n}`;
  names.push({Name:'MFJ_Lo',Ref:rng('A')},{Name:'MFJ_dR',Ref:rng('C')},{Name:'SGL_Lo',Ref:rng('E')},{Name:'SGL_dR',Ref:rng('G')});
  r++;
  title('IRMAA: MAGI where each tier starts and the combined annual Part B + Part D surcharge per enrolled person');
  ['MFJ MAGI from','MFJ surcharge / person / yr','','Single MAGI from','Single surcharge / person / yr'].forEach((h,i)=>{ if(h) xlsxPut(sh,r,i,xlsxTxt(h)); }); r++;
  const m=IRMAA_MFJ.length, t2=r;
  for(let j=0;j<m;j++){
    xlsxPut(sh,r,0,xlsxNum(IRMAA_MFJ[j].magi,XLSX_MONEY)); xlsxPut(sh,r,1,xlsxNum(IRMAA_MFJ[j].surch,XLSX_MONEY));
    xlsxPut(sh,r,3,xlsxNum(IRMAA_SGL[j].magi,XLSX_MONEY)); xlsxPut(sh,r,4,xlsxNum(IRMAA_SGL[j].surch,XLSX_MONEY)); r++;
  }
  const rng2=(c)=>`'Tax tables'!$${c}$${t2+1}:$${c}$${t2+m}`;
  names.push({Name:'IR_MFJ_Lo',Ref:rng2('A')},{Name:'IR_MFJ_S',Ref:rng2('B')},{Name:'IR_SGL_Lo',Ref:rng2('D')},{Name:'IR_SGL_S',Ref:rng2('E')},
    {Name:'IR_MFJ_1',Ref:`'Tax tables'!$A$${t2+1}`},{Name:'IR_SGL_1',Ref:`'Tax tables'!$D$${t2+1}`});
  r++;
  const selSt=xlsxSelectedState();
  if(selSt==='CA'){
    title('State income tax (Inputs: State income tax). California: 2025 brackets, state standard deduction and credits. Held flat in today\'s $ (the state indexes them); only the Mental Health Services threshold is deflated.');
    scalar('California standard deduction, married (MFJ)','CA_Std_MFJ',CA_STD_MFJ,XLSX_MONEY);
    scalar('California standard deduction, single','CA_Std_SGL',CA_STD_SGL,XLSX_MONEY);
    scalar('California personal exemption credit, per living person','CA_Cred',CA_PERSONAL_CREDIT,XLSX_MONEY);
    scalar('California senior (65+) exemption credit, per living person','CA_SrCred',CA_SENIOR_CREDIT,XLSX_MONEY);
    scalar('California Mental Health Services surcharge starts at taxable income','CA_MH_Thr',CA_MH_THRESH,XLSX_MONEY,'Not indexed: deflated to today\'s $ in the projection');
    scalar('California Mental Health Services surcharge rate','CA_MH_Rate',CA_MH_RATE,XLSX_PCT);
  } else if(selSt==='WA'){
    title('State income tax (Inputs: State income tax). Washington: capital-gains excise tax. Held flat in today\'s $ (the state indexes them); only the second-tier threshold is deflated.');
    scalar('Washington capital-gains deduction (one per household)','WA_Ded',WA_CG_DEDUCTION,XLSX_MONEY);
    scalar('Washington capital-gains rate, first tier','WA_R1',WA_CG_RATE,XLSX_PCT);
    scalar('Washington second tier starts at taxable gain','WA_T2',WA_CG_TIER2,XLSX_MONEY,'Not indexed: deflated to today\'s $ in the projection');
    scalar('Washington capital-gains rate, second tier','WA_R2',WA_CG_RATE2,XLSX_PCT);
  }
  if(selSt==='CA'){
    r++;
    title('California brackets: lower edge of each bracket and the rate step the tax formula sums');
    ['MFJ bracket starts','MFJ rate','MFJ rate step','','Single bracket starts','Single rate','Single rate step'].forEach((h,i)=>{ if(h) xlsxPut(sh,r,i,xlsxTxt(h)); }); r++;
    const nc=CA_ORD_MFJ.length, topC=r;
    for(let j=0;j<nc;j++){
      const R=r+1;
      xlsxPut(sh,r,0,xlsxNum(j===0?0:CA_ORD_MFJ[j-1].lim,XLSX_MONEY)); xlsxPut(sh,r,1,xlsxNum(CA_ORD_MFJ[j].r,XLSX_PCT));
      xlsxPut(sh,r,2,j===0?xlsxFml(`B${R}`,CA_ORD_MFJ[j].r,XLSX_PCT):xlsxFml(`B${R}-B${R-1}`,CA_ORD_MFJ[j].r-CA_ORD_MFJ[j-1].r,XLSX_PCT));
      xlsxPut(sh,r,4,xlsxNum(j===0?0:CA_ORD_SGL[j-1].lim,XLSX_MONEY)); xlsxPut(sh,r,5,xlsxNum(CA_ORD_SGL[j].r,XLSX_PCT));
      xlsxPut(sh,r,6,j===0?xlsxFml(`F${R}`,CA_ORD_SGL[j].r,XLSX_PCT):xlsxFml(`F${R}-F${R-1}`,CA_ORD_SGL[j].r-CA_ORD_SGL[j-1].r,XLSX_PCT));
      r++;
    }
    const rngC=(c)=>`'Tax tables'!$${c}$${topC+1}:$${c}$${topC+nc}`;
    names.push({Name:'CA_MFJ_Lo',Ref:rngC('A')},{Name:'CA_MFJ_dR',Ref:rngC('C')},{Name:'CA_SGL_Lo',Ref:rngC('E')},{Name:'CA_SGL_dR',Ref:rngC('G')});

  }
  return {ws:xlsxFinish(sh,{minW:14,mixedText:60}), names};
}

// Format for an Inputs-sheet number from its label: ages 3.1, percents 3.1 (values already in percent units), whole-number
// years / months / counts, otherwise dollars 9.2.
function xlsxLabelFmt(label){
  const l=String(label).toLowerCase();
  if(/\b(year|years|month|count)\b/.test(l)) return XLSX_COUNT;
  if(/\bage\b/.test(l)) return XLSX_AGE;
  if(/%|\b(pct|percent|yield|rate)\b/.test(l)) return XLSX_PCTNUM;
  return XLSX_MONEY;
}
// Same idea for the raw field names dumped for annuities / rentals / real estate (camelCase keys).
function xlsxFieldFmt(key){
  const k=String(key).replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();
  return xlsxLabelFmt(k);
}
// ═══ Inputs sheet ════════════════════════════════════════════════════════════════════════════════
// Every assumption / input of the saved plan, laid out label | value | note. `addr(name)` finds a cell for the account sheets.
function xlsxInputsSheet(proj){
  const sh=xlsxSheet(), names=[], addr={}; let r=0;
  const st=state;
  const put=(label,value,o)=>{
    o=o||{};
    xlsxPut(sh,r,0,xlsxTxt(label));
    const c=(typeof value==='number')?xlsxNum(value,o.fmt||xlsxLabelFmt(label)):xlsxVal(value,o.fmt);
    if(c) xlsxPut(sh,r,1,c);
    if(o.note) xlsxPut(sh,r,2,xlsxTxt(o.note));
    if(o.key) addr[o.key]=`Inputs!$B$${r+1}`;
    if(o.name) names.push({Name:o.name,Ref:`Inputs!$B$${r+1}`});
    r++;
  };
  const head=t=>{ r++; xlsxPut(sh,r,0,xlsxTxt(t)); r++; };
  const yn=v=>v?'Yes':'No';
  xlsxPut(sh,r++,0,xlsxTxt('INPUTS & ASSUMPTIONS of the saved plan (all money in today\'s $). Cells marked as a name below are used by formulas in the other sheets; the rest document the plan the app solved.')); 
  xlsxPut(sh,r++,0,xlsxTxt('Changing a named cell here recalculates the formula columns, but the income / expense-funding / Roth-conversion amounts on "Projection by year" are the app\'s solved values: re-export after changing the plan in the app for those.'));
  head('Household');
  put('Filing status',st.filingStatus==='married'?'Married (MFJ)':'Single',{key:'filing'});
  put('Year 0 (first projected year)',THIS_YEAR,{name:'BaseYear',fmt:XLSX_YEAR});
  put('Inflation (SS COLA assumed equal)',st.inflation,{name:'Inflation',fmt:'0.00%',key:'inflation'});
  put('Household living expenses / yr',Number(st.living)||0,{fmt:XLSX_MONEY,key:'living'});
  put('Suspended capital-gain loss (SCGL) pool enabled',yn(st.scglEnabled!==false),{key:'scglOn'});
  put('SCGL pool',Number(st.scgl)||0,{fmt:XLSX_MONEY,key:'scgl'});
  names.push({Name:'SCGL_Start',Ref:`Inputs!$B$${r+1}`});
  xlsxPut(sh,r,0,xlsxTxt('SCGL used by the projection (0 when not enabled)'));
  xlsxPut(sh,r,1,xlsxFml(`IF(${addr.scglOn.replace('Inputs!','')}="Yes",${addr.scgl.replace('Inputs!','')},0)`,st.scglEnabled===false?0:Math.max(0,Number(st.scgl)||0),XLSX_MONEY)); r++;
  put('Asset / basis swap',yn(!!st.basisSwap),{note:'Years before last passing: '+(st.basisSwapYears==null?BASIS_SWAP_YEARS_DEFAULT:st.basisSwapYears)});
  const aum=st.aumFee||{};
  put('AUM fee enabled',yn(aum.enabled),{}); put('AUM fee mode',aum.mode==='pct'?'% of AUM balance':'Fixed $ / yr (today\'s $)'); put('AUM fee value',Number(aum.value)||0,{fmt:aum.mode==='pct'?XLSX_PCTNUM:XLSX_MONEY});
  head('State income tax');
  put('State income tax enabled',yn(st.stateTax&&st.stateTax.enabled),{name:'State_On'});
  if(xlsxSelectedState()) put('State',xlsxSelectedState()==='WA'?'Washington':'California');
  head('Future tax-law assumption (NIIT thresholds)');
  put('Enabled',yn(st.futureTax&&st.futureTax.enabled),{key:'futOn'});
  names.push({Name:'FutNIIT_On',Ref:`Inputs!$B$${r}`});
  put('NIIT change starts in year',Number(st.futureTax&&st.futureTax.niitStartYear)||0,{name:'FutNIIT_Start',fmt:XLSX_YEAR});
  put('NIIT threshold, single',Number(st.futureTax&&st.futureTax.niitSingle)||0,{name:'FutNIIT_SGL',fmt:XLSX_MONEY});
  put('NIIT threshold, married',Number(st.futureTax&&st.futureTax.niitMarried)||0,{name:'FutNIIT_MFJ',fmt:XLSX_MONEY});
  const ltc=st.ltc||{};
  head('Long Term Care');
  put('LTC modeled',yn(ltc.enabled));
  (ltc.people||[]).forEach((L,i)=>{ if(i>0&&st.filingStatus!=='married') return; put(`Person ${i+1}: LTC starts at age`,Number(L.startAge)||0); put(`Person ${i+1}: LTC cost / yr`,Number(L.cost)||0,{fmt:XLSX_MONEY}); });
  put('Household living expenses once 1st LTC starts',Math.max(0,Number(ltc.living1!=null?ltc.living1:ltcLiving1Default(st.filingStatus==='married'))||0),{fmt:XLSX_MONEY});
  put('Household living expenses once 2nd LTC starts',Number(ltc.living2)||0,{fmt:XLSX_MONEY});

  proj.people.forEach((p,i)=>{
    const nm=displayPersonName(p,i), pass=st.passing[p.id]!=null?st.passing[p.id]:95;
    head(`${nm}`);
    put('Name',nm); put('Birth year',p.birthYear,{fmt:XLSX_YEAR,key:`birthYear${i}`}); put('Birth month',p.birthMonth);
    put('Passing age (plan ends)',pass,{name:`Pass_${i+1}`});
    const w=p.wage||{}; put('Wage income',yn(w.enabled)); put('  amount / yr',Number(w.amount)||0,{fmt:XLSX_MONEY});
    const s=p.ss||{}; put('Social Security',yn(s.enabled)); put('  PIA / month',Number(s.pia)||0,{fmt:XLSX_MONEY}); put('  full retirement age',Number(s.fra)||0); put('  already started',yn(s.started)); put('  claim age',Number(s.claimAge)||0);
    const pn=p.pension||{}; put('Pension',yn(pn.enabled)); put('  amount / yr',Number(pn.amount)||0,{fmt:XLSX_MONEY}); put('  inherited by spouse',yn(pn.bene));
    const ira=p.ira||{}; put('Pre-tax IRA',yn(ira.enabled)); put('  balance',Number(ira.balance)||0,{fmt:XLSX_MONEY,key:`ira${i}Bal`});
    put('  growth mode',ira.growth&&ira.growth.mode,{key:`ira${i}GMode`}); put('  growth value (% nominal, or offset %)',ira.growth?Number(ira.growth.value)||0:0,{key:`ira${i}GVal`});
    put('  Roth conversion mode',ira.convMode==='bracket'?'Up to bracket / IRMAA limits':'Fixed amount'); put('  fixed conversion / yr',Number(ira.conv)||0,{fmt:XLSX_MONEY});
    put('  conversion ordinary-bracket limit (%)',ira.convOrdPct==null?'none':ira.convOrdPct); put('  conversion IRMAA limit (Part B % over standard)',ira.convIrmaaPct==null?'none':ira.convIrmaaPct);
    put('  conversion start',ira.convStartMode); put('  inherited by spouse',yn(ira.bene)); put('  held by heirs after last passing (stretch)',yn(ira.stretch)); put('  counts toward AUM fee',yn(ira.aum));
    const ro=p.roth||{}; put('Roth IRA',yn(ro.enabled)); put('  balance',Number(ro.balance)||0,{fmt:XLSX_MONEY,key:`roth${i}Bal`});
    put('  growth mode',ro.growth&&ro.growth.mode,{key:`roth${i}GMode`}); put('  growth value (% nominal, or offset %)',ro.growth?Number(ro.growth.value)||0:0,{key:`roth${i}GVal`});
    put('  inherited by spouse',yn(ro.bene)); put('  held by heirs after last passing (stretch)',yn(ro.stretch));
    (p.brokerage||[]).forEach((b,bi)=>{
      const lab=`Portfolio ${bi+1}: ${(b.name&&b.name.trim())||'(unnamed)'}${b.idgt?' (IDGT)':''}`;
      put(lab,yn(b.enabled!==false)); put('  balance',Number(b.balance)||0,{fmt:XLSX_MONEY,key:`pf${i}_${bi}Bal`});
      put('  growth mode',b.growth&&b.growth.mode,{key:`pf${i}_${bi}GMode`}); put('  growth value (% nominal, or offset %)',b.growth?Number(b.growth.value)||0:0,{key:`pf${i}_${bi}GVal`});
      put('  dividend yield %',Number(b.yield)||0); put('  qualified share of dividends %',Number(b.qdivPct)||0); put('  tax-exempt yield %',Number(b.teYield)||0);
      put('  cost basis % of balance',b.basisPct==null||b.basisPct===''?'(blank = no gain)':Number(b.basisPct)); put('  foreign-income %',Number(b.foreignPct)||0); put('  foreign tax credit %',Number(b.ftcPct)||0);
      put('  type',b.type); put('  pays household expenses',yn(b.payExp)); put('  reinvests excess income',yn(b.reinvest)); put('  counts toward AUM fee',yn(b.aum)); put('  joint with spouse / inherited',yn(b.bene));
    });
    const dump=(title,list)=>(list||[]).forEach((o,j)=>{
      put(`${title} ${j+1}`,o.name||'');
      Object.keys(o).forEach(k=>{ const v=o[k]; if(k==='id'||k==='hidden'||k==='name') return;
        if(v&&typeof v==='object'){ Object.keys(v).forEach(k2=>{ if(typeof v[k2]!=='object') put(`  ${k}.${k2}`,v[k2],{fmt:xlsxFieldFmt(k2)}); }); }
        else put(`  ${k}`,typeof v==='boolean'?yn(v):v,{fmt:xlsxFieldFmt(k)}); });
    });
    dump('Annuity',p.annuities); dump('Rental',p.rentals);
    (p.realEstate||[]).forEach((r,ri)=>{
      const lab=`Real estate ${ri+1}: ${(r.name&&r.name.trim())||'(unnamed)'}`, mode=r.sellMode||'never';
      const sellTo=(()=>{ if(!r.sellTo) return 'Automatic (owner\'s first non-IDGT portfolio)'; let nm='(portfolio no longer exists)'; st.people.forEach((q,ti)=>(q.brokerage||[]).forEach(b=>{ if(b.id===r.sellTo) nm=`${displayPersonName(q,ti)} — ${(b.name&&b.name.trim())||'Portfolio'}`; })); return nm; })();
      put(lab,yn(r.enabled!==false)); put('  value',Number(r.balance)||0,{fmt:XLSX_MONEY,key:`re${i}_${ri}Val`});
      put('  cost basis',reBasisEntered(r)?Number(r.basis):'(blank = no unrealized gain)',{fmt:XLSX_MONEY,key:`re${i}_${ri}Basis`});
      put('  exemption per owner alive at a sale',Number(r.exempt)||0,{fmt:XLSX_MONEY,key:`re${i}_${ri}Exempt`,note:'Fixed nominal amount: erodes with inflation in today\'s $, like the cost basis'});
      put('  growth mode',r.growth&&r.growth.mode,{key:`re${i}_${ri}GMode`}); put('  growth value (% nominal, or offset %)',r.growth?Number(r.growth.value)||0:0,{key:`re${i}_${ri}GVal`});
      put('  jointly owned with spouse (continues to the survivor)',yn(r.bene));
      put('  sell',({never:'Never',ltc:'When the last person starts LTC',passing:'At the last person\'s passing',age:'At the owner\'s age'})[mode]||mode);
      if(mode==='age') put('  sell at owner age',Number(r.sellAge)||0);
      if(mode!=='never') put('  sale proceeds go to',sellTo,{note:'After the sale tax, at a 100% cost basis'});
    });
  });
  return {ws:xlsxFinish(sh,{minW:16,mixedText:30}), names, addr};
}

// Real growth rate (today's $) formula text for an account whose growth mode / value sit on the Inputs sheet.
function xlsxRealGrowthFormula(modeCell,valCell,change,inflation){
  const mode=change&&change.mode, v=(change&&change.value)||0;
  const cached=realGrowth(change,inflation);
  let f;
  if(mode==='custom') f=`(1+${valCell}/100)/(1+Inflation)-1`;
  else if(mode==='offset') f=`${valCell}/100/(1+Inflation)`;
  else if(mode==='fixed') f='1/(1+Inflation)-1';
  else f='0';
  return {f, cached};
}

// ═══ Per-account sheets ══════════════════════════════════════════════════════════════════════════
function xlsxAccountHeader(sh,title,growth,startAddr,startVal){
  xlsxPut(sh,0,0,xlsxTxt(title));
  xlsxPut(sh,1,0,xlsxTxt('Real growth rate (today\'s $), from Inputs'));
  xlsxPut(sh,1,1,xlsxFml(growth.f,growth.cached,XLSX_PCT));
  if(startAddr){ xlsxPut(sh,2,0,xlsxTxt('Starting balance (input)')); xlsxPut(sh,2,1,xlsxFml(startAddr,startVal,XLSX_MONEY)); }
}
function xlsxPortfolioSheet(proj,i,bi,inAddr){
  const person=displayPersonName(proj.people[i],i), b=proj.people[i].brokerage[bi];
  const sh=xlsxSheet();
  xlsxAccountHeader(sh,`${person} – portfolio ${bi+1}`,xlsxRealGrowthFormula(inAddr[`pf${i}_${bi}GMode`],inAddr[`pf${i}_${bi}GVal`],b.growth,proj.inflation||state.inflation),inAddr[`pf${i}_${bi}Bal`],Number(b.balance)||0);
  const rowsIn=proj.rows.filter(r=>r.portfoliosByPerson[i][bi]);
  const ent=r=>r.portfoliosByPerson[i][bi];
  const cols=[
    {key:'year',head:'Year',fmt:XLSX_YEAR,v:r=>THIS_YEAR+r.k},
    {key:'age',head:`${person} age`,fmt:XLSX_AGE,v:r=>r.ages[i]},
    {key:'bal',head:'Balance (SOY)',v:r=>ent(r).balance},
    {key:'gr',head:'Growth %',fmt:XLSX_PCTNUM,v:r=>round1(ent(r).growthPct)},
    {key:'ngr',head:'Net growth %',fmt:XLSX_PCTNUM,v:r=>round1(ent(r).netGrowthPct!=null?ent(r).netGrowthPct:ent(r).growthPct)},
    {key:'fee',head:'AUM fee share',v:r=>ent(r).feeDrag},
    {key:'ltcg',head:'Realized LTCG (gross, before SCGL)',v:r=>ent(r).ltcg},
    {key:'basis',head:'Cost basis (SOY)',v:r=>ent(r).tracked?ent(r).basis:''},
    {key:'gain',head:'Unrealized gain (SOY)',kind:'f',v:r=>ent(r).tracked?ent(r).unrealizedGain:'',f:X=>`IF(${X('basis')}="","",${X('bal')}-${X('basis')})`},
    {key:'bpct',head:'Basis % of balance',kind:'f',fmt:XLSX_PCT,v:r=>(ent(r).tracked&&ent(r).balance>0)?ent(r).basis/ent(r).balance:'',f:X=>`IF(OR(${X('basis')}="",${X('bal')}<=0),"",${X('basis')}/${X('bal')})`},
    {key:'up',head:'Stepped up this year',text:true,v:r=>ent(r).steppedUp?'Yes':''},
    {key:'swap',head:'Swapped with IDGT this year (value)',v:r=>ent(r).swapAmt>0?ent(r).swapAmt:''},
    {key:'reIn',head:'Real estate sold into this portfolio this year (value; its cost basis moves in too)',v:r=>{ const t=(ent(r).reSaleIn||[]).reduce((x,y)=>x+y.value,0); return t>0?t:''; }},
    {key:'divu',head:'Dividends used for expenses',v:r=>ent(r).divUsed},
    {key:'divr',head:'Dividends reinvested',v:r=>ent(r).divReinvested},
    {key:'sold',head:'Shares sold',v:r=>ent(r).sold},
    {key:'exc',head:'Excess income reinvested',v:r=>ent(r).excessReinvested||0},
    {key:'te',head:'Tax-exempt income paid',v:r=>ent(r).taxExempt||0},
    {key:'roll',head:'Rolled-forward next-year balance = SOY × (1 + growth) − dividends used − shares sold − tax-exempt paid + excess reinvested',kind:'f',
      v:(r,idx)=>{ const e=ent(r); return Math.max(0,e.balance*(1+realGrowth(b.growth,proj.inflation||state.inflation))-e.divUsed-e.sold-(e.taxExempt||0)+(e.excessReinvested||0)); },
      f:X=>`MAX(0,${X('bal')}*(1+$B$2)-${X('divu')}-${X('sold')}-${X('te')}+${X('exc')})`}
  ];
  const t=xlsxTable(sh,4,cols,rowsIn);
  return {sh, ws:xlsxFinish(sh), t, cols, items:rowsIn, type:'pf', i, bi, balCol:'bal', gainCol:'gain', idgt:!!b.idgt, name:null};
}
// One sheet per property: the value and cost basis each year, and — in the year it is sold — the gain, exemption, tax and the amount forwarded to the portfolio.
function xlsxRealEstateSheet(proj,i,ri,inAddr){
  const person=displayPersonName(proj.people[i],i), r0=proj.people[i].realEstate[ri];
  const sh=xlsxSheet();
  xlsxAccountHeader(sh,`${person} – real estate: ${(r0.name&&r0.name.trim())||('Property '+(ri+1))}`,xlsxRealGrowthFormula(inAddr[`re${i}_${ri}GMode`],inAddr[`re${i}_${ri}GVal`],r0.growth,proj.inflation||state.inflation),inAddr[`re${i}_${ri}Val`],Number(r0.balance)||0);
  const ent=r=>r.realEstateByPerson[i][ri];
  const rowsIn=proj.rows.filter(r=>{ const e=r.realEstateByPerson[i]&&r.realEstateByPerson[i][ri]; return e&&e.balance>0; });
  const sale=r=>ent(r).sale;
  const cols=[
    {key:'year',head:'Year',fmt:XLSX_YEAR,v:r=>THIS_YEAR+r.k},
    {key:'age',head:`${person} age`,fmt:XLSX_AGE,v:r=>r.ages[i]},
    {key:'bal',head:'Value (SOY)',v:r=>ent(r).balance},
    {key:'gr',head:'Growth % (real)',fmt:XLSX_PCTNUM,v:r=>round1(ent(r).growthPct)},
    {key:'basis',head:'Cost basis (SOY)',v:r=>ent(r).basis},
    {key:'gain',head:'Unrealized gain (SOY)',kind:'f',v:r=>Math.max(0,ent(r).balance-ent(r).basis),f:X=>`MAX(0,${X('bal')}-${X('basis')})`},
    {key:'bpct',head:'Basis % of value',kind:'f',fmt:XLSX_PCT,v:r=>ent(r).balance>0?ent(r).basis/ent(r).balance:'',f:X=>`IF(${X('bal')}<=0,"",${X('basis')}/${X('bal')})`},
    {key:'up',head:'Basis stepped up this year (owner passed)',text:true,v:r=>ent(r).steppedUp?'Yes':''},
    {key:'eoy',head:'Value at end of year = SOY × (1 + growth)',kind:'f',v:r=>ent(r).balance*(1+ent(r).growthPct/100),f:X=>`${X('bal')}*(1+$B$2)`},
    {key:'sold',head:'Sold at the end of this year',text:true,v:r=>sale(r)?'Yes':''},
    {key:'sBas',head:'Cost basis at the sale (after the passing step-up, eroded by inflation)',v:r=>sale(r)?sale(r).basEnd:''},
    {key:'sEx',head:'Exemption used (per owner, eroded by inflation × owners alive)',v:r=>sale(r)?sale(r).exempt:''},
    {key:'sGain',head:'Taxable gain = value − exemption − basis (floored at 0; realized LTCG)',kind:'f',v:r=>sale(r)?sale(r).gain:'',f:X=>`IF(${X('sold')}="Yes",MAX(0,${X('eoy')}-${X('sEx')}-${X('sBas')}),"")`},
    {key:'sTax',head:'Tax added by the sale, federal + state (paid out of the sale)',v:r=>sale(r)?sale(r).tax:''},
    {key:'sNet',head:'Forwarded to the portfolio = value − tax, at a 100% cost basis',kind:'f',v:r=>sale(r)?sale(r).net:'',f:X=>`IF(${X('sold')}="Yes",${X('eoy')}-${X('sTax')},"")`}
  ];
  const t=xlsxTable(sh,4,cols,rowsIn);
  return {sh, ws:xlsxFinish(sh), t, cols, items:rowsIn, type:'re', i, ri, balCol:'bal', gainCol:'gain', name:null};
}
function xlsxIraRothSheet(proj,i,isRoth,inAddr){
  const person=displayPersonName(proj.people[i],i), acct=isRoth?proj.people[i].roth:proj.people[i].ira, inf=proj.inflation||state.inflation;
  const key=isRoth?'roth':'ira', sh=xlsxSheet();
  const g=realGrowth(acct.growth,inf);
  xlsxAccountHeader(sh,`${person} – ${isRoth?'Roth IRA':'Pre-tax IRA'}`,xlsxRealGrowthFormula(inAddr[`${key}${i}GMode`],inAddr[`${key}${i}GVal`],acct.growth,inf),inAddr[`${key}${i}Bal`],Number(acct.balance)||0);
  const main=proj.rows.map(r=>({r,heirs:false}));
  const stretchOn=!!acct.stretch;
  const tail=stretchOn?(proj.stretch||[]).map(r=>({r,heirs:true})):[];
  const items=main.concat(tail);
  const bal=x=>isRoth?(x.r.rothBalByPerson[i]||0):(x.r.iraBalByPerson[i]||0);
  // A roll-forward formula is written only where it reproduces the app's balance (an account that ends at death, or other special rules, stay values).
  const predicted=items.map((x,idx)=>{
    const prev=idx===0?(Number(acct.balance)||0):bal(items[idx-1]);
    if(x.heirs) return prev*(1+g);
    const rmd=x.r.iraByPerson[i]||0, conv=x.r.rothConvByPerson[i]||0, ex=isRoth?(x.r.rothExpByPerson[i]||0):(x.r.iraExpByPerson[i]||0);
    return isRoth?Math.max(0,prev+conv-ex)*(1+g):Math.max(0,prev-rmd-conv-ex)*(1+g);
  });
  const cols=[
    {key:'year',head:'Year',fmt:XLSX_YEAR,v:x=>THIS_YEAR+x.r.k},
    {key:'age',head:`${person} age`,fmt:XLSX_AGE,v:x=>x.r.ages[i]},
    ...(isRoth?[]:[{key:'rmd',head:'RMD',v:x=>x.heirs?0:(x.r.iraByPerson[i]||0)}]),
    {key:'conv',head:isRoth?'Converted in from pre-tax IRA':'Pre-tax IRA withdraw (Roth conversion)',v:x=>x.heirs?0:(x.r.rothConvByPerson[i]||0)},
    {key:'ex',head:isRoth?'Roth IRA sold for expenses':'Pre-tax IRA withdraw for expenses',v:x=>x.heirs?0:(isRoth?(x.r.rothExpByPerson[i]||0):(x.r.iraExpByPerson[i]||0))},
    {key:'bal',head:isRoth?'Roth IRA balance (EOY) = (prior EOY + converted in − sold) × (1 + growth)':'Pre-tax IRA balance (EOY) = (prior EOY − RMD − conversion − expense draw) × (1 + growth)',kind:'f',v:x=>bal(x),
      f:(X,idx)=>{
        if(Math.abs(predicted[idx]-bal(items[idx]))>1) return null;
        const prev=idx===0?'$B$3':X('bal',-1);
        if(items[idx].heirs) return `${prev}*(1+$B$2)`;
        return isRoth?`MAX(0,${prev}+${X('conv')}-${X('ex')})*(1+$B$2)`:`MAX(0,${prev}-${X('rmd')}-${X('conv')}-${X('ex')})*(1+$B$2)`;
      }},
    {key:'heirs',head:'After last passing (heirs)',text:true,v:x=>x.heirs?'Yes':''}
  ];
  const t=xlsxTable(sh,4,cols,items);
  return {sh, ws:xlsxFinish(sh), t, cols, type:isRoth?'roth':'ira', i, balCol:'bal', name:null};
}
function xlsxAnnuitySheet(proj,i,ai){
  const person=displayPersonName(proj.people[i],i);
  const rows=[['Year',`${person} age`,'Account value (SOY)','Payout total','  taxable','  tax-exempt','Taxable embedded in value (SOY)','Passing benefit to heirs (paid after this year)','  taxable','  tax-exempt']];
  proj.rows.forEach(r=>{
    const e=(r.annuitiesByPerson[i]||[])[ai]; if(!e||!e.live) return;
    const pb=e.passing;
    rows.push([THIS_YEAR+r.k, r.ages[i], e.balance, e.payout, e.taxable, e.taxFree, e.taxableEmbedded, pb?pb.amount:'', pb?pb.taxable:'', pb?pb.taxFree:'']);
  });
  return rows;
}

// [{name, ...sheet}] for every enabled portfolio / annuity / IRA / Roth IRA, in person order.
function xlsxAccountSheets(proj,inAddr){
  const used=new Set(['inputs','tax tables','projection by year']), out=[];
  proj.people.forEach((p,i)=>{
    const person=displayPersonName(p,i);
    (p.brokerage||[]).forEach((b,bi)=>{
      if(b.enabled===false) return;
      const e=proj.rows.length&&proj.rows[0].portfoliosByPerson[i][bi];
      const nm=(e&&e.name)||('Portfolio '+(bi+1));
      const sh=xlsxPortfolioSheet(proj,i,bi,inAddr); sh.name=xlsxSheetName(`${person} - ${nm}${b.idgt?' (IDGT)':''}`,used); out.push(sh);
    });
    (p.annuities||[]).forEach((a,ai)=>{
      if(a.enabled===false||!(Number(a.value)>0)) return;
      out.push({type:'annuity', name:xlsxSheetName(`${person} - ${(a.name&&a.name.trim())||('Annuity '+(ai+1))} (annuity)`,used), rows:xlsxAnnuitySheet(proj,i,ai)});
    });
    (p.realEstate||[]).forEach((r,ri)=>{
      if(r.enabled===false||!(Number(r.balance)>0)) return;
      const sh=xlsxRealEstateSheet(proj,i,ri,inAddr); sh.name=xlsxSheetName(`${person} - ${(r.name&&r.name.trim())||('Property '+(ri+1))} (real estate)`,used); out.push(sh);
    });
    if(p.ira&&p.ira.enabled){ const sh=xlsxIraRothSheet(proj,i,false,inAddr); sh.name=xlsxSheetName(`${person} - Pre-tax IRA`,used); out.push(sh); }
    if(p.roth&&p.roth.enabled){ const sh=xlsxIraRothSheet(proj,i,true,inAddr); sh.name=xlsxSheetName(`${person} - Roth IRA`,used); out.push(sh); }
  });
  return out;
}

// ═══ Projection by year ══════════════════════════════════════════════════════════════════════════
function xlsxMainColumns(proj,acctSheets){
  const married=proj.married, n=married?2:1, inf=proj.inflation||state.inflation;
  const cols=[]; const add=c=>cols.push(c);
  const V=(key,head,get,fmt)=>add({key,head,kind:'v',fmt,v:get});
  const F=(key,head,get,f,fmt,text)=>add({key,head,kind:'f',fmt,text,v:get,f});
  const per=(field,label,key,f)=>{ for(let i=0;i<n;i++){
    const head=married?`${displayPersonName(proj.people[i],i)} ${label}`:label;
    V(`${key}_${i}`,head,r=>{ const x=r[field][i]; return f?f(x):(x||0); });
  } };
  const sumK=key=>{ const a=[]; for(let i=0;i<n;i++) a.push(key+'_'+i); return a; };
  const sumF=(X,key)=>sumK(key).map(k=>X(k)).join('+');
  const M=X=>`${X('filing')}="Married (MFJ)"`;
  const fOf=X=>X('f');
  const v=x=>x||0;

  F('year','Year',r=>THIS_YEAR+r.k,(X,idx)=>idx===0?'BaseYear':`${X('year',-1)}+1`,XLSX_YEAR);
  V('age0',ageAxisLabel(proj),r=>r.age0,XLSX_AGE);
  per('ages','Age','age',null); cols.slice(-n).forEach(c=>c.fmt=XLSX_AGE);
  add({key:'filing',head:'Filing status',kind:'v',text:true,v:r=>r.filing==='married'?'Married (MFJ)':'Single'});
  F('f','Inflation deflator (statutory un-indexed amounts shrink by this in today\'s $)',r=>Math.pow(1+inf,-r.k),X=>`(1+Inflation)^-(${X('year')}-BaseYear)`,'0.0000');
  per('wageByPerson','Wage','wage');
  F('wageT','Wage total',r=>r.wageTotal,X=>sumF(X,'wage'));
  per('ssByPerson','Social Security (SS)','ss');
  F('ssT','Social Security (SS) total',r=>r.totalSS,X=>sumF(X,'ss'));
  per('pensionByPerson','Pension','pen');
  F('penT','Pension total',r=>r.pension,X=>sumF(X,'pen'));
  per('annuityByPerson','Annuity payout (taxable)','ann');
  F('annT','Annuity payout total (taxable)',r=>v(r.annuity),X=>sumF(X,'ann'));
  per('annuityTEByPerson','Annuity payout (tax-exempt)','annTE');
  F('annTET','Annuity payout total (tax-exempt, untaxed)',r=>v(r.annuityTE),X=>sumF(X,'annTE'));
  F('annAll','Annuity payout total (taxable + tax-exempt)',r=>v(r.annuity)+v(r.annuityTE),X=>`${X('annT')}+${X('annTET')}`);
  V('annBal','Annuity account value total (SOY)',r=>v(r.annuityBalance));
  V('annEmb','  Taxable part embedded in annuity value (SOY)',r=>sumAnnuities(r,'taxableEmbedded'));
  V('annPass','Annuity passing benefit to heirs (year the contract ends)',r=>sumAnnuityPassing(r,'amount'));
  V('annPassT','  passing benefit: taxable',r=>sumAnnuityPassing(r,'taxable'));
  V('annPassF','  passing benefit: tax-exempt',r=>sumAnnuityPassing(r,'taxFree'));
  V('annNII','Annuity taxable payout that is net investment income (non-qualified annuities)',r=>{ let s=0; (r.annuitiesByPerson||[]).forEach(l=>l.forEach(e=>{ if(e.nonQual) s+=(e.taxable||0); })); return s; });
  per('rentalByPerson','Rental','rent');
  F('rentT','Rental total (taxable)',r=>r.rental,X=>sumF(X,'rent'));
  V('rentDep','Rental depreciation (non-cash, untaxed)',r=>v(r.rentalDep));
  per('teByPerson','Tax-exempt income','te');
  F('teT','Tax-exempt income total (untaxed)',r=>v(r.teIncome),X=>sumF(X,'te'));
  per('rothConvByPerson','Pre-tax IRA withdraw','conv');
  F('convT','Pre-tax IRA withdraw total',r=>r.rothConvTotal,X=>sumF(X,'conv'));
  per('iraByPerson','IRA RMD','rmd');
  F('rmdT','IRA RMD total',r=>r.iraTotal,X=>sumF(X,'rmd'));
  per('iraExpByPerson','Pre-tax IRA withdraw (for expenses)','iraEx');
  F('iraExT','Pre-tax IRA withdraw (for expenses) total (taxable)',r=>v(r.iraExpTotal),X=>sumF(X,'iraEx'));
  V('odivNQ','Ordinary dividends (ODIV−QDIV)',r=>r.odivNQ);
  V('qdiv','Qualified dividends (QDIV)',r=>r.qdiv);
  V('ltcgG','LTCG realized, gross (before SCGL)',r=>r.ltcgGross);
  V('reGain','  of which: gain on a property sold this year (taxed as LTCG)',r=>v(r.reSaleGain));
  V('reTax','Tax added by that property sale, federal + state (paid out of the sale, not by household expenses)',r=>v(r.reSaleTax));
  V('scglU','SCGL used',r=>r.scglUsed);
  F('scglR','SCGL remaining (today\'s $)',r=>r.scglRemaining,(X,idx)=>`MAX(0,${idx===0?'SCGL_Start':X('scglR',-1)}-${X('scglU')})`);
  F('ltcg','LTCG, net of SCGL (taxed)',r=>r.ltcg,X=>`MAX(0,${X('ltcgG')}-${X('scglU')})`);
  V('ftc','Foreign tax credit',r=>r.foreignTaxCredit);
  // — expenses —
  V('expLiving','Living expenses',r=>v(r.expLiving));
  per('ltcCostByPerson','LTC cost','ltcC');
  V('ltcN','LTC started (count of people)',r=>v(r.ltcStarted),XLSX_COUNT);
  F('expLtc','Long Term Care expense (total)',r=>v(r.expLtc),X=>sumF(X,'ltcC'));
  V('aumBal','AUM balance (start of year)',r=>v(r.aumBalance));
  V('aumFee','AUM fee, total charged',r=>v(r.aumFee));
  F('expAum','AUM fee paid by household (non-IDGT)',r=>v(r.expAum),X=>X('aumFee'));
  // — tax chain —
  // Formula builders shared by the tax chain and by the SST / marginal-rate hypotheticals below, so each uses exactly the same equations.
  const tssFml=(X,p)=>{ const ss=X('ssT'), f=X('f');
    const mfj=`IF(${p}>SS_MFJ_2*${f},MIN(SS_MFJ_Amt*${f}+SS_Hi*(${p}-SS_MFJ_2*${f}),SS_Hi*${ss}),IF(${p}>SS_MFJ_1*${f},MIN(SS_Lo*(${p}-SS_MFJ_1*${f}),SS_Lo*${ss}),0))`;
    const sgl=`IF(${p}>SS_SGL_2*${f},MIN(SS_SGL_Amt*${f}+SS_Hi*(${p}-SS_SGL_2*${f}),SS_Hi*${ss}),IF(${p}>SS_SGL_1*${f},MIN(SS_Lo*(${p}-SS_SGL_1*${f}),SS_Lo*${ss}),0))`;
    return `MAX(0,IF(${M(X)},${mfj},${sgl}))`; };
  const senFml=(X,agi)=>`IF(${X('senN')}>0,${X('senN')}*MAX(0,SenDed*${X('f')}-SenRate*MAX(0,${agi}-IF(${M(X)},SenThrMFJ,SenThrSGL)*${X('f')})),0)`;
  const ordTaxFml=(X,t)=>`IF(${M(X)},SUMPRODUCT((${t}>MFJ_Lo)*(${t}-MFJ_Lo)*MFJ_dR),SUMPRODUCT((${t}>SGL_Lo)*(${t}-SGL_Lo)*SGL_dR))`;
  const qualTaxFml=(X,t,q)=>{
    const tier=(l1,l2)=>`QD_R2*MAX(0,MIN(${t}+${q},${l2})-MAX(${t},${l1}))+QD_R3*MAX(0,${t}+${q}-MAX(${t},${l2}))`;
    return `IF(${q}<=0,0,IF(${M(X)},${tier('QD_MFJ_1','QD_MFJ_2')},${tier('QD_SGL_1','QD_SGL_2')}))`; };
  F('nonSS','Ordinary income excluding Social Security (wage + pension + rental + annuity + RMD + ODIV + conversion + IRA expense draw)',r=>r.nonSSOrdinary,
    X=>`${X('wageT')}+${X('penT')}+${X('rentT')}+${X('annT')}+${X('rmdT')}+${X('odivNQ')}+${X('convT')}+${X('iraExT')}`);
  F('prov','Provisional income (non-SS income incl. QDIV, net LTCG, tax-exempt + 50% of SS)',r=>r.provisional,
    X=>`${X('nonSS')}+${X('qdiv')}+${X('ltcg')}+${X('teT')}+${X('annTET')}+0.5*${X('ssT')}`);
  F('tss','Taxable Social Security (SS)',r=>r.taxableSS,X=>tssFml(X,X('prov')));
  F('ordInc','Ordinary income before deduction (red line on the Taxable Ordinary Income chart)',r=>v(r.ordIncome),X=>`${X('nonSS')}+${X('tss')}`);
  F('agi','Adjusted gross income (AGI)',r=>r.agi,X=>`${X('ordInc')}+${X('qdiv')}+${X('ltcg')}`);
  F('magi','MAGI for IRMAA (AGI + tax-exempt income)',r=>r.magi,X=>`${X('agi')}+${X('teT')}+${X('annTET')}`);
  F('std','Standard deduction',r=>r.stdDeduction,X=>`IF(${M(X)},Std_MFJ,Std_SGL)`);
  F('floor','7.5% AGI floor',r=>v(r.agiFloor),X=>`ItemFloor*MAX(0,${X('agi')})`);
  F('item','Itemized deductions (LTC cost above 7.5% AGI floor)',r=>v(r.itemized),X=>`MAX(0,${X('expLtc')}-${X('floor')})`);
  F('ded','Deduction used (standard or itemized)',r=>r.std,X=>`MAX(${X('std')},${X('item')})`);
  V('senN','Senior-deduction eligible people (living, age 65+, tax years 2025–2028)',r=>v(r.seniorEligible),XLSX_COUNT);
  F('sen','Enhanced senior deduction (Schedule 1-A)',r=>v(r.seniorDeduction),X=>senFml(X,X('agi')));
  F('ordTI','Ordinary taxable income (as on the Taxable Ordinary Income chart)',r=>r.ordTI,X=>`MAX(0,${X('ordInc')}-${X('ded')}-${X('sen')})`);
  F('absorbed','Deduction absorbed by ordinary income',r=>Math.max(0,v(r.ordIncome)-v(r.ordTI)),X=>`MAX(0,${X('ordInc')}-${X('ordTI')})`);
  F('qual','Qualified income (QDIV + LTCG net of SCGL)',r=>v(r.qualIncome),X=>`${X('qdiv')}+${X('ltcg')}`);
  F('tiTot','Taxable income, total (ordinary + qualified)',r=>v(r.ordTI)+v(r.qualIncome),X=>`${X('ordTI')}+${X('qual')}`);
  V('noConvOrd','Ordinary taxable income, no conversion (a bracket start tests this)',r=>r.noConvOrdTI==null?'':r.noConvOrdTI);
  V('noConvItem','Itemized deductions, no conversion (an itemized start tests this)',r=>r.noConvItemized==null?'':r.noConvItemized);
  for(let i=0;i<n;i++) add({key:'trig_'+i,head:(married?`${displayPersonName(proj.people[i],i)} `:'')+'Roth conversion trigger met this year (trigger starts only)',kind:'v',text:true,v:r=>r.convTriggerStartedByPerson[i]?'Yes':''});
  F('ordTax','Ordinary tax',r=>r.ordTax,X=>ordTaxFml(X,X('ordTI')));
  // Taxable Qualified Income chart: its two dashed lines are the qualified tax brackets themselves (the 0% / 15% limits for the filing status in force).
  // Qualified income is stacked on top of taxable ordinary income, so the room each tier has left is the limit minus taxable ordinary income;
  // the amounts below split qualified income across the tiers (the qualified tax column prices the same split).
  const qLim=(idx,r)=>(r.filing==='married'?MFJ_QDIV:SGL_QDIV)[idx].lim;
  F('qLine0','Qualified bracket: 0% tier ends (lower dashed line on the Taxable Qualified Income chart)',r=>qLim(0,r),X=>`IF(${M(X)},QD_MFJ_1,QD_SGL_1)`);
  F('qLine15','Qualified bracket: 15% tier ends (upper dashed line on that chart)',r=>qLim(1,r),X=>`IF(${M(X)},QD_MFJ_2,QD_SGL_2)`);
  F('qRoom0','Room left for qualified income in the 0% tier = 0% tier limit − taxable ordinary income, floored at 0',r=>Math.max(0,qLim(0,r)-v(r.ordTI)),X=>`MAX(0,${X('qLine0')}-${X('ordTI')})`);
  F('qRoom15','Room left for qualified income up to the end of the 15% tier = 15% tier limit − taxable ordinary income, floored at 0',r=>Math.max(0,qLim(1,r)-v(r.ordTI)),X=>`MAX(0,${X('qLine15')}-${X('ordTI')})`);
  F('qAt0','Qualified income taxed at 0%',r=>Math.min(v(r.qualIncome),Math.max(0,qLim(0,r)-v(r.ordTI))),X=>`MIN(${X('qual')},${X('qRoom0')})`);
  F('qAt15','Qualified income taxed at 15%',r=>Math.max(0,Math.min(v(r.qualIncome),Math.max(0,qLim(1,r)-v(r.ordTI)))-Math.min(v(r.qualIncome),Math.max(0,qLim(0,r)-v(r.ordTI)))),X=>`MIN(${X('qual')},${X('qRoom15')})-${X('qAt0')}`);
  F('qAt20','Qualified income taxed at 20%',r=>Math.max(0,v(r.qualIncome)-Math.min(v(r.qualIncome),Math.max(0,qLim(1,r)-v(r.ordTI)))),X=>`${X('qual')}-MIN(${X('qual')},${X('qRoom15')})`);
  F('qualTax','Qualified tax (QDIV+LTCG)',r=>r.qualTax,X=>qualTaxFml(X,X('ordTI'),X('qual')));
  F('incTax','Income tax before foreign tax credit (ordinary + qualified)',r=>r.ordTax+r.qualTax,X=>`${X('ordTax')}+${X('qualTax')}`);
  // Social Security Tax (SST) = income tax (ordinary + qualified, before FTC, no NIIT) minus the same tax in a hypothetical where none of the SS is taxed
  // (non-SS income, qualified income, filing status and the deduction held fixed; the senior deduction re-evaluated at that lower AGI).
  F('sstTI','SST hypothetical: ordinary taxable income with no SS taxed',r=>r.sstOrdTI,
    X=>`MAX(0,${X('nonSS')}-${X('ded')}-${senFml(X,`(${X('nonSS')}+${X('qual')})`)})`);
  F('sstTax','SST hypothetical: ordinary + qualified tax with no SS taxed',r=>r.sstTaxNoSS,
    X=>`${ordTaxFml(X,X('sstTI'))}+${qualTaxFml(X,X('sstTI'),X('qual'))}`);
  F('sst','Social Security Tax (SST) = income tax − income tax with no SS taxed (floored at 0)',r=>r.sst,X=>`MAX(0,${X('incTax')}-${X('sstTax')})`);
  // Marginal tax rate = (tax with MargBump more non-SS ordinary income − tax) / MargBump, re-running taxable SS and the senior deduction at the higher income.
  F('mProv','Marginal rate: provisional income + step',r=>r.mProv,X=>`${X('prov')}+MargBump`);
  F('mTSS','Marginal rate: taxable SS at the higher income',r=>r.mTSS,X=>tssFml(X,X('mProv')));
  F('mTI','Marginal rate: ordinary taxable income at the higher income',r=>r.mTI,
    X=>`MAX(0,${X('nonSS')}+MargBump+${X('mTSS')}-${X('ded')}-${senFml(X,`(${X('nonSS')}+MargBump+${X('mTSS')}+${X('qual')})`)})`);
  F('mTax','Marginal rate: ordinary + qualified tax at the higher income',r=>r.mTax,
    X=>`${ordTaxFml(X,X('mTI'))}+${qualTaxFml(X,X('mTI'),X('qual'))}`);
  F('marg','Marginal tax rate on ORDINARY income = (tax at higher income − tax) / step, floored at 0 (includes the SS torpedo and senior-deduction phase-out; not the rate on the next dollar of qualified income)',r=>pct(r.marginalRate),
    X=>`MAX(0,(${X('mTax')}-${X('incTax')})/MargBump)`,XLSX_PCT);
  F('margQ','  of which: ordinary income pushing qualified income into a higher tier',r=>pct(r.marginalQual),
    X=>`MAX(0,(${qualTaxFml(X,X('mTI'),X('qual'))}-${X('qualTax')})/MargBump)`,XLSX_PCT);
  F('margO','  of which: ordinary brackets (incl. SS torpedo and senior-deduction phase-out)',r=>pct(r.marginalOrd),X=>`${X('marg')}-${X('margQ')}`,XLSX_PCT);
  F('nii','Net investment income (NII)',r=>r.niiIncome,X=>`${X('odivNQ')}+${X('qdiv')}+${X('ltcg')}+${X('annNII')}`);
  F('niit','NIIT (3.8%)',r=>r.niit,X=>{
    const th=`IF(AND(FutNIIT_On="Yes",${X('year')}>=FutNIIT_Start),IF(${M(X)},FutNIIT_MFJ,FutNIIT_SGL),IF(${M(X)},NIIT_MFJ,NIIT_SGL)*${X('f')})`;
    return `NIIT_Rate*MIN(MAX(0,${X('nii')}),MAX(0,${X('agi')}-${th}))`; });
  F('tt','Total Tax (TT) = MAX(0, income tax − foreign tax credit) + NIIT',r=>r.totalTax,X=>`MAX(0,${X('incTax')}-${X('ftc')})+${X('niit')}`);
  F('eff','Effective tax rate',r=>pct(r.agi>0?r.totalTax/r.agi:0),X=>`IF(${X('agi')}>0,${X('tt')}/${X('agi')},0)`,XLSX_PCT);
  // — IRMAA: MAGI two years back × living people 65+ —
  F('enr','People on Medicare (alive, age 65+)',r=>r.ages.reduce((c,a,i)=>c+((r.alive[i]&&a>=65)?1:0),0),X=>{
    const t=[]; for(let i=0;i<n;i++) t.push(`(${X('age_'+i)}>=65)*(${X('age_'+i)}<Pass_${i+1})`); return t.join('+'); },XLSX_COUNT);
  F('irmaa','Household IRMAA surcharge (expense) = tier of MAGI from 2 years earlier × people on Medicare',r=>v(r.irmaaSurcharge),(X,idx)=>{
    if(idx<2) return '0';
    const m=X('magi',-2);
    return `${X('enr')}*IF(${M(X)},IF(${m}<IR_MFJ_1,0,LOOKUP(${m},IR_MFJ_Lo,IR_MFJ_S)),IF(${m}<IR_SGL_1,0,LOOKUP(${m},IR_SGL_Lo,IR_SGL_S)))`; });
  // — State income tax (Inputs: State income tax; not part of TT, paid as a household expense) —
  const selState=xlsxSelectedState();
  if(selState==='CA'){
    F('stN','People alive (state tax: personal credits)',r=>r.alive.reduce((c,a)=>c+(a?1:0),0),X=>{
      const t=[]; for(let i=0;i<n;i++) t.push(`(${X('age_'+i)}<Pass_${i+1})`); return t.join('+'); },XLSX_COUNT);
    const caTIv=r=>Math.max(0,r.agi-r.taxableSS-(r.filing==='married'?CA_STD_MFJ:CA_STD_SGL));
    F('caTI','California taxable income = AGI − taxable SS − state standard deduction',caTIv,X=>`MAX(0,${X('agi')}-${X('tss')}-IF(${M(X)},CA_Std_MFJ,CA_Std_SGL))`);
    F('stateTax','California income tax (not part of TT; paid as a household expense)',r=>v(r.stateTax),X=>{
      const t=X('caTI'), f=X('f');
      const ca=`MAX(0,IF(${M(X)},SUMPRODUCT((${t}>CA_MFJ_Lo)*(${t}-CA_MFJ_Lo)*CA_MFJ_dR),SUMPRODUCT((${t}>CA_SGL_Lo)*(${t}-CA_SGL_Lo)*CA_SGL_dR))+CA_MH_Rate*MAX(0,${t}-CA_MH_Thr*${f})-CA_Cred*${X('stN')}-CA_SrCred*${X('enr')})`;
      return `IF(State_On="Yes",${ca},0)`; });
  } else if(selState==='WA'){
    F('waGain','Washington taxable capital gain = portfolio LTCG (gross − property-sale gain − SCGL used) − deduction',
      r=>Math.max(0,(r.ltcgGross||0)-(r.reSaleGain||0)-(r.scglUsed||0)-WA_CG_DEDUCTION),
      X=>`MAX(0,${X('ltcgG')}-${X('reGain')}-${X('scglU')}-WA_Ded)`);
    F('stateTax','Washington capital-gains tax (not part of TT; paid as a household expense)',r=>v(r.stateTax),X=>{
      const f=X('f'), g=X('waGain');
      const wa=`WA_R1*MIN(${g},WA_T2*${f})+WA_R2*MAX(0,${g}-WA_T2*${f})`;
      return `IF(State_On="Yes",${wa},0)`; });
  } else {
    F('stateTax','State income tax (off)',r=>0,X=>'0');
  }
  F('expTax','Income tax paid as expense (tax drag) = total tax + state tax − tax paid out of a property sale',r=>v(r.expTax),X=>`${X('tt')}+${X('stateTax')}-${X('reTax')}`);
  F('expTot','Total household expenses = living + LTC + IRMAA + AUM fee + income tax',r=>v(r.expTotal),X=>`${X('expLiving')}+${X('expLtc')}+${X('irmaa')}+${X('expAum')}+${X('expTax')}`);
  F('totInc','Total income (as on Annual Household Income chart: every band incl. dividends, LTCG, IRA/Roth withdraws, depreciation)',r=>chartTotalIncome(r),
    X=>`${X('penT')}+${X('annT')}+${X('annTET')}+${X('wageT')}+${X('convT')}+${X('rmdT')}+${X('iraExT')}+${X('rentT')}+${X('rentDep')}+${X('teT')}+${X('expFromRoth')}+${X('qdiv')}+${X('odivNQ')}+${X('ltcg')}+${X('ssT')}`);
  V('cash','Household cash income (wage+SS+pension+rental+depreciation+tax-exempt+annuity+RMD)',r=>v(r.cashIncome));
  F('expFromInc','Expenses paid by household income',r=>v(r.expFromIncome),X=>`MIN(${X('expTot')},${X('cash')})`);
  V('expFromDiv','Expenses paid by dividends',r=>v(r.expFromDiv));
  V('expFromSales','Expenses paid by asset sales',r=>v(r.expFromSales));
  V('expFromIra','Expenses paid by pre-tax IRA',r=>v(r.expFromIra));
  V('expFromRoth','Expenses paid by Roth IRA (untaxed)',r=>v(r.expFromRoth));
  V('unf','Expenses unfunded',r=>v(r.expUnfunded));
  F('chk','Funding check: total expenses − all funding sources (≈ 0)',r=>0,X=>`${X('expTot')}-${X('expFromInc')}-${X('expFromDiv')}-${X('expFromSales')}-${X('expFromIra')}-${X('expFromRoth')}-${X('unf')}`);
  V('excess','Excess income (after all expenses)',r=>v(r.excessIncome));
  V('excessRe','Excess income reinvested',r=>v(r.excessReinvested));
  // — balances: pulled from the account sheets by Year —
  const q=nm=>`'${nm.replace(/'/g,"''")}'`;
  const pfSheets=acctSheets.filter(s=>s.type==='pf');
  const sumIfs=(shs,colKey,X)=>{ if(!shs.length) return null;
    return shs.map(s=>{ const L=s.t.letter[colKey], a=s.t.firstRow, b=Math.max(s.t.lastRow,a); return `SUMIFS(${q(s.name)}!$${L}$${a}:$${L}$${b},${q(s.name)}!$A$${a}:$A$${b},${X('year')})`; }).join('+'); };
  for(let i=0;i<n;i++){
    const sh=acctSheets.find(s=>s.type==='ira'&&s.i===i);
    add({key:'iraBal_'+i,head:(married?`${displayPersonName(proj.people[i],i)} `:'')+'Pre-tax IRA balance (EOY)',kind:sh?'f':'v',v:r=>r.iraBalByPerson[i]||0,f:sh?(X=>sumIfs([sh],'bal',X)):null});
  }
  for(let i=0;i<n;i++){
    const sh=acctSheets.find(s=>s.type==='roth'&&s.i===i);
    add({key:'rothBal_'+i,head:(married?`${displayPersonName(proj.people[i],i)} `:'')+'Roth IRA balance (EOY)',kind:sh?'f':'v',v:r=>r.rothBalByPerson[i]||0,f:sh?(X=>sumIfs([sh],'bal',X)):null});
  }
  const pfN=pfSheets.filter(s=>!s.idgt), pfI=pfSheets.filter(s=>s.idgt);
  const pfAdd=(key,head,get,shs,col)=>add({key,head,kind:shs.length?'f':'v',v:get,f:shs.length?(X=>sumIfs(shs,col,X)):null});
  pfAdd('bN','Brokerage balance, non-IDGT (SOY)',r=>sumPortfolios(r,false,'balance'),pfN,'bal');
  pfAdd('bI','Brokerage balance, IDGT (SOY)',r=>sumPortfolios(r,true,'balance'),pfI,'bal');
  pfAdd('gN','Unrealized gain, non-IDGT (SOY)',r=>v(r.embeddedGain),pfN,'gain');
  pfAdd('gI','Unrealized gain, IDGT (SOY)',r=>v(r.embeddedGainIdgt),pfI,'gain');
  // Real estate: summed from the property sheets by Year (a property that is sold or has left the plan has no row after that).
  const reSheets=acctSheets.filter(s=>s.type==='re');
  const reSum=(r,f)=>r.realEstateByPerson.reduce((a,l)=>a+(l||[]).reduce((b,e)=>b+(e?f(e):0),0),0);
  pfAdd('reVal','Real estate value (SOY)',r=>reSum(r,e=>e.balance),reSheets,'bal');
  pfAdd('reGainU','Real estate unrealized gain (SOY)',r=>reSum(r,e=>Math.max(0,e.balance-e.basis)),reSheets,'gain');
  return cols;
}
// Sum of every stacked band on the Annual Household Income chart (same fields as INC_KEYS in incomeChart.js).
function chartTotalIncome(r){
  const v=x=>x||0;
  return v(r.pension)+v(r.annuity)+v(r.annuityTE)+v(r.wageTotal)+v(r.rothConvTotal)+v(r.iraTotal)+v(r.iraExpTotal)+v(r.rental)+v(r.rentalDep)+
    v(r.teIncome)+v(r.rothExpTotal)+v(r.qdiv)+v(r.odivNQ)+v(r.ltcg)+(r.ssByPerson||[]).reduce((a,b)=>a+v(b),0);
}

// Builds every sheet. Returns {sheets:[{name,ws}], names[], calc} — shared by exportToExcel() and the Node test harness.
function xlsxBuildWorkbook(proj){
  proj.inflation=proj.inflation!=null?proj.inflation:state.inflation;
  const inputs=xlsxInputsSheet(proj), tax=xlsxTaxSheet();
  const acct=xlsxAccountSheets(proj,inputs.addr);
  const cols=xlsxMainColumns(proj,acct);
  const main=xlsxSheet();
  xlsxPut(main,0,0,xlsxTxt('Projection by year (today\'s $). Row 4 says whether a column is an Excel formula or a value solved by the app; formulas read the Inputs and Tax tables sheets and the account sheets.'));
  const t=xlsxTable(main,2,cols,proj.rows);
  const sheets=[{name:'Inputs',ws:inputs.ws},{name:'Tax tables',ws:tax.ws},{name:'Projection by year',ws:xlsxFinish(main),_t:t,_cols:cols}];
  acct.forEach(s=>sheets.push({name:s.name,ws:s.type==='annuity'?xlsxAoa(s.rows):s.ws,_t:s.t,_cols:s.cols,_items:s.items}));
  return {sheets, names:inputs.names.concat(tax.names)};
}
// Annuity sheet: row 0 = headers, then one row per live year (Year, age, then dollar amounts), formatted like the other sheets.
function xlsxAoa(rows){
  const sh=xlsxSheet();
  rows.forEach((row,r)=>row.forEach((v,c)=>{
    if(r===0) xlsxPut(sh,r,c,xlsxTxt(v));
    else if(typeof v==='number') xlsxPut(sh,r,c,xlsxNum(v,c===0?XLSX_YEAR:c===1?XLSX_AGE:XLSX_MONEY));
  }));
  return xlsxFinish(sh);
}

function exportToExcel(){
  if(typeof XLSX==='undefined'){ alert('The Excel export library failed to load (needs an internet connection the first time). Please check your connection and try again.'); return; }
  if(!lastProjection || !lastProjection.rows.length){ alert('Nothing to export yet — enable at least one income source first.'); return; }
  const built=xlsxBuildWorkbook(lastProjection);
  const wb=XLSX.utils.book_new();
  built.sheets.forEach(s=>XLSX.utils.book_append_sheet(wb,s.ws,s.name));
  wb.Workbook={Names:built.names, CalcPr:{fullCalcOnLoad:true}};
  XLSX.writeFile(wb,'retirement-plan.xlsx');
}
