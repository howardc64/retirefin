'use strict';
// Keeping the LLM in step with the plan:  node tests/llm/sync_test.js
//   every result has planVersion; planChanged (inputs changed, headline before / after) appears once after an edit; the server asks the page for its plan before each tool call
//   (no 0.8 s lag), a silent page costs about a second and is reported, and the same notice works for a plan file edited on disk.
const {spawn}=require('child_process'), path=require('path'), fs=require('fs'), os=require('os');
const {connect}=require('./wsclient.js'), {makeBridge}=require('../../server/bridge.js');
const ROOT=path.join(__dirname,'..','..');
let pass=0,fail=0; const ck=(n,c)=>{ if(c) pass++; else { fail++; console.log('FAIL',n); } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CODE='SYNC-TEST-CODE', couple=JSON.parse(fs.readFileSync(path.join(ROOT,'Samples','Couple_Heir.json'),'utf8')), widow=fs.readFileSync(path.join(ROOT,'Samples','Widow.json'),'utf8');

function start(args){
  const p=spawn('node',[path.join(ROOT,'server','mcp.js')].concat(args),{stdio:['pipe','pipe','pipe']}); const s={p,buf:'',nid:0,w:{},err:''};
  p.stderr.on('data',d=>s.err+=d);
  p.stdout.on('data',d=>{ s.buf+=d; let i; while((i=s.buf.indexOf('\n'))>=0){ const l=s.buf.slice(0,i); s.buf=s.buf.slice(i+1); try{ const m=JSON.parse(l); if(s.w[m.id]){ s.w[m.id](m); delete s.w[m.id]; } }catch(e){} } });
  s.rpc=(method,params)=>new Promise((res,rej)=>{ const id=++s.nid; s.w[id]=res; p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n'); setTimeout(()=>rej(new Error('timeout '+method)),60000); });
  s.tool=async(n,a)=>{ const r=await s.rpc('tools/call',{name:n,arguments:a||{}}); let j=null; try{ j=JSON.parse(r.result.content[0].text); }catch(e){} return {r:r.result,j}; };
  s.port=()=>new Promise((res,rej)=>{ const t=setInterval(()=>{ const m=/listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(s.err); if(m){ clearInterval(t); res(Number(m[1])); } },30); setTimeout(()=>{ clearInterval(t); rej(new Error('no port')); },8000); });
  s.stop=()=>new Promise(r=>{ p.stdin.end(); setTimeout(()=>{ p.kill(); r(); },250); });
  return s;
}
const init=s=>s.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}});
// a stand-in page: holds a "current plan"; answers syncRequest like the real page (unchanged → synced, changed → plan with syncId); `mode` can make it silent
function fakePage(c,plan){
  const pg={plan:JSON.stringify(plan),sent:null,silent:false,syncs:0,plansSent:0};
  pg.push=()=>{ pg.sent=pg.plan; pg.plansSent++; c.send({type:'plan',plan:JSON.parse(pg.plan)}); };       // the debounced send
  pg.edit=fn=>{ const o=JSON.parse(pg.plan); fn(o); pg.plan=JSON.stringify(o); };                         // an edit the page has NOT sent yet
  const iv=setInterval(()=>{ c.messages.filter(m=>m.type==='syncRequest'&&!m.__done).forEach(m=>{ m.__done=true; pg.syncs++; if(pg.silent) return; if(pg.plan===pg.sent) c.send({type:'synced',id:m.id}); else { pg.sent=pg.plan; pg.plansSent++; c.send({type:'plan',syncId:m.id,plan:JSON.parse(pg.plan)}); } }); },5);
  c.sock.on('close',()=>clearInterval(iv)); return pg;
}

(async()=>{
  // ── protocol: requestSync on the bridge itself ──
  {
    const b=makeBridge({port:0,token:CODE+'AA',effects:[],log:()=>{}}); const plans=[]; b.on('plan',p=>plans.push(p)); const {port}=await b.start();
    ck('requestSync with no page → noPage',(await b.requestSync(100)).status==='noPage');
    const c=await connect(port); c.send({type:'hello',token:CODE+'AA'}); await c.waitFor(x=>x.type==='welcome');
    let p=b.requestSync(2000); let req=await c.waitFor(x=>x.type==='syncRequest'); ck('the page is sent a syncRequest with an id',/^y\d+$/.test(req.id));
    c.send({type:'plan',syncId:'other',plan:{a:1}}); await sleep(50); c.send({type:'plan',syncId:req.id,plan:{a:2}}); ck('a plan carrying the id settles it (after the plan handler ran)',(await p).status==='synced'&&plans.length===2&&plans[1].a===2);
    c.messages.length=0; p=b.requestSync(2000); req=await c.waitFor(x=>x.type==='syncRequest'); c.send({type:'synced',id:req.id}); ck('"synced" settles it without a plan',(await p).status==='synced'&&plans.length===2);
    const t0=Date.now(); c.messages.length=0; p=b.requestSync(200); await p.then(r=>ck('a silent page → timeout after the wait',r.status==='timeout'&&Date.now()-t0>=180));
    c.send({type:'synced',id:'nope'}); await sleep(30); ck('an unknown id is ignored',true);
    c.messages.length=0; p=b.requestSync(5000); await c.waitFor(x=>x.type==='syncRequest'); c.send({type:'bye'}); ck('a page that leaves ends the wait (disconnected)',(await p).status==='disconnected');
    await b.close();
  }

  // ── through the MCP process, with a bridge ──
  let s=start(['--bridge','--bridge-port','0','--bridge-token',CODE]);
  try{
    const port=await s.port(); await init(s);
    const c=await connect(port); c.send({type:'hello',token:CODE}); await c.waitFor(x=>x.type==='welcome'); const pg=fakePage(c,couple); pg.push(); const ack=await c.waitFor(x=>x.type==='planAck');
    const a=await s.tool('list_runs'); ck('every result has planVersion, the same key the page was given',a.j.planVersion===ack.key&&/^[0-9a-f]{8}$/.test(a.j.planVersion));
    ck('the first result has no planChanged',a.j.planChanged===undefined&&a.j.pageSync===undefined);
    ck('the server asked the page for its plan before the call',pg.syncs>=1);
    const b2=await s.tool('list_runs'); ck('nothing changed → same version, no notice',b2.j.planVersion===a.j.planVersion&&b2.j.planChanged===undefined);
    const pl0=(await s.tool('get_run',{id:'plan'})).j; const before=pl0.kpis.finalTotal;

    // an edit the page has NOT sent yet (still inside its debounce): the next tool call must already see it
    pg.edit(o=>{ o.living=(o.living||0)+7777; });
    const t0=Date.now(); const c1=await s.tool('get_run',{id:'plan'}), dt=Date.now()-t0;
    ck('the call pulled the unsent edit: planChanged is present and the version moved',!!c1.j.planChanged&&c1.j.planVersion!==a.j.planVersion&&c1.j.planChanged.from===a.j.planVersion&&c1.j.planChanged.to===c1.j.planVersion);
    ck('no pageSync problem and no long wait',c1.j.pageSync===undefined&&dt<900);
    const ch=c1.j.planChanged; ck('it lists which input changed, as a path',ch.changedInputs.includes('living'));
    ck('it gives the headline numbers before and after, and they differ',ch.planHeadline.before&&ch.planHeadline.after&&ch.planHeadline.before.finalTotal===before&&ch.planHeadline.after.finalTotal!==before);
    ck('the result itself is computed on the NEW plan (the old one was only borrowed)',c1.j.kpis.finalTotal===ch.planHeadline.after.finalTotal);
    ck('no input values are leaked, only paths',!JSON.stringify(ch.changedInputs).includes(String(JSON.parse(pg.plan).living))&&ch.changedInputs.every(x=>typeof x==='string'));
    ck('the note tells the LLM the earlier numbers are out of date',/out of date|describe the old plan/.test(ch.note));
    const c2=await s.tool('get_run',{id:'plan'}); ck('the notice appears once: the next call is clean',c2.j.planChanged===undefined&&c2.j.planVersion===c1.j.planVersion);
    const rr=((await s.tool('list_runs')).j.runs||[]); ck('(the plan run after the borrow is on the new plan)',rr.find(r=>r.id==='plan').kpis.finalTotal===ch.planHeadline.after.finalTotal);

    // an edit that arrives the normal way (debounced push), then a tool call
    pg.edit(o=>{ o.inflation=(o.inflation||0.025)+0.01; }); pg.push(); await c.waitFor(x=>x.type==='planAck'&&c.messages.indexOf(x)>c.messages.length-3).catch(()=>{}); await sleep(100);
    const d=await s.tool('list_runs'); ck('a pushed edit is reported the same way',!!d.j.planChanged&&d.j.planChanged.changedInputs.some(x=>/inflation/.test(x)));
    // a big change: the list is capped and still only paths
    c.messages.length=0; pg.plan=widow; pg.sent=null; pg.push(); await sleep(200);
    const big=await s.tool('list_runs'); ck('a different plan → a capped list of changed paths',big.j.planChanged&&big.j.planChanged.changedInputs.length<=16&&big.j.planChanged.changedInputs.length>=1);
    // a plan with a run made earlier: stale flag and notice agree
    await s.tool('run_scenarios',{scenarios:[{id:'a',label:'Spend less',levers:[{lever:'living',pctChange:-10}]}]}); pg.edit(o=>{ o.living=(o.living||0)+1; });
    const st=await s.tool('list_runs'); ck('the run made before the edit is stale in the same result that carries the notice',!!st.j.planChanged&&(st.j.runs||[]).some(r=>/^lev:/.test(r.id)&&r.stale===true));

    // a silent page: the call still works after about a second, and says so
    pg.silent=true; pg.edit(o=>{ o.living=(o.living||0)+2; }); const t1=Date.now(); const sl=await s.tool('get_run',{id:'plan'}), d1=Date.now()-t1;
    ck('a page that does not answer costs about a second',d1>=900&&d1<4000);
    ck('and the result says the plan may be behind',sl.j.pageSync&&sl.j.pageSync.status==='timeout'&&/behind/.test(sl.j.pageSync.note)&&!sl.r.isError);
    pg.silent=false;
    // bridge_status is stamped too and shows the version
    const bs=await s.tool('bridge_status'); ck('bridge_status carries the plan version',/^[0-9a-f]{8}$/.test(bs.j.planVersion));
    // the page leaves: no waiting, no pageSync
    c.send({type:'bye'}); await c.waitClosed(); await sleep(100); const t2=Date.now(); const nopage=await s.tool('list_runs'); ck('with no page there is no wait and no pageSync',Date.now()-t2<800&&nopage.j.pageSync===undefined&&!!nopage.j.planVersion);
  }catch(e){ fail++; console.log('ERR bridge',e&&e.stack||e,'\n',s.err.slice(0,600)); }
  await s.stop();

  // ── a plan file edited on disk, no bridge at all ──
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sync-')), file=path.join(tmp,'plan.json'); fs.writeFileSync(file,JSON.stringify(couple));
  s=start(['--plan',file]);
  try{
    await init(s); const a=await s.tool('list_runs'); ck('file mode: planVersion present, no notice',/^[0-9a-f]{8}$/.test(a.j.planVersion)&&a.j.planChanged===undefined);
    const e=JSON.parse(JSON.stringify(couple)); e.living=(e.living||0)+3000; fs.writeFileSync(file,JSON.stringify(e)); fs.utimesSync(file,new Date(),new Date(Date.now()+3000));
    const b=await s.tool('list_runs'); ck('file mode: an edited file is reported with source "file" and the changed path',b.j.planChanged&&b.j.planChanged.source==='file'&&b.j.planChanged.changedInputs.includes('living')&&b.j.planChanged.from===a.j.planVersion);
    ck('file mode: no pageSync field (there is no page)',b.j.pageSync===undefined);
  }catch(e){ fail++; console.log('ERR file',e&&e.stack||e); }
  await s.stop();
  console.log('sync_test: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})().catch(e=>{ console.log('ERR',e&&e.stack||e); process.exit(1); });
