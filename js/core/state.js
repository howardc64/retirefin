'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / STATE — the app's single state model: defaults, hydration
// of loaded/imported files, autosave, save/load/reset, and dot-path
// get/set into `state` used by every input control's onchange handler.
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEY='retirementPlannerState_v1';

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
// survivor benefit, ODIV yield (default 1.5%), QDIV share of ODIV (default 70%), an IDGT flag, an AUM flag and a
// `payExp` flag (default OFF): only portfolios with it checked contribute dividends and asset sales to the household
// expenses — living costs, IRMAA, the AUM fee and income tax (IDGT or not). Saves that predate the field load with it on
// for non-IDGT portfolios, as they behaved before.
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
  return {id:uid(),enabled:true,hidden:false,name:'',balance:balance||0,growth:defaultChange('offset',4),yield:1.5,qdivPct:70,aum:false,payExp:false,basisPct:null,ar:defaultAgeRange('now',0,'passing',0),bene:false,idgt:false,foreignPct:0,ftcPct:0.25};
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
    rental:  defaultAgeRangedItem(0,'inflation',0,'now',0,'passing',0),
    brokerage:[],
    ira:{enabled:false, hidden:true, balance:0, growth:defaultChange('offset',3), ar:defaultAgeRange('rmd',0,'passing',0), bene:false, conv:0, stretch:false, aum:false},
    roth:{enabled:false, hidden:true, balance:0, growth:defaultChange('offset',3), bene:false, stretch:false, aum:false}
  };
}
// Section Hide checkboxes (the 6 chart sections + the Assumptions panel). They are part of `state` (`state.ui.hiddenSections`)
// so they are saved to file, autosaved, restored on load and put back to these defaults on Reset — the DOM (checkbox + collapsed
// section) is always derived from this object (controls.js: syncSectionHide). Keys match `data-hide-key` in index.html.
// DEFAULT_SECTION_HIDDEN is what a fresh session / Reset to defaults starts with: true = every section starts checked + collapsed.
const SECTION_HIDE_KEYS=['assumptions','ss','income','tss','tax','expenses','assets'];
const DEFAULT_SECTION_HIDDEN=true;
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
    scgl:0,
    aumFee:{mode:'pct',value:0},   // AUM fee: mode 'pct' = % of the AUM balance (portfolios with `aum` checked), 'fixed' = $/yr in today's $
    futureTax:{enabled:false, niitStartYear:THIS_YEAR+10, niitSingle:NIIT_THRESH_SGL, niitMarried:NIIT_THRESH_MFJ},
    ui:{hiddenSections:defaultHiddenSections()}   // display-only, but saved/restored/reset with the plan (see above)
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
  if(loaded && !(loaded.ui && loaded.ui.hiddenSections)) out.ui={hiddenSections:defaultHiddenSections(false)};
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
  if(Array.isArray(out.people)) out.people.forEach(p=>{
    if(!Array.isArray(p.brokerage)) p.brokerage=[];
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
    ['wage','ss','pension','rental','ira','roth'].forEach(key=>{
      if(p[key]) p[key].hidden = !p[key].enabled;
    });
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
