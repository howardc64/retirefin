'use strict';
// The page side of the live bridge (display/llmBridge.js) with the real app scripts, a stub DOM and a fake WebSocket:  node tests/llm/bridge_ui_test.js
const fs=require('fs'), path=require('path');
const head=fs.readFileSync(path.resolve(__dirname,'../mc/mc_ui_test.js'),'utf8').split('// ---- Monte Carlo trial view')[0];
const body=`
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
ctx.__plan=JSON.parse(fs.readFileSync(path.join(root,'Samples/Couple_Heir.json'),'utf8'));
run('state=hydrateState(__plan); recompute();');
// a fake WebSocket: records what the page sends, lets the test play the server
const socks=[]; class FakeWS{ constructor(url){ this.url=url; this.sent=[]; this.readyState=0; this.closed=null; socks.push(this); }
  send(t){ this.sent.push(JSON.parse(t)); } close(c){ this.closed=c; this.readyState=3; if(this.onclose) this.onclose({code:c}); }
  open(){ this.readyState=1; this.onopen(); } recv(o){ this.onmessage({data:typeof o==='string'?o:JSON.stringify(o)}); } }
ctx.WebSocket=FakeWS;
const timers=[]; ctx.setTimeout=(f)=>{ timers.push(f); return timers.length; }; const flush=()=>{ while(timers.length) timers.shift()(); };
const sessionStore={}; ctx.sessionStorage={getItem:k=>sessionStore[k]??null,setItem:(k,v)=>{sessionStore[k]=v},removeItem:k=>{delete sessionStore[k]}};
const card=()=>document.getElementById('llmCard').innerHTML;
const planJson=()=>run('JSON.stringify(Object.assign({},state,{ui:null}))');
const before=planJson();
const CODE='ABCD-EFGH-JKLM';
const sentOf=(w,t)=>w.sent.filter(m=>m.type===t);

// off by default
ok(run('lbStatus')==='off'&&socks.length===0,'nothing connects by itself');
run('autosave()'); flush(); ok(socks.length===0,'autosave with no bridge does nothing');
run('openLlmCard("bridge")'); ok(/Live bridge/.test(card())&&/Off until you connect/.test(card())&&/Connect/.test(card())&&/same content as Save/.test(card()),'the tab explains what is sent and offers Connect');
ok(/Live bridge/.test(fs.readFileSync(path.join(root,'index.html'),'utf8'))===false||true,'(index loads llmBridge.js)'); ok(/llmBridge\\.js/.test(fs.readFileSync(path.join(root,'index.html'),'utf8')),'index.html loads llmBridge.js');

// bad input never opens a socket
run('lbSetField("port","80")'); run('lbSetField("token",${JSON.stringify('ABCD-EFGH-JKLM')})'); run('lbConnect()'); ok(socks.length===0&&/1024/.test(card()),'a low port is refused before any connection');
run('lbSetField("port","8765")'); run('lbSetField("token","short")'); run('lbConnect()'); ok(socks.length===0&&/pairing code/.test(card()),'a short code is refused before any connection');

// connect
run('lbSetField("token","'+CODE+'")'); run('lbConnect()');
const ws=socks[0]; ok(socks.length===1&&ws.url==='ws://127.0.0.1:8765'&&run('lbStatus')==='connecting','Connect opens ws://127.0.0.1:<port> (loopback only)');
ws.open(); ok(ws.sent.length===1&&ws.sent[0].type==='hello'&&ws.sent[0].token===CODE,'the first message is hello with the pairing code');
ok(!ws.sent.some(m=>m.type==='plan'),'no plan is sent before the server accepts the code');
ws.recv({type:'welcome',session:'s1-abc',effects:['showMarketPath','showProposals']});
ok(run('lbStatus')==='connected'&&sentOf(ws,'plan').length===1&&sentOf(ws,'approvals').length===1,'after welcome the page sends its plan and its (empty) approvals');
ok(JSON.stringify(sentOf(ws,'plan')[0].plan)===run('JSON.stringify(state)'),'the plan sent is the plan as it is on screen');
ok(run('lbForm.token')==='','the pairing code is dropped from memory once used');
ok(!JSON.stringify(store).includes(CODE)&&!JSON.stringify(sessionStore).includes(CODE)&&!run('JSON.stringify(state)').includes(CODE),'the pairing code is in no storage and not in the plan');
ws.recv({type:'planAck',ok:true,key:'1a2b3c4d'}); ok(/The server has your plan/.test(card())&&/1a2b3c4d/.test(card()),'the tab shows that the server has the plan');
// edits are re-sent, debounced, and only when changed
run('state.living+=1234; autosave()'); run('state.living+=1; autosave()'); ok(sentOf(ws,'plan').length===1,'edits are not sent immediately');
flush(); ok(sentOf(ws,'plan').length===2&&sentOf(ws,'plan')[1].plan.living===run('state.living'),'after the debounce the latest plan is sent once');
run('autosave()'); flush(); ok(sentOf(ws,'plan').length===2,'an autosave with nothing changed sends nothing');
run('state.living-=1235'); run('autosave()'); flush();

// the server asks for the plan before each tool call
const nS=ws.sent.length; ws.recv({type:'syncRequest',id:'y1'}); ok(ws.sent.length===nS+1&&ws.sent[nS].type==='synced'&&ws.sent[nS].id==='y1','syncRequest with nothing new → a tiny "synced" answer, no plan');
run('state.living+=4321'); ws.recv({type:'syncRequest',id:'y2'}); const sp=ws.sent[ws.sent.length-1]; ok(sp.type==='plan'&&sp.syncId==='y2'&&sp.plan.living===run('state.living'),'syncRequest with an unsent edit → the plan itself, tagged with the request id');
run('state.living-=4321'); run('autosave()'); flush(); const nP=sentOf(ws,'plan').length; run('state.living+=1; autosave()'); ws.recv({type:'syncRequest',id:'y3'}); const np=sentOf(ws,'plan').length; flush(); ok(np===nP+1&&sentOf(ws,'plan').length===np,'answering a syncRequest cancels the pending debounced send (the plan goes once)'); run('state.living-=1'); run('autosave()'); flush();
const nB=ws.sent.length; ws.recv({type:'syncRequest'}); ws.recv({type:'syncRequest',id:5}); ok(ws.sent.length===nB,'a syncRequest without a usable id is ignored');
// effects: first time asks
const effPath={schema:'planner.market/1',id:'two-bad',label:'Two bad years <b>x</b>',note:'',source:'mcp',from:{mode:'retire'},returns:[-0.25,-0.1,0.06,0.08],inflation:null,tail:{returnPct:6,inflationPct:null},equityShare:100};
const nBefore=ws.sent.length; ws.recv({type:'effect',id:'e1',effect:{type:'showMarketPath',path:effPath},why:'show the bad start'});
ok(ws.sent.length===nBefore&&run('lbPending.length')===1,'an effect of an unapproved kind is NOT applied and gets no answer yet');
ok(run('llmCardOpen&&llmTab')==='bridge'&&/asks to: show a market scenario/.test(card())&&/show the bad start/.test(card())&&/Allow/.test(card())&&/Deny/.test(card()),'the user is asked, with the reason, in the Live bridge tab');
ok(!/<b>x<\\/b>/.test(card())&&/&lt;b&gt;x/.test(card()),'a hostile label is shown escaped');
ok(run('!mcTrialView')&&run('Object.keys(msSession).length')===0,'nothing is shown or stored while waiting');
// deny
run('lbDeny("e1")'); ok(sentOf(ws,'effectResult').pop().status==='denied'&&run('lbPending.length')===0&&run('lbApproved.size')===0,'Deny answers "denied" and remembers nothing');
// ask again, allow
ws.recv({type:'effect',id:'e2',effect:{type:'showMarketPath',path:effPath}}); ok(run('lbPending.length')===1,'a denied kind asks again next time');
run('lbAllow("e2")'); const r2=sentOf(ws,'effectResult').pop(); ok(r2.id==='e2'&&r2.status==='applied','Allow applies the effect and answers "applied"');
ok(run('!!mcTrialView&&mcTrialView.view==="D"'),'the path is replayed in the main charts (view D, shown as B)');
ok(/STRESS TEST "Two bad years/.test(run('(xlsxTrialContext()||{}).label')),'Export Excel would write that path as a stress test named after it'); run('mcTrialExit()');
ok(run('state.ui.marketPaths.length')===0,'it was not saved into the plan');
ok(sentOf(ws,'approvals').pop().types.join()==='showMarketPath','the approval is reported to the server');
// approved: no question
const n2=ws.sent.length; ws.recv({type:'effect',id:'e3',effect:{type:'showMarketPath',path:Object.assign({},effPath,{label:'Again',id:'two-bad'})}});
ok(run('lbPending.length')===0&&sentOf(ws,'effectResult').pop().id==='e3'&&sentOf(ws,'effectResult').pop().status==='applied','an approved kind is applied without asking again'); run('mcTrialExit()');
ok(run('Object.keys(msSession).length')===2,'a repeated id does not overwrite the earlier path (made unique)');
// invalid payloads
ws.recv({type:'effect',id:'e4',effect:{type:'showMarketPath',path:Object.assign({},effPath,{returns:[5000]})}}); const r4=sentOf(ws,'effectResult').pop(); ok(r4.id==='e4'&&r4.status==='error'&&/not a valid market path/.test(r4.note),'a path with out-of-range returns is rejected by the page\\'s own validation');
ws.recv({type:'effect',id:'e5',effect:{type:'deleteEverything'}}); const r5=sentOf(ws,'effectResult').pop(); ok(r5.id==='e5'&&r5.status==='unsupported'&&run('lbPending.length')===0,'an unknown effect kind is refused without asking');
ws.recv({type:'effect',id:'e6',effect:{type:'__proto__'}}); ok(sentOf(ws,'effectResult').pop().id==='e6'&&sentOf(ws,'effectResult').pop().status==='unsupported','__proto__ is not an effect kind');
const nRes=sentOf(ws,'effectResult').length; ws.recv({type:'effect',effect:{type:'showMarketPath'}}); ws.recv({type:'effect',id:'e7'}); ok(sentOf(ws,'effectResult').length===nRes,'malformed requests (no id, no effect) are ignored');
ws.recv('not json'); ws.recv('{"type":'); ok(run('lbStatus')==='connected','garbage from the server does not break the connection');
ws.recv(JSON.stringify({type:'effect',id:'big',effect:{type:'showProposals',pad:'x'.repeat(2100000)}})); ok(sentOf(ws,'effectResult').every(m=>m.id!=='big'),'an oversize message is dropped');

// proposals
const spec={schema:'planner.scenarios/1',scenarios:[{kind:'lever',label:'Delay SS',why:'test',levers:[{lever:'ssClaimAge',person:1,age:70}]},{kind:'market',label:'Bad start',returnsPct:[-20,-5,5],afterReturnPct:6},{kind:'lever',label:'Broken',levers:[{lever:'nope'}]}]};
ws.recv({type:'effect',id:'p1',effect:{type:'showProposals',spec}}); ok(run('lbPending.length')===1&&/add scenarios/i.test(card())&&/Delay SS/.test(card())&&run('rrProposals().length')===0,'proposals wait for approval and are not imported yet');
run('lbAllow("p1")'); const rp=sentOf(ws,'effectResult').pop(); ok(rp.id==='p1'&&rp.status==='applied'&&/2 added/.test(rp.note)&&/1 not accepted/.test(rp.note),'after Allow the page re-validates: 2 added, the broken one reported');
ok(run('rrProposals().length')===2&&run('rrProposals().every(p=>p.source==="mcp")')&&run('llmTab')==='import','they are in the proposals list, stamped mcp, and the Import tab is shown');
ok(planJson()===before,'none of this changed the plan'); run('llmClearAll()');
// too many waiting
run('lbRevoke("showProposals")'); run('openLlmCard("bridge")'); for(let i=0;i<6;i++) ws.recv({type:'effect',id:'w'+i,effect:{type:'showProposals',spec}});
ok(run('lbPending.length')===5&&sentOf(ws,'effectResult').pop().id==='w5'&&sentOf(ws,'effectResult').pop().status==='denied','more than 5 waiting requests are refused');
ws.recv({type:'effectCancel',id:'w0'}); ok(run('lbPending.length')===4,'a cancelled request disappears from the list');
run('lbAllow("w1")'); ok(run('lbPending.length')===0&&sentOf(ws,'effectResult').filter(m=>/^w[1-4]$/.test(m.id)).length===4,'Allow also answers the other waiting requests of the same kind');
run('llmClearAll()');
// revoke
run('lbRevoke("showProposals")'); ok(sentOf(ws,'approvals').pop().types.join()==='showMarketPath','Revoke removes the approval and tells the server');
// a run finished in the page: the plan it ran on, then the settings it used (the results are not sent)
{ const n0=ws.sent.length; run('llmBridgeRunDone("stmc",{trials:200,seed:9},{equityShare:100})'); const sent=ws.sent.slice(n0);
  ok(sent.length===2&&sent[0].type==='plan'&&sent[1].type==='pageRun','a finished run sends the plan, then a pageRun message');
  ok(sent[1].kind==='stmc'&&sent[1].mc.trials===200&&sent[1].mc.seed===9&&sent[1].stress.equityShare===100&&!('results' in sent[1]),'the pageRun carries the settings used, not the results');
  const n1=ws.sent.length; run('llmBridgeRunDone("mc",{trials:50},null)'); ok(ws.sent.slice(n1).pop().stress===null,'a Monte Carlo-only run has no stress settings'); }
// a different plan was loaded (not an edit): the next plan sent says so, once
{ const n0=sentOf(ws,'plan').length; run('llmBridgeReplaced()'); flush();
  const ps=sentOf(ws,'plan').slice(n0); ok(ps.length===1&&ps[0].replaced===true,'after a plan was replaced the next plan sent carries replaced:true even when its JSON is unchanged');
  run('state.living+=7; autosave()'); flush(); const p2=sentOf(ws,'plan').pop(); ok(p2.replaced===undefined&&p2.plan.living===run('state.living'),'a later edit does not say replaced'); run('state.living-=7; autosave()'); flush();
  run('llmBridgeReplaced()'); const nn=ws.sent.length; ws.recv({type:'syncRequest',id:'r1'}); const sp2=ws.sent.slice(nn).pop(); ok(sp2.type==='plan'&&sp2.replaced===true&&sp2.syncId==='r1','a syncRequest while a replacement is pending sends the plan (not "unchanged"), flagged replaced'); }
// disconnect
run('lbDisconnect()'); ok(ws.sent.some(m=>m.type==='bye')&&ws.closed===1000&&run('lbStatus')==='off'&&run('lbApproved.size')===0&&run('lbPending.length')===0,'Disconnect says bye, closes, and forgets every approval');
const sc=sentOf(ws,'plan').length; run('state.living+=1; autosave()'); flush(); ok(sentOf(ws,'plan').length===sc,'after disconnecting edits are not sent'); run('state.living-=1');
const nOff=ws.sent.length; ws.recv({type:'syncRequest',id:'y9'}); ok(ws.sent.length===nOff,'a syncRequest after disconnecting is not answered');
run('llmBridgeRunDone("mc",{trials:50},null)'); ok(ws.sent.length===nOff,'a finished run after disconnecting sends nothing');
// denied login
run('openLlmCard("bridge")');
run('lbSetField("token","WRONG-WRONG-WRO")'); run('lbConnect()'); const ws2=socks[1]; ws2.open(); ws2.recv({type:'denied',reason:'wrong pairing code'}); ws2.close(1008);
ok(run('lbStatus')==='off'&&/refused the pairing code/.test(card())&&!ws2.sent.some(m=>m.type==='plan'),'a refused code shows a message and sends no plan');
// server vanishes
run('openLlmCard("bridge")');
run('lbSetField("token","'+CODE+'")'); run('lbConnect()'); const ws3=socks[2]; ws3.readyState=3; ws3.onclose({code:1006}); ok(/Could not connect/.test(card()),'a connection that never opens says what to check');
run('lbSetField("token","'+CODE+'")'); run('lbConnect()'); const ws4=socks[3]; ws4.open(); ws4.recv({type:'welcome',session:'s2'}); ws4.onclose({code:1006}); ok(run('lbStatus')==='off'&&/Disconnected/.test(card()),'a dropped connection is shown as disconnected and clears approvals');
ok(planJson()===before,'the plan is unchanged at the end');
run('closeLlmCard()');
console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
`;
eval(head+body);
