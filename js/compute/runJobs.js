'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / RUN JOBS — let a tool (an LLM through the chat import or an MCP host) set up and run stress tests and Monte Carlo, safely.
// Design: docs/LLM_INTEGRATION_DESIGN.md (phase 2). Loaded after runRegistry.js. No DOM; never writes `state` and never touches the page's own card results.
//
//   Validated settings: rjValidateStress / rjValidateMc take PARTIAL settings in the cards' own shape, start from the card's current settings (page) or the defaults,
//     and reject unknown keys and out-of-range values with the same bounds as the cards' inputs.
//   Stress run:   rjRunStress(cfg)   → synchronous (a handful of projections); kept as the "tool" stress result (ids stl:<scenario>).
//   Monte Carlo:  rjStartMc(cfg, opts, host) → a JOB that runs in ~40 ms slices (setTimeout) on a private snapshot of the plan, so editing the plan mid-run cannot corrupt it;
//     one runs at a time, the rest queue; results appear as runs mcj:<job> (Monte Carlo) and mcj:<job>:<scenario> (stress + Monte Carlo) with `source:'llm'`.
//   Tools (MCP host only: they carry hosts:['mcp']): define_stress_config, define_mc_config, run_stress_tests, run_monte_carlo, get_job, cancel_job.
//   Import kinds `stress` and `montecarlo` (planner.scenarios/1) come through rjImportStress / rjImportMc, called by rrImport.
// ═══════════════════════════════════════════════════════════════
const RJ_LIMITS={chat:{trials:2000,total:6000},import:{trials:2000,total:6000},mcp:{trials:5000,total:20000}};   // per job: trials per row, trials over all rows
const RJ_MAX_FINISHED=5, RJ_MAX_QUEUE=4, RJ_MAX_PATHS=6, RJ_SLICE_MS=40;
let RJ_SEQ=0, RJ_JOBS=[], RJ_STRESS=null; const RJ_DRAFT={stress:null,mc:null};

// ── settings: allowed keys and bounds ────────────────────────────
const RJ_MC_SPEC={
  trials:{t:'int',min:50,max:10000,desc:'trials per row (a tool may be limited further)'}, seed:{t:'int',min:1,max:2147483647,desc:'same seed and trial number give the same draws'},
  returns:{enabled:'bool',volEquity:{t:'num',min:0,max:60,desc:'equity volatility, %'},volRE:{t:'num',min:0,max:40,desc:'real estate volatility, %'},rho:{t:'num',min:0,max:1,desc:'correlation of each portfolio with the market shock'},
    panic:{enabled:'bool',rhoPanic:{t:'num',min:0,max:1},trigger:{t:'num',min:-4,max:-0.5,desc:'crash size in sigmas, negative (default -1.5)'},holdYears:{t:'int',min:1,max:5},includeRE:'bool',rhoRE:{t:'num',min:0,max:1}}},
  mortality:{enabled:'bool',mode:{t:'num',min:70,max:100,desc:'modal age at passing'},scale:{t:'num',min:2,max:20,desc:'spread in years'}},
  ltc:{enabled:'bool',prob:{t:'num',min:0,max:1},medianYears:{t:'num',min:0.5,max:10},yearsSigma:{t:'num',min:0,max:2},costSigma:{t:'num',min:0,max:1},minStartAge:{t:'num',min:50,max:90}},
  inflation:{enabled:'bool',sigma:{t:'num',min:0,max:5},phi:{t:'num',min:0,max:0.95},min:{t:'num',min:-5,max:5},max:{t:'num',min:0,max:25}},
  inheritance:{enabled:'bool',haircutPct:{t:'num',min:0,max:100}}};
const RJ_ST_SPEC={
  start:{mode:{t:'enum',v:['retire','now','custom']},years:{t:'int',min:0,max:60,desc:'years from now when mode is custom'}},
  equityShare:{t:'num',min:0,max:100,desc:'% of each non-property asset that takes the scenario\'s stock return'},
  lost:{enabled:'bool',actualInflation:'bool'}, stag:{enabled:'bool',years:{t:'int',min:1,max:30},eqReturn:{t:'num',min:-50,max:50},inflStart:{t:'num',min:0,max:30},inflEnd:{t:'num',min:0,max:30}},
  y1966:{enabled:'bool'}, custom:{enabled:'bool'}};

function rjApply(t,inp,spec,path,errs){
  if(inp==null) return;
  if(typeof inp!=='object'||Array.isArray(inp)){ errs.push((path||'config')+' must be an object'); return; }
  Object.keys(inp).forEach(k=>{
    const sp=spec[k], p=path?path+'.'+k:k, v=inp[k];
    if(sp==null||k==='desc'){ errs.push('unknown setting "'+p+'"'+(p==='med'||p==='start.med'?' (the late-life medical shock is not available to tools)':'')); return; }
    if(sp==='bool'){ if(typeof v!=='boolean') errs.push(p+' must be true or false'); else t[k]=v; }
    else if(sp.t==='num'||sp.t==='int'){
      if(typeof v!=='number'||!isFinite(v)){ errs.push(p+' must be a number'); return; }
      if(sp.t==='int'&&!Number.isInteger(v)){ errs.push(p+' must be a whole number'); return; }
      if((sp.min!=null&&v<sp.min)||(sp.max!=null&&v>sp.max)){ errs.push(p+' must be between '+sp.min+' and '+sp.max); return; }
      t[k]=v; }
    else if(sp.t==='enum'){ if(!sp.v.includes(v)) errs.push(p+' must be one of '+sp.v.join(', ')); else t[k]=v; }
    else { if(!t[k]||typeof t[k]!=='object') t[k]={}; rjApply(t[k],v,sp,p,errs); }
  });
}
const rjClone=o=>JSON.parse(JSON.stringify(o));
function rjBase(which,kind){
  const card=kind==='mc'?(typeof mcCfg!=='undefined'?mcCfg:null):(typeof stCfg!=='undefined'?stCfg:null);
  if(which!=='defaults'&&card){ const c=rjClone(card); delete c.hidden; return {cfg:c,basedOn:'the card\'s current settings'}; }
  return {cfg:rjClone(kind==='mc'?MC_DEFAULTS:ST_DEFAULTS),basedOn:'the defaults'};
}
// → {errors, cfg, basedOn}
function rjValidateMc(input,opts){
  opts=opts||{}; const errs=[], b=rjBase(opts.base,'mc'), lim=(RJ_LIMITS[opts.source]||RJ_LIMITS.chat);
  if(input&&typeof input==='object'&&input.returns&&input.returns.panic&&input.returns.panic.compare!==undefined) errs.push('returns.panic.compare is not available to tools');
  rjApply(b.cfg,input,RJ_MC_SPEC,'',errs);
  if(b.cfg.trials>lim.trials){ errs.push('trials must be at most '+lim.trials+' for this host'); }
  if(b.cfg.returns&&b.cfg.returns.panic) b.cfg.returns.panic.compare=false;
  if(b.cfg.inflation&&b.cfg.inflation.min>=b.cfg.inflation.max) errs.push('inflation.min must be below inflation.max');
  return {errors:errs,cfg:b.cfg,basedOn:b.basedOn};
}
function rjValidateStress(input,opts){
  opts=opts||{}; const errs=[], b=rjBase(opts.base,'st');
  if(input&&typeof input==='object'&&input.med!==undefined) errs.push('unknown setting "med" (the late-life medical shock is not available to tools)');
  const clean=Object.assign({},input||{}); delete clean.med; rjApply(b.cfg,clean,RJ_ST_SPEC,'',errs);
  b.cfg.med=Object.assign({},ST_DEFAULTS.med,{enabled:false});
  const ids=opts.includePathIds;
  if(ids!=null){
    if(!Array.isArray(ids)||ids.length>RJ_MAX_PATHS) errs.push('includePathIds must be a list of at most '+RJ_MAX_PATHS+' market scenario ids');
    else { b.cfg.extraPaths=[]; ids.forEach(id=>{ const p=msGet(String(id)); if(!p) errs.push('unknown market scenario "'+id+'" (see list_market_scenarios)'); else b.cfg.extraPaths.push(msClone(p)); }); }
  }
  if(!errs.length){ const any=b.cfg.lost.enabled||b.cfg.stag.enabled||b.cfg.y1966.enabled||(b.cfg.custom&&b.cfg.custom.enabled&&msSaved().length)||(b.cfg.extraPaths&&b.cfg.extraPaths.length); if(!any) errs.push('at least one scenario must be enabled (lost, stag, y1966, custom with saved paths, or includePathIds)'); }
  return {errors:errs,cfg:b.cfg,basedOn:b.basedOn};
}

// ── stress run ───────────────────────────────────────────────────
function rjRunStress(cfg){
  const key=rrPlanKey(), sr=stRunAll(cfg);
  RJ_STRESS={cfg,results:sr.results,sr,planKey:key,startAge:sr.startAge,startCovered:sr.startCovered};
  return RJ_STRESS;
}

// ── Monte Carlo jobs ─────────────────────────────────────────────
function rjJobInfo(id){
  const j=RJ_JOBS.find(x=>x.id===id); if(!j) return null;
  const o={id:j.id,status:j.status,done:j.done,total:j.total,percent:j.total?Math.round(j.done/j.total*100):0,trialsPerRow:j.cfg.trials,rows:j.rows.map(r=>({id:r.id,label:r.label,trials:r.res.length})),withStress:j.withStress,source:j.source,elapsedSec:Math.round(((j.finishedAt||Date.now())-(j.startedAt||j.createdAt))/100)/10};
  if(j.error) o.error=j.error;
  if(j.fromPage) o.reproducedFromPage='this is the run you did in the page, reproduced here from the same plan, settings and seed (the same trials)';
  if(j.status==='done'||j.status==='cancelled') o.runIds=j.rows.filter(r=>r.res.length).map(r=>'mcj:'+j.id+(r.id==='none'?'':':'+r.id));
  if(j.status==='cancelled') o.note='cancelled; the rows above hold the trials finished so far';
  return o;
}
function rjTrim(){ const fin=RJ_JOBS.filter(j=>j.status==='done'||j.status==='cancelled'||j.status==='error'); while(fin.length>RJ_MAX_FINISHED){ const old=fin.shift(); RJ_JOBS=RJ_JOBS.filter(j=>j!==old); } }
function rjNext(){
  if(RJ_JOBS.some(j=>j.status==='running')) return;
  const j=RJ_JOBS.find(x=>x.status==='queued'); if(!j) return;
  j.status='running'; j.startedAt=Date.now(); setTimeout(()=>rjSlice(j),0);
}
function rjSlice(job){
  if(job.status!=='running') return;
  const tEnd=Date.now()+RJ_SLICE_MS;
  try{
    rrWithState(job.snapshot,()=>{
      while(Date.now()<tEnd){
        while(job.ri<job.rows.length&&job.rows[job.ri].res.length>=job.cfg.trials) job.ri++;
        if(job.ri>=job.rows.length) break;
        const row=job.rows[job.ri]; row.res.push(mcRunTrial(job.cfg,row.res.length,null,null,row.stressDef)); job.done++;
      }
    });
  }catch(e){ job.status='error'; job.error=String(e&&e.message||e); job.finishedAt=Date.now(); rjTrim(); rjNext(); return; }
  if(job.done>=job.total){ job.status='done'; job.finishedAt=Date.now(); rjTrim(); rjNext(); }
  else setTimeout(()=>rjSlice(job),0);
}
// opts: {withStress, stressCfg}. → {job} | {error}
function rjStartMc(cfg,opts,host){
  opts=opts||{}; const src=(host&&host.source)||'chat', lim=RJ_LIMITS[src]||RJ_LIMITS.chat;
  if(RJ_JOBS.filter(j=>j.status==='running'||j.status==='queued').length>=RJ_MAX_QUEUE) return {error:'too many jobs are waiting ('+RJ_MAX_QUEUE+'); wait for one to finish or cancel it'};
  const rows=[{id:'none',label:'Monte Carlo alone (no stress test)',stressDef:null,res:[]}];
  let note=null;
  if(opts.withStress){
    const scfg=opts.stressCfg||rjValidateStress({},{}).cfg, sr=stRunAll(scfg);
    if(!sr.startCovered) note='the shock starts beyond the end of the projection, so only Monte Carlo alone was run';
    else { const scs=stScenarios(scfg); sr.results.forEach(r=>{ const sc=scs.find(s=>s.id===r.id); if(!sc) return; rows.push({id:r.id,label:r.label,stressDef:{scen:sc,start:r.start!=null?r.start:sr.start,share:r.share!=null?r.share:scfg.equityShare},res:[]}); }); }
  }
  const total=rows.length*cfg.trials;
  if(cfg.trials>lim.trials) return {error:'trials must be at most '+lim.trials+' for this host'};
  if(total>lim.total) return {error:'this job would run '+total+' trials ('+rows.length+' rows × '+cfg.trials+'); the limit is '+lim.total+'. Lower trials or run without withStress.'};
  const job={id:'j'+(++RJ_SEQ),cfg:rjClone(cfg),sig:JSON.stringify([cfg,opts.withStress?(opts.stressCfg||null):null]),rows,ri:0,total,done:0,status:'queued',withStress:!!opts.withStress,planKey:rrPlanKey(),snapshot:rjClone(state),createdAt:Date.now(),source:src,note};
  RJ_JOBS.push(job); rjNext();
  return {job};
}
// A run the user did in the PAGE (its Run button): reproduce it here from the same plan, settings and seed, so the tools can read it. The page's own results are never sent (they
// are the same numbers: the draws depend only on the plan, the settings and the seed). kind: 'mc' (Monte Carlo card), 'stress' (stress tests), 'stmc' (stress tests + Monte Carlo).
// mcIn / stIn: the settings the page used, in the cards' own shape (a few page-only keys are dropped). Asking twice for the same run on the same plan does nothing.
// → {job} | {stress:true} | {error}
function rjFromPage(kind,mcIn,stIn){
  if(kind!=='mc'&&kind!=='stress'&&kind!=='stmc') return {error:'unknown kind of run'};
  const scrub=c=>{ const o=rjClone(c&&typeof c==='object'&&!Array.isArray(c)?c:{}); delete o.hidden; delete o.med; if(o.returns&&o.returns.panic) delete o.returns.panic.compare; return o; };
  let cfg=null, scfg=null;
  if(kind!=='stress'){ const v=rjValidateMc(scrub(mcIn),{base:'defaults',source:'mcp'}); if(v.errors.length) return {error:'Monte Carlo settings: '+v.errors.join('; ')}; cfg=v.cfg; }
  if(kind!=='mc'){ const v=rjValidateStress(scrub(stIn),{base:'defaults'}); if(v.errors.length) return {error:'stress settings: '+v.errors.join('; ')}; scfg=v.cfg; }
  if(scfg){ const key=rrPlanKey(); if(!(RJ_STRESS&&RJ_STRESS.planKey===key&&JSON.stringify(RJ_STRESS.cfg)===JSON.stringify(scfg))) rjRunStress(scfg); }
  if(kind==='stress') return {stress:true};
  const sig=JSON.stringify([cfg,kind==='stmc'?scfg:null]), key=rrPlanKey();
  const same=RJ_JOBS.find(j=>j.planKey===key&&j.sig===sig&&(j.status==='queued'||j.status==='running'||j.status==='done'));
  if(same) return {job:same,existing:true};
  const r=rjStartMc(cfg,{withStress:kind==='stmc',stressCfg:scfg},{source:'mcp'}); if(r.error) return r;
  r.job.fromPage=true; return r;
}
// A DIFFERENT plan was loaded in the page (file, sample, reset): everything made on the old plan goes: jobs (running ones are stopped), the stress run, the tool drafts, the what-ifs and
// market what-ifs in the master plan list, the proposals and the promoted trials. Editing the same plan does not come here: those runs stay and are reported stale.
// Job ids keep counting (a new "j3" is never an old "j3"). Saved market scenarios are not plan-specific and stay.
function rjClearAll(){
  RJ_JOBS.slice().forEach(j=>{ if(j.status==='running'||j.status==='queued') rjCancel(j.id); });
  RJ_JOBS=[]; RJ_STRESS=null; RJ_DRAFT.stress=null; RJ_DRAFT.mc=null;
  if(typeof RR_CACHE!=='undefined') RR_CACHE=new Map();
  if(typeof RR_PROPOSALS!=='undefined') RR_PROPOSALS=[];
  if(typeof plMcClearPromoted==='function') plMcClearPromoted();
  if(typeof plReset==='function') plReset();
}
function rjCancel(id){ const j=RJ_JOBS.find(x=>x.id===id); if(!j) return null; if(j.status==='running'||j.status==='queued'){ j.status='cancelled'; j.finishedAt=Date.now(); rjNext(); } return rjJobInfo(id); }
const rjLatest=()=>RJ_JOBS.length?RJ_JOBS[RJ_JOBS.length-1]:null;

// Entries for the registry: the tool stress run, and every finished (or cancelled) job.
rrRegisterSource((out,key,ph)=>{
  // (the tool stress run is a set of plans in the master plan list: plans/jobsProducer.js; rrEntries lists them)
  RJ_JOBS.forEach(j=>{
    if(j.status!=='done'&&j.status!=='cancelled') return; const stale=j.planKey!==key;
    j.rows.forEach(row=>{
      if(!row.res.length) return;
      const S=rrMemo('job|'+j.id+'|'+row.id+'|'+row.res.length,()=>mcSummarize(row.res)), id='mcj:'+j.id+(row.id==='none'?'':':'+row.id), partial=row.res.length<j.cfg.trials;
      out.push({run:{id,kind:row.stressDef?'stress_mc':'monte_carlo',label:(row.stressDef?row.label+' + ':'')+'Monte Carlo (job '+j.id+', '+row.res.length+' trials'+(partial?', partial':'')+')',source:'llm',spec:{settings:rjClone(j.cfg),scenario:row.stressDef?row.id:null},planKey:rrHash(j.planKey),stale,distribution:rrDist(S,row.res,false)},
        res:row.res,S,cfg:j.cfg,stressDef:row.stressDef||null});
    });
  });
});

// ── import kinds ─────────────────────────────────────────────────
const RJ_STRESS_KEYS=['kind','id','label','why','config','includePathIds'], RJ_MC_KEYS=['kind','id','label','why','config','withStress','stressConfig','includePathIds'];
function rjStressSummary(sr){
  return sr.results.map(r=>({id:r.id,label:r.label,firstUnfundedAge:r.m.failAge==null?null:Math.round(r.m.failAge),finalAssets:rrM(r.m.estateFin+r.m.estateRe),lowestInvestedAfterStart:rrM(r.low),deltaFinalAssets:rrM(r.m.estateFin+r.m.estateRe-(sr.base.estateFin+sr.base.estateRe))}));
}
// Both return {error} or the stored proposal. `raw` already passed the key check.
function rjImportStress(raw,label,why,src){
  const v=rjValidateStress(raw.config||{},{includePathIds:raw.includePathIds}); if(v.errors.length) return {errors:v.errors};
  const sr=stRunAll(v.cfg), p=rrAddProposal({kind:'stress',label,why,source:src,planHash:rrHash(rrPlanKey()),config:v.cfg,includePathIds:raw.includePathIds||null,rows:rjStressSummary(sr),kpis:null,deltas:{},notes:[],changed:true,status:'new',basedOn:v.basedOn});
  return {proposal:p};
}
function rjImportMc(raw,label,why,src){
  const v=rjValidateMc(raw.config||{},{source:'import'}); if(v.errors.length) return {errors:v.errors};
  let stressCfg=null;
  if(raw.withStress){ const sv=rjValidateStress(raw.stressConfig||{},{includePathIds:raw.includePathIds}); if(sv.errors.length) return {errors:sv.errors.map(e=>'stressConfig: '+e)}; stressCfg=sv.cfg; }
  const r=rjStartMc(v.cfg,{withStress:!!raw.withStress,stressCfg},{source:'import'}); if(r.error) return {errors:[r.error]};
  const p=rrAddProposal({kind:'montecarlo',label,why,source:src,planHash:rrHash(rrPlanKey()),config:v.cfg,withStress:!!raw.withStress,stressConfig:stressCfg,includePathIds:raw.includePathIds||null,jobId:r.job.id,kpis:null,deltas:{},notes:[],changed:true,status:'new',basedOn:v.basedOn});
  return {proposal:p};
}

// ── tools (MCP host only) ────────────────────────────────────────
function rjSchema(spec){
  const props={};
  Object.keys(spec).forEach(k=>{ const s=spec[k];
    if(s==='bool') props[k]={type:'boolean'};
    else if(s.t==='num'||s.t==='int') props[k]={type:s.t==='int'?'integer':'number',description:(s.desc?s.desc+'; ':'')+'between '+s.min+' and '+s.max};
    else if(s.t==='enum') props[k]={type:'string',enum:s.v};
    else props[k]=rjSchema(s); });
  return {type:'object',properties:props};
}
const RJ_BASE_PROP={type:'string',enum:['card','defaults'],description:'start from the card\'s current settings (default when the app page is open) or the built-in defaults'};
const RJ_PATH_PROP={type:'array',items:{type:'string'},description:'market scenario ids (list_market_scenarios) to add as extra stress scenarios; at most '+RJ_MAX_PATHS};
if(typeof apiRegister==='function'){
  const H=['mcp'], rjErr=(errors,what)=>({isError:true,response:{error:what+' was not accepted.',problems:errors}});
  apiRegister({name:'define_stress_config',hosts:H,
    description:'Validate and remember stress test settings (partial settings are fine: anything you leave out keeps the base value). Returns the full settings and the scenarios they enable. run_stress_tests uses them. Unknown keys and out-of-range numbers are rejected.',
    inputSchema:{type:'object',properties:{base:RJ_BASE_PROP,config:rjSchema(RJ_ST_SPEC),includePathIds:RJ_PATH_PROP}},
    handler(args){ const v=rjValidateStress(args.config||{},{base:args.base,includePathIds:args.includePathIds}); if(v.errors.length) return rjErr(v.errors,'The stress test settings');
      RJ_DRAFT.stress=v.cfg; return {isError:false,response:{config:v.cfg,basedOn:v.basedOn,scenarios:stScenarios(v.cfg).map(s=>({id:s.id,label:s.label})),note:'remembered for run_stress_tests'}}; }});
  apiRegister({name:'define_mc_config',hosts:H,
    description:'Validate and remember Monte Carlo settings (partial settings are fine: anything you leave out keeps the base value). Returns the full settings. run_monte_carlo uses them. Unknown keys, out-of-range numbers and too many trials are rejected.',
    inputSchema:{type:'object',properties:{base:RJ_BASE_PROP,config:rjSchema(RJ_MC_SPEC)}},
    handler(args,host){ const v=rjValidateMc(args.config||{},{base:args.base,source:(host&&host.source)||'mcp'}); if(v.errors.length) return rjErr(v.errors,'The Monte Carlo settings');
      RJ_DRAFT.mc=v.cfg; return {isError:false,response:{config:v.cfg,basedOn:v.basedOn,trialsLimit:(RJ_LIMITS[(host&&host.source)||'mcp']||RJ_LIMITS.mcp).trials,note:'remembered for run_monte_carlo'}}; }});
  apiRegister({name:'run_stress_tests',hosts:H,
    description:'Run the stress tests (Lost Decade, Stagflation, 1966 retiree, saved market paths and any includePathIds) on the user\'s plan with the app\'s own engine, using config (over the remembered or base settings). Instant. Results are runs with ids stl:<scenario>: read them with get_stress_results, compare_runs or get_run.',
    inputSchema:{type:'object',properties:{base:RJ_BASE_PROP,config:rjSchema(RJ_ST_SPEC),includePathIds:RJ_PATH_PROP}},
    handler(args){
      let cfg; if(args.config!=null||args.includePathIds!=null||!RJ_DRAFT.stress){ const v=rjValidateStress(args.config||{},{base:args.base,includePathIds:args.includePathIds}); if(v.errors.length) return rjErr(v.errors,'The stress test settings'); cfg=v.cfg; } else cfg=RJ_DRAFT.stress;
      const sr=rjRunStress(cfg); RR_STEP=1; RR_KEEP_NAMES=RR_TOOL_NAMES;
      try{ const rows=rrEntries().filter(e=>e.run.id.startsWith('stl:')).map(e=>rrRunOut(e,false)); return {isError:false,response:{units:'today\'s dollars',startAge:rr1(sr.startAge),shockStartsWithinProjection:!!sr.startCovered,plan:rrRunOut(rrEntries()[0],false).kpis,stress:rows}}; } finally{ RR_KEEP_NAMES=false; }
    }});
  apiRegister({name:'run_monte_carlo',hosts:H,
    description:'Start a Monte Carlo run on the user\'s plan as a background job and return its id at once. With withStress true it also replays the trials under every stress scenario (the app\'s "stress + Monte Carlo" table). Poll get_job; when done the results are runs mcj:<job> (and mcj:<job>:<scenario>): read them with get_mc_summary, get_trial, compare_runs. The job runs on a snapshot of the plan, so later edits do not disturb it (its runs then show stale).',
    inputSchema:{type:'object',properties:{base:RJ_BASE_PROP,config:rjSchema(RJ_MC_SPEC),withStress:{type:'boolean'},stressConfig:rjSchema(RJ_ST_SPEC),includePathIds:RJ_PATH_PROP}},
    handler(args,host){
      const src=(host&&host.source)||'mcp';
      let cfg; if(args.config!=null||!RJ_DRAFT.mc){ const v=rjValidateMc(args.config||{},{base:args.base,source:src}); if(v.errors.length) return rjErr(v.errors,'The Monte Carlo settings'); cfg=v.cfg; } else cfg=RJ_DRAFT.mc;
      let stressCfg=null; if(args.withStress){ const sv=args.stressConfig!=null||args.includePathIds!=null||!RJ_DRAFT.stress?rjValidateStress(args.stressConfig||{},{base:args.base,includePathIds:args.includePathIds}):{errors:[],cfg:RJ_DRAFT.stress}; if(sv.errors.length) return rjErr(sv.errors,'The stress settings'); stressCfg=sv.cfg; }
      const r=rjStartMc(cfg,{withStress:!!args.withStress,stressCfg},{source:src}); if(r.error) return apiErr(r.error);
      return {isError:false,response:Object.assign(rjJobInfo(r.job.id),{note:(r.job.note?r.job.note+'. ':'')+'poll get_job until status is done'})};
    }});
  apiRegister({name:'get_job',hosts:H,
    description:'Progress of a Monte Carlo job (default: the latest): status queued, running, done, cancelled or error, trials done of total, and, when finished, the run ids to read.',
    inputSchema:{type:'object',properties:{id:{type:'string',description:'job id from run_monte_carlo (default: the latest job)'}}},
    handler(args){ const j=args.id!=null?RJ_JOBS.find(x=>x.id===String(args.id)):rjLatest(); if(!j) return apiErr(args.id!=null?'unknown job "'+args.id+'". Known: '+RJ_JOBS.map(x=>x.id).join(', '):'no job has been started'); return {isError:false,response:rjJobInfo(j.id)}; }});
  apiRegister({name:'cancel_job',hosts:H,
    description:'Stop a Monte Carlo job (default: the latest). Trials finished so far stay readable as partial runs.',
    inputSchema:{type:'object',properties:{id:{type:'string'}}},
    handler(args){ const j=args.id!=null?RJ_JOBS.find(x=>x.id===String(args.id)):rjLatest(); if(!j) return apiErr('no such job'); return {isError:false,response:rjCancel(j.id)}; }});
}

if(typeof module!=='undefined') module.exports={rjValidateMc,rjValidateStress,rjStartMc,rjJobInfo};
