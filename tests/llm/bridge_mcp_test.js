'use strict';
// The MCP server with --bridge, over a real stdio pipe and a real WebSocket: node tests/llm/bridge_mcp_test.js
//   no plan until a page connects; the page's current plan is used (and re-sent after edits → stale runs); effects reach the page and the answer comes back in the tool result;
//   token rejection; page gone → noPage; file plan restored after disconnect; --bridge-hide-code.
const {spawn}=require('child_process'), path=require('path'), fs=require('fs'), os=require('os');
const {connect}=require('./wsclient.js');
const ROOT=path.join(__dirname,'..','..');
let pass=0,fail=0; const ck=(n,c)=>{ if(c) pass++; else { fail++; console.log('FAIL',n); } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CODE='TEST-PAIR-CODE', coupleText=fs.readFileSync(path.join(ROOT,'Samples','Couple_Heir.json'),'utf8'), widowText=fs.readFileSync(path.join(ROOT,'Samples','Widow.json'),'utf8');

function start(args){
  const p=spawn('node',[path.join(ROOT,'server','mcp.js')].concat(args),{stdio:['pipe','pipe','pipe']});
  const s={p,buf:'',nid:0,waiters:{},stderr:'',nonJson:0};
  p.stderr.on('data',d=>s.stderr+=d);
  p.stdout.on('data',d=>{ s.buf+=d; let i; while((i=s.buf.indexOf('\n'))>=0){ const l=s.buf.slice(0,i); s.buf=s.buf.slice(i+1); if(!l.trim()) continue; let m; try{ m=JSON.parse(l); }catch(e){ s.nonJson++; continue; } if(s.waiters[m.id]){ s.waiters[m.id](m); delete s.waiters[m.id]; } } });
  s.rpc=(method,params,ms)=>new Promise((res,rej)=>{ const id=++s.nid; s.waiters[id]=res; p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n'); setTimeout(()=>rej(new Error('timeout '+method)),ms||60000); });
  s.tool=async(n,a,ms)=>{ const r=await s.rpc('tools/call',{name:n,arguments:a||{}},ms); const t=r.result&&r.result.content&&r.result.content[0]&&r.result.content[0].text; let j=null; try{ j=JSON.parse(t); }catch(e){} return {r:r.result,j,err:r.error}; };
  s.port=()=>new Promise((res,rej)=>{ const t=setInterval(()=>{ const m=/listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(s.stderr); if(m){ clearInterval(t); res(Number(m[1])); } },30); setTimeout(()=>{ clearInterval(t); rej(new Error('no bridge port in stderr: '+s.stderr)); },8000); });
  s.stop=()=>new Promise(r=>{ p.stdin.end(); setTimeout(()=>{ p.kill(); r(); },300); });
  return s;
}
// a stand-in page answers the server's "send your plan now" with "unchanged" (these tests change the plan only by sending it themselves)
const autoSync=c=>{ const iv=setInterval(()=>{ c.messages.filter(m=>m.type==='syncRequest'&&!m.__done).forEach(m=>{ m.__done=true; c.send({type:'synced',id:m.id}); }); },10); c.sock.on('close',()=>clearInterval(iv)); };
const login=async(port,code,plan)=>{ const c=await connect(port); c.send({type:'hello',token:code}); autoSync(c); const w=await c.waitFor(x=>x.type==='welcome'||x.type==='denied'); if(w.type==='welcome'&&plan){ c.send({type:'plan',plan:JSON.parse(plan)}); await c.waitFor(x=>x.type==='planAck'); } return {c,w}; };
// answers every effect request with the given status (and records them)
const autoAnswer=(c,status,log)=>{ const iv=setInterval(()=>{ c.messages.filter(m=>m.type==='effect'&&!m.__done).forEach(m=>{ m.__done=true; log.push(m); c.send({type:'effectResult',id:m.id,status,note:status==='applied'?'ok':'declined'}); }); },20); return ()=>clearInterval(iv); };

(async()=>{
  // ── A. bridge only, no plan file ──
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'brg-'));
  let s=start(['--bridge','--bridge-port','0','--bridge-token',CODE]);
  try{
    const port=await s.port();
    await s.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}}); s.p.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    ck('the pairing code is printed on stderr',s.stderr.includes('pairing code: '+CODE));
    const names=(await s.rpc('tools/list')).result.tools.map(t=>t.name); ck('bridge_status is listed with the other tools',names.includes('bridge_status')&&names.includes('list_runs'));
    const noPlan=await s.tool('list_runs'); ck('without a plan a tool says so and is an error',noPlan.r.isError&&/No scenario is loaded/.test(noPlan.j.error));
    const st0=await s.tool('bridge_status'); ck('bridge_status works before any plan: not connected, with port and code',st0.j.bridge.pageConnected===false&&st0.j.bridge.port===port&&st0.j.bridge.pairingCode===CODE&&/Live bridge/.test(st0.j.bridge.howToConnect)&&st0.j.bridge.planSource==='none');
    ck('resources need a plan too',!!(await s.rpc('resources/read',{uri:'planner://runs'})).error);

    // token rejection
    const bad=await login(port,'WRONG-WRONG-WRONG'); ck('a wrong pairing code is denied',bad.w.type==='denied'); ck('…and no scenario is loaded because of it',(await s.tool('list_runs')).r.isError);

    // ── B. a page connects and sends its plan ──
    const {c:page,w}=await login(port,CODE,coupleText); ck('the right code is welcomed, with the effect kinds',w.type==='welcome'&&w.effects.includes('showMarketPath'));
    const ack=page.messages.find(x=>x.type==='planAck'); ck('the plan is acknowledged with its version key',ack.ok===true&&/^[0-9a-f]{8}$/.test(ack.key));
    const lr=await s.tool('list_runs'); ck('tools now answer about the page\'s plan',!lr.r.isError&&(lr.j.runs||lr.j).some(r=>r.id==='entered'));
    const st1=await s.tool('bridge_status'); ck('bridge_status: connected, source page, same key, no pairing code any more',st1.j.bridge.pageConnected&&st1.j.bridge.planSource==='page'&&st1.j.bridge.scenarioKey===ack.key&&st1.j.bridge.pairingCode===undefined&&!!st1.j.bridge.lastSync);
    page.send({type:'plan',plan:'not an object'}); const bad2=await page.waitFor(x=>x.type==='planAck'&&x.ok===false); ck('a plan that is not an object is rejected, the old one stays',!!bad2&&!(await s.tool('list_runs')).r.isError);
    page.send({type:'plan',plan:{filingStatus:'nonsense',inflation:'x'}}); await page.waitFor(x=>x.type==='planAck'&&x.key&&x!==ack&&page.messages.indexOf(x)>page.messages.indexOf(bad2));    // hydrateState sanitises junk: it is accepted and the tools still run
    page.send({type:'plan',plan:JSON.parse(coupleText)}); await sleep(150);

    // stale detection after an edit that arrives from the page
    const sc=await s.tool('run_scenarios',{scenarios:[{id:'a',label:'Spend less',levers:[{lever:'living',pctChange:-10}]}]}); ck('a what-if runs on the live plan',!sc.r.isError);
    const before=((await s.tool('list_runs')).j.runs||[]).find(r=>/^lev:/.test(r.id)); ck('it is listed, fresh',before&&!before.stale);
    const edited=JSON.parse(coupleText); edited.living=(edited.living||0)+5000; const mark=page.messages.length; page.send({type:'plan',plan:edited}); await page.waitFor(x=>x.type==='planAck'&&page.messages.indexOf(x)>=mark);
    const after=((await s.tool('list_runs')).j.runs||[]).find(r=>/^lev:/.test(r.id)); ck('after the page edits its plan the earlier run is reported stale',after&&after.stale===true);
    const st2=await s.tool('bridge_status'); ck('the plan version changed with the edit',st2.j.bridge.scenarioKey!==ack.key);

    // ── C. effects ──
    const effs=[], stop=autoAnswer(page,'applied',effs);
    const dm=await s.tool('define_market_scenario',{label:'Two bad years',returnsPct:[-25,-10,6,8],afterReturnPct:6,showInCharts:true});
    ck('showInCharts → the page is asked to show the path (full validated path, not just an id)',effs.length===1&&effs[0].effect.type==='showMarketPath'&&effs[0].effect.path.returns.length===4&&effs[0].effect.path.label==='Two bad years');
    ck('the tool result reports what the page did',dm.j.pageEffects&&dm.j.pageEffects[0].type==='showMarketPath'&&dm.j.pageEffects[0].status==='applied'&&dm.j.pageEffects[0].note==='ok');
    const imp=await s.tool('import_scenarios',{schema:'planner.scenarios/1',scenarios:[{kind:'lever',label:'Delay SS',why:'test',levers:[{lever:'ssClaimAge',person:1,age:70}]}]});
    const pe=effs.find(e=>e.effect.type==='showProposals'); ck('import_scenarios → the page gets the proposals in the import form, with the plan key',pe&&pe.effect.spec.schema==='planner.scenarios/1'&&pe.effect.spec.scenarios.length===1&&pe.effect.spec.scenarios[0].label==='Delay SS'&&pe.effect.spec.scenarioKey===st2.j.bridge.scenarioKey);
    ck('and the host sees it applied',imp.j.pageEffects&&imp.j.pageEffects[0].status==='applied'&&imp.j.accepted.length===1);
    const imp2=await s.tool('import_scenarios',{schema:'planner.scenarios/1',scenarios:[{kind:'lever',label:'Other',levers:[{lever:'ssClaimAge',person:2,age:68}]}]});
    ck('a second import sends only its own proposal, not the earlier one',effs.filter(e=>e.effect.type==='showProposals').pop().effect.spec.scenarios.length===1&&effs.filter(e=>e.effect.type==='showProposals').pop().effect.spec.scenarios[0].label==='Other'&&imp2.j.accepted.length===1);
    const noFx=await s.tool('get_stress_results'); ck('a tool without effects gets no pageEffects field',noFx.j&&noFx.j.pageEffects===undefined);
    stop();
    // denied
    const effs2=[], stop2=autoAnswer(page,'denied',effs2);
    const dn=await s.tool('show_market_scenario_in_charts',{id:'lost'}); ck('a denial reaches the LLM in the tool result',dn.j.pageEffects[0].status==='denied'&&dn.j.pageEffects[0].note==='declined'&&!dn.r.isError);
    stop2();
    // no answer in time is reported, not hung (this uses the server's own timeout, so only check it is bounded by asking with the page silent for a short while)
    // page leaves
    page.send({type:'bye'}); await page.waitClosed(); await sleep(100);
    const gone=await s.tool('show_market_scenario_in_charts',{id:'lost'}); ck('with no page the effect is reported as noPage',gone.j.pageEffects[0].status==='noPage');
    const st3=await s.tool('bridge_status'); ck('after disconnect the last page plan stays, labelled, and the code is offered again',st3.j.bridge.pageConnected===false&&st3.j.bridge.planSource==='page (disconnected)'&&st3.j.bridge.pairingCode===CODE);
    ck('stdout carried only protocol',s.nonJson===0);
  }catch(e){ fail++; console.log('ERR A',e&&e.stack||e,'\n',s.stderr.slice(0,800)); }
  await s.stop();

  // ── C2. a run done in the page is reproduced on the server, so the tools can read it ──
  s=start(['--bridge','--bridge-port','0','--bridge-token',CODE]);
  try{
    const port=await s.port();
    await s.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}}); s.p.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    const {c:page}=await login(port,CODE,coupleText);
    const before=await s.tool('get_mc_summary'); ck('before the page runs anything, there is no Monte Carlo result and the error explains how it appears',before.r.isError&&/no Monte Carlo result/.test(before.j.error)&&/live bridge is connected/.test(before.j.error));
    // what the page sends when its "stress tests + Monte Carlo" run finishes: the plan, then the settings it used (the card's own shape, with page-only keys)
    const mc={trials:120,seed:4242,returns:{enabled:true,volEquity:18,volRE:8,rho:0.8,panic:{enabled:false,rhoPanic:0.9,trigger:-1.5,holdYears:1,includeRE:true,rhoRE:0.9,compare:false}},mortality:{enabled:true,mode:87,scale:10},ltc:{enabled:true,prob:0.5,medianYears:2,yearsSigma:0.6,costSigma:0.25,minStartAge:70},inflation:{enabled:true,sigma:1.2,phi:0.6,min:-2,max:12},inheritance:{enabled:true,haircutPct:0},hidden:false};
    const st={start:{mode:'retire',years:0},equityShare:100,lost:{enabled:true,actualInflation:true},stag:{enabled:true,years:10,eqReturn:0,inflStart:6,inflEnd:11},y1966:{enabled:true},custom:{enabled:false},med:{enabled:false,who:0,fromAge:80,years:3,cost:100000,compare:true},hidden:false};
    page.send({type:'plan',plan:JSON.parse(coupleText)}); page.send({type:'pageRun',kind:'stmc',mc,stress:st});
    let job=null; for(let i=0;i<200&&!job;i++){ await sleep(150); const j=await s.tool('get_job'); if(!j.r.isError&&j.j.status==='done') job=j.j; }
    ck('the server started a job for the page\'s run and it finished',!!job&&job.trialsPerRow===120&&job.withStress===true);
    ck('the job says it is the page\'s run, reproduced',!!job&&/run you did in the page/.test(job.reproducedFromPage||''));
    ck('with the settings the page used (120 trials, every stress row)',!!job&&job.rows.length>=2&&job.rows.every(r=>r.trials===120));
    const sum=await s.tool('get_mc_summary',{id:'mcj:'+job.id}); ck('get_mc_summary now reads the run',!sum.r.isError&&sum.j.distribution&&sum.j.distribution.trials===120);
    const rid=job.runIds.find(x=>/:stag$/.test(x)); const ss=await s.tool('get_mc_summary',{id:rid}); ck('and each stress row, with every failed trial listed',!ss.r.isError&&Array.isArray(ss.j.distribution.failures));
    const nJobs=async()=>{ const t=await s.tool('get_job',{id:'j2'}); return !t.r.isError; };
    page.send({type:'plan',plan:JSON.parse(coupleText)}); page.send({type:'pageRun',kind:'stmc',mc,stress:st}); await sleep(600);
    ck('the same run reported again on the same plan does not start a second job',!(await nJobs()));
    const mark=s.stderr.length; page.send({type:'pageRun',kind:'mc',mc:{trials:99999},stress:null}); await sleep(400);
    ck('settings outside the limits are refused, said on stderr, and the server keeps working',/page run \(mc\): \{"error"/.test(s.stderr.slice(mark))&&!(await s.tool('list_runs')).r.isError);
    page.send({type:'pageRun',kind:'bogus',mc:null,stress:null}); await sleep(200);
    ck('an unknown kind of page run is ignored',!(await s.tool('list_runs')).r.isError);
    // an EDIT of the same plan keeps the runs (they become stale); a DIFFERENT plan (replaced:true) clears them
    const ed=JSON.parse(coupleText); ed.living=(ed.living||0)+3000; page.send({type:'plan',plan:ed}); await sleep(300);
    const kept=await s.tool('list_scenarios'); ck('after an edit the runs are still there (reported stale)',kept.j.scenarios.some(p=>/^mcj:/.test(p.ref)&&p.stale===true)&&!(await s.tool('get_job',{id:job.id})).r.isError);
    const mark2=page.messages.length; page.send({type:'plan',plan:JSON.parse(widowText),replaced:true}); const ack2=await page.waitFor(x=>x.type==='planAck'&&page.messages.indexOf(x)>=mark2);
    ck('a different plan is acknowledged',ack2.ok===true);
    const gone=await s.tool('list_scenarios'); ck('a different plan clears every run made on the old one: only the new plan is left',gone.j.scenarios.length===1&&gone.j.scenarios[0].kind==='scenario'&&gone.j.monteCarloRuns.length===0);
    ck('no job, no stress run and no Monte Carlo result remains',(await s.tool('get_job')).r.isError&&(await s.tool('get_mc_summary')).r.isError&&((await s.tool('list_runs')).j.runs||[]).every(r=>!/^(mcj|stl)/.test(r.id)));
    ck('and the server says so',/a different plan was loaded/.test(s.stderr));
    page.send({type:'pageRun',kind:'mc',mc:{trials:60,seed:5},stress:null});
    let nj=null; for(let i=0;i<100&&!nj;i++){ await sleep(100); const j=await s.tool('get_job'); if(!j.r.isError&&j.j.status==='done') nj=j.j; }
    ck('a run done afterwards on the new plan works, with a fresh job id',!!nj&&nj.id!==job.id&&/^j\d+$/.test(nj.id));
    page.close();
  }catch(e){ fail++; console.log('ERR C2',e&&e.stack||e,'\n',s.stderr.slice(0,800)); }
  await s.stop();

  // ── D. a plan file plus the bridge ──
  const planFile=path.join(tmp,'plan.json'); fs.writeFileSync(planFile,widowText);
  s=start(['--bridge','--bridge-port','0','--bridge-token',CODE,'--bridge-hide-code','--plan',planFile]);
  try{
    const port=await s.port(); await s.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}});
    const planKpi=async()=>{ const r=await s.tool('get_run',{id:'entered'}); const j=Object.assign({},r.j); delete j.planVersion; delete j.planChanged; delete j.pageSync; return JSON.stringify(j).slice(0,3000); };
    const fileKpi=await planKpi(); ck('with --plan the file is used until a page connects',!/No scenario/.test(fileKpi)&&fileKpi.length>50);
    const st=await s.tool('bridge_status'); ck('--bridge-hide-code keeps the code out of the tool result',st.j.bridge.pairingCode===undefined&&!/TEST-PAIR/.test(JSON.stringify(st.j))&&st.j.bridge.planSource==='file');
    const {c:page}=await login(port,CODE,coupleText); await sleep(100);
    const live=await planKpi(); ck('the connected page\'s plan replaces the file\'s',live!==fileKpi);
    fs.writeFileSync(planFile,widowText+' '); await sleep(50); ck('a change to the file is ignored while the page is connected',(await planKpi())===live);
    page.send({type:'bye'}); await page.waitClosed(); await sleep(100);
    fs.utimesSync(planFile,new Date(),new Date(Date.now()+5000));
    ck('after the page leaves the file is used again',(await planKpi())===fileKpi&&(await s.tool('bridge_status')).j.bridge.planSource==='file');
    // an effect with nobody to answer: the server's own bounded wait is long (30 s), so only check a second page can be refused politely with a wrong code
    const bad=await login(port,'AAAA-BBBB-CCCC'); ck('wrong code is denied here too',bad.w.type==='denied');
  }catch(e){ fail++; console.log('ERR D',e&&e.stack||e,'\n',s.stderr.slice(0,800)); }
  await s.stop();

  // ── E. startup rules ──
  const e1=spawn('node',[path.join(ROOT,'server','mcp.js')],{stdio:['pipe','pipe','pipe']}); let e1err=''; e1.stderr.on('data',d=>e1err+=d); const code1=await new Promise(r=>e1.on('exit',r));
  ck('no --plan and no --bridge is a usage error',code1===2&&/usage/.test(e1err));
  const nb=start(['--plan',planFile]); await nb.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}});
  const nn=(await nb.rpc('tools/list')).result.tools.map(t=>t.name); ck('without --bridge nothing changes: no bridge_status tool and no port opened',!nn.includes('bridge_status')&&!/listening/.test(nb.stderr));
  const ok1=await nb.tool('list_runs'); ck('and list_runs works as in phase 2',!ok1.r.isError); await nb.stop();
  const busy=start(['--bridge','--bridge-port','0','--bridge-token',CODE]); const bp=await busy.port();
  const clash=start(['--bridge','--bridge-port',String(bp),'--bridge-token',CODE]); await sleep(1500);
  const clashTools=(await clash.rpc('tools/list')).result.tools.map(t=>t.name);
  ck('a port already in use is reported on stderr',/could not start/.test(clash.stderr));
  ck('and the server still answers, without the bridge tool',clashTools.includes('list_runs')&&!clashTools.includes('bridge_status'));
  await clash.stop(); await busy.stop();

  console.log('bridge_mcp_test: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})().catch(e=>{ console.log('ERR',e&&e.stack||e); process.exit(1); });
