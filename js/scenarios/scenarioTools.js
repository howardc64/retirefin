'use strict';
// ═══════════════════════════════════════════════════════════════
// PLANS / TOOLS — the master scenario list as LLM tools (chat, MCP, live bridge: the same registry as the other tools). Load after scenarios/jobsProducer.js and compute/runRegistry.js.
//   list_scenarios     every scenario, however it was made, with how it was made and headline numbers; plus the Monte Carlo runs trials can be asked from
//   get_scenario       one scenario: headline numbers, or (detail "inputs") what it is made of, or (detail "series") its yearly values
//   compare_scenarios  headline numbers of several scenarios side by side, with the change against a baseline
//   show_scenario      put a scenario on the app's main charts (a page effect, like show_market_scenario_in_charts)
//   delete_scenario    forget a scenario the tools made, or hide a derived one; never the user's own scenarios or saved market paths
// A scenario is addressed by `ref`: its key ('scn:B', 'st:lost', 'mc:trial:17', 'stmc:lost:7', 'mkt:<id>', 'lev:r1'), its id ('p12'), "plan" (the one on screen), or how it was made:
//   "scenario B" · "stress Lost Decade" · "mc trial 17" · "mc earliestFailure" · "stress+mc Lost Decade trial 7" · "market Two bad years" · "what-if r1" · or a unique part of its label.
// A Monte Carlo trial that is not a scenario yet is made one when it is asked for (the app never keeps thousands); a stale run cannot be asked for new trials.
// ═══════════════════════════════════════════════════════════════
const SC_KIND_ORDER=['scenario','lever','market','stress','mc_trial','stress_mc_trial'];
const SC_EXEMPLAR_NAMES=['earliestFailure','medianFailure','worstShortfall','typicalSuccess'];

// How a scenario was made, in words the user would use.
function scHow(p){
  const o=p.origin, r=o.ref||{};
  switch(o.kind){
    case 'scenario': return 'Scenario '+r.scenarioId+(p.key==='scn:'+(typeof scnActive!=='undefined'?scnActive:'A')?' (on screen: the scenario as entered)':' (a saved scenario)');
    case 'stress': return (o.groupId==='stl'?'Stress test run by a tool: ':'Stress test: ')+p.label;
    case 'mc_trial': return 'Monte Carlo trial '+r.trial+' (app #'+(r.trial+1)+')'+(r.exemplar?' ('+r.exemplar+')':'')+(p.key.startsWith('mcj:')?' of tool-started job '+p.key.split(':')[1]:'');
    case 'stress_mc_trial': return 'Stress + Monte Carlo: '+p.label.replace(/ trial \d+.*$/,'')+', trial '+r.trial+' (app #'+(r.trial+1)+')'+(r.exemplar?' ('+r.exemplar+')':'');
    case 'market': return 'Market scenario "'+p.label+'" ('+(p.meta&&p.meta.source==='user'?'saved by the user':'made by a tool')+')';
    case 'lever': return 'What-if run '+r.runId+' made by a tool';
  }
  return p.label;
}
const scSourceOf=p=>(p.meta&&p.meta.source)||(p.origin.kind==='scenario'||p.origin.kind==='mc_trial'&&p.owner==='monteCarlo'?'user':(p.owner==='jobs'||p.owner==='stressTool'||p.owner==='levers'?'llm':'builtin'));

// ── reference → scenario ─────────────────────────────────────────────
// → {scenario} or {error}. opts.promote (default true): a Monte Carlo trial asked for by number becomes a scenario.
function scResolveRef(ref,opts){
  opts=opts||{}; const promote=opts.promote!==false;
  scSyncAll();
  let s=String(ref==null?'':ref).trim();
  if(!s) return {error:'ref is empty'};
  const live='scn:'+(typeof scnActive!=='undefined'?scnActive:'A');
  if(['entered','plan','scenario'].includes(s.toLowerCase())) return {scenario:scGet(live)};
  let p=scGet(s); if(p) return {scenario:p};
  s=s.replace(/\bapp\s*#?\s*(\d+)\s*$/i,(_,n)=>'trial '+(Number(n)-1));   // the app\'s own 1-based number
  const low=s.toLowerCase().replace(/\s+/g,' ');
  const cands=(list,q,what)=>{
    const ql=String(q).toLowerCase().trim(), exact=list.filter(x=>x.key.toLowerCase()===ql||x.key.toLowerCase().endsWith(':'+ql)||x.label.toLowerCase()===ql);
    const hit=exact.length?exact:list.filter(x=>x.label.toLowerCase().includes(ql));
    if(hit.length===1) return {scenario:hit[0]};
    if(!hit.length) return {error:'no '+what+' matches "'+q+'". Use list_scenarios.'};
    return {error:'"'+q+'" matches several '+what+'s: '+hit.slice(0,8).map(x=>x.key+' ("'+x.label+'")').join('; ')+'. Use the key.'};
  };
  let m;
  if((m=/^(?:scenario|scn)\s*[:\-]?\s*([a-z])$/i.exec(s))||(m=/^([a-z])$/i.exec(s))){ p=scGet('scn:'+m[1].toUpperCase()); return p?{scenario:p}:{error:'there is no scenario '+m[1].toUpperCase()+'. Use list_scenarios.'}; }
  // Monte Carlo trials of the card: "mc trial 17", "mc 17", "monte carlo #17", "mc earliestFailure"
  if((m=/^(?:mc|monte ?carlo)[ :]*(?:trial)?[ :#]*(\d+)$/i.exec(s))){
    const key='mc:trial:'+Number(m[1]); p=scGet(key); if(p) return {scenario:p};
    if(!promote) return {error:'trial '+m[1]+' is not a scenario (it has not been asked for)'};
    const r=scPromoteTrial(Number(m[1]),'mc'); return r.scenario?{scenario:r.scenario}:{error:r.why};
  }
  if((m=/^(?:mc|monte ?carlo)\s*[:]?\s*(earliestFailure|medianFailure|worstShortfall|typicalSuccess)$/i.exec(s))){
    const G=scMcFindGroup('mc'); if(!G) return {error:'no Monte Carlo run is available'};
    const nm=SC_EXEMPLAR_NAMES.find(n=>n.toLowerCase()===m[1].toLowerCase()), ex=rrExemplars(G.res)||{}, t=ex[nm]&&ex[nm].trial;
    if(t==null) return {error:'this run has no '+nm+' trial'};
    p=scGet(G.keyPrefix+t); if(p) return {scenario:p};
    const r=scPromoteTrial(t,'mc'); return r.scenario?{scenario:r.scenario}:{error:r.why};
  }
  // stress + Monte Carlo: "stress+mc Lost Decade trial 7", "stmc lost 7"
  if((m=/^(?:stress ?\+ ?(?:mc|monte ?carlo)|stmc)\s*[:]?\s*(.+?)\s*(?:#|:|,| trial)\s*(\d+)$/i.exec(s))){
    const gs=scMcGroups().filter(g=>g.id.startsWith('stmc:')||g.id.startsWith('mcj:')&&g.stressDef), q=m[1].toLowerCase();
    const hit=gs.filter(g=>g.id.toLowerCase().endsWith(':'+q)||g.label.toLowerCase().includes(q));
    if(hit.length!==1) return {error:hit.length?'"'+m[1]+'" matches several runs: '+hit.map(g=>g.id).join(', '):'no stress + Monte Carlo run matches "'+m[1]+'"'+(gs.length?' (have: '+gs.map(g=>g.id).join(', ')+')':'. It has not been run.')};
    const t=Number(m[2]), key=hit[0].keyPrefix+t; p=scGet(key); if(p) return {scenario:p};
    if(!promote) return {error:'trial '+t+' is not a scenario (it has not been asked for)'};
    const r=scPromoteTrial(t,hit[0].id); return r.scenario?{scenario:r.scenario}:{error:r.why};
  }
  if((m=/^stress(?: test)?\s*[:]?\s*(.+)$/i.exec(s))){
    const card=scFind({kind:'stress',groupId:'st'}), tool=scFind({kind:'stress',groupId:'stl'});
    let r=cands(card,m[1],'stress test'); if(r.scenario||!tool.length) return r;
    const r2=cands(tool,m[1],'stress test'); return r2.scenario?r2:r;
  }
  if((m=/^(?:market(?: scenario)?|mkt)\s*[:]?\s*(.+)$/i.exec(s))) return cands(scFind({kind:'market'}),m[1],'market scenario');
  if((m=/^(?:what-?if|lever|lev)\s*[:]?\s*(.+)$/i.exec(s))) return cands(scFind({kind:'lever'}),m[1],'what-if run');
  // last resort: a unique part of any label
  const all=scList(), isTrial=x=>x.origin.kind==='mc_trial'||x.origin.kind==='stress_mc_trial';
  let hit=all.filter(x=>!isTrial(x)&&x.label.toLowerCase().includes(low)); if(!hit.length) hit=all.filter(x=>x.label.toLowerCase().includes(low));   // trials only when nothing else matches
  if(hit.length===1) return {scenario:hit[0]};
  if(hit.length>1) return {error:'"'+s+'" matches several scenarios: '+hit.slice(0,8).map(x=>x.key).join(', ')+'. Use the key from list_scenarios.'};
  return {error:'no scenario matches "'+s+'". Use list_scenarios to see the keys; a Monte Carlo trial is asked for as "mc trial 17".'};
}

// ── output helpers ───────────────────────────────────────────────
function scKpisOf(p){ try{ const s=scEnsureSummary(p.id); return s?s.kpis:null; }catch(e){ return null; } }
function scSummaryOf(p){ try{ return scEnsureSummary(p.id); }catch(e){ return null; } }
function scRowOut(p,liveFp,withKpis){
  const o={ref:p.key,id:p.id,kind:p.origin.kind,how:rrClean(scHow(p),140,RR_TOOL_NAMES),label:rrClean(p.label,RR_MAX_LABEL,RR_TOOL_NAMES),group:p.origin.groupId||null,source:scSourceOf(p),stale:scIsStale(p,liveFp)};
  if(p.pinned) o.requested=true;
  if(withKpis){ const k=scKpisOf(p); if(k) o.kpis=rrKpiOut(k); }
  return o;
}
// the state as an LLM may read it: no UI part, names only where the host allows them
function scStateOut(st){
  const o=JSON.parse(JSON.stringify(st,(k,v)=>k==='ui'?undefined:v));
  if(!RR_TOOL_NAMES&&Array.isArray(o.people)) o.people.forEach((pp,i)=>{ if(pp&&typeof pp.name==='string') pp.name='Person '+(i+1); });
  return o;
}
// What differs between two states, as {path, scenario, scenario} (arrays and objects flattened; capped).
function scFlatten(o,pre,out){ if(o&&typeof o==='object'){ Object.keys(o).forEach(k=>{ if(k==='ui'||k==='id'||k==='hidden') return; scFlatten(o[k],pre+(pre?'.':'')+k,out); }); } else out[pre]=o; return out; }
function scStateDiff(a,b,max){
  const fa=scFlatten(a,'',{}), fb=scFlatten(b,'',{}), keys=new Set(Object.keys(fa).concat(Object.keys(fb))), out=[];
  keys.forEach(k=>{ if(JSON.stringify(fa[k])!==JSON.stringify(fb[k])) out.push({path:k,onScreen:fa[k]===undefined?null:fa[k],thisScenario:fb[k]===undefined?null:fb[k]}); });
  return {changes:out.slice(0,max||60),total:out.length};
}
const scR1=v=>v==null||typeof v!=='number'||!isFinite(v)?null:Math.round(v*10)/10;
function scOverlayOut(p,sum){
  const inp=p.input, o={baseScenario:inp.baseKey,madeOnTheCurrentScenario:!scIsStale(p)};
  if(inp.overlay){ const v=inp.overlay;
    if(v.type==='stress'){ o.overlay={type:'stress',scenario:v.scenarioId,startAge:p.meta&&p.meta.row?scR1(p.meta.row.age0+p.meta.row.start):null,years:v.eq.length,shareOfAssetsHitPct:scR1(v.share*100),
      stockReturnsPct:v.eq.slice(0,30).map(x=>scR1(x*100)),inflationPct:v.infl?v.infl.slice(0,30).map(x=>scR1(x*100)):'the scenario\'s own'}; }
    else if(v.type==='market'){ o.overlay=Object.assign({type:'market'},p.meta&&p.meta.describe||{}); o.overlay.stockReturnsPct=(v.path.returns||[]).slice(0,30).map(x=>scR1(x*100)); }
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
  apiRegister({name:'list_scenarios',
    description:'List every scenario the app holds, however it was made: the user\'s scenarios (A, B, …), what-if runs, market scenarios, stress test rows, and the Monte Carlo and stress + Monte Carlo trials worth looking at (earliest failure, median failure, largest shortfall, typical success, and any trial you asked for). Each has a ref (use it with get_scenario / compare_scenarios / show_scenario), how it was made, whether it is stale (the scenario was edited after it was made) and headline numbers. Also lists the Monte Carlo runs any trial number can be asked from. Prefer reading a scenario\'s inputs (get_scenario detail "inputs") to re-running it.',
    inputSchema:{type:'object',properties:{kinds:{type:'array',items:{type:'string',enum:SC_KIND_ORDER},description:'optional filter'},group:{type:'string',description:'optional: only scenarios of this run, e.g. "mc:run", "stmc:lost", "st", "stl"'},label:{type:'string',description:'optional: part of the label'},stale:{type:'boolean',description:'only stale (true) or only current (false) scenarios'},withKpis:{type:'boolean',description:'include headline numbers (default true; a trial is replayed the first time)'}}},
    handler(args){
      scSyncAll(); RR_STEP=1; RR_KEEP_NAMES=RR_TOOL_NAMES;
      try{
        const liveFp=scFingerprint(state), withK=args.withKpis!==false;
        let l=scList().filter(p=>(!Array.isArray(args.kinds)||!args.kinds.length||args.kinds.includes(p.origin.kind))&&(args.group==null||p.origin.groupId===args.group)&&(!args.label||p.label.toLowerCase().includes(String(args.label).toLowerCase())));
        l.sort((x,y)=>SC_KIND_ORDER.indexOf(x.origin.kind)-SC_KIND_ORDER.indexOf(y.origin.kind));
        let rows=l.map(p=>scRowOut(p,liveFp,withK)); if(typeof args.stale==='boolean') rows=rows.filter(r=>r.stale===args.stale);
        const groups=scMcGroups().map(g=>({group:g.id,label:rrClean(g.label,RR_MAX_LABEL,RR_TOOL_NAMES),trials:g.res.length,stale:g.runKey!==scStateKey(state),askFor:g.id==='mc:run'?'"mc trial N"':'"stress+mc '+g.id.replace(/^stmc:/,'')+' trial N"'}));
        return {isError:false,response:{units:'today\'s dollars',scenarios:rows,monteCarloRuns:groups,note:'Only exemplar and requested trials are scenarios; ask for any trial by number with get_scenario ref "mc trial 17" (0-based; the app shows it as #18; "mc app #18" uses the app\'s number). Stale scenarios keep the numbers of the scenario they were made on.'}};
      } finally{ RR_KEEP_NAMES=false; }
    }});
  apiRegister({name:'get_scenario',
    description:'One scenario in detail. detail "summary" (default): how it was made, headline numbers, the change against the scenario on screen, and what was drawn (Monte Carlo trials). "inputs": what it is made of: for a scenario the full input data and how it differs from the scenario on screen; for a stress test, market path, what-if or Monte Carlo trial the scenario it was made on plus the overlay, settings and seed (reading these is better than re-running anything). "series": also the yearly values, optionally between two ages. ref: a key from list_scenarios, "entered" (the scenario on screen), "scenario B", "stress Lost Decade", "mc trial 17", "mc earliestFailure", "stress+mc Lost Decade trial 7", "market <name>", or a unique part of a label.',
    inputSchema:{type:'object',properties:{ref:{type:'string'},detail:{type:'string',enum:['summary','inputs','series']},fromAge:{type:'number'},toAge:{type:'number'}},required:['ref']},
    handler(args){
      RR_STEP=1; RR_KEEP_NAMES=RR_TOOL_NAMES;
      try{
        const r=scResolveRef(args.ref); if(!r.scenario) return unknownRef(r.error);
        const p=r.scenario, liveFp=scFingerprint(state), live=scGet('scn:'+(typeof scnActive!=='undefined'?scnActive:'A')), o=scRowOut(p,liveFp,false), det=args.detail||'summary';
        const sum=scSummaryOf(p); if(sum){ o.kpis=rrKpiOut(sum.kpis); if(sum.draws) o.drawn=sum.draws; const lk=live&&live!==p?scKpisOf(live):null; if(lk) o.changeVsScenario=rrDeltas(sum.kpis,lk); }
        else o.warning='the scenario was edited after this was made and its numbers were never kept; run it again';
        if(o.stale) o.warning=o.warning||'the scenario on screen was edited after this was made; its numbers describe the scenario it was made on';
        if(det==='inputs'){
          if(p.input.state){ o.inputs={kind:'full scenario'}; if(live&&live!==p) o.inputs.differsFromScenarioOnScreen=scStateDiff(scStateOut(live.input.state),scStateOut(p.input.state),60); o.inputs.state=scStateOut(p.input.state); }
          else { o.inputs=scOverlayOut(p,sum); const b=scGet(p.input.baseKey); if(b&&!scIsStale(p,liveFp)) o.inputs.baseScenarioLabel=rrClean(b.label,RR_MAX_LABEL,RR_TOOL_NAMES); o.inputs.note='the full inputs of the base scenario: get_scenario ref "'+p.input.baseKey+'" detail "inputs"'; }
        }
        if(det==='series'){
          if(!sum) return unknownRef('this scenario is stale and has no kept numbers; its yearly values cannot be rebuilt');
          if(scIsStale(p,liveFp)&&p.input.baseKey){ o.warning='the scenario on screen was edited after this was made; its yearly values come from the scenario it was made on'; }
          const g=scRunScenario(p); if(g){ const m=g.m; o.series=rrSeriesOf(g.proj,m,args.fromAge,args.toAge); } else o.warning=(o.warning?o.warning+'; ':'')+'its yearly values cannot be rebuilt (the scenario it was made on changed)';
        }
        return {isError:false,response:o};
      } finally{ RR_KEEP_NAMES=false; }
    }});
  apiRegister({name:'compare_scenarios',
    description:'Side-by-side headline numbers for several scenarios of any kind (refs as in get_scenario), with the change against a baseline scenario (default: the scenario on screen). A Monte Carlo trial named by number is made a scenario first.',
    inputSchema:{type:'object',properties:{refs:{type:'array',items:{type:'string'},description:'1 to 8 refs'},baseline:{type:'string',description:'ref (default "entered")'}},required:['refs']},
    handler(args){
      if(!Array.isArray(args.refs)||args.refs.length<1||args.refs.length>8) return apiErr('refs must list 1 to 8 scenario refs');
      RR_STEP=1; RR_KEEP_NAMES=RR_TOOL_NAMES;
      try{
        const b=scResolveRef(args.baseline==null?'entered':args.baseline); if(!b.scenario) return unknownRef('baseline: '+b.error);
        const bk=scKpisOf(b.scenario), liveFp=scFingerprint(state), rows=[], problems=[];
        args.refs.forEach(ref=>{ const r=scResolveRef(ref); if(!r.scenario){ problems.push({ref,error:r.error}); return; }
          const o=scRowOut(r.scenario,liveFp,true); if(o.kpis&&bk&&r.scenario!==b.scenario) o.changeVsBaseline=rrDeltas(scKpisOf(r.scenario),bk); rows.push(o); });
        if(!rows.length) return apiErr('none of the refs resolved: '+problems.map(x=>x.ref+' ('+x.error+')').join('; '));
        const resp={units:'today\'s dollars',baseline:b.scenario.key,scenarios:rows}; if(problems.length) resp.unresolved=problems; return {isError:false,response:resp};
      } finally{ RR_KEEP_NAMES=false; }
    }});
  apiRegister({name:'show_scenario',
    description:'Put a scenario on the app\'s main chart grid (a replay on a private copy; the user\'s scenario is not changed and they can go Back to scenario). Works for scenarios, stress tests, market scenarios and Monte Carlo / stress + Monte Carlo trials; ref as in get_scenario. Only has an effect where the host has a display.',
    inputSchema:{type:'object',properties:{ref:{type:'string'}},required:['ref']},
    handler(args){
      const r=scResolveRef(args.ref); if(!r.scenario) return unknownRef(r.error);
      if(r.scenario.origin.kind==='lever') return apiErr('what-if runs cannot be shown on the main charts; use show_chart with the run id '+r.scenario.origin.ref.runId);
      if(scIsStale(r.scenario)&&r.scenario.input.baseKey) return apiErr('that scenario was made before the scenario on screen was edited, so it cannot be replayed. Ask the user to run it again.');
      return {isError:false,response:{requested:r.scenario.key,how:scHow(r.scenario),note:'shown in the main charts if this host has a display'},effects:[{type:'showScenario',ref:r.scenario.key}]};
    }});
  apiRegister({name:'delete_scenario',
    description:'Forget a scenario the tools made (a what-if run, a market scenario you defined) or hide a derived one (a stress row, a Monte Carlo trial) from the scenario list until its run is replaced. Never deletes the user\'s own scenarios or their saved market scenarios: ask the user to do that in the app.',
    inputSchema:{type:'object',properties:{ref:{type:'string'}},required:['ref']},
    handler(args){
      const r=scResolveRef(args.ref,{promote:false}); if(!r.scenario) return unknownRef(r.error);
      const p=r.scenario, k=p.origin.kind;
      if(k==='scenario') return apiErr('scenarios are the user\'s own; ask them to delete it in the Scenario card');
      if(k==='market'&&scSourceOf(p)==='user') return apiErr('that market scenario was saved by the user; ask them to remove it in the Stress tests card');
      const d=scDelete(p.key); if(!d.ok) return apiErr(d.why||'could not delete');
      return {isError:false,response:{deleted:p.key,note:d.note||'removed'}};
    }});
}
if(typeof module!=='undefined') module.exports={scResolveRef,scHow};
