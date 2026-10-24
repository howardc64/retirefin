// Master plan list (js/plans/*): store semantics + the 🆎 scenario producer. Node only, no browser.
//   PLANNER_ROOT=. node tests/plans/plan_store_test.js
const fs=require('fs'), path=require('path');
const {makeCtx,run,ROOT}=require('../chat/harness.js');
const vm=require('vm');
let fails=0,n=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m); } else console.log('  ok: '+m); };
const ctx=makeCtx('Couple_Heir.json');
// (the harness already loaded the plan modules)
const J=code=>JSON.parse(run(ctx,'JSON.stringify('+code+')'));
const stateBefore=run(ctx,'JSON.stringify(state)');

// ── store basics ──
run(ctx,`var A=plUpsert({key:'scn:A',label:'Scenario A',owner:'t',input:{state:state}});`);
ok(J('plList().length')===1&&J('A.id')==='p1','upsert adds a plan with a stable id');
ok(J('plGet("p1").key')==='scn:A'&&J('plGet("scn:A").id')==='p1','get works by id and by key');
run(ctx,`var A2=plUpsert({key:'scn:A',label:'Scenario A',owner:'t',input:{state:state}});`);
ok(J('plList().length')===1&&J('A2.id')==='p1','upserting the same key updates in place (no duplicate)');
const s1=J('plEnsureSummary("p1")');
ok(s1.kpis.finalTotal>0&&s1.fin.length===s1.n&&s1.re.length===s1.n,'summary holds KPIs and yearly fin/re arrays');
ok(!('rows' in s1)&&JSON.stringify(s1).length<20000,'summary is slim (no projection rows): '+JSON.stringify(s1).length+' bytes');
ok(run(ctx,'JSON.stringify(state)')===stateBefore,'live state untouched by summarizing');
run(ctx,`var s=JSON.parse(JSON.stringify(state)); s.living=state.living*1.5; plUpsert({key:'scn:A',label:'Scenario A',owner:'t',input:{state:s}});`);
ok(J('plGet("p1").summary')===null&&J('plGet("p1").id')==='p1','changed input drops the summary but keeps the id');
const s2=J('plEnsureSummary("p1")');
ok(s2.kpis.finalTotal!==s1.kpis.finalTotal,'recomputed summary reflects the new input');
run(ctx,`plUpsert({key:'scn:A',label:'Renamed',owner:'t',input:{state:JSON.parse(JSON.stringify(plGet('p1').input.state))}});`);
ok(J('plGet("p1").summary')!==null&&J('plGet("p1").label')==='Renamed','label-only change keeps the summary');

// ── find / reconcile / group ──
run(ctx,`plReset(); plUpsert({key:'st:a',owner:'st',origin:{kind:'stress',groupId:'g1'},label:'Lost Decade',input:{state:state}});
  plUpsert({key:'mc:trial:3',owner:'mc',origin:{kind:'mc_trial',groupId:'g2'},label:'MC trial 3',input:{state:state}});
  plUpsert({key:'mc:trial:9',owner:'mc',origin:{kind:'mc_trial',groupId:'g2'},label:'MC trial 9',input:{state:state}});`);
ok(J('plFind({kind:"mc_trial"}).length')===2&&J('plFind({key:"mc:trial:*"}).length')===2&&J('plFind({label:"lost"}).length')===1,'find by kind, key prefix and label');
run(ctx,`plReconcile('mc',[{key:'mc:trial:9',label:'MC trial 9',origin:{kind:'mc_trial',groupId:'g2'},input:{state:state}}]);`);
ok(J('plFind({owner:"mc"}).map(p=>p.key)').join()==='mc:trial:9'&&J('plFind({owner:"st"}).length')===1,'reconcile removes only that owner\'s missing plans');
ok(J('plRemoveGroup("g2")')===1&&J('plList().length')===1,'removing a group removes its member plans');

// ── scenario-set producer ──
run(ctx,`plReset(); scnOrder=['A']; scnActive='A'; scnSnaps={}; var scnNames={A:'',B:'Spend more'}; function scnLabel(id){ return 'Scenario '+id+(scnNames[id]?' — '+scnNames[id]:''); }`);
run(ctx,'plSyncAll()'); ok(J('plList().map(p=>p.key)').join()==='scn:A','a single scenario yields plan scn:A');
run(ctx,`(()=>{ const alt=JSON.parse(JSON.stringify(state)); alt.living=state.living*1.3; scnOrder=['A','B']; scnSnaps={B:alt}; })()`);
run(ctx,'plSyncAll()');
ok(J('plList().map(p=>p.key)').join()==='scn:A,scn:B'&&J('plGet("scn:B").label')==='Scenario B — Spend more','adding scenario B adds plan scn:B with its label');
const ids=J('plList().map(p=>p.id)');
const kA=J('plEnsureSummary("scn:A").kpis.finalTotal'), kB=J('plEnsureSummary("scn:B").kpis.finalTotal');
ok(kA!==kB,'A and B have different summaries');
// switch the screen to B (the app swaps state and scnSnaps) — ids and inputs must follow the scenario, not the slot
run(ctx,`(()=>{ const leaving=state, incoming=scnSnaps.B; scnSnaps.A=JSON.parse(JSON.stringify(leaving)); delete scnSnaps.B; scnActive='B'; state=incoming; })()`);
run(ctx,'plSyncAll()');
ok(JSON.stringify(J('plList().map(p=>p.id)'))===JSON.stringify(ids)&&J('plEnsureSummary("scn:B").kpis.finalTotal')===kB&&J('plEnsureSummary("scn:A").kpis.finalTotal')===kA,'switching the active scenario keeps ids and summaries');
ok(J('plGet("scn:A").summary')!==null,'summary is cached across a sync when nothing changed');
// edit the active scenario → its plan updates
run(ctx,`state.living=state.living*2;`); run(ctx,'plSyncAll()');
ok(J('plGet("scn:B").summary')===null&&J('plEnsureSummary("scn:B").kpis.finalTotal')!==kB,'editing the on-screen scenario updates its plan');
// delete B
run(ctx,`(()=>{ scnOrder=['A']; const incoming=scnSnaps.A; delete scnSnaps.A; scnActive='A'; state=incoming; })()`);
run(ctx,'plSyncAll()');
ok(J('plList().map(p=>p.key)').join()==='scn:A','deleting a scenario removes its plan');
ok(J('plGet("scn:B")')===null,'deleted plan is gone');

// ── stress-test producer ──
run(ctx,`plReset(); scnOrder=['A']; scnActive='A'; scnSnaps={}; var stResults=null;`);
run(ctx,'plSyncAll()'); ok(J('plList().map(p=>p.key)').join()==='scn:A','no stress results → no stress plans');
const runStress=()=>run(ctx,`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); stResults=Object.assign(stRunAll(cfg),{cfg,planKey:plStateKey(state)}); })()`);
runStress(); run(ctx,'plSyncAll()');
const stKeys=J('plFind({owner:"stress"}).map(p=>p.key)');
ok(stKeys.join()==='st:lost,st:stag,st:y1966','one plan per stress scenario: '+stKeys.join());
const idsBefore=J('plFind({owner:"stress"}).map(p=>p.id)');
ok(J('plFind({owner:"stress"}).every(p=>p.input.baseKey==="scn:A"&&!p.input.state&&!plIsStale(p))'),'stress plans are deltas on scn:A and not stale');
ok(JSON.stringify(J('plGet("st:lost").input')).length<4000,'delta input is small: '+JSON.stringify(J('plGet("st:lost").input')).length+' bytes (no state copy)');
// the plan's summary equals what the card itself computed
const card=J('stResults.results.map(r=>({id:r.id,start:r.start,estate:Math.round(r.estate),fail:r.m.failAge==null?null:Math.round(r.m.failAge),low:Math.round(r.low)}))');
card.forEach(c=>{ const s=J('plEnsureSummary("st:'+c.id+'")'); ok(s.kpis.finalTotal===c.estate&&s.failAge===c.fail&&Math.min(...s.fin.slice(c.start))===c.low,'st:'+c.id+' summary equals the card (estate, failure age, lowest investable)'); });
ok(J('plEnsureSummary("st:lost").kpis.finalTotal')!==J('plEnsureSummary("scn:A").kpis.finalTotal'),'a stress plan differs from its base');
ok(run(ctx,'JSON.stringify(state)')===stateBefore,'live state untouched');
// re-run the card: same keys, same ids, updated in place
run(ctx,'plSyncAll()'); runStress(); run(ctx,'plSyncAll()');
ok(JSON.stringify(J('plFind({owner:"stress"}).map(p=>p.id)'))===JSON.stringify(idsBefore),'re-running the card keeps the plan ids');
// change the card's settings (one scenario off) → that plan is removed on the next run
run(ctx,`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); cfg.stag.enabled=false; stResults=Object.assign(stRunAll(cfg),{cfg,planKey:plStateKey(state)}); })()`);
run(ctx,'plSyncAll()'); ok(J('plFind({owner:"stress"}).map(p=>p.key)').join()==='st:lost,st:y1966','a scenario dropped from the card is removed from the list');
// edit the plan after the run → stress plans go stale, are kept, and refuse to run
run(ctx,'state.living=state.living*1.2;'); run(ctx,'plSyncAll()');
ok(J('plFind({owner:"stress"}).length')===2&&J('plFind({owner:"stress"}).every(p=>plIsStale(p))'),'editing the plan marks stress plans stale and keeps them');
ok(J('plFind({owner:"stress"}).every(p=>plRow(p).stale)'),'plRow reports stale');
ok(J('plEnsureSummary("st:lost").kpis.finalTotal')===card[0].estate,'a stale plan keeps the summary of the run it came from');
run(ctx,'plGet("st:y1966").summary=null; plGet("st:y1966").summaryFor=null;');
let threw=false; try{ run(ctx,'plEnsureSummary("st:y1966")'); }catch(e){ threw=/out of date/.test(String(e.message||e)); } ok(threw,'a stale plan with no summary refuses to compute (no guessing)');
// re-run on the edited plan → fresh again, same ids
runStress(); run(ctx,'plSyncAll()');
ok(J('plFind({owner:"stress"}).length')===3&&J('plFind({owner:"stress"}).every(p=>!plIsStale(p))')&&[idsBefore[0],idsBefore[2]].every(i=>J('plGet("'+i+'")')!==null),'re-run after an edit refreshes the plans in place');
// card cleared / another plan loaded
run(ctx,'stResults=null;'); run(ctx,'plSyncAll()'); ok(J('plFind({owner:"stress"}).length')===0,'clearing the card removes its plans');

// ── Monte Carlo producer ──
ctx.__plan=JSON.parse(fs.readFileSync(path.join(ROOT,'Samples','Couple_Heir.json'),'utf8')); run(ctx,'Object.assign(state, hydrateState(__plan))');
run(ctx,`plReset(); plMcClearPromoted(); scnOrder=['A']; scnActive='A'; scnSnaps={}; var stResults=null, mcResults=null, mcStateAtRun=null;
  var runMc=(seed,n)=>{ const mc=JSON.parse(JSON.stringify(MC_DEFAULTS)); mc.trials=n; mc.seed=seed; const res=mcRunRange(mc,0,n);
    mcResults={cfg:mc,S:mcSummarize(res),R:mcFailureReasons(res),complete:true,results:res}; mcStateAtRun=plStateKey(state); };`);
run(ctx,'plSyncAll()'); ok(J('plFind({owner:"monteCarlo"}).length')===0,'no Monte Carlo run → no Monte Carlo plans');
run(ctx,'runMc(7,60); plSyncAll()');
const mcp=J('plFind({owner:"monteCarlo"})');
ok(mcp.length>=1&&mcp.length<=4&&mcp.every(p=>/^mc:trial:\d+$/.test(p.key)&&p.origin.kind==='mc_trial'&&p.origin.groupId==='mc:run'),'60 trials → only the exemplar trials become plans: '+mcp.map(p=>p.key).join(', '));
ok(mcp.every(p=>!p.input.state&&p.input.draw&&p.input.draw.type==='mc'&&p.pinned===false),'trial plans are seeded draws, not state copies');
console.log('  (trial plan input size: '+JSON.stringify(mcp[0].input).length+' bytes, dominated by the Monte Carlo settings)');
const checkTrial=(key,n)=>{ const s=J('plEnsureSummary("'+key+'")'), r=J('(()=>{const m=mcResults.results['+n+']; return {est:Math.round(m.estateFin+m.estateRe), fail:m.failAge==null?null:Math.round(m.failAge)}; })()'); return s.kpis.finalTotal===r.est&&s.failAge===r.fail; };
ok(mcp.every(p=>checkTrial(p.key,p.origin.ref.trial)),'each trial plan reproduces the run\'s own result (final assets, failure age)');
const s0=J('plEnsureSummary("'+mcp[0].key+'")'); ok(s0.draws&&Array.isArray(s0.draws.passingAges)&&'priceLevelAfter15' in s0.draws,'summary carries the trial\'s random draws');
run(ctx,'var __st=JSON.stringify(state);');
// promote on request
let r1=J('plPromoteTrial(5)'); ok(r1.plan&&r1.plan.key==='mc:trial:5'&&r1.plan.pinned&&checkTrial('mc:trial:5',5),'promoting trial 5 creates a pinned plan that matches the run');
const id5=r1.plan.id; r1=J('plPromoteTrial(5)'); ok(r1.plan.id===id5&&J('plFind({key:"mc:trial:5"}).length')===1,'promoting twice is idempotent');
ok(J('plPromoteTrial(60)').plan===null&&J('plPromoteTrial(-1)').plan===null&&/0 to 59/.test(J('plPromoteTrial(60)').why),'out-of-range trial is refused with a reason');
// re-run with another seed: same trial numbers re-evaluated, ids kept, exemplars refreshed
const exBefore=J('plFind({owner:"monteCarlo"}).filter(p=>!p.pinned).map(p=>p.key)');
run(ctx,'runMc(99,80); plSyncAll()');
ok(J('plGet("mc:trial:5").id')===id5&&checkTrial('mc:trial:5',5)&&J('plGet("mc:trial:5").input.draw.cfg.seed')===99,'re-run: promoted trial keeps its id and follows the new seed');
const exAfter=J('plFind({owner:"monteCarlo"}).filter(p=>!p.pinned).map(p=>p.key)');
ok(exAfter.every(k=>checkTrial(k,Number(k.split(':')[2]))),'re-run: exemplar plans match the new run'+(exBefore.join()!==exAfter.join()?' (and changed)':''));
// edit the plan → stale, kept, promote refuses
run(ctx,'state.living=state.living*1.1; plSyncAll()');
ok(J('plFind({owner:"monteCarlo"}).length')===exAfter.length+1&&J('plFind({owner:"monteCarlo"}).every(p=>plIsStale(p))'),'editing the plan marks every trial plan stale and keeps it');
ok(/edited/.test(J('plPromoteTrial(7)').why),'cannot promote from a stale run');
run(ctx,'Object.assign(state, JSON.parse(__st)); plSyncAll()'); ok(run(ctx,'JSON.stringify(state)')===run(ctx,'__st'),'live state is exactly as before after trial replays and summaries');
// reset the card: promoted forgotten, exemplars remain until results are cleared
run(ctx,'plMcClearPromoted(); plSyncAll()'); ok(J('plGet("mc:trial:5")')===null&&J('plFind({owner:"monteCarlo"}).every(p=>!p.pinned)')&&J('plFind({owner:"monteCarlo"}).length')===exAfter.length,'clearing promotions drops promoted-only trials and keeps the exemplars');
run(ctx,'mcResults=null; mcStateAtRun=null; plSyncAll()'); ok(J('plFind({owner:"monteCarlo"}).length')===0,'clearing the card removes all its plans');

// ── stress + Monte Carlo rows ──
run(ctx,`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); stResults=Object.assign(stRunAll(cfg),{cfg,planKey:plStateKey(state)});
  const mc=JSON.parse(JSON.stringify(MC_DEFAULTS)); mc.trials=30; mc.seed=3; const scs=stScenarios(cfg), rows=[{id:'none',label:'Monte Carlo alone',stress:false,stressDef:null}];
  stResults.results.slice(0,1).forEach(r=>{ const sc=scs.find(s=>s.id===r.id); rows.push({id:r.id,label:r.label,stress:true,stressDef:{scen:sc,start:r.start,share:cfg.equityShare}}); });
  rows.forEach(row=>{ row.res=[]; for(let t=0;t<mc.trials;t++) row.res.push(mcRunTrial(mc,t,null,null,row.stressDef)); row.S=mcSummarize(row.res); });
  stResults.mc={cfg:mc,rows}; })(); plSyncAll();`);
const sm=J('plFind({kind:"stress_mc_trial"})');
ok(sm.length>=2&&sm.every(p=>/^stmc:(none|lost):\d+$/.test(p.key)&&p.origin.kind==='stress_mc_trial'),'stress + Monte Carlo rows give plans keyed stmc:<scenario>:<trial>: '+sm.map(p=>p.key).join(', '));
const stmcOk=(key)=>{ const [,sid,t]=key.split(':'); const s=J('plEnsureSummary("'+key+'")'), r=J('(()=>{const row=stResults.mc.rows.find(x=>x.id==="'+sid+'"); const m=row.res['+t+']; return Math.round(m.estateFin+m.estateRe); })()'); return s.kpis.finalTotal===r; };
ok(sm.every(p=>stmcOk(p.key)),'stress + Monte Carlo trial plans reproduce the table\'s own trials');
const lostT=J('plFind({key:"stmc:lost:*"})[0].origin.ref.trial'), noneSame=J('plPromoteTrial('+lostT+',"none").plan');
ok(noneSame&&J('plEnsureSummary("stmc:none:'+lostT+'").kpis.finalTotal')!==J('plEnsureSummary("stmc:lost:'+lostT+'").kpis.finalTotal'),'same trial number under no stress and under Lost Decade gives different plans');
run(ctx,'stResults=null; plMcClearPromoted(); plSyncAll()'); ok(J('plList().length')===1,'clearing the stress card removes stress and stress + Monte Carlo plans, leaving scn:A');
console.log(fails?('\n'+fails+' of '+n+' FAILED'):('\nall '+n+' passed')); process.exit(fails?1:0);
