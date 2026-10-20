'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / STATE — the app's single state model: defaults, hydration
// of loaded/imported files, autosave, save/load/reset, and dot-path
// get/set into `state` used by every input control's onchange handler.
// ═══════════════════════════════════════════════════════════════
// Plan slot = which autosave this tab uses, so two tabs (two running copies of the app) never overwrite each other's autosave and can be linked live (input/liveLink.js).
//   '' = the 1st app (the original keys: an existing session loads as before); '2', '3' … = further apps; ?plan=NAME in the address asks for a named slot.
// claimPlanSlot() (run once at start, before the state is loaded) picks the slot with the Web Locks API: a tab holds the lock of its slot until it closes (a crash releases it), so the
// choice is atomic. Order: the address's ?plan= > the slot this tab already used (sessionStorage, survives a reload) > the 1st app > the first free number. A tab that gets a numbered
// slot it did not use before starts in the DEFAULT state; when that slot still holds an autosave, a dialog asks "Restore previous 2nd app session?" (Start fresh is the default answer).
// Without Web Locks (old browser, page not served over https / localhost) only ?plan= separates tabs, and liveLink.js warns about a shared slot.
let PLAN_INSTANCE=(()=>{ try{ return (new URLSearchParams(location.search).get('plan')||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,24); }catch(e){ return ''; } })();
const PLAN_EXPLICIT=PLAN_INSTANCE;   // the slot asked for in the address, if any
function planKeys(slot){ const s=slot?'_'+slot:''; return {state:'retirementPlannerState_v1'+s, scn:'retirementPlannerScenarios_v2'+s, ts:'retirementPlannerState_v1'+s+'_ts'}; }
let STORAGE_KEY=planKeys(PLAN_INSTANCE).state;
function planSlotLabel(slot){
  if(!slot) return '1st app';
  if(/^\d+$/.test(slot)){ const n=+slot, v=n%100, suf=(v>=11&&v<=13)?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'); return n+suf+' app'; }
  return slot;
}
function planApplySlot(slot){
  PLAN_INSTANCE=slot; STORAGE_KEY=planKeys(slot).state;
  if(typeof SCN_STORAGE_KEY!=='undefined') SCN_STORAGE_KEY=planKeys(slot).scn;
  if(slot&&!document.title.includes(planSlotLabel(slot))) document.title+=' \u2013 '+planSlotLabel(slot);
}
function planSlotInfo(slot){
  try{
    const raw=localStorage.getItem(planKeys(slot).state); if(!raw||!raw.trim()) return null;
    const s=JSON.parse(raw), ppl=(s.people||[]).slice(0,s.filingStatus==='married'?2:1).map((p,i)=>(p&&p.name&&String(p.name).trim())||('Person '+(i+1)));
    const ts=Number(localStorage.getItem(planKeys(slot).ts));
    return {names:ppl.join(' & '), when:ts?new Date(ts).toLocaleString():''};
  }catch(e){ return null; }
}
function planSlotWipe(slot){ const k=planKeys(slot); try{ [k.state,k.scn,k.ts].forEach(x=>localStorage.removeItem(x)); }catch(e){} }
// The question; resolves true = restore, false = start fresh. (A function of its own so a test can replace it.)
function planSlotAsk(slot, info){
  return new Promise(res=>{
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:inherit';
    const lbl=planSlotLabel(slot), detail=[info&&info.names?('plan for '+info.names):'', info&&info.when?('last used '+info.when):''].filter(Boolean).join(', ');
    ov.innerHTML='<div role="dialog" aria-modal="true" style="background:#fff;color:#222;max-width:440px;width:calc(100% - 40px);border-radius:12px;padding:22px 24px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'+
      '<div style="font-size:17px;font-weight:600;margin-bottom:8px">Restore previous '+lbl+' session?</div>'+
      '<div style="font-size:13px;line-height:1.5;margin-bottom:16px">This is the '+lbl+' open in this browser. A session saved by an earlier '+lbl+' is still stored'+(detail?' ('+detail+')':'')+'. Start fresh opens the default plan; the stored session is then discarded.</div>'+
      '<div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn" id="planRestoreBtn">Restore previous session</button><button type="button" class="btn btn-primary" id="planFreshBtn">Start fresh</button></div></div>';
    document.body.appendChild(ov);
    const done=v=>{ ov.remove(); document.removeEventListener('keydown',key); res(v); };
    const key=e=>{ if(e.key==='Escape') done(false); };
    document.addEventListener('keydown',key);
    ov.querySelector('#planRestoreBtn').onclick=()=>done(true);
    const f=ov.querySelector('#planFreshBtn'); f.onclick=()=>done(false); f.focus();
  });
}
async function claimPlanSlot(){
  if(typeof navigator==='undefined'||!navigator.locks||!navigator.locks.request) return;
  const tryLock=name=>new Promise(res=>{
    try{ navigator.locks.request('retirementPlannerSlot:'+name,{ifAvailable:true},lock=>{ if(!lock){ res(false); return; } res(true); return new Promise(()=>{}); }).catch(()=>res(false)); }   // held until the tab closes
    catch(e){ res(false); }
  });
  let remembered=null; try{ remembered=sessionStorage.getItem('planSlot'); }catch(e){}
  const wanted=PLAN_EXPLICIT||(remembered!=null?remembered:'');
  const cands=[wanted,'']; for(let n=2;n<=9;n++) cands.push(String(n));
  let got=null;
  for(const c of [...new Set(cands)]){ if(await tryLock(c)){ got=c; break; } }
  if(got===null) got='t'+Math.random().toString(36).slice(2,6);   // nine apps already open: a private slot
  const reload=remembered!=null&&remembered===got, ask=!reload&&got!==''&&got!==PLAN_EXPLICIT;
  planApplySlot(got); try{ sessionStorage.setItem('planSlot',got); }catch(e){}
  if(ask){ const info=planSlotInfo(got); if(info){ const restore=await planSlotAsk(got,info); if(!restore) planSlotWipe(got); } }
}

// LTC household living-expense defaults (today's $/yr). Single: the one LTC amount defaults to $7,500. Married: the 1st LTC amount
// defaults to the household's original living expenses (it follows `state.living` while ltc.living1 is null) and the 2nd to $15,000.
const BASIS_SWAP_YEARS_DEFAULT=3;   // Asset / basis swap: default years before the last passing
const LTC_SINGLE_LIVING=7500, LTC_LIVING2_DEFAULT=15000;
function ltcLiving1Default(married){ return married ? (Number(state.living)||0) : LTC_SINGLE_LIVING; }
function defaultChange(mode,value){return{mode,value:value||0};}
function defaultAgeRange(startMode,startVal,endMode,endVal){
  return{startMode,startVal:startVal||0,endMode,endVal:endVal||0};
}
function defaultAgeRangedItem(amount, changeMode, changeVal, startMode, startVal, endMode, endVal){
  return{
    enabled:false, hidden:true, amount:amount||0,
    ar:defaultAgeRange(startMode,startVal,endMode,endVal),
    change:defaultChange(changeMode,changeVal),
    bene:false
  };
}
// Brokerage portfolio (spec 4.3): value, age range, annual growth (default inflation + 4%),
// survivor benefit, Distributed LTCG (`cgdMode` 'pct' = `cgdPct` % of the balance (default, 0) or 'amt' = `cgdAmt` $/yr in today's $; taxed LTCG, spendable like a dividend), ODIV yield (default 1.5%), QDIV share of ODIV (default 70%), tax-exempt yield % (`teYield`, default 0: paid out of the
// portfolio each year as tax-exempt income — untaxed, but part of household income), an IDGT flag, an AUM flag and a
// `type` ('living' default | 'idgt') drives the idgt/payExp/reinvest flags (living: payExp+reinvest on; idgt: all off).
// `payExp` flag (derived): only portfolios with it checked contribute dividends and asset sales to the household
// expenses — living costs, IRMAA, the AUM fee and income tax (IDGT or not). Saves that predate the field load with it on
// for non-IDGT portfolios, as they behaved before.
// `reinvest` flag (default OFF): household income left over after ALL expenses are paid is reinvested, pro rata to start-of-year
// balance, into the portfolios with it checked (added to balance and to cost basis at year-end). Older saves load with it off.
// `aum` (default off; always off for IDGT): the portfolio's balance counts toward the AUM balance the household AUM fee is charged on
// (`state.aumFee`, Expenses panel). The fee, the household IRMAA surcharge, living expenses and income tax are all
// funded by household income first, then portfolio dividends, then asset sales (which realize LTCG).
// Cost-basis / unrealized-gain tracking (spec §4.6, cost basis). Every portfolio is tracked: household expenses
// can force asset sales from any portfolio, and realized LTCG is always automatic (sale × unrealized-gain share),
// so every portfolio needs a basis. A blank cost basis (`basisPct` null) is treated as no unrealized gain today.
// `basisPct` is the cost basis as a % of the portfolio's start balance (0–100); it replaced the older
// dollar-valued `basis` field (older saves are converted in hydrateState).
function pfBasisEntered(b){ return !!b && b.basisPct!=null && b.basisPct!=='' && Number.isFinite(Number(b.basisPct)); }
function pfTracksBasis(b){ return !!b; }
function defaultBrokeragePortfolio(balance, n){
  // `name` starts blank rather than a pre-filled "Brokerage Portfolio N" — the input's placeholder
  // (input/brokerage.js) and the card header's fallback (also "Portfolio N", position-based) already
  // show a sensible default, and starting blank means the header always visibly tracks the first
  // character the user types instead of initially showing unrelated placeholder text to overwrite.
  return {id:uid(),enabled:true,hidden:false,name:'',balance:balance||0,growth:defaultChange('offset',4),yield:1.5,qdivPct:70,cgdMode:'pct',cgdPct:0,cgdAmt:0,teYield:0,aum:false,type:'living',payExp:true,reinvest:true,basisPct:null,ar:defaultAgeRange('now',0,'passing',0),bene:false,idgt:false,foreignPct:0,ftcPct:0.25,
    inh:null, startYear:null};   // inh/startYear: set only on a portfolio created by the Inheritance card (input/inheritance.js): {file,key,base} and the calendar year it enters the plan
}
// Real estate asset (per person, any number): a passive asset with no income stream — no dividends, tax-exempt yield, foreign credit, AUM fee,
// type (IDGT) or expense funding. `balance` = value today ($, today's $) entered AFTER TAX, counting any gain covered by an exemption (e.g. the
// home-sale exclusion) at full value, so the app computes no tax on it. `basis` = cost basis in dollars, today's $ (blank = no unrealized gain
// today; capped at the value). Saves from the short-lived % version (`basisPct`) are converted on load. `growth` = annual change, default 'inflation' (flat in today's $). `bene` = Joint owned with
// spouse. The basis is a fixed nominal amount, so in today's $ it erodes with inflation, and steps up to value when the owner passes (to the
// surviving spouse if jointly owned; otherwise the property leaves the plan, like a brokerage portfolio).
function defaultRealEstate(n){
  // exempt: gain excluded from tax per living owner when sold, today's $ (e.g. the $250,000 home-sale exclusion); a jointly owned property counts both owners while both live.
  // niitStatus: how a sale's taxable gain is treated for the 3.8% Net Investment Income Tax. 'investment' (default) = investment / personal-use property, the gain above `exempt` is net
  // investment income; 'business' = used in a trade or business the owner materially participates in (not a passive activity), so the gain is not net investment income.
  // sellMode: when the property is sold ('never' default | 'ltc' = the year the last person starts LTC | 'passing' = the year of the last passing | 'age' = the owner reaches `sellAge`);
  // sellTo: id of the brokerage portfolio that receives the value and cost basis ('' = automatic: the owner's first non-IDGT portfolio, then the spouse's).
  return {id:uid(), enabled:true, hidden:false, name:'', balance:0, basis:null, exempt:0, niitStatus:'investment', growth:defaultChange('inflation',0), bene:false, sellMode:'never', sellAge:80, sellTo:'', inh:null, startYear:null};   // inh/startYear: as on a brokerage portfolio (Inheritance card)
}
function reBasisEntered(r){ return !!r && r.basis!=null && r.basis!=='' && Number.isFinite(Number(r.basis)); }
// Annuity (per person, any number): `value` = current account value (today's $), `premium` = cost basis / premium paid ($, blank = value,
// i.e. no gain), `growth` = credited rate, NET of all fees (an annual-change spec), `ar` = payout Start–End age,
// `payoutMode` ('fixed' = fixed nominal $ `payout`, no inflation/COLA | 'pct' = `payoutPct` % of the account value each year),
// `tax` = payout tax treatment ('taxable' | 'lifo' | 'exclusion' | 'exempt'; see compute/projection.js simulateAnnuity) with `exemptPct` for 'exempt',
// `pb` = passing (death) benefit ('fixed' = fixed nominal $ `pbFixed` | 'initial' = initial account value, nominal | 'value' = account value at passing)
// and `bene` (contract continues to the surviving spouse).
function defaultAnnuity(n){
  return {id:uid(), enabled:true, hidden:false, name:'', value:0, premium:null, growth:defaultChange('custom',4),
          ar:defaultAgeRange('custom',67,'passing',0), payoutMode:'fixed', payout:0, payoutPct:5,
          tax:'lifo', exemptPct:100,
          pb:'value', pbFixed:0,
          bene:false};
}
// One rental property: `amount` = TAXABLE (net, after depreciation) rental income, today's $; `depreciation` = annual non-cash
// depreciation, today's $ (added to household cash income but untaxed — see projection). Own age range / annual change / survivor flag.
// `niitStatus`: 'passive' (default) = a passive rental, so its net income is net investment income (3.8% NIIT); 'business' = a rental that is a trade or business the
// owner materially participates in (e.g. a real estate professional, or substantial services), which is excluded from NII. Saves without it behave as 'passive'.
// Older saves held a single `person.rental`; hydrateState turns it into the first entry of `rentals`.
function defaultRental(n){
  return Object.assign(defaultAgeRangedItem(0,'inflation',0,'now',0,'passing',0), {id:uid(), enabled:true, hidden:false, name:'', depreciation:0, niitStatus:'passive'});
}
// Inherited IRA (Inheritance card, js/input/inheritance.js): a pre-tax ('ira') or Roth ('roth') IRA inherited from another plan. `balance` = value when it
// arrives (today's $), `startYear` = calendar year it arrives (the last passing in the source plan), `growth` = annual change. It is always empty by the end of the
// 10th year after arrival. There is no withdraw option: `rmdStarted` (set automatically from the source plan on import; true = the deceased had already started RMDs)
// makes the current holder take an RMD every year by the holder's own age (the surviving spouse's, once the spouse takes over) until year 10 empties it; with
// `rmdStarted` false (and always for a Roth IRA) nothing is forced until year 10. Not editable. Saves without the field behave as true (the earlier behaviour).

// `inh` = {file,key,base} (where it came from and the inherited values, so edits can be flagged and survive a re-import).
function defaultInheritedIra(){
  // It carries the parameters of the matching Pre-tax IRA / Roth IRA card that an inherited IRA can really have: `bene` (the spouse takes it over when its holder passes; the
// 10-year deadline does not move) and, pre-tax only, the annual-withdraw fields (conv, convMode, convIrmaaPct, convOrdPct, convStartMode, convStart, convStartBracket,
// convStartItemized). Not available, so not offered: a start / end age range (everything starts when it is inherited and ends by year 10) and IRA stretch (never beyond 10 years,
// whoever inherits it next).
return {id:uid(), enabled:true, hidden:false, name:'', kind:'ira', balance:0, startYear:null, growth:defaultChange('offset',3), rmdStarted:true,
    aum:false, bene:false, conv:0, convToRoth:false, convMode:'fixed', convIrmaaPct:40, convOrdPct:32, convStartMode:'now', convStart:0, convStartBracket:24, convStartItemized:35000, inh:null};
}
function defaultPerson(idx){
  const by = THIS_YEAR - (idx===0?63:61);
  return{
    id:'p'+(idx+1),
    name:'Person '+(idx+1),
    birthYear:by,
    birthMonth:1,
    wage:{enabled:false, hidden:true, amount:0, ar:defaultAgeRange('now',0,'custom',65), change:defaultChange('inflation')},
    ss:{enabled:true, hidden:false, pia:0, fra:fraForBirthYear(by), started:false, claimAge:fraForBirthYear(by)},
    pension: defaultAgeRangedItem(0,'inflation',0,'now',0,'passing',0),
    annuities: [],   // any number of annuities (see defaultAnnuity); Add/Remove on the Annuity card
    rentals: [],   // any number of rental properties (see defaultRental); Add/Remove on the Rental income card
    brokerage:[],
    inhIras:[],   // inherited pre-tax / Roth IRAs (see defaultInheritedIra); created and removed by the Inheritance card
    inheritance:{sources:[], hidden:true},   // Inheritance card (starts hidden = body collapsed): one entry per imported plan file {id,file,importedAt,startYear,assets:[{key,type,label,value,snap,pct}]} (js/input/inheritance.js)
    realEstate:[],   // any number of real estate assets (see defaultRealEstate); Add/Remove on the Real estate card
    ira:{enabled:false, hidden:true, balance:0, growth:defaultChange('offset',3), ar:defaultAgeRange('rmd',0,'passing',0), bene:false, conv:0, convToRoth:true, convMode:'fixed', convIrmaaPct:40, convOrdPct:32, convStartMode:'rmd', convStart:0, convStartBracket:24, convStartItemized:35000, stretch:false, aum:false},   // aum: the balance counts toward the AUM fee base (like a portfolio's AUM box). conv* = the ANNUAL WITHDRAW from this pre-tax IRA (formerly "annual Roth conversion"); convToRoth: true (default) = the withdraw is a Roth conversion (goes into the Roth IRA), false = an ordinary withdrawal (taxed, spendable cash). convMode: 'fixed' ($/yr, today's $ = conv) or 'bracket' (convert as much as fits BELOW the IRMAA bracket and the ordinary bracket chosen with the sliders; stops in CONV_*_STOPS, null = no limit); convStartMode: 'rmd' (conversions begin at the IRA's Start / RMD age), 'now', 'custom' (uses convStart), or a trigger that starts conversions the first year it is met and keeps them going: 'bracket' (taxable ordinary income before any conversion is below the convStartBracket % bracket), 'itemized' (itemized deductions before any conversion exceed convStartItemized, today's $) or 'ltc' (the first LTC start)
    roth:{enabled:false, hidden:true, balance:0, growth:defaultChange('offset',3), bene:false, stretch:false, aum:false}
  };
}
// Chart panels. Every chart lives in its own panel on a 2- or 3-column grid (display/chartPanels.js). Display-only settings are part of `state.ui`, so they are
// saved to file / autosave, restored on load and put back to these defaults on Reset:
//   ui.chartHidden[key] — the panel's Hide checkbox (true = collapsed to its title bar). Default: hidden for CHART_DEFAULT_HIDE_KEYS, shown for every other chart.
//   ui.gridCols         — 2 or 3: the number of grid columns (the 2×N / 3×N toggle right of the Scale buttons). Default 3.
//   ui.chartPos[key]    — {r,c[,s:2]} (s:2 = enlarged to a 2×2 block, 3×N only; see display/chartPanels.js), the panel's grid row and column in the grid that is on screen (0-based; `gridCols` columns). The user can drag a panel to any free or
//                         occupied cell; cells nobody occupies stay blank. Defaults below, one per layout.
//   ui.chartPosAlt[key] — the same, for the OTHER layout, kept so toggling 2×N ↔ 3×N brings back the arrangement that layout had.
//   ui.stressCfg / ui.mcCfg — the Stress test card's and the Monte Carlo card's settings (every choice and number in the card, and its Hide box); null = the card's defaults. Saved, restored on load and reset like the rest of `state.ui` (display/stressPanel.js, display/mcPanel.js).
//   ui.cardOrder        — the order of those two cards under the chart grid, ['stressPanel','mcPanel'] or the reverse (null = the default order; display/cardStack.js).
//   ui.chartYMax[key]   — each chart's Y-axis maximum (null = fit automatically on the next draw). Saved and restored with the plan; the Same-scale buttons and each chart's
//                         Rescale button change it (see chartHelpers.js).
// Keys are the keys of the `charts` registry (display/chartHelpers.js).
const CHART_KEYS=['expense','incomeMagi','income','incomeOrd','incomeQual','tax','taxOrd','taxQual','asset','idgt','ira','ltcg','inhIncome','ss','tss','inflation','market'];
const GRID_COLS_DEFAULT=3;
const CHART_DEFAULT_HIDE_KEYS=['expense','income','tax','asset','idgt','ira','ltcg','inflation','market'];   // Hide checked by default; every other chart starts shown
// Left → right, top → bottom.
// 2 × N:  Annual expenses · Annual income  /  IRA · LTCG  /  Total tax · Asset value  /  Taxable ordinary · Taxable qualified  /  MAGI · Inheritance income  /
//         Ordinary income tax · QDIV/LTCG/NIIT tax  /  IDGT value · (blank)  /  Inflation rate · Market return %  /  Cumulative household SS · Social Security tax.
// 3 × N:  Annual expenses · (blank) · MAGI  /  Annual income · Taxable ordinary · Taxable qualified  /  (blank) · IRA · LTCG  /
//         Total tax · Ordinary income tax · QDIV/LTCG/NIIT tax  /  Asset value · IDGT value · Inheritance income  /  Inflation rate · Market return %  /  Cumulative household SS · Social Security tax.
const CHART_DEFAULT_POS_BY_COLS={
  2:{expense:{r:0,c:0}, income:{r:0,c:1}, ira:{r:1,c:0}, ltcg:{r:1,c:1}, tax:{r:2,c:0}, asset:{r:2,c:1}, incomeOrd:{r:3,c:0}, incomeQual:{r:3,c:1}, incomeMagi:{r:4,c:0}, inhIncome:{r:4,c:1},
     taxOrd:{r:5,c:0}, taxQual:{r:5,c:1}, idgt:{r:6,c:0}, inflation:{r:7,c:0}, market:{r:7,c:1}, ss:{r:8,c:0}, tss:{r:8,c:1}},
  3:{expense:{r:0,c:0}, incomeMagi:{r:0,c:2}, income:{r:1,c:0}, incomeOrd:{r:1,c:1}, incomeQual:{r:1,c:2}, ira:{r:2,c:1}, ltcg:{r:2,c:2},
     tax:{r:3,c:0}, taxOrd:{r:3,c:1}, taxQual:{r:3,c:2}, asset:{r:4,c:0}, idgt:{r:4,c:1}, inhIncome:{r:4,c:2}, inflation:{r:5,c:0}, market:{r:5,c:1}, ss:{r:6,c:0}, tss:{r:6,c:1}}
};
function otherGridCols(cols){ return cols===3?2:3; }
function defaultChartHidden(hidden){
  const o={}; CHART_KEYS.forEach(k=>{ o[k]=(hidden===undefined?CHART_DEFAULT_HIDE_KEYS.includes(k):!!hidden); }); return o;
}
function defaultChartPos(cols){ const d=CHART_DEFAULT_POS_BY_COLS[cols===3?3:2], o={}; CHART_KEYS.forEach(k=>{ o[k]={...d[k]}; }); return o; }
// A saved layout is kept as far as it is valid: a missing / out-of-range / duplicate position is replaced by the first free cell (row-major).
// Where the Inflation chart used to sit by default (earlier builds): a saved layout with it still there gets the current default cell (a new bottom row) instead.
const LEGACY_INFLATION_CELLS={2:[[6,1],[7,1]], 3:[[5,2]]};
// The default of the build before this one: Cumulative household SS · Social Security tax, then Inflation · Market return below them. A saved layout that is exactly that (nobody moved them) takes the current default (Inflation · Market return above SS · SS tax).
const PREV_DEFAULT_BOTTOM={2:{ss:[7,0],tss:[7,1],inflation:[8,0],market:[8,1]}, 3:{ss:[5,0],tss:[5,1],inflation:[6,0],market:[6,1]}};
function normalizeChartPos(p, cols){
  cols=(cols===3?3:2);
  const pd=PREV_DEFAULT_BOTTOM[cols];
  if(p&&Object.keys(pd).every(k=>p[k]&&p[k].r===pd[k][0]&&p[k].c===pd[k][1])){ p=Object.assign({},p); Object.keys(pd).forEach(k=>{ p[k]={...CHART_DEFAULT_POS_BY_COLS[cols][k]}; }); }
  if(p&&p.inflation&&(LEGACY_INFLATION_CELLS[cols]||[]).some(([r,c])=>p.inflation.r===r&&p.inflation.c===c)){ p=Object.assign({},p); delete p.inflation; }
  const out={}, taken=new Set(), cell=(r,c)=>r+','+c, bad=[];
  const valid=v=>v && Number.isInteger(Number(v.r)) && Number.isInteger(Number(v.c)) && Number(v.r)>=0 && Number(v.r)<200 && Number(v.c)>=0 && Number(v.c)<cols;
  // Enlarged charts (s:2 = a 2×2 block, 3×N only) claim their four cells first. The anchor column is clamped so the block fits (c ≤ 1); a block that overlaps another
  // enlarged one is dropped back to normal size. In 2×N the flag is kept (dormant, one cell) so toggling back to 3×N restores the big chart.
  if(cols===3) CHART_KEYS.forEach(k=>{
    const v=p&&p[k]; if(!valid(v)||v.s!==2) return;
    const r=+v.r, c=Math.min(+v.c,1), cells=[[r,c],[r,c+1],[r+1,c],[r+1,c+1]].map(x=>cell(x[0],x[1]));
    if(cells.some(x=>taken.has(x))) return;
    cells.forEach(x=>taken.add(x)); out[k]={r,c,s:2};
  });
  CHART_KEYS.forEach(k=>{
    if(out[k]) return;   // already placed as a block
    const keepBig=cols!==3&&p&&p[k]&&p[k].s===2; const v=p&&p[k], r=Number(v&&v.r), c=Number(v&&v.c);
    if(valid(v) && !taken.has(cell(r,c))){ out[k]=keepBig?{r,c,s:2}:{r,c}; taken.add(cell(r,c)); }
    else bad.push(k);
  });
  const dflt=CHART_DEFAULT_POS_BY_COLS[cols];
  bad.forEach(k=>{
    const d=dflt&&dflt[k];   // a chart added after the save was made (not in the saved layout at all) takes its default cell when that is free
    if(!(p&&p[k])&&d&&!taken.has(cell(d.r,d.c))){ out[k]={r:d.r,c:d.c}; taken.add(cell(d.r,d.c)); return; }
    let r=0, c=0; while(taken.has(cell(r,c))){ if(++c>=cols){ c=0; r++; } }   // first free cell, row-major
    out[k]={r,c}; taken.add(cell(r,c));
  });
  return out;
}
// The Expenses and Tax & Optimizations panels each have a Hide box for the whole panel (assumpHide.expenses / assumpHide.taxOpt, default hidden), and every feature inside is a card with its own Hide box (default hidden); General has one for the whole panel (default shown).
const ASSUMP_HIDE_DEFAULT={general:false, expenses:true, taxOpt:true, ltc:true, withdraw:true, guardrail:true, medShock:true, aum:true, stateTax:true, scgl:true, swap:true, pfWithdraw:true, futureTax:true};
// Display order of the income-source cards (`state.ui.incomeOrder`), shared by every person column so married spouses reorder together.
const INCOME_CARD_KEYS=['wage','ss','pension','rental','brokerage','realestate','annuity','ira','roth','inhira','inheritance'];
// A saved order is kept as far as it is valid: unknown / duplicate keys are dropped and any card missing from it (e.g. one added
// after the save was written) is appended in its default position order.
function normalizeIncomeOrder(o){
  const out=[]; (Array.isArray(o)?o:[]).forEach(k=>{ if(INCOME_CARD_KEYS.includes(k)&&!out.includes(k)) out.push(k); });
  INCOME_CARD_KEYS.forEach(k=>{ if(!out.includes(k)) out.push(k); });
  return out;
}
function defaultState(){
  return{
    filingStatus:'married',
    notes:'',   // free-text notes for THIS scenario (Scenario Notes button, js/display/userNotes.js); saved with the plan file. The global Notes button's text is `ui.globalNotes` (it must exist in the default `ui` below, or hydrateState drops it on load/reload)
    liveId:'',   // identity of this plan on the live link (input/liveLink.js): made on first use, saved with the plan file
    inflation:0.03,
    people:[defaultPerson(0), defaultPerson(1)],
    passing:{p1:85,p2:90},
    living:0,   // household living expenses per year, today's $ (funded income → dividends → asset sales)
    basisSwap:false, basisSwapYears:BASIS_SWAP_YEARS_DEFAULT,   // Asset / basis swap (Tax & Optimizations panel): off by default. When on, living-expense portfolio assets (and their proportional basis) are swapped with IDGT assets after the first passing (married) and `basisSwapYears` years before the last passing (see projection.js)
    scgl:0, scglEnabled:true,   // SCGL carryforward; scglEnabled=false makes the projection ignore it (the amount is kept)
    ltc:{enabled:false, people:[{startAge:85,cost:100000},{startAge:85,cost:100000}], living1:null, living2:LTC_LIVING2_DEFAULT},   // Long Term Care: per person start age (own age) and cost; household living expenses from the 1st / 2nd LTC start (today's $)
    withdrawOrder:{enabled:false, steps:[]},   // Expense-shortfall withdrawal order (Expenses panel): off = the built-in order (pay-expenses portfolios, pre-tax IRA, Roth IRA). On = `steps` [{id, asset}] in order, asset = 'pf:<portfolio id>' | 'ira:<person id>' | 'roth:<person id>' | 're:<property id>' (see projection.js, runWaterfall)
    pfWithdraw:{enabled:false, ltcgPct:0, acceptNiit:false, acceptTorpedo:false},   // Portfolio withdraw (Tax & Optimizations): when on, EVERY non-IDGT portfolio sells each year as much as fits with taxable income (ordinary + qualified) staying within the LTCG bracket `ltcgPct` (a stop of LTCG_STOPS = [0,15,20]; 20 = no limit). Proceeds are household cash income; the gain share is realized LTCG. acceptNiit (default false): when false a sale is also capped so it does not push MAGI over the NIIT threshold (a portfolio with no unrealized gain is not capped); true accepts the 3.8% NIIT. acceptTorpedo (default false): when false a sale is also capped so it does not raise this year's taxable Social Security (the "tax torpedo": each extra $ of LTCG making up to another 85c of Social Security taxable); true accepts it. No age window beyond the portfolio's own range (projection.js, "Brokerage withdraws")
    aumFee:{enabled:true, mode:'pct',value:0},   // AUM fee: mode 'pct' = % of the AUM balance (portfolios with `aum` checked), 'fixed' = $/yr in today's $
    medShock:{enabled:false, person:0, age:80, years:3, cost:100000},   // Late-life medical shock (Expenses card): an extra itemized medical cost of `cost` (today's $) a year for `years` years from the age `age` of person `person`, on top of any Long Term Care card. It is added to the Long Term Care cost line, so it goes through the same itemized-deduction (7.5% of AGI floor), state-tax and withdrawal logic, but does not switch living expenses to the care amount
    guardrail:{enabled:false, discPct:30, iwrMode:'initial', targetWR:4, band:20, cutPct:10, prosperity:false, raisePct:10, sunsetYears:15, excludeLtc:false},   // Spending guardrails (Expenses panel): off by default. discPct = % of living expenses that can be cut (discretionary); the rest is essential and never cut. Each year the withdrawal rate (portfolio-funded spending / invested balance at the start of the year) is compared with the initial rate (iwrMode 'initial' = the first year without wages, 'target' = targetWR %). Above IWR×(1+band%) the discretionary spending of the NEXT year is cut by cutPct%; with prosperity on, below IWR×(1−band%) it is raised by raisePct% (never above the plan's amount). No change in the last sunsetYears years. excludeLtc: leave the Long Term Care cost out of the rate (see projection.js)
    stateTax:{enabled:false, state:'CA'},   // State income tax (Tax & Optimizations panel): 'CA' or 'WA'; off by default. Paid as a household expense, shown stacked on the Total Income Tax chart
    futureTax:{enabled:false, niitStartYear:THIS_YEAR+10, niitSingle:NIIT_THRESH_SGL, niitMarried:NIIT_THRESH_MFJ},
    ui:{globalNotes:'', incomeOrder:INCOME_CARD_KEYS.slice(), chartHidden:defaultChartHidden(), gridCols:GRID_COLS_DEFAULT, chartPos:defaultChartPos(GRID_COLS_DEFAULT), chartPosAlt:defaultChartPos(otherGridCols(GRID_COLS_DEFAULT)), chartYMax:Object.fromEntries(CHART_KEYS.map(k=>[k,null])), stressCfg:null, mcCfg:null, cardOrder:null, assumpHide:{...ASSUMP_HIDE_DEFAULT}, hidePerson:null}   // display-only, but saved/restored/reset with the plan (see above)
  };
}
// Saves written before Hide was persisted: a card with no `hidden` flag gets what the app used to show for it (collapsed
// only if it was not enabled).
// Only *missing* values are filled — a `hidden` value that is present in the file is always kept.
function fillLegacyHide(loaded){
  if(!loaded || typeof loaded!=='object') return;
  if(Array.isArray(loaded.people)) loaded.people.forEach(p=>{
    if(!p || typeof p!=='object') return;
    ['wage','ss','pension','rental','ira','roth'].forEach(k=>{
      const it=p[k];
      if(it && typeof it==='object' && it.hidden===undefined) it.hidden = !(it.enabled===undefined ? k==='ss' : !!it.enabled);
    });
    if(Array.isArray(p.brokerage)) p.brokerage.forEach(b=>{
      if(b && typeof b==='object' && b.hidden===undefined) b.hidden = (b.enabled===false);
    });
  });
}
// Fills in any fields missing from a loaded/imported state (e.g. an older save
// file from before a field was added) using defaults, without touching values
// that are already present.
// Resets to defaults first, then applies `loaded` on top (per spec: "on
// restore, reset before restoring"). Any field present in a loaded/imported
// file that no longer exists in the current default shape (e.g. left over
// from an older save format) is dropped rather than carried forward, and
// any field missing from the loaded file falls back to its default value.
function hydrateState(loaded){
  const base=defaultState();
  function merge(dst,src){
    if(src==null||typeof src!=='object') return dst===undefined?src:dst;
    if(Array.isArray(src)){
      if(!Array.isArray(dst)) return src;
      // Loop to the LONGER of the two lengths — not just src's (default's) length —
      // so a loaded file with more entries than the default shape (e.g. more than
      // one brokerage portfolio) keeps every entry instead of silently truncating
      // the extras. Any index past the default array reuses its first element as
      // a field-shape template so missing/legacy fields still get sensible defaults.
      const template = src.length ? src[0] : undefined;
      const len = Math.max(src.length, dst.length);
      const out=[];
      for(let i=0;i<len;i++) out.push(merge(dst[i], i<src.length?src[i]:template));
      return out;
    }
    const out={}; // fresh object — never reuses/mutates dst, so stale keys are reset away
    for(const k of Object.keys(src)){
      out[k]=merge(dst?dst[k]:undefined, src[k]);
    }
    return out;
  }
  fillLegacyHide(loaded);
  const out=merge(loaded, base);
  // Saves from before the Expenses / Tax & Optimizations features became cards: their per-feature Hide flags are the defaults (all hidden); General keeps its own Hide.
  if(loaded && !(loaded.ui && loaded.ui.assumpHide && loaded.ui.assumpHide.general!==undefined)) out.ui={...out.ui, assumpHide:{...ASSUMP_HIDE_DEFAULT, general:false}};
  // Saves from before the 2×N / 3×N toggle had a fixed 3-column layout: keep that layout (and the arrangement they saved) rather than re-flowing it into 2 columns.
  if(loaded && loaded.ui && loaded.ui.chartPos && loaded.ui.gridCols===undefined) out.ui={...out.ui, gridCols:3, chartPos:loaded.ui.chartPos, chartPosAlt:defaultChartPos(2)};
  // Older saves had a per-portfolio "Withdrawal" (`living`) and "tax drag %" — both are gone. Carry the
  // withdrawals over as the household living expenses so an old plan keeps roughly the same spending.
  if(loaded && loaded.living===undefined && Array.isArray(loaded.people)){
    out.living=loaded.people.reduce((t,p)=>t+((p&&Array.isArray(p.brokerage))?p.brokerage.reduce((u,b)=>u+(Number(b&&b.enabled!==false&&b.living)||0),0):0),0);
  }
  // Older saves had a per-portfolio Expenses toggle with its own fee drag (`expense`/`fee`) and an IRMAA checkbox (`irmaa`).
  // The fee is now one household AUM fee on the portfolios flagged `aum`; IRMAA is always a household expense. Carry the
  // old fee over: portfolios that had the fee on become AUM-checked, and the household fee takes the first % fee found
  // (or, if all were fixed $, their sum).
  if(loaded && loaded.aumFee===undefined && Array.isArray(loaded.people)){
    const feeOn=b=>!!b&&(b.expense!==undefined?!!b.expense:(Number(b.fee&&b.fee.value)||0)>0)&&(Number(b.fee&&b.fee.value)||0)>0;
    const all=[]; loaded.people.forEach(p=>{ if(p&&Array.isArray(p.brokerage)) p.brokerage.forEach(b=>{ if(feeOn(b)) all.push(b); }); });
    const pct=all.find(b=>b.fee.mode!=='fixed');
    if(pct) out.aumFee={mode:'pct', value:Number(pct.fee.value)||0};
    else if(all.length) out.aumFee={mode:'fixed', value:all.reduce((t,b)=>t+(Number(b.fee.value)||0),0)};
  }
  // Older saves had scheduled withdraws on each portfolio (start / end age, amount or LTCG bracket). They are now one household "Portfolio withdraw" slider
  // (Tax & Optimizations) that applies to every non-IDGT portfolio: the first enabled bracket withdraw found carries over (on, same bracket); fixed-amount ones are dropped.
  if(loaded && loaded.pfWithdraw===undefined && Array.isArray(loaded.people)){
    let found=null;
    loaded.people.forEach(p=>{ if(p&&Array.isArray(p.brokerage)) p.brokerage.forEach(b=>{ if(!found&&b&&b.type!=='idgt'&&!b.idgt&&Array.isArray(b.withdraws)) found=b.withdraws.find(w=>w&&w.enabled!==false&&w.mode==='bracket')||null; }); });
    if(found) out.pfWithdraw={enabled:true, ltcgPct:Number.isFinite(Number(found.ltcgPct))?Number(found.ltcgPct):0};
  }
  if(loaded && loaded.ltc && out.ltc && out.ltc.people && out.ltc.people[0]){
    if(loaded.ltc.startAge!==undefined && !Array.isArray(loaded.ltc.people)){
      out.ltc.people[0]={startAge:Number(loaded.ltc.startAge)||85, cost:Number(loaded.ltc.cost)||0};
      out.ltc.living1=Number(loaded.ltc.living)||0;
    }else if(loaded.ltc.living1===undefined && Array.isArray(loaded.ltc.people)){
      // Older per-person living expenses: the earlier-starting person's becomes the 1st LTC amount, the later's the 2nd.
      const lp=loaded.ltc.people, ppl=out.people||[];
      const sk=i=>(Number(lp[i]&&lp[i].startAge)||0)-(ppl[i]?currentAge(ppl[i]):0);
      const order=(lp.length>1&&sk(1)<sk(0))?[1,0]:[0,1];
      out.ltc.living1=Number(lp[order[0]]&&lp[order[0]].living)||0;
      out.ltc.living2=Number(lp[order[1]]&&lp[order[1]].living)||0;
    }
  }
  if(Array.isArray(out.people)) out.people.forEach((p,pi)=>{
    if(!Array.isArray(p.brokerage)) p.brokerage=[];
    // Rentals: older saves had one `rental` object per person — it becomes the first rental property (if it was in use).
    const lp0=loaded&&Array.isArray(loaded.people)?loaded.people[pi]:null;
    if(!Array.isArray(p.rentals)) p.rentals=[];
    if(lp0 && lp0.rentals===undefined && lp0.rental && typeof lp0.rental==='object'){
      const lr=lp0.rental;
      if(lr.enabled || Number(lr.amount)>0 || Number(lr.depreciation)>0) p.rentals=[Object.assign(defaultRental(1), lr, {id:uid(), name:'', hidden:!!lr.hidden, enabled:!!lr.enabled})];
    }
    p.rentals=p.rentals.map(r=>merge(r, defaultRental(0)));
    if(!Array.isArray(p.inhIras)) p.inhIras=[];
    p.inhIras=p.inhIras.map(x=>{ const y=merge(x, defaultInheritedIra()); y.convToRoth=false; return y; });   // an inherited IRA can never be converted to a Roth IRA
    if(!p.inheritance||!Array.isArray(p.inheritance.sources)) p.inheritance={sources:[]};
    if(typeof p.inheritance.hidden!=='boolean') p.inheritance.hidden=true;   // the Inheritance card starts collapsed (also for older saves)
    if(!Array.isArray(p.annuities)) p.annuities=[];
    p.annuities=p.annuities.map(a=>merge(a, defaultAnnuity(0)));
    if(!Array.isArray(p.realEstate)) p.realEstate=[];
    p.realEstate=p.realEstate.map(r=>{
      // Older real estate saves held the basis as a % of value (`basisPct`): convert to dollars.
      if(r && r.basis===undefined && r.basisPct!=null && r.basisPct!=='' && Number.isFinite(Number(r.basisPct))){
        r=Object.assign({}, r, {basis: Math.round((Number(r.balance)||0)*Math.min(100,Math.max(0,Number(r.basisPct)))/100)});
      }
      return merge(r, defaultRealEstate(0));
    });
    // Older saves have no convStartMode: a plan that already converts keeps its old start (convStart>0 = that age, else now); one that
    // does not convert simply takes the new default (RMD start).
    const lpIra=loaded&&Array.isArray(loaded.people)&&loaded.people[pi]&&loaded.people[pi].ira;
    if(p.ira && lpIra && lpIra.convStartMode===undefined) { if(Number(p.ira.conv)>0) p.ira.convStartMode=(Number(p.ira.convStart)>0?'custom':'now'); }
    // The Roth-conversion slider runs 0 → the pre-tax IRA balance (a conversion can't exceed what is there): trim older saves.
    if(p.ira && Number(p.ira.conv)>Math.max(0,Number(p.ira.balance)||0)) p.ira.conv=Math.max(0,Number(p.ira.balance)||0);
    // Fill any missing fields (older saves) from a default portfolio, then drop untouched blank
    // ones (zero balance and still the auto-generated name) that older versions created on start.
    p.brokerage=p.brokerage
      .map(b=>{
        // Legacy saves stored the cost basis in dollars (`basis`); convert to % of start balance.
        if(b && b.basisPct===undefined && b.basis!=null && b.basis!=='' && Number.isFinite(Number(b.basis))){
          const bal=Number(b.balance)||0;
          b=Object.assign({}, b, {basisPct: bal>0 ? Math.round(Math.min(100,Math.max(0,Number(b.basis)/bal*100))*100)/100 : null});
        }
        // Saves that predate "Pay expenses" had every non-IDGT portfolio paying expenses: keep that behavior.
        if(b && b.payExp===undefined) b=Object.assign({}, b, {payExp: !b.idgt});
        // Portfolio type (living expense & income | IDGT) replaces the Pay expenses / Reinvest / IDGT checkboxes.
        if(b){
          const t = b.type==='idgt' || (b.type===undefined && b.idgt) ? 'idgt' : 'living';
          b=Object.assign({}, b, {type:t, idgt:t==='idgt', payExp:t!=='idgt', reinvest:t!=='idgt'});
        }
        // Legacy fee-drag portfolios become AUM-checked (see the aumFee migration above).
        if(b && b.aum===undefined){
          const fv=Number(b.fee&&b.fee.value)||0;
          b=Object.assign({}, b, {aum: (b.expense!==undefined?!!b.expense:fv>0) && fv>0});
        }
        if(b && b.idgt) b=Object.assign({}, b, {aum:false});   // the AUM fee is charged only on Living expense & income portfolios
        return merge(b, defaultBrokeragePortfolio(0));
      })
      .filter(b=>!((Number(b.balance)||0)===0 && (!b.name||!b.name.trim()||/^Brokerage Portfolio \d+$/.test(b.name.trim()))));
    if(p.odiv && Number(p.odiv.amount)>0 && !p.brokerage.some(b=>Number(b.balance)>0)){
      const od=Number(p.odiv.amount)||0, q=Number(p.qdiv?.amount)||0;
      p.brokerage.push(merge({id:uid(),enabled:true,name:'Brokerage Portfolio 1',balance:od/0.02,growth:defaultChange('offset',3),yield:2,qdivPct:od>0?Math.min(100,Math.max(0,q/od*100)):70,ar:defaultAgeRange('now',0,'passing',0),bene:!!p.odiv.bene}, defaultBrokeragePortfolio(0)));
    }
    delete p.odiv; delete p.qdiv;
  });
  if(!out.ui) out.ui={};
  // merge() keeps only the keys the defaults have ({r,c}), so an enlarged chart's size flag (s:2, see normalizeChartPos) is copied back from the loaded file here.
  ['chartPos','chartPosAlt'].forEach(n=>{ const lp=loaded&&loaded.ui&&loaded.ui[n], dp=out.ui[n]; if(lp&&dp) CHART_KEYS.forEach(k=>{ if(lp[k]&&lp[k].s===2&&dp[k]) dp[k]={...dp[k],s:2}; }); });
  out.ui.incomeOrder=normalizeIncomeOrder(out.ui.incomeOrder);
  out.ui.hidePerson=(out.ui.hidePerson===0||out.ui.hidePerson===1)?out.ui.hidePerson:null;   // married: which person's Income & Assets column is collapsed (null = both shown)
  out.ui.gridCols=(out.ui.gridCols===3?3:2);
  out.ui.chartPos=normalizeChartPos(out.ui.chartPos, out.ui.gridCols);   // a layout from a file is kept as saved, repaired only if it is invalid
  out.ui.chartPosAlt=normalizeChartPos(out.ui.chartPosAlt, otherGridCols(out.ui.gridCols));
  if(typeof inhAlignPortfolioStarts==='function') inhAlignPortfolioStarts(out);   // older saves: an inherited portfolio's Start age = the age it was inherited
  return out;
}
let state = defaultState();

// Quiet autosave to this browser only, so an in-progress session survives a
// reload. The file save/load below is the real, portable save per spec.
function autosave(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); localStorage.setItem(STORAGE_KEY+'_ts',String(Date.now())); }
  catch(e){ console.error('Autosave failed',e); }
  if(typeof scnSave==='function') scnSave();   // the other scenarios are kept alongside (scenarios.js)
}
function loadAutosave(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw || !raw.trim()) return false;
    const parsed=JSON.parse(raw);
    if(!parsed || typeof parsed!=='object') return false;
    state=hydrateState(parsed);
    return true;
  }catch(e){
    console.error('Autosave load failed',e);
    state=defaultState();
    try{ localStorage.removeItem(STORAGE_KEY); }catch(_){}
    return false;
  }
}
function flashMsg(text){
  const m=document.getElementById('saveMsg');
  m.textContent=text;
  setTimeout(()=>{ if(m.textContent===text) m.textContent=''; },3000);
}
// Reset to defaults (and a first visit with nothing saved) starts every income-source and asset card AND every chart panel collapsed (Hide checked), enabled or not. This is applied ONLY to a
// fresh default state (Reset) — never to a loaded file or an autosave, whose own saved `hidden` values (per card and, in
// `state.ui`, per chart panel) are restored exactly as saved.
function applyDefaultHiddenFromEnabled(s){
  (s.people||[]).forEach(p=>{
    ['wage','ss','pension','ira','roth'].forEach(key=>{ if(p[key]) p[key].hidden=true; });
    ['rentals','annuities','brokerage','realEstate'].forEach(key=>(p[key]||[]).forEach(x=>{ x.hidden=true; }));
    if(p.inheritance) p.inheritance.hidden=true;
  });
  if(s.ui) s.ui.chartHidden=defaultChartHidden(true);   // starting fresh: every chart panel is collapsed to its title bar too
  return s;
}
function resetState(){
  if(!confirm('Reset all inputs to defaults? This cannot be undone.')) return;
  if(typeof stResetCard==='function') stResetCard(true);   // Stress test results and settings back to the defaults (display/stressPanel.js)
  if(typeof mcResetCard==='function') mcResetCard(true);   // Monte Carlo results, trial view and settings back to the defaults (display/mcPanel.js)
  state=applyDefaultHiddenFromEnabled(defaultState());
  setSaveTarget(null);   // the default plan must not silently overwrite the file that was loaded
  if(typeof scnReset==='function') scnReset();   // back to the single scenario A
  renderAll();
  if(typeof compactUnusedChartRows==='function') compactUnusedChartRows();   // close the chart rows that hold nothing on screen (display/chartPanels.js)
  autosave();
  flashMsg('Reset to defaults.');
}
// Visible confirmation of a successful save: the Save button itself turns green and reads "✓ Saved" for two seconds, and a toast appears
// at the bottom of the window (the small text at the end of the top bar is easy to miss).
let saveDoneTimer=null, saveToastTimer=null;
function saveDone(msg){
  flashMsg(msg);
  const b=document.getElementById('saveBtn');
  if(b){
    if(!b.dataset.label) b.dataset.label=b.textContent;
    b.textContent='✓ Saved'; b.classList.add('saved');
    clearTimeout(saveDoneTimer);
    saveDoneTimer=setTimeout(()=>{ b.textContent=b.dataset.label; b.classList.remove('saved'); },2000);
  }
  let t=document.getElementById('saveToast');
  if(!t){ t=document.createElement('div'); t.id='saveToast'; t.className='save-toast'; t.setAttribute('role','status'); document.body.appendChild(t); }
  t.textContent=msg; t.classList.add('show');
  clearTimeout(saveToastTimer);
  saveToastTimer=setTimeout(()=>t.classList.remove('show'),2600);
}
// ── Remembered plan file ──
// Loading a file with the File System Access picker remembers its handle, so Save then overwrites that same file with no dialog.
// Sample plans (and a plan that was never loaded or saved) have no handle: Save opens a Save As picker instead, and the file chosen there
// becomes the remembered one. Browsers without the API can only download, so there Save always downloads. Kept for this page session only,
// never across a reload, so a fresh page can't silently overwrite an old file with a default plan.
let saveHandle=null;          // FileSystemFileHandle Save writes to, or null
let saveName='';              // its file name, for messages and the button tooltip
let saveFromSample='';        // name of the sample plan on screen (never written to), or ''
function setSaveTarget(handle,sampleName){
  saveHandle=handle||null; saveName=handle?handle.name:''; saveFromSample=sampleName||'';
  const b=document.getElementById('saveBtn');
  if(b) b.title=saveHandle?('Save over '+saveName+' (no prompt)'):(saveFromSample?'Sample plans cannot be overwritten: Save asks where to save a copy':'Save the plan; asks where to save the first time');
}
async function saveToFile(){
  const dataStr=JSON.stringify(typeof scnFileData==='function'?scnFileData():state,null,2);   // every scenario goes into the file (scenarios.js)
  if(window.showSaveFilePicker){
    if(saveHandle){                                  // the loaded / last-saved file: overwrite it without asking
      try{
        let perm=await saveHandle.queryPermission({mode:'readwrite'});
        if(perm!=='granted') perm=await saveHandle.requestPermission({mode:'readwrite'});   // the browser's own one-time permission prompt
        if(perm==='granted'){
          const w=await saveHandle.createWritable(); await w.write(dataStr); await w.close();
          saveDone('Saved to '+saveName+'.'); return;
        }
      }catch(err){ console.error('Could not overwrite the remembered file, asking where to save instead',err); }
    }
    try{
      const base=saveFromSample?saveFromSample.replace(/\.json$/i,'')+' (my copy).json':(saveName||'retirement-plan.json');
      const opts={suggestedName:base, types:[{description:'Retirement Plan JSON', accept:{'application/json':['.json']}}]};
      if(saveHandle) opts.startIn=saveHandle;
      const handle=await window.showSaveFilePicker(opts);
      const writable=await handle.createWritable();
      await writable.write(dataStr);
      await writable.close();
      setSaveTarget(handle);                         // later Saves overwrite this file
      saveDone('Saved to '+handle.name+'.');
      return;
    }catch(err){
      if(err && err.name==='AbortError') return; // user cancelled the picker
      console.error('showSaveFilePicker failed, falling back to download',err);
    }
  }
  // Fallback for browsers without the File System Access API (e.g. Firefox, Safari): a page cannot open a Save As dialog or overwrite a
  // file there, so the user is asked for the file name first (remembered as the next default) and the plan is downloaded under that name;
  // the browser's own settings may also ask where to put it.
  const dflt=saveFromSample?saveFromSample.replace(/\.json$/i,'')+' (my copy).json':(saveName||'retirement-plan.json');
  let name=window.prompt('Save the plan as this file name:',dflt);
  if(name===null) return;                      // cancelled
  name=name.trim().replace(/[\\/:*?"<>|]+/g,'-')||dflt;
  if(!/\.json$/i.test(name)) name+='.json';
  const blob=new Blob([dataStr],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=name; a.click();
  URL.revokeObjectURL(url);
  saveName=name;                               // next Save offers the same name (no handle, so it is still a download each time)
  saveDone('Saved '+name+' to your downloads.');
}
// Shared by both load paths below: parses a save file's raw text and applies it on top of a
// clean default state, exactly like the file-import spec (§11) requires ("reset state before
// loading the saved data").
function applyLoadedFileText(text){
  const parsed=JSON.parse(text); // throws on malformed JSON — caller decides how to report it
  if(typeof stResetCard==='function') stResetCard(true);   // Stress test results belong to the old plan, and its settings go back to the defaults, collapsed (display/stressPanel.js)
  if(typeof mcResetCard==='function') mcResetCard(true);   // Monte Carlo results / loaded trial belong to the old plan; its settings go back to the defaults, collapsed (display/mcPanel.js)
  destroyCharts();             // discard every visual/data closure from the old plan
  state=defaultState();        // reset before restoring, per spec
  state=hydrateState(parsed);  // then apply the restored file on top of that clean default (its Hide flags are kept as saved)
  if(typeof scnLoadFromFile==='function') scnLoadFromFile(parsed);   // the file's other scenarios (or just A) replace the current set
  renderAll();
  autosave();
  flashMsg('Loaded from file.');
}
// "Load from file" (spec §4.4/§11). Prefers the File System Access API's open-file picker, which
// supports a stable `id` so the browser remembers this app's last-used folder across sessions —
// there is no web-platform API that can force a *first-ever* picker open in an arbitrary bundled
// folder (browsers deliberately disallow a page from choosing where its own file dialog starts, to
// keep sites from probing the local filesystem); the closest available approximation is this
// per-origin memory once the user has opened the Samples/ folder once. Falls back to the classic
// hidden <input type="file"> for browsers without the API (e.g. Firefox, Safari), which has no
// such memory but works everywhere, including plain file:// use.
async function loadFromFile(){
  if(window.showOpenFilePicker){
    try{
      const [handle]=await window.showOpenFilePicker({
        id:'retirementPlannerLoad',
        types:[{description:'Retirement Plan JSON', accept:{'application/json':['.json']}}]
      });
      const file=await handle.getFile();
      applyLoadedFileText(await file.text());
      setSaveTarget(handle);               // Save now overwrites this file
      flashMsg('Loaded '+handle.name+'. Save will overwrite it.');
      return;
    }catch(err){
      if(err && err.name==='AbortError') return; // user cancelled the picker
      console.error('showOpenFilePicker failed, falling back to classic file input',err);
    }
  }
  document.getElementById('importFile').click();
}
document.getElementById('importFile').addEventListener('change', function(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(ev){
    try{ applyLoadedFileText(ev.target.result); setSaveTarget(null); }   // no file handle from a plain <input>: Save downloads
    catch(err){ alert('Could not read that file as a saved plan.'); }
  };
  reader.readAsText(file);
  e.target.value='';
});


// ── PATH GET/SET (dot-notation into `state`) ──
function setPath(path, value){
  const keys=path.split('.');
  let o=state;
  for(let i=0;i<keys.length-1;i++){
    const k=/^\d+$/.test(keys[i])?+keys[i]:keys[i];
    o=o[k];
  }
  const last=keys[keys.length-1];
  o[/^\d+$/.test(last)?+last:last]=value;
}
