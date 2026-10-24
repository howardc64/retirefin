'use strict';
// ═══════════════════════════════════════════════════════════════
// PLANS / SPEC — pure helpers for the master plan list (plans/planStore.js). No DOM, never writes the live `state`.
//
//   plFingerprint(st)      short hash of a plan state (the UI part is ignored): "did the inputs change?"
//   plMaterialize(plan)    the plan's input as a ready-to-run state object (a private copy)
//   plSummarize(st)        run the engine once on a state → slim summary {kpis, fin[], re[], failAge, ...}; never the projection rows
//
// A Plan's `input` is one of
//   {state}                                   a full snapshot (an A/B scenario)
//   {baseKey, baseFingerprint, overlay}       a delta: another plan (by key) plus an overlay applied on top. The overlay is one of
//                                             {type:'stress', scenarioId, eq, infl, path, start, share}   a stress scenario (engine returns / inflation)
//                                             {type:'market', path}                                        a saved or session market path, placed by its own start
//                                             {type:'levers', levers}                                      validated what-if levers (compute/scenarioSpec.js)
//   {baseKey, baseFingerprint, draw}          a seeded trial: another plan plus {type:'mc', cfg, trial, stressDef|null}. mcRunTrial(cfg, trial, …) rebuilds the
//                                             trial's random lifespans, care, inheritance, returns and inflation exactly, so nothing else needs storing.
// A delta is valid only while the base plan still has `baseFingerprint` (plIsStale).
// Loaded after compute/scenarioSpec.js, scenarioApi.js and stressTest.js (uses specKpis, stRun, apiMarketRun) and before plans/planStore.js.
// ═══════════════════════════════════════════════════════════════
function plHash(s){ let h=2166136261>>>0; s=String(s); for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h.toString(16).padStart(8,'0'); }
const plStateKey=st=>JSON.stringify(Object.assign({},st,{ui:null}));
const plFingerprint=st=>plHash(plStateKey(st));
const plClone=o=>JSON.parse(JSON.stringify(o));

// Fingerprint of an input: a snapshot hashes its state; a delta hashes the base's fingerprint plus the overlay.
function plInputFingerprint(inp){
  if(inp&&inp.state) return plFingerprint(inp.state);
  if(inp&&inp.baseKey) return plHash(inp.baseFingerprint+'|'+JSON.stringify(inp.overlay||null)+'|'+JSON.stringify(inp.draw||null));
  throw new Error('plan input needs {state} or {baseKey, baseFingerprint, overlay|draw}');
}
// The plan's input as something runnable: {state (a private copy), overlay|null, draw|null}. A delta whose base is missing or has changed since is refused, not guessed.
function plResolve(plan){
  const inp=plan&&plan.input;
  if(inp&&inp.state) return {state:plClone(inp.state),overlay:null,draw:null};
  if(inp&&inp.baseKey){
    const base=plGet(inp.baseKey);
    if(!base||base.fingerprint!==inp.baseFingerprint) throw new Error('plan "'+plan.key+'" is out of date: its base plan "'+inp.baseKey+'" changed or was removed');
    return {state:plResolve(base).state,overlay:plClone(inp.overlay||null),draw:plClone(inp.draw||null)};
  }
  throw new Error('plan "'+(plan&&plan.key)+'" has no usable input');
}
const plMaterialize=plan=>plResolve(plan).state;

// Run the engine for a plan's resolved input and hand back the FULL result {proj, m, draws} (the live `state` is put back afterwards). Callers that keep anything long-term
// must slim it (plSummarize); callers that show it (a chart, a yearly series) use it directly and let it go.
function plRunFull(st,overlay,draw){
  const backup=state; state=plClone(st);
  try{
    let proj, m, draws=null;
    if(draw){   // a seeded trial: the engine replays it from cfg + trial number (compute/monteCarlo.js), identical to the run's own trial
      if(draw.type!=='mc') throw new Error('unknown draw type "'+draw.type+'"');
      const cap={}; m=mcRunTrial(draw.cfg,draw.trial,null,cap,draw.stressDef||null); proj=cap.proj;
      const info=cap.info||{}, two=state.filingStatus==='married';
      draws={passingAges:info.pass?info.pass.slice(0,two?2:1):null, careYears:info.ltcYears?info.ltcYears.slice(0,two?2:1):null,
        earlyMarket10:m.early10, panicYearsInFirst10:m.panic10, priceLevelAfter15:m.inflRatio15};
    } else if(overlay&&overlay.type==='stress'){   // same call the Stress test card makes (compute/stressTest.js), so the numbers are the card's
      const sc={id:overlay.scenarioId,eq:overlay.eq,infl:overlay.infl,path:overlay.path||null};
      proj=stRun(sc,overlay.start,{equityShare:(Number(overlay.share)||0)*100}); m=mcMeasure(proj,{pass:[0,0],ltcYears:[0,0]});
    } else if(overlay&&overlay.type==='market'){ const r=apiMarketRun(overlay.path,null); proj=r.proj; m=r.m; }
    else if(overlay&&overlay.type==='levers'){ const r=specRunScenario({levers:overlay.levers}); proj=r.proj; m=r.m; }
    else if(overlay) throw new Error('unknown overlay type "'+overlay.type+'"');
    else { const r=specRunScenario({levers:[]}); proj=r.proj; m=r.m; }
    return {proj,m,draws};
  } finally { state=backup; }
}
// Keep only what is cheap to hold: the KPI vector and the yearly investable / real-estate balances (whole dollars; plain numbers, since Float32 loses cents on large estates).
function plSummarize(st,overlay,draw){
  const backup=state; state=plClone(st);               // specKpis reads the state's own settings through the engine, so keep the plan in place while it runs
  try{
    const r=plRunFull(st,overlay,draw), m=r.m, R=Math.round;
    return {kpis:specKpis(r.proj,m), age0:m.age0, n:m.n, fin:Array.from(m.fin,R), re:Array.from(m.re,R),
      failAge:m.failAge==null?null:R(m.failAge), shortfall:R(m.shortfall), lifeTax:R(m.lifeTax), draws:r.draws};
  } finally { state=backup; }
}
// The full engine result of a stored plan, for a chart or a series: null when the plan is out of date (its base changed), never a guess.
function plRunPlan(p){ try{ const r=plResolve(p); return plRunFull(r.state,r.overlay,r.draw); }catch(e){ return null; } }
