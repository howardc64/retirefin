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
function defaultIncomeItem(amount, changeMode, changeVal){
  return{ enabled:false, hidden:true, amount:amount||0, change:defaultChange(changeMode,changeVal), bene:false };
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
// survivor benefit, ODIV yield (default 1.5%), QDIV share of ODIV (default 70%),
// tax drag (% of the household's annual total tax, TT, paid out of this portfolio),
// fee drag (% of balance, or a fixed today's-$ amount per year), and an IDGT flag.
// Annual asset value change = growth - tax drag - fee drag.
// "Expenses" checkbox (spec 4.4): when on, a portfolio also has tax drag, fee drag, a withdrawal
// and realized LTCG. Older saved files without the flag count as on if they had drag/fees.
function pfExpense(b){
  if(!b) return false;
  if(b.expense!==undefined) return !!b.expense;
  return (Number(b.taxDrag)||0)>0 || (Number(b.fee&&b.fee.value)||0)>0;
}
// Cost-basis / unrealized-gain tracking (spec §4.6, cost basis). A portfolio is tracked when the user
// entered a cost basis (`basis` is a number; null/blank = none entered) or when its Expenses panel is on
// (realized LTCG is always automatic there: dividends pay expenses first, only a shortfall is sold and
// realizes gain — so it needs a basis, and a blank one is treated as no unrealized gain today).
function pfBasisEntered(b){ return !!b && b.basis!=null && b.basis!=='' && Number.isFinite(Number(b.basis)); }
function pfTracksBasis(b){ return pfBasisEntered(b) || pfExpense(b); }
function defaultBrokeragePortfolio(balance, n){
  // `name` starts blank rather than a pre-filled "Brokerage Portfolio N" — the input's placeholder
  // (input/brokerage.js) and the card header's fallback (also "Portfolio N", position-based) already
  // show a sensible default, and starting blank means the header always visibly tracks the first
  // character the user types instead of initially showing unrelated placeholder text to overwrite.
  return {id:uid(),enabled:true,hidden:false,name:'',balance:balance||0,growth:defaultChange('offset',4),yield:1.5,qdivPct:70,expense:false,living:0,basis:null,taxDrag:0,fee:{mode:'pct',value:0},ar:defaultAgeRange('now',0,'passing',0),bene:false,idgt:false,foreignPct:0,ftcPct:0.25};
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
    ira:{enabled:false, hidden:true, balance:0, growth:defaultChange('offset',3), ar:defaultAgeRange('rmd',0,'passing',0), bene:false, conv:0},
    roth:{enabled:false, hidden:true, balance:0, growth:defaultChange('offset',3), bene:false}
  };
}
function defaultState(){
  return{
    filingStatus:'married',
    inflation:0.03,
    people:[defaultPerson(0), defaultPerson(1)],
    passing:{p1:85,p2:90},
    scgl:0,
    futureTax:{enabled:false, niitStartYear:THIS_YEAR+10, niitSingle:NIIT_THRESH_SGL, niitMarried:NIIT_THRESH_MFJ}
  };
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
  const out=merge(loaded, base);
  if(Array.isArray(out.people)) out.people.forEach(p=>{
    if(!Array.isArray(p.brokerage)) p.brokerage=[];
    // Fill any missing fields (older saves) from a default portfolio, then drop untouched blank
    // ones (zero balance and still the auto-generated name) that older versions created on start.
    p.brokerage=p.brokerage
      .map(b=>merge(b, defaultBrokeragePortfolio(0)))
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
// Every disabled income-source card collapses by default whenever a file is loaded or the app is
// reset — a loaded file's own `hidden` values are intentionally overridden here so a freshly opened
// plan always starts tidy (only what's actually enabled is expanded), while manual Hide/Show toggles
// made *during* a session (and preserved by ordinary autosave-restore on reload) are left alone.
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
  if(typeof chartYMax!=='undefined'){ chartYMax.ss=null; chartYMax.income=null; chartYMax.tss=null; chartYMax.tax=null; chartYMax.asset=null; chartYMax.idgt=null; }
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
  state=hydrateState(parsed);  // then apply the restored file on top of that clean default
  applyDefaultHiddenFromEnabled(state); // collapse anything the loaded file left disabled
  if(typeof chartYMax!=='undefined'){ chartYMax.ss=null; chartYMax.income=null; chartYMax.tss=null; chartYMax.tax=null; chartYMax.asset=null; chartYMax.idgt=null; }
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
