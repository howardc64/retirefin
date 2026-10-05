'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / STATE — the app's single state model: defaults, hydration
// of loaded/imported files, autosave, save/load/reset, and dot-path
// get/set into `state` used by every input control's onchange handler.
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEY='retirementPlannerState_v1';

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
// survivor benefit, ODIV yield (default 1.5%), QDIV share of ODIV (default 70%), tax-exempt yield % (`teYield`, default 0: paid out of the
// portfolio each year as tax-exempt income — untaxed, but part of household income), an IDGT flag, an AUM flag and a
// `type` ('living' default | 'idgt') drives the idgt/payExp/reinvest flags (living: payExp+reinvest on; idgt: all off).
// `payExp` flag (derived): only portfolios with it checked contribute dividends and asset sales to the household
// expenses — living costs, IRMAA, the AUM fee and income tax (IDGT or not). Saves that predate the field load with it on
// for non-IDGT portfolios, as they behaved before.
// `reinvest` flag (default OFF): household income left over after ALL expenses are paid is reinvested, pro rata to start-of-year
// balance, into the portfolios with it checked (added to balance and to cost basis at year-end). Older saves load with it off.
// `aum` (default off): the portfolio's balance counts toward the AUM balance the household AUM fee is charged on
// (`state.aumFee`, Assumptions panel). The fee, the household IRMAA surcharge, living expenses and income tax are all
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
  return {id:uid(),enabled:true,hidden:false,name:'',balance:balance||0,growth:defaultChange('offset',4),yield:1.5,qdivPct:70,teYield:0,aum:false,type:'living',payExp:true,reinvest:true,basisPct:null,ar:defaultAgeRange('now',0,'passing',0),bene:false,idgt:false,foreignPct:0,ftcPct:0.25};
}
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
// Older saves held a single `person.rental`; hydrateState turns it into the first entry of `rentals`.
function defaultRental(n){
  return Object.assign(defaultAgeRangedItem(0,'inflation',0,'now',0,'passing',0), {id:uid(), enabled:true, hidden:false, name:'', depreciation:0});
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
    ira:{enabled:false, hidden:true, balance:0, growth:defaultChange('offset',3), ar:defaultAgeRange('rmd',0,'passing',0), bene:false, conv:0, convMode:'fixed', convIrmaaPct:40, convOrdPct:32, convStartMode:'rmd', convStart:0, convStartBracket:24, convStartItemized:35000, stretch:false, aum:false},   // convMode: 'fixed' ($/yr, today's $ = conv) or 'bracket' (convert as much as fits BELOW the IRMAA bracket and the ordinary bracket chosen with the sliders; stops in CONV_*_STOPS, null = no limit); convStartMode: 'rmd' (conversions begin at the IRA's Start / RMD age), 'now', 'custom' (uses convStart), or a trigger that starts conversions the first year it is met and keeps them going: 'bracket' (taxable ordinary income before any conversion is below the convStartBracket % bracket), 'itemized' (itemized deductions before any conversion exceed convStartItemized, today's $) or 'ltc' (the first LTC start)
    roth:{enabled:false, hidden:true, balance:0, growth:defaultChange('offset',3), bene:false, stretch:false, aum:false}
  };
}
// Section Hide checkboxes (the 6 chart sections + the Assumptions panel). They are part of `state` (`state.ui.hiddenSections`)
// so they are saved to file, autosaved, restored on load and put back to these defaults on Reset — the DOM (checkbox + collapsed
// section) is always derived from this object (controls.js: syncSectionHide). Keys match `data-hide-key` in index.html.
// DEFAULT_SECTION_HIDDEN is what a fresh session / Reset to defaults starts with: true = every section starts checked + collapsed.
const SECTION_HIDE_KEYS=['assumptions','ss','income','tss','tax','expenses','assets'];
const DEFAULT_SECTION_HIDDEN=true;
// Display order of the income-source cards (`state.ui.incomeOrder`), shared by every person column so married spouses reorder together.
const INCOME_CARD_KEYS=['wage','ss','pension','rental','brokerage','annuity','ira','roth'];
// A saved order is kept as far as it is valid: unknown / duplicate keys are dropped and any card missing from it (e.g. one added
// after the save was written) is appended in its default position order.
function normalizeIncomeOrder(o){
  const out=[]; (Array.isArray(o)?o:[]).forEach(k=>{ if(INCOME_CARD_KEYS.includes(k)&&!out.includes(k)) out.push(k); });
  INCOME_CARD_KEYS.forEach(k=>{ if(!out.includes(k)) out.push(k); });
  return out;
}
// Asset Value chart "devalue" sliders (display only): % knocked off the unrealized-gain part of brokerage value (LTCG) and off pre-tax IRA value (ordinary income).
const DEFAULT_LTCG_DEVALUE=0, DEFAULT_ORD_DEVALUE=0;
// Second set: applies only to the years after the last passing (heirs' anticipated brackets); its defaults (0 / 0) are independent of the first set's.
const DEFAULT_LTCG_DEVALUE2=0, DEFAULT_ORD_DEVALUE2=0;
function defaultHiddenSections(hidden){
  const o={}; SECTION_HIDE_KEYS.forEach(k=>{ o[k]=(hidden===undefined?DEFAULT_SECTION_HIDDEN:!!hidden); }); return o;
}
function defaultState(){
  return{
    filingStatus:'married',
    inflation:0.03,
    people:[defaultPerson(0), defaultPerson(1)],
    passing:{p1:85,p2:90},
    living:0,   // household living expenses per year, today's $ (funded income → dividends → asset sales)
    basisSwap:false, basisSwapYears:BASIS_SWAP_YEARS_DEFAULT,   // Asset / basis swap (Assumptions): off by default. When on, living-expense portfolio assets (and their proportional basis) are swapped with IDGT assets after the first passing (married) and `basisSwapYears` years before the last passing (see projection.js)
    scgl:0, scglEnabled:true,   // SCGL carryforward; scglEnabled=false makes the projection ignore it (the amount is kept)
    ltc:{enabled:false, people:[{startAge:85,cost:100000},{startAge:85,cost:100000}], living1:null, living2:LTC_LIVING2_DEFAULT},   // Long Term Care: per person start age (own age) and cost; household living expenses from the 1st / 2nd LTC start (today's $)
    aumFee:{enabled:true, mode:'pct',value:0},   // AUM fee: mode 'pct' = % of the AUM balance (portfolios with `aum` checked), 'fixed' = $/yr in today's $
    futureTax:{enabled:false, niitStartYear:THIS_YEAR+10, niitSingle:NIIT_THRESH_SGL, niitMarried:NIIT_THRESH_MFJ},
    ui:{incomeOrder:INCOME_CARD_KEYS.slice(), hiddenSections:defaultHiddenSections(), assumpHide:{scgl:false,aum:false,swap:false,ltc:true,future:true}, ltcgDevalue:DEFAULT_LTCG_DEVALUE, ordDevalue:DEFAULT_ORD_DEVALUE, ltcgDevalue2:DEFAULT_LTCG_DEVALUE2, ordDevalue2:DEFAULT_ORD_DEVALUE2}   // display-only, but saved/restored/reset with the plan (see above). *Devalue = the Asset Value charts' two sliders (% haircut on unrealized gain / on pre-tax IRA)
  };
}
// Saves written before Hide was persisted: a card with no `hidden` flag gets what the app used to show for it (collapsed
// only if it was not enabled), and a save with no `ui.hiddenSections` shows every section, as it did when it was written.
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
  // Saves from before the Assumptions cards had Hide: LTC / speculative cards were open only while enabled — keep that.
  if(loaded && !(loaded.ui && loaded.ui.assumpHide)) out.ui={...out.ui, assumpHide:{scgl:false, aum:false, swap:false, ltc:!(out.ltc&&out.ltc.enabled), future:!(out.futureTax&&out.futureTax.enabled)}};
  if(loaded && !(loaded.ui && loaded.ui.hiddenSections)) out.ui={...out.ui, hiddenSections:defaultHiddenSections(false)};
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
    if(!Array.isArray(p.annuities)) p.annuities=[];
    p.annuities=p.annuities.map(a=>merge(a, defaultAnnuity(0)));
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
  out.ui.incomeOrder=normalizeIncomeOrder(out.ui.incomeOrder);
  return out;
}
let state = defaultState();

// Quiet autosave to this browser only, so an in-progress session survives a
// reload. The file save/load below is the real, portable save per spec.
function autosave(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.error('Autosave failed',e); }
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
// Reset to defaults starts every disabled income-source card collapsed (Hide checked) and every enabled one
// shown. This is applied ONLY to a fresh default state (Reset) — never to a loaded file or an autosave,
// whose own saved `hidden` values (per card and, in `state.ui`, per section) are restored exactly as saved.
function applyDefaultHiddenFromEnabled(s){
  (s.people||[]).forEach(p=>{
    ['wage','ss','pension','ira','roth'].forEach(key=>{
      if(p[key]) p[key].hidden = !p[key].enabled;
    });
    (p.rentals||[]).forEach(r=>{ r.hidden = !(r.enabled!==false); });
    (p.annuities||[]).forEach(a=>{ a.hidden = !(a.enabled!==false); });
    (p.brokerage||[]).forEach(b=>{ b.hidden = !(b.enabled!==false); });
  });
  return s;
}
function resetState(){
  if(!confirm('Reset all inputs to defaults? This cannot be undone.')) return;
  state=applyDefaultHiddenFromEnabled(defaultState());
  resetChartYMax();
  renderAll();
  autosave();
  flashMsg('Reset to defaults.');
}
async function saveToFile(){
  const dataStr=JSON.stringify(state,null,2);
  if(window.showSaveFilePicker){
    try{
      const handle=await window.showSaveFilePicker({
        suggestedName:'retirement-plan.json',
        types:[{description:'Retirement Plan JSON', accept:{'application/json':['.json']}}]
      });
      const writable=await handle.createWritable();
      await writable.write(dataStr);
      await writable.close();
      flashMsg('Saved to file.');
      return;
    }catch(err){
      if(err && err.name==='AbortError') return; // user cancelled the picker
      console.error('showSaveFilePicker failed, falling back to download',err);
    }
  }
  // Fallback for browsers without the File System Access API (e.g. Firefox,
  // Safari): a normal download, which the browser's own settings may prompt
  // a save-location dialog for (e.g. "Ask where to save each file").
  const blob=new Blob([dataStr],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='retirement-plan.json'; a.click();
  URL.revokeObjectURL(url);
  flashMsg('Saved to file.');
}
// Shared by both load paths below: parses a save file's raw text and applies it on top of a
// clean default state, exactly like the file-import spec (§11) requires ("reset state before
// loading the saved data").
function applyLoadedFileText(text){
  const parsed=JSON.parse(text); // throws on malformed JSON — caller decides how to report it
  destroyCharts();             // discard every visual/data closure from the old plan
  state=defaultState();        // reset before restoring, per spec
  state=hydrateState(parsed);  // then apply the restored file on top of that clean default (its Hide flags are kept as saved)
  resetChartYMax();
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
    try{ applyLoadedFileText(ev.target.result); }
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
