'use strict';
// ═══════════════════════════════════════════════════════════════
// PLANS / TOOLS — the master plan list as LLM tools (chat, MCP, live bridge: the same registry as the other tools). Load after plans/jobsProducer.js and compute/runRegistry.js.
//   list_plans     every plan, however it was made, with how it was made and headline numbers; plus the Monte Carlo runs trials can be asked from
//   get_plan       one plan: headline numbers, or (detail "inputs") what it is made of, or (detail "series") its yearly values
//   compare_plans  headline numbers of several plans side by side, with the change against a baseline
//   show_plan      put a plan on the app's main charts (a page effect, like show_market_scenario_in_charts)
//   delete_plan    forget a plan the tools made, or hide a derived one; never the user's own scenarios or saved market paths
// A plan is addressed by `ref`: its key ('scn:B', 'st:lost', 'mc:trial:17', 'stmc:lost:7', 'mkt:<id>', 'lev:r1'), its id ('p12'), "plan" (the one on screen), or how it was made:
//   "scenario B" · "stress Lost Decade" · "mc trial 17" · "mc earliestFailure" · "stress+mc Lost Decade trial 7" · "market Two bad years" · "what-if r1" · or a unique part of its label.
// A Monte Carlo trial that is not a plan yet is made one when it is asked for (the app never keeps thousands); a stale run cannot be asked for new trials.
// ═══════════════════════════════════════════════════════════════
const PL_KIND_ORDER=['scenario','lever','market','stress','mc_trial','stress_mc_trial'];
const PL_EXEMPLAR_NAMES=['earliestFailure','medianFailure','worstShortfall','typicalSuccess'];

// How a plan was made, in words the user would use.
function plHow(p){
  const o=p.origin, r=o.ref||{};
  switch(o.kind){
    case 'scenario': return 'Scenario '+r.scenarioId+(p.key==='scn:'+(typeof scnActive!=='undefined'?scnActive:'A')?' (on screen: the plan as entered)':' (a saved scenario)');
    case 'stress': return (o.groupId==='stl'?'Stress test run by a tool: ':'Stress test: ')+p.label;
    case 'mc_trial': return 'Monte Carlo trial '+r.trial+' (app #'+(r.trial+1)+')'+(r.exemplar?' ('+r.exemplar+')':'')+(p.key.startsWith('mcj:')?' of tool-started job '+p.key.split(':')[1]:'');
    case 'stress_mc_trial': return 'Stress + Monte Carlo: '+p.label.replace(/ trial \d+.*$/,'')+', trial '+r.trial+' (app #'+(r.trial+1)+')'+(r.exemplar?' ('+r.exemplar+')':'');
    case 'market': return 'Market scenario "'+p.label+'" ('+(p.meta&&p.meta.source==='user'?'saved by the user':'made by a tool')+')';
    case 'lever': return 'What-if run '+r.runId+' made by a tool';
  }
  return p.label;
}
const plSourceOf=p=>(p.meta&&p.meta.source)||(p.origin.kind==='scenario'||p.origin.kind==='mc_trial'&&p.owner==='monteCarlo'?'user':(p.owner==='jobs'||p.owner==='stressTool'||p.owner==='levers'?'llm':'builtin'));

// ── reference → plan ─────────────────────────────────────────────
// → {plan} or {error}. opts.promote (default true): a Monte Carlo trial asked for by number becomes a plan.
function plResolveRef(ref,opts){
  opts=opts||{}; const promote=opts.promote!==false;
  plSyncAll();
  let s=String(ref==null?'':ref).trim();
  if(!s) return {error:'ref is empty'};
  const live='scn:'+(typeof scnActive!=='undefined'?scnActive:'A');
  if(s.toLowerCase()==='plan') return {plan:plGet(live)};
  let p=plGet(s); if(p) return {plan:p};
  s=s.replace(/\bapp\s*#?\s*(\d+)\s*$/i,(_,n)=>'trial '+(Number(n)-1));   // the app\'s own 1-based number
  const low=s.toLowerCase().replace(/\s+/g,' ');
  const cands=(list,q,what)=>{
    const ql=String(q).toLowerCase().trim(), exact=list.filter(x=>x.key.toLowerCase()===ql||x.key.toLowerCase().endsWith(':'+ql)||x.label.toLowerCase()===ql);
    const hit=exact.length?exact:list.filter(x=>x.label.toLowerCase().includes(ql));
    if(hit.length===1) return {plan:hit[0]};
    if(!hit.length) return {error:'no '+what+' matches "'+q+'". Use list_plans.'};
    return {error:'"'+q+'" matches several '+what+'s: '+hit.slice(0,8).map(x=>x.key+' ("'+x.label+'")').join('; ')+'. Use the key.'};
  };
  let m;
  if((m=/^(?:scenario|scn)\s*[:\-]?\s*([a-z])$/i.exec(s))||(m=/^([a-z])$/i.exec(s))){ p=plGet('scn:'+m[1].toUpperCase()); return p?{plan:p}:{error:'there is no scenario '+m[1].toUpperCase()+'. Use list_plans.'}; }
  // Monte Carlo trials of the card: "mc trial 17", "mc 17", "monte carlo #17", "mc earliestFailure"
  if((m=/^(?:mc|monte ?carlo)[ :]*(?:trial)?[ :#]*(\d+)$/i.exec(s))){
    const key='mc:trial:'+Number(m[1]); p=plGet(key); if(p) return {plan:p};
    if(!promote) return {error:'trial '+m[1]+' is not a plan (it has not been asked for)'};
    const r=plPromoteTrial(Number(m[1]),'mc'); return r.plan?{plan:r.plan}:{error:r.why};
  }
  if((m=/^(?:mc|monte ?carlo)\s*[:]?\s*(earliestFailure|medianFailure|worstShortfall|typicalSuccess)$/i.exec(s))){
    const G=plMcFindGroup('mc'); if(!G) return {error:'no Monte Carlo run is available'};
    const nm=PL_EXEMPLAR_NAMES.find(n=>n.toLowerCase()===m[1].toLowerCase()), ex=rrExemplars(G.res)||{}, t=ex[nm]&&ex[nm].trial;
    if(t==null) return {error:'this run has no '+nm+' trial'};
    p=plGet(G.keyPrefix+t); if(p) return {plan:p};
    const r=plPromoteTrial(t,'mc'); return r.plan?{plan:r.plan}:{error:r.why};
  }
  // stress + Monte Carlo: "stress+mc Lost Decade trial 7", "stmc lost 7"
  if((m=/^(?:stress ?\+ ?(?:mc|monte ?carlo)|stmc)\s*[:]?\s*(.+?)\s*(?:#|:|,| trial)\s*(\d+)$/i.exec(s))){
    const gs=plMcGroups().filter(g=>g.id.startsWith('stmc:')||g.id.startsWith('mcj:')&&g.stressDef), q=m[1].toLowerCase();
    const hit=gs.filter(g=>g.id.toLowerCase().endsWith(':'+q)||g.label.toLowerCase().includes(q));
    if(hit.length!==1) return {error:hit.length?'"'+m[1]+'" matches several runs: '+hit.map(g=>g.id).join(', '):'no stress + Monte Carlo run matches "'+m[1]+'"'+(gs.length?' (have: '+gs.map(g=>g.id).join(', ')+')':'. It has not been run.')};
    const t=Number(m[2]), key=hit[0].keyPrefix+t; p=plGet(key); if(p) return {plan:p};
    if(!promote) return {error:'trial '+t+' is not a plan (it has not been asked for)'};
    const r=plPromoteTrial(t,hit[0].id); return r.plan?{plan:r.plan}:{error:r.why};
  }
  if((m=/^stress(?: test)?\s*[:]?\s*(.+)$/i.exec(s))){
    const card=plFind({kind:'stress',groupId:'st'}), tool=plFind({kind:'stress',groupId:'stl'});
    let r=cands(card,m[1],'stress test'); if(r.plan||!tool.length) return r;
    const r2=cands(tool,m[1],'stress test'); return r2.plan?r2:r;
  }
  if((m=/^(?:market(?: scenario)?|mkt)\s*[:]?\s*(.+)$/i.exec(s))) return cands(plFind({kind:'market'}),m[1],'market scenario');
  if((m=/^(?:what-?if|lever|lev)\s*[:]?\s*(.+)$/i.exec(s))) return cands(plFind({kind:'lever'}),m[1],'what-if run');
  // last resort: a unique part of any label
  const all=plList(), isTrial=x=>x.origin.kind==='mc_trial'||x.origin.kind==='stress_mc_trial';
  let hit=all.filter(x=>!isTrial(x)&&x.label.toLowerCase().includes(low)); if(!hit.length) hit=all.filter(x=>x.label.toLowerCase().includes(low));   // trials only when nothing else matches
  if(hit.length===1) return {plan:hit[0]};
  if(hit.length>1) return {error:'"'+s+'" matches several plans: '+hit.slice(0,8).map(x=>x.key).join(', ')+'. Use the key from list_plans.'};
  return {error:'no plan matches "'+s+'". Use list_plans to see the keys; a Monte Carlo trial is asked for as "mc trial 17".'};
}

// ── output helpers ───────────────────────────────────────────────
function plKpisOf(p){ try{ const s=plEnsureSummary(p.id); return s?s.kpis:null; }catch(e){ return null; } }
function plSummaryOf(p){ try{ return plEnsureSummary(p.id); }catch(e){ return null; } }
function plRowOut(p,liveFp,withKpis){
  const o={ref:p.key,id:p.id,kind:p.origin.kind,how:rrClean(plHow(p),140,RR_TOOL_NAMES),label:rrClean(p.label,RR_MAX_LABEL,RR_TOOL_NAMES),group:p.origin.groupId||null,source:plSourceOf(p),stale:plIsStale(p,liveFp)};
  if(p.pinned) o.requested=true;
  if(withKpis){ const k=plKpisOf(p); if(k) o.kpis=rrKpiOut(k); }
  return o;
}
// the state as an LLM may read it: no UI part, names only where the host allows them
function plStateOut(st){
  const o=JSON.parse(JSON.stringify(st,(k,v)=>k==='ui'?undefined:v));
  if(!RR_TOOL_NAMES&&Array.isArray(o.people)) o.people.forEach((pp,i)=>{ if(pp&&typeof pp.name==='string') pp.name='Person '+(i+1); });
  return o;
}
// What differs between two states, as {path, plan, scenario} (arrays and objects flattened; capped).
function plFlatten(o,pre,out){ if(o&&typeof o==='object'){ Object.keys(o).forEach(k=>{ if(k==='ui'||k==='id'||k==='hidden') return; plFlatten(o[k],pre+(pre?'.':'')+k,out); }); } else out[pre]=o; return out; }
function plStateDiff(a,b,max){
  const fa=plFlatten(a,'',{}), fb=plFlatten(b,'',{}), keys=new Set(Object.keys(fa).concat(Object.keys(fb))), out=[];
  keys.forEach(k=>{ if(JSON.stringify(fa[k])!==JSON.stringify(fb[k])) out.push({path:k,onScreen:fa[k]===undefined?null:fa[k],thisPlan:fb[k]===undefined?null:fb[k]}); });
  return {changes:out.slice(0,max||60),total:out.length};
}
const plR1=v=>v==null||typeof v!=='number'||!isFinite(v)?null:Math.round(v*10)/10;
function plOverlayOut(p,sum){
  const inp=p.input, o={basePlan:inp.baseKey,madeOnTheCurrentPlan:!plIsStale(p)};
  if(inp.overlay){ const v=inp.overlay;
    if(v.type==='stress'){ o.overlay={type:'stress',scenario:v.scenarioId,startAge:p.meta&&p.meta.row?plR1(p.meta.row.age0+p.meta.row.start):null,years:v.eq.length,shareOfAssetsHitPct:plR1(v.share*100),
      stockReturnsPct:v.eq.slice(0,30).map(x=>plR1(x*100)),inflationPct:v.infl?v.infl.slice(0,30).map(x=>plR1(x*100)):'the plan\'s own'}; }
    else if(v.type==='market'){ o.overlay=Object.assign({type:'market'},p.meta&&p.meta.describe||{}); o.overlay.stockReturnsPct=(v.path.returns||[]).slice(0,30).map(x=>plR1(x*100)); }
    else if(v.type==='levers') o.overlay={type:'levers',levers:v.levers};
  }
  if(inp.draw){ const d=inp.draw, cfg=typeof rrStripCfg==='function'?rrStripCfg(d.cfg):d.cfg;
    o.overlay={type:'monte_carlo_trial',trial:d.trial,seed:d.cfg.seed,trialsInRun:d.cfg.trials,settings:cfg,
      underStress:d.stressDef?{scenario:d.stressDef.scen&&d.stressDef.scen.id,start:d.stressDef.start,sharePct:d.stressDef.share}:null,drawn:sum&&sum.draws||null,
      note:'the trial is replayed from the seed: same settings, seed and trial number always give the same draws'}; }
  return o;
}

if(typeof apiRegister==='function'){
  const unknownRef=e=>apiErr(e);
  apiRegister({name:'list_plans',
    description:'List every plan the app holds, however it was made: the user\'s scenarios (A, B, …), what-if runs, market scenarios, stress test rows, and the Monte Carlo and stress + Monte Carlo trials worth looking at (earliest failure, median failure, largest shortfall, typical success, and any trial you asked for). Each has a ref (use it with get_plan / compare_plans / show_plan), how it was made, whether it is stale (the plan was edited after it was made) and headline numbers. Also lists the Monte Carlo runs any trial number can be asked from. Prefer reading a plan\'s inputs (get_plan detail "inputs") to re-running it.',
    inputSchema:{type:'object',properties:{kinds:{type:'array',items:{type:'string',enum:PL_KIND_ORDER},description:'optional filter'},group:{type:'string',description:'optional: only plans of this run, e.g. "mc:run", "stmc:lost", "st", "stl"'},label:{type:'string',description:'optional: part of the label'},stale:{type:'boolean',description:'only stale (true) or only current (false) plans'},withKpis:{type:'boolean',description:'include headline numbers (default true; a trial is replayed the first time)'}}},
    handler(args){
      plSyncAll(); RR_STEP=1; RR_KEEP_NAMES=RR_TOOL_NAMES;
      try{
        const liveFp=plFingerprint(state), withK=args.withKpis!==false;
        let l=plList().filter(p=>(!Array.isArray(args.kinds)||!args.kinds.length||args.kinds.includes(p.origin.kind))&&(args.group==null||p.origin.groupId===args.group)&&(!args.label||p.label.toLowerCase().includes(String(args.label).toLowerCase())));
        l.sort((x,y)=>PL_KIND_ORDER.indexOf(x.origin.kind)-PL_KIND_ORDER.indexOf(y.origin.kind));
        let rows=l.map(p=>plRowOut(p,liveFp,withK)); if(typeof args.stale==='boolean') rows=rows.filter(r=>r.stale===args.stale);
        const groups=plMcGroups().map(g=>({group:g.id,label:rrClean(g.label,RR_MAX_LABEL,RR_TOOL_NAMES),trials:g.res.length,stale:g.runKey!==plStateKey(state),askFor:g.id==='mc:run'?'"mc trial N"':'"stress+mc '+g.id.replace(/^stmc:/,'')+' trial N"'}));
        return {isError:false,response:{units:'today\'s dollars',plans:rows,monteCarloRuns:groups,note:'Only exemplar and requested trials are plans; ask for any trial by number with get_plan ref "mc trial 17" (0-based; the app shows it as #18; "mc app #18" uses the app\'s number). Stale plans keep the numbers of the plan they were made on.'}};
      } finally{ RR_KEEP_NAMES=false; }
    }});
  apiRegister({name:'get_plan',
    description:'One plan in detail. detail "summary" (default): how it was made, headline numbers, the change against the plan on screen, and what was drawn (Monte Carlo trials). "inputs": what it is made of: for a scenario the full input data and how it differs from the plan on screen; for a stress test, market path, what-if or Monte Carlo trial the plan it was made on plus the overlay, settings and seed (reading these is better than re-running anything). "series": also the yearly values, optionally between two ages. ref: a key from list_plans, "plan", "scenario B", "stress Lost Decade", "mc trial 17", "mc earliestFailure", "stress+mc Lost Decade trial 7", "market <name>", or a unique part of a label.',
    inputSchema:{type:'object',properties:{ref:{type:'string'},detail:{type:'string',enum:['summary','inputs','series']},fromAge:{type:'number'},toAge:{type:'number'}},required:['ref']},
    handler(args){
      RR_STEP=1; RR_KEEP_NAMES=RR_TOOL_NAMES;
      try{
        const r=plResolveRef(args.ref); if(!r.plan) return unknownRef(r.error);
        const p=r.plan, liveFp=plFingerprint(state), live=plGet('scn:'+(typeof scnActive!=='undefined'?scnActive:'A')), o=plRowOut(p,liveFp,false), det=args.detail||'summary';
        const sum=plSummaryOf(p); if(sum){ o.kpis=rrKpiOut(sum.kpis); if(sum.draws) o.drawn=sum.draws; const lk=live&&live!==p?plKpisOf(live):null; if(lk) o.changeVsPlan=rrDeltas(sum.kpis,lk); }
        else o.warning='the plan was edited after this was made and its numbers were never kept; run it again';
        if(o.stale) o.warning=o.warning||'the plan on screen was edited after this was made; its numbers describe the plan it was made on';
        if(det==='inputs'){
          if(p.input.state){ o.inputs={kind:'full plan'}; if(live&&live!==p) o.inputs.differsFromPlanOnScreen=plStateDiff(plStateOut(live.input.state),plStateOut(p.input.state),60); o.inputs.state=plStateOut(p.input.state); }
          else { o.inputs=plOverlayOut(p,sum); const b=plGet(p.input.baseKey); if(b&&!plIsStale(p,liveFp)) o.inputs.basePlanLabel=rrClean(b.label,RR_MAX_LABEL,RR_TOOL_NAMES); o.inputs.note='the full inputs of the base plan: get_plan ref "'+p.input.baseKey+'" detail "inputs"'; }
        }
        if(det==='series'){
          if(!sum) return unknownRef('this plan is stale and has no kept numbers; its yearly values cannot be rebuilt');
          if(plIsStale(p,liveFp)&&p.input.baseKey){ o.warning='the plan on screen was edited after this was made; its yearly values come from the plan it was made on'; }
          const g=plRunPlan(p); if(g){ const m=g.m; o.series=rrSeriesOf(g.proj,m,args.fromAge,args.toAge); } else o.warning=(o.warning?o.warning+'; ':'')+'its yearly values cannot be rebuilt (the plan it was made on changed)';
        }
        return {isError:false,response:o};
      } finally{ RR_KEEP_NAMES=false; }
    }});
  apiRegister({name:'compare_plans',
    description:'Side-by-side headline numbers for several plans of any kind (refs as in get_plan), with the change against a baseline plan (default: the plan on screen). A Monte Carlo trial named by number is made a plan first.',
    inputSchema:{type:'object',properties:{refs:{type:'array',items:{type:'string'},description:'1 to 8 refs'},baseline:{type:'string',description:'ref (default "plan")'}},required:['refs']},
    handler(args){
      if(!Array.isArray(args.refs)||args.refs.length<1||args.refs.length>8) return apiErr('refs must list 1 to 8 plan refs');
      RR_STEP=1; RR_KEEP_NAMES=RR_TOOL_NAMES;
      try{
        const b=plResolveRef(args.baseline==null?'plan':args.baseline); if(!b.plan) return unknownRef('baseline: '+b.error);
        const bk=plKpisOf(b.plan), liveFp=plFingerprint(state), rows=[], problems=[];
        args.refs.forEach(ref=>{ const r=plResolveRef(ref); if(!r.plan){ problems.push({ref,error:r.error}); return; }
          const o=plRowOut(r.plan,liveFp,true); if(o.kpis&&bk&&r.plan!==b.plan) o.changeVsBaseline=rrDeltas(plKpisOf(r.plan),bk); rows.push(o); });
        if(!rows.length) return apiErr('none of the refs resolved: '+problems.map(x=>x.ref+' ('+x.error+')').join('; '));
        const resp={units:'today\'s dollars',baseline:b.plan.key,plans:rows}; if(problems.length) resp.unresolved=problems; return {isError:false,response:resp};
      } finally{ RR_KEEP_NAMES=false; }
    }});
  apiRegister({name:'show_plan',
    description:'Put a plan on the app\'s main chart grid (a replay on a private copy; the user\'s plan is not changed and they can go Back to plan). Works for scenarios, stress tests, market scenarios and Monte Carlo / stress + Monte Carlo trials; ref as in get_plan. Only has an effect where the host has a display.',
    inputSchema:{type:'object',properties:{ref:{type:'string'}},required:['ref']},
    handler(args){
      const r=plResolveRef(args.ref); if(!r.plan) return unknownRef(r.error);
      if(r.plan.origin.kind==='lever') return apiErr('what-if runs cannot be shown on the main charts; use show_chart with the run id '+r.plan.origin.ref.runId);
      if(plIsStale(r.plan)&&r.plan.input.baseKey) return apiErr('that plan was made before the plan on screen was edited, so it cannot be replayed. Ask the user to run it again.');
      return {isError:false,response:{requested:r.plan.key,how:plHow(r.plan),note:'shown in the main charts if this host has a display'},effects:[{type:'showPlan',ref:r.plan.key}]};
    }});
  apiRegister({name:'delete_plan',
    description:'Forget a plan the tools made (a what-if run, a market scenario you defined) or hide a derived one (a stress row, a Monte Carlo trial) from the plan list until its run is replaced. Never deletes the user\'s own scenarios or their saved market scenarios: ask the user to do that in the app.',
    inputSchema:{type:'object',properties:{ref:{type:'string'}},required:['ref']},
    handler(args){
      const r=plResolveRef(args.ref,{promote:false}); if(!r.plan) return unknownRef(r.error);
      const p=r.plan, k=p.origin.kind;
      if(k==='scenario') return apiErr('scenarios are the user\'s own; ask them to delete it in the Scenario card');
      if(k==='market'&&plSourceOf(p)==='user') return apiErr('that market scenario was saved by the user; ask them to remove it in the Stress tests card');
      const d=plDelete(p.key); if(!d.ok) return apiErr(d.why||'could not delete');
      return {isError:false,response:{deleted:p.key,note:d.note||'removed'}};
    }});
}
if(typeof module!=='undefined') module.exports={plResolveRef,plHow};
