// Phase 2: validated stress / Monte Carlo settings, the stress runner, Monte Carlo jobs, the MCP-only tools and the stress / montecarlo import kinds
// (compute/runJobs.js).  PLANNER_ROOT=. node tests/llm/jobs_test.js
const {makeCtx,run}=require('../chat/harness.js');
let fails=0,n=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m); } else console.log('  ok: '+m); };
const ctx=makeCtx('Couple_Heir.json');
const J=code=>JSON.parse(run(ctx,'JSON.stringify('+code+')'));
const call=(name,args,src)=>{ ctx.__a=args||{}; return JSON.parse(run(ctx,'JSON.stringify(apiCall('+JSON.stringify(name)+',__a,{source:'+JSON.stringify(src||'mcp')+'}))')); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(f,ms=30000)=>{ const t0=Date.now(); while(Date.now()-t0<ms){ if(f()) return true; await sleep(20); } return false; };
const before=run(ctx,'JSON.stringify(state)');
(async()=>{
// ── 1. validation ──
const V=(fn,inp,opts)=>{ ctx.__i=inp; ctx.__o=opts||{}; return J(fn+'(__i,__o)'); };
let v=V('rjValidateMc',{trials:300,returns:{volEquity:20,panic:{enabled:true}},mortality:{mode:90}});
ok(!v.errors.length&&v.cfg.trials===300&&v.cfg.returns.volEquity===20&&v.cfg.returns.panic.enabled===true&&v.cfg.mortality.mode===90&&v.cfg.mortality.scale===10&&v.cfg.ltc.prob===0.5,'partial Monte Carlo settings are merged over the base (untouched values keep the default)');
ok(v.basedOn==='the defaults','headless: the base is the defaults');
v=V('rjValidateMc',{trials:10,bogus:1,returns:{volEquity:500,rho:'x',panic:{compare:true}},mortality:{mode:50.5},inflation:{min:5,max:1}});
ok(v.errors.length>=6&&v.errors.some(e=>/unknown setting "bogus"/.test(e))&&v.errors.some(e=>/trials must be between 50/.test(e))&&v.errors.some(e=>/volEquity must be between/.test(e))&&v.errors.some(e=>/rho must be a number/.test(e))&&v.errors.some(e=>/compare is not available/.test(e))&&v.errors.some(e=>/min must be below/.test(e)),'unknown keys, out-of-range, wrong type, the compare option and min ≥ max are each reported');
ok(V('rjValidateMc',{trials:3000},{source:'chat'}).errors.some(e=>/at most 2000/.test(e))&&!V('rjValidateMc',{trials:3000},{source:'mcp'}).errors.length,'the trial limit depends on the host (chat 2000, MCP 5000)');
ok(V('rjValidateMc','x').errors.length===1||V('rjValidateMc',[1]).errors.length>=1,'settings that are not an object are rejected');
v=V('rjValidateStress',{start:{mode:'custom',years:3},equityShare:60,stag:{years:8,inflEnd:9}});
ok(!v.errors.length&&v.cfg.start.mode==='custom'&&v.cfg.equityShare===60&&v.cfg.stag.years===8&&v.cfg.stag.eqReturn===0&&v.cfg.med.enabled===false,'partial stress settings merge; the medical shock stays off');
v=V('rjValidateStress',{med:{enabled:true},lost:{enabled:'yes'},start:{mode:'later'},equityShare:101});
ok(v.errors.length===4&&v.errors.some(e=>/medical shock is not available/.test(e)),'med, a non-boolean, a bad enum and an out-of-range share are rejected');
ok(V('rjValidateStress',{lost:{enabled:false},stag:{enabled:false},y1966:{enabled:false},custom:{enabled:false}}).errors.some(e=>/at least one scenario/.test(e)),'turning every scenario off is rejected');
ok(V('rjValidateStress',{},{includePathIds:['nope']}).errors.some(e=>/unknown market scenario/.test(e)),'includePathIds must name a known market scenario');

// ── 2. host gating ──
const neutral=J("apiList('neutral').map(t=>t.name)"), mcpAll=J("apiList('mcp','mcp').map(t=>t.name)"), mcpNoHost=J("apiList('mcp').map(t=>t.name)");
const jobTools=['define_stress_config','define_mc_config','run_stress_tests','run_monte_carlo','get_job','cancel_job'];
ok(jobTools.every(t=>!neutral.includes(t)&&!mcpNoHost.includes(t))&&jobTools.every(t=>mcpAll.includes(t)),'the job tools are listed only for the MCP host (the chat\'s declarations do not grow)');
ok(call('run_monte_carlo',{},'chat').isError&&/not available to this host/.test(call('run_stress_tests',{},'chat').response.error),'calling a job tool as the chat is refused');
const objWithoutProps=sch=>{ let bad=false; (function w(s){ if(!s||typeof s!=='object') return; if(s.type==='object'&&(!s.properties||!Object.keys(s.properties).length)) bad=true; Object.keys(s).forEach(k=>w(s[k])); })(sch); return bad; };
ok(!J("apiList('mcp','mcp')").some(t=>objWithoutProps(t.inputSchema)),'every declaration has properties on every object (strict providers accept them)');

// ── 3. stress run ──
let r=call('define_stress_config',{config:{equityShare:80}}); ok(!r.isError&&r.response.config.equityShare===80&&r.response.scenarios.length>=3,'define_stress_config validates, remembers and lists the scenarios');
ok(call('define_stress_config',{config:{equityShare:900}}).isError&&call('define_stress_config',{config:{equityShare:900}}).response.problems.length===1,'define_stress_config rejects with the problems listed');
r=call('run_stress_tests',{}); ok(!r.isError&&r.response.stress.length>=3&&r.response.stress.every(x=>x.id.startsWith('stl:')&&x.source==='llm'&&x.kpis),'run_stress_tests returns stl:<scenario> runs from the remembered settings');
const direct=J(`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); cfg.equityShare=80; cfg.med.enabled=false; return stRunAll(cfg).results.map(r=>Math.round(r.m.estateFin+r.m.estateRe)); })()`);
ok(JSON.stringify(r.response.stress.map(x=>x.kpis.finalTotal))===JSON.stringify(direct),'stress KPIs equal the engine\'s own stRunAll on the same settings');
ok(J('rrListRuns()').filter(x=>x.id.startsWith('stl:')).length===direct.length,'the runs appear in list_runs / the export list');
r=call('get_stress_results',{}); ok(!r.isError&&r.response.stress.length===direct.length,'get_stress_results reads the tool\'s stress run too');
r=call('get_run',{id:'stl:lost',detail:'series'}); ok(!r.isError&&r.response.series.rows.length>20,'a stress run has yearly values (replayed)');
// a market path from the chat becomes an extra scenario
call('define_market_scenario',{label:'Extra path',returnsPct:[-30,-10,5,10]},'chat'); const pid=J('msList()[0].id');
r=call('run_stress_tests',{includePathIds:[pid]}); ok(!r.isError&&r.response.stress.some(x=>x.id==='stl:'+pid),'includePathIds adds a market path as a stress scenario');
run(ctx,'state.living+=500'); ok(J('rrListRuns()').filter(x=>x.id.startsWith('stl:')).every(x=>x.stale),'after a plan edit the stress run is stale'); run(ctx,'state.living-=500');

// ── 4. Monte Carlo job ──
r=call('define_mc_config',{config:{trials:60,seed:7}}); ok(!r.isError&&r.response.config.trials===60&&r.response.trialsLimit===5000,'define_mc_config validates and remembers; the host\'s trial limit is shown');
r=call('run_monte_carlo',{}); ok(!r.isError&&/^j\d+$/.test(r.response.id)&&r.response.status!=='done'&&r.response.total===60,'run_monte_carlo returns a job at once, not the results');
const j1=r.response.id;
ok(call('get_job',{id:j1}).response.total===60&&call('get_job',{}).response.id===j1,'get_job reports progress (default: the latest job)');
run(ctx,'state.living+=2000');   // edit the plan while the job runs: it works on a snapshot
ok(await waitFor(()=>call('get_job',{id:j1}).response.status==='done'),'the job finishes');
run(ctx,'state.living-=2000');
r=call('get_job',{id:j1}).response; ok(r.done===60&&r.runIds&&r.runIds[0]==='mcj:'+j1&&r.percent===100,'a finished job lists its run ids');
const ref=J(`(()=>{ const mc=JSON.parse(JSON.stringify(MC_DEFAULTS)); mc.trials=60; mc.seed=7; const res=mcRunRange(mc,0,60); return {funded:Math.round(mcSummarize(res).successRate*1000)/1000, p50:Math.round(mcSummarize(res).estate.p50)}; })()`);
const mcr=call('get_mc_summary',{id:'mcj:'+j1}).response;
ok(mcr.distribution.fundedShare===ref.funded&&Math.abs(mcr.distribution.finalAssets.p50-ref.p50)<=1,'job results equal a direct run of the same settings on the original plan ('+ref.funded+' funded), although the plan was edited meanwhile');
ok(J('rrListRuns()').find(x=>x.id==='mcj:'+j1).kind==='monte_carlo'&&J('rrListRuns()').find(x=>x.id==='mcj:'+j1).source==='llm','the job result is a monte_carlo run with source llm');
r=call('get_trial',{id:'mcj:'+j1,trial:'typicalSuccess'}); ok(!r.isError&&r.response.series.rows.length>20,'get_trial replays a trial of a tool-started job (seeded)');
run(ctx,'state.living+=2000'); ok(J('rrListRuns()').find(x=>x.id==='mcj:'+j1).stale===true,'after a plan edit the job\'s run is stale'); ok(call('get_trial',{id:'mcj:'+j1,trial:'typicalSuccess'}).isError,'and its trials are no longer replayed'); run(ctx,'state.living-=2000');
// limits
ok(call('run_monte_carlo',{config:{trials:6000}}).isError&&/at most 5000/.test(JSON.stringify(call('run_monte_carlo',{config:{trials:6000}}).response)),'trials over the host limit are refused');
ok(/limit is 20000/.test(call('run_monte_carlo',{config:{trials:5000},withStress:true,includePathIds:[pid]}).response.error||''),'total trials over the job limit (rows × trials) are refused');

// ── 5. stress + Monte Carlo, queue, cancel ──
r=call('run_monte_carlo',{config:{trials:50,seed:3},withStress:true}); const j2=r.response.id;
const r3=call('run_monte_carlo',{config:{trials:50,seed:4}}); const j3=r3.response.id;
ok(r3.response.status==='queued'||r3.response.status==='running','a second job waits its turn ('+r3.response.status+')');
ok(await waitFor(()=>call('get_job',{id:j2}).response.status==='done'&&call('get_job',{id:j3}).response.status==='done'),'both jobs finish in order');
const jr=call('get_job',{id:j2}).response; ok(jr.rows.length>=4&&jr.rows[0].id==='none'&&jr.runIds.length===jr.rows.length,'withStress adds one row per stress scenario next to Monte Carlo alone');
const stRow=J('rrListRuns()').find(x=>x.id==='mcj:'+j2+':lost'); ok(stRow&&stRow.kind==='stress_mc'&&stRow.distribution.trials===50,'a stress + Monte Carlo row is a stress_mc run');
const refSt=J(`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); cfg.med.enabled=false; const sr=stRunAll(cfg), r=sr.results.find(x=>x.id==='lost'), sc=stScenarios(cfg).find(s=>s.id==='lost'), mc=JSON.parse(JSON.stringify(MC_DEFAULTS)); mc.trials=50; mc.seed=3;
  const res=[]; for(let t=0;t<50;t++) res.push(mcRunTrial(mc,t,null,null,{scen:sc,start:r.start,share:r.share})); return Math.round(mcSummarize(res).successRate*1000)/1000; })()`);
ok(stRow.distribution.fundedShare===refSt,'the stress + Monte Carlo row equals a direct run of the same trials under that scenario ('+refSt+')');
r=call('run_monte_carlo',{config:{trials:2000,seed:9}}); const j4=r.response.id; await sleep(60);
r=call('cancel_job',{id:j4}); ok(!r.isError&&r.response.status==='cancelled'&&r.response.done<2000,'cancel_job stops a running job ('+r.response.done+' of 2000 done)');
ok(J('rrListRuns()').some(x=>x.id==='mcj:'+j4&&/partial/.test(x.label))||r.response.done<50,'the trials finished so far stay readable as a partial run');
ok(call('get_job',{id:'zzz'}).isError,'get_job rejects an unknown id');
// the page's own result stores are never touched
ok(J("typeof stResults==='undefined'||stResults===null||stResults===undefined")&&J("typeof mcResults==='undefined'||!mcResults"),'tool runs never write the page\'s own Stress / Monte Carlo card results');

// ── 6. import kinds ──
const imp=(obj)=>{ ctx.__i=obj; return J('rrImport(__i,{source:"import"})'); };
let ir=imp({schema:'planner.scenarios/1',scenarios:[
  {kind:'stress',label:'Harsher stagflation',why:'inflation worry',config:{stag:{years:8,eqReturn:-2,inflEnd:10},lost:{enabled:false},y1966:{enabled:false}}},
  {kind:'montecarlo',label:'Longer lives',why:'family history',config:{trials:60,seed:11,mortality:{mode:92}}}]});
ok(ir.accepted.length===2&&!ir.rejected.length,'stress and montecarlo kinds are accepted by the import');
const ps=J('rrProposals()'); const sp=ps.find(p=>p.kind==='stress'), mp=ps.find(p=>p.kind==='montecarlo');
ok(sp.rows.length>=1&&sp.rows.every(x=>typeof x.finalAssets==='number'&&'firstUnfundedAge' in x),'a stress proposal shows each scenario\'s outcome right away');
ok(mp.job&&mp.job.trialsPerRow===60,'a Monte Carlo proposal starts a job and shows its progress');
ok(await waitFor(()=>J('rrProposals().find(p=>p.kind==="montecarlo").job.status')==='done'),'the proposal\'s job finishes');
ok(J('rrListRuns()').some(x=>x.id==='mcj:'+J('rrProposals().find(p=>p.kind==="montecarlo").jobId')),'its result is a run in the export list');
const specs=J('rrProposals().map(rrProposalSpec)'); ok(specs.map(s=>s.kind).join()==='stress,montecarlo','proposals convert back to the import form');
run(ctx,'rrProposalsClear()'); ir=imp({schema:'planner.scenarios/1',scenarios:specs}); ok(ir.accepted.length===2,'the converted specs import again (round trip)');
ir=imp({schema:'planner.scenarios/1',scenarios:[{kind:'stress',label:'bad',config:{med:{enabled:true}}},{kind:'stress',label:'x',config:{equityShare:'a lot'}},{kind:'montecarlo',label:'big',config:{trials:9000}},{kind:'montecarlo',label:'extra',nope:1},{kind:'stress',label:'allOff',config:{lost:{enabled:false},stag:{enabled:false},y1966:{enabled:false},custom:{enabled:false}}}]});
ok(ir.accepted.length===0&&ir.rejected.length===5,'invalid stress / Monte Carlo imports are rejected with reasons: '+ir.rejected.map(x=>x.errors[0]).join(' | ').slice(0,200));
run(ctx,'rrProposalsClear()'); await waitFor(()=>J('RJ.jobs.every(j=>j.status!=="running"&&j.status!=="queued")'));
const b=J("rrBuildBundle({tier:'summary'})"); ok(b.settingsCatalog&&b.settingsCatalog.montecarlo.some(x=>/returns\.volEquity/.test(x))&&/"kind":"stress"/.test(b.instructions)&&/montecarlo/.test(b.instructions),'the analysis file documents the stress and Monte Carlo settings and import kinds for the LLM');
ok(b.runs.some(x=>x.id.startsWith('mcj:')),'tool-started jobs are included in the export');
ok(run(ctx,'JSON.stringify(state)')===before,'after all of the above the plan is byte-identical');
console.log(fails?('\n'+fails+' of '+n+' FAILED'):('\nall '+n+' passed')); process.exit(fails?1:0);
})();
