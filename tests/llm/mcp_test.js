// MCP server over a real stdio pipe: handshake, tool list (incl. host-gated job tools), runs, stress, MC job, proposals sidecar, resources.
const {spawn}=require('child_process'), path=require('path'), fs=require('fs'), os=require('os');
const ROOT=path.join(__dirname,'..','..');
let pass=0,fail=0; const ck=(n,c)=>{ if(c) pass++; else { fail++; console.log('FAIL',n); } };
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-')); const plan=path.join(tmp,'plan.json');
fs.copyFileSync(path.join(ROOT,'Samples','Couple_Heir.json'),plan);
const p=spawn('node',[path.join(ROOT,'server','mcp.js'),'--plan',plan],{stdio:['pipe','pipe','pipe']});
let buf='',nid=0; const waiters={}; let stderr=''; let nonJson=0;
p.stderr.on('data',d=>stderr+=d);
p.stdout.on('data',d=>{ buf+=d; let i; while((i=buf.indexOf('\n'))>=0){ const l=buf.slice(0,i); buf=buf.slice(i+1); if(!l.trim()) continue; let m; try{ m=JSON.parse(l); }catch(e){ nonJson++; continue; } if(waiters[m.id]){ waiters[m.id](m); delete waiters[m.id]; } } });
const rpc=(method,params)=>new Promise((res,rej)=>{ const id=++nid; waiters[id]=res; p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n'); setTimeout(()=>rej(new Error('timeout '+method)),60000); });
const tool=async(n,a)=>{ const r=await rpc('tools/call',{name:n,arguments:a||{}}); const t=r.result&&r.result.content&&r.result.content[0]&&r.result.content[0].text; let j=null; try{ j=JSON.parse(t); }catch(e){} return {r:r.result,j,t,err:r.error}; };
(async()=>{
  try{
    const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}});
    ck('initialize serverInfo',init.result&&init.result.serverInfo.name==='retirement-planner');
    p.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    ck('ping',!!(await rpc('ping')).result);
    const tl=(await rpc('tools/list')).result.tools, names=tl.map(t=>t.name);
    ['list_runs','get_run','get_mc_summary','import_scenarios','run_stress_tests','run_monte_carlo','get_job','cancel_job','define_stress_config','define_mc_config'].forEach(n=>ck('tool '+n,names.includes(n)));
    ck('tools have inputSchema',tl.every(t=>t.inputSchema&&t.inputSchema.type==='object'));
    const lr=await tool('list_runs'); ck('list_runs ok',lr.j&&!lr.r.isError);
    const runs=lr.j&&(lr.j.runs||lr.j); ck('plan run present',Array.isArray(runs)&&runs.some(r=>r.id==='plan'));
    
    const st=await tool('run_stress_tests',{}); ck('run_stress_tests ok',st.j&&!st.r.isError);
    const lr2=await tool('list_runs'); const r2=lr2.j.runs||lr2.j; ck('stress runs listed',r2.some(r=>/^stl:/.test(r.id)));
    const mc=await tool('run_monte_carlo',{trials:300,seed:7}); ck('run_monte_carlo ok',mc.j&&!mc.r.isError);
    const jobId=mc.j&&(mc.j.jobId||mc.j.job&&mc.j.job.id||mc.j.id); ck('job id',!!jobId);
    let st2=null; for(let i=0;i<100;i++){ st2=await tool('get_job',{jobId}); const s=st2.j&&(st2.j.status||st2.j.state||(st2.j.job&&st2.j.job.status)); if(s==='done'||s==='complete'||s==='completed') break; await new Promise(r=>setTimeout(r,200)); }
    ck('job finished',st2&&/done|complete/.test(JSON.stringify(st2.j).slice(0,400)));
    const sum=await tool('get_mc_summary',{runId:'mcj:'+jobId}); ck('get_mc_summary ok',sum.j&&!sum.r.isError&&!sum.err);
    const imp=await tool('import_scenarios',{schema:'planner.scenarios/1',scenarios:[{kind:'lever',label:'Delay SS',levers:[{lever:'ssClaimAge',person:1,age:70}]}]});
    ck('import_scenarios accepted',imp.j&&imp.j.accepted&&imp.j.accepted.length===1&&!imp.r.isError);
    const side=plan.replace(/\.json$/,'')+'.proposals.json'; ck('sidecar written',fs.existsSync(side));
    if(fs.existsSync(side)){ const o=JSON.parse(fs.readFileSync(side,'utf8')); ck('sidecar schema',o.schema==='planner.scenarios/1'&&Array.isArray(o.scenarios)); ck('sidecar holds the proposal',o.scenarios.length===1&&o.scenarios[0].label==='Delay SS'); }
    const rl=(await rpc('resources/list')).result.resources; ck('5 resources',rl.length===5);
    const rd=await rpc('resources/read',{uri:rl[0].uri}); ck('resources/read',rd.result&&rd.result.contents[0].text.length>2);
    const bad=await rpc('nope',{}); ck('unknown method error',bad.error&&bad.error.code===-32601);
    const bt=await tool('no_such_tool'); ck('unknown tool is an error',!!(bt.err||(bt.r&&bt.r.isError)));
    ck('stdout only protocol',nonJson===0);
  }catch(e){ fail++; console.log('ERR',e.message,'\n',stderr.slice(0,800)); }
  p.stdin.end(); setTimeout(()=>{ p.kill(); console.log('mcp_test: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0); },200);
})();
