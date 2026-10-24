'use strict';
// The Claude Desktop extension (mcpb/manifest.json + server/build-mcpb.js): node tests/llm/mcpb_test.js
//   the bundle is built, is self-contained (unpacked into an empty folder it runs), the manifest agrees with the server (every setting is read, tools match), and the server treats
//   empty / unresolved settings as "not set" the way Claude Desktop passes them.
const {spawn,execFileSync}=require('child_process'), path=require('path'), fs=require('fs'), os=require('os');
const {build,zip,crc32}=require('../../server/build-mcpb.js'), {FILES}=require('../../server/engine.js');
const ROOT=path.join(__dirname,'..','..');
let pass=0,fail=0; const ck=(n,c)=>{ if(c) pass++; else { fail++; console.log('FAIL',n); } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mcpb-')), out=path.join(tmp,'planner.mcpb'), dir=path.join(tmp,'unpacked');

function start(cwd,env){
  const p=spawn('node',[path.join(cwd,'server','mcp.js')],{cwd:tmp,env:Object.assign({},process.env,{PLANNER_PLAN:'',PLANNER_NAMES:'',PLANNER_BRIDGE:'',PLANNER_BRIDGE_PORT:'',PLANNER_BRIDGE_TOKEN:''},env),stdio:['pipe','pipe','pipe']});
  const s={p,buf:'',nid:0,w:{},err:''}; p.stderr.on('data',d=>s.err+=d);
  p.stdout.on('data',d=>{ s.buf+=d; let i; while((i=s.buf.indexOf('\n'))>=0){ const l=s.buf.slice(0,i); s.buf=s.buf.slice(i+1); try{ const m=JSON.parse(l); if(s.w[m.id]){ s.w[m.id](m); delete s.w[m.id]; } }catch(e){} } });
  s.rpc=(method,params)=>new Promise((res,rej)=>{ const id=++s.nid; s.w[id]=res; p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n'); setTimeout(()=>rej(new Error('timeout '+method+' '+s.err.slice(0,300))),30000); });
  s.tool=async(n,a)=>{ const r=await s.rpc('tools/call',{name:n,arguments:a||{}}); let j=null; try{ j=JSON.parse(r.result.content[0].text); }catch(e){} return {r:r.result,j}; };
  s.names=async()=>(await s.rpc('tools/list')).result.tools.map(t=>t.name);
  s.exited=new Promise(r=>p.on('exit',c=>r(c)));
  s.stop=()=>new Promise(r=>{ p.stdin.end(); setTimeout(()=>{ p.kill(); r(); },250); });
  return s;
}
const init=s=>s.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}});

(async()=>{
  try{
    // ── the zip writer ──
    ck('crc32 of "123456789" is the standard check value',crc32(Buffer.from('123456789'))===0xCBF43926);
    // ── build ──
    const r=build(out); ck('the build writes a file',fs.existsSync(out)&&r.bytes>50000);
    execFileSync('unzip',['-tq',out]); ck('unzip -t finds no errors',true);
    const out2=path.join(tmp,'again.mcpb'); build(out2); ck('the build is reproducible (identical bytes)',fs.readFileSync(out).equals(fs.readFileSync(out2)));
    fs.mkdirSync(dir); execFileSync('unzip',['-q',out,'-d',dir]);
    const man=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
    ck('manifest.json is at the root with the required fields',['manifest_version','name','version','description','author','server'].every(k=>man[k]!==undefined)&&man.server.type==='node'&&man.server.entry_point==='server/mcp.js');
    ck('the entry point and icon exist in the bundle',fs.existsSync(path.join(dir,man.server.entry_point))&&fs.existsSync(path.join(dir,man.icon)));
    ck('every engine script file is in the bundle',FILES.every(f=>fs.existsSync(path.join(dir,'js',f))));
    ck('the command runs the bundled server with ${__dirname}',man.server.mcp_config.command==='node'&&man.server.mcp_config.args[0]==='${__dirname}/server/mcp.js');
    // manifest ↔ server agreement
    const src=fs.readFileSync(path.join(ROOT,'server','mcp.js'),'utf8'), env=man.server.mcp_config.env, cfgKeys=Object.keys(man.user_config);
    ck('every environment variable the manifest sets is read by the server',Object.keys(env).every(k=>src.includes("'"+k+"'")));
    ck('every setting in the form is passed on, and every placeholder names a real setting',cfgKeys.every(k=>Object.values(env).includes('${user_config.'+k+'}'))&&Object.values(env).every(v=>cfgKeys.includes((/^\$\{user_config\.(\w+)\}$/.exec(v)||[])[1])));
    ck('settings have a type, title and description',cfgKeys.every(k=>man.user_config[k].type&&man.user_config[k].title&&man.user_config[k].description));
    ck('nothing is required, so it installs with no setup',cfgKeys.every(k=>!man.user_config[k].required));
    ck('the sensitive pairing code is marked sensitive',man.user_config.bridge_token.sensitive===true);
    ck('the licence is shipped',fs.existsSync(path.join(dir,'LICENSE')));

    // ── run the unpacked bundle from an empty place (nothing from the project folder) ──
    const plan=path.join(tmp,'my plan.json'); fs.copyFileSync(path.join(ROOT,'Samples','Couple_Heir.json'),plan);
    // 1. what Claude Desktop passes with an empty form: all values empty / placeholders unresolved, bridge on by default
    let s=start(dir,{PLANNER_PLAN:'${user_config.plan_file}',PLANNER_NAMES:'false',PLANNER_BRIDGE:'true',PLANNER_BRIDGE_PORT:'0',PLANNER_BRIDGE_TOKEN:''});
    await init(s); const n1=await s.names();
    ck('the bundle starts with no plan file and the bridge on (no usage error)',n1.includes('bridge_status')&&n1.includes('list_runs'));
    const st=await s.tool('bridge_status'); ck('it reports a random pairing code and a port',st.j.bridge.listening&&/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(st.j.bridge.pairingCode)&&st.j.bridge.port>0);
    ck('the tool list matches the manifest\'s tools list',JSON.stringify(n1.slice().sort())===JSON.stringify(man.tools.map(t=>t.name).sort()));
    const none=await s.tool('list_runs'); ck('with no plan the tools say so',none.r.isError&&/No plan is loaded/.test(none.j.error));
    await s.stop();
    // 2. a plan file chosen in the form, bridge off, names off ("false" is not a flag)
    s=start(dir,{PLANNER_PLAN:plan,PLANNER_NAMES:'false',PLANNER_BRIDGE:'false'}); await init(s); const n2=await s.names();
    ck('bridge "false" → no bridge tool and no port',!n2.includes('bridge_status')&&!/listening/.test(s.err));
    const lr=await s.tool('list_runs'); ck('the chosen plan file (a path with a space) is used',!lr.r.isError&&(lr.j.runs||lr.j).some(x=>x.id==='plan'));
    const labelSeen=async()=>{ await s.tool('run_scenarios',{scenarios:[{id:'a',label:'Robert waits',levers:[{lever:'ssClaimAge',person:1,age:70}]}]}); return JSON.stringify((await s.tool('list_runs')).j); };
    const off=await labelSeen(); ck('names are hidden when "show names" is off',!/Robert/.test(off)&&/Person 1 waits/.test(off));
    await s.stop();
    // 3. names on
    s=start(dir,{PLANNER_PLAN:plan,PLANNER_NAMES:'true'}); await init(s); const on=await labelSeen(); ck('"true" turns the names flag on',/Robert waits/.test(on)); await s.stop();
    // 4. a too-short pairing code is ignored with a message, a good one is used
    s=start(dir,{PLANNER_BRIDGE:'true',PLANNER_BRIDGE_PORT:'0',PLANNER_BRIDGE_TOKEN:'abc'}); await init(s); const s4=await s.tool('bridge_status'); ck('a short code is replaced by a random one, with a message',/at least 12/.test(s.err)&&s4.j.bridge.pairingCode!=='ABC'&&s4.j.bridge.pairingCode.length===14); await s.stop();
    s=start(dir,{PLANNER_BRIDGE:'true',PLANNER_BRIDGE_PORT:'0',PLANNER_BRIDGE_TOKEN:'MYSECRET-CODE-12'}); await init(s); const s5=await s.tool('bridge_status'); ck('a good code is used as given',s5.j.bridge.pairingCode==='MYSECRET-CODE-12'); await s.stop();
    // 5. an out-of-range port falls back to the default, not a crash
    s=start(dir,{PLANNER_BRIDGE:'true',PLANNER_BRIDGE_PORT:'99999'}); await init(s); await sleep(300); const s6=await s.tool('bridge_status'); ck('a bad port value uses the default port (or reports it is busy), and the server still answers',!!s6.j&&(s6.j.bridge&&s6.j.bridge.port===8765||/could not start/.test(s.err))); await s.stop();
    // 6. nothing set and no bridge: a usage error (exit 2), as before
    s=start(dir,{}); const code=await s.exited; ck('no plan and no bridge is still a usage error',code===2&&/usage/.test(s.err));
    // 7. command-line flags still win over / work without the environment
    const cl=spawn('node',[path.join(dir,'server','mcp.js'),'--plan',plan],{stdio:['pipe','pipe','pipe'],env:Object.assign({},process.env,{PLANNER_BRIDGE:''})}); let o=''; cl.stdout.on('data',d=>o+=d); cl.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\n'); await sleep(1200); cl.kill();
    ck('the command-line form still works',/list_runs/.test(o));
  }catch(e){ fail++; console.log('ERR',e&&e.stack||e); }
  console.log('mcpb_test: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
