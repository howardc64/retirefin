'use strict';
// The live bridge server (server/bridge.js) on its own: node tests/llm/bridge_test.js
//   handshake and Host guard, pairing token (wrong / rotation), frame rules (masking, size, fragments, binary), plan messages, the effect request / answer round trip, timeouts, replacement.
const http=require('http'), crypto=require('crypto');
const {makeBridge,newToken,tokenOk,hostOk}=require('../../server/bridge.js');
const {connect,maskFrame}=require('./wsclient.js');
let pass=0,fail=0; const ck=(n,c)=>{ if(c) pass++; else { fail++; console.log('FAIL',n); } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hello=(c,t)=>c.send({type:'hello',token:t});

(async()=>{
  const logs=[]; const TOKEN='ABCD-EFGH-JKLM';
  const b=makeBridge({port:0,token:TOKEN,effects:['showMarketPath','showProposals'],log:m=>logs.push(m),preAuthMs:400,maxPlanBytes:6*1024*1024});
  const plans=[]; b.on('plan',(p,h)=>{ plans.push(p); h.reply({ok:true,key:'k'+plans.length}); });
  const {port}=await b.start();
  ck('binds a real port',port>0&&b.state().listening);

  // pure helpers
  ck('newToken shape',/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(newToken()));
  ck('tokenOk ignores case, spaces and dashes',tokenOk('abcd efgh-jklm',TOKEN)&&!tokenOk('ABCD-EFGH-JKLN',TOKEN)&&!tokenOk('',TOKEN));
  ck('hostOk accepts only loopback names with the port',hostOk('127.0.0.1:'+port,port)&&hostOk('localhost:'+port,port)&&!hostOk('evil.example:'+port,port)&&!hostOk('127.0.0.1:1',port)&&!hostOk('',port));
  let threw=false; try{ makeBridge({token:'short'}); }catch(e){ threw=true; } ck('a short fixed token is refused',threw);

  // plain HTTP is not served
  const plain=await new Promise(res=>http.get({host:'127.0.0.1',port,path:'/plan'},r=>{ let d=''; r.on('data',x=>d+=x); r.on('end',()=>res({s:r.statusCode,d})); }));
  ck('plain HTTP answers 426 and serves nothing',plain.s===426&&!/plan|state/i.test(plain.d.replace('retirement planner bridge: WebSocket only','')));
  // Host header guard (DNS rebinding)
  const rb=await connect(port,{host:'evil.example:'+port}); ck('a foreign Host header is refused (403)',rb.refused&&rb.status===403);
  const np=await connect(port,{path:'/other'}); ck('another path is refused (404)',np.refused&&np.status===404);

  // wrong token, then the limit
  let c=await connect(port); hello(c,'WRONG-WRONG-WRON'); let m=await c.waitFor(x=>x.type==='denied'); ck('wrong code is denied',m.reason==='wrong pairing code');
  ck('and the socket is closed with 1008',(await c.waitClosed()).code===1008);
  ck('a wrong code never reaches the plan handler',plans.length===0&&!b.state().connected);
  for(let i=0;i<3;i++){ c=await connect(port); hello(c,'WRONG-WRONG-WRO'+i); await c.waitClosed(); }
  let rotated=null; b.on('token',t=>{ rotated=t; });
  c=await connect(port); hello(c,'WRONG-WRONG-WRO9'); await c.waitClosed();      // the 5th failure
  ck('after 5 wrong codes the code is replaced',!!rotated&&rotated!==TOKEN&&b.token===rotated);
  c=await connect(port); hello(c,TOKEN); m=await c.waitFor(x=>x.type==='denied'); ck('the old code no longer works after rotation',!!m); await c.waitClosed();
  const T=b.token;

  // frame rules before login
  c=await connect(port); c.send({type:'plan',plan:{}}); ck('anything but hello first is closed (1008)',(await c.waitClosed()).code===1008);
  c=await connect(port); c.sendRaw(maskFrame(1,'{"type":"hello","token":"'+'x'.repeat(2000)+'"}')); ck('an oversize frame before login is closed (1009)',(await c.waitClosed()).code===1009);
  c=await connect(port); c.sendRaw(maskFrame(1,'{"type":"hello"}',{unmasked:true})); ck('an unmasked client frame is closed (1002)',(await c.waitClosed()).code===1002);
  c=await connect(port); c.sendRaw(maskFrame(2,Buffer.from([1,2,3]))); ck('a binary frame is closed (1003 or 1008)',[1003,1008].includes((await c.waitClosed()).code));
  c=await connect(port); c.sendRaw(maskFrame(1,'not json')); ck('non-JSON before login is closed (1008)',(await c.waitClosed()).code===1008);
  c=await connect(port); ck('a silent socket is closed after the pre-login time',(await c.waitClosed(2500)).code===1008);

  // good login
  const page=await connect(port); hello(page,T);
  const w=await page.waitFor(x=>x.type==='welcome'); ck('welcome carries a session id and the effect kinds',/^s\d+-/.test(w.session)&&w.effects.join()==='showMarketPath,showProposals');
  ck('state shows one connected page',b.state().connected&&b.state().session===w.session);
  page.sendRaw(maskFrame(9,'hi')); await sleep(80); ck('ping is answered with pong',page.pongs===1&&page.lastPong.toString()==='hi');

  // plan messages: small, then a big one split into fragments
  page.send({type:'plan',plan:{a:1}}); let ack=await page.waitFor(x=>x.type==='planAck'); ck('plan → planAck with the handler\'s answer',ack.ok&&ack.key==='k1'&&plans[0].a===1);
  page.send({type:'plan',plan:[1,2]}); ack=await page.waitFor(x=>x.type==='planAck'&&x.ok===false); ck('a plan that is not an object is rejected',/object/.test(ack.error));
  const big=JSON.stringify({type:'plan',plan:{blob:'z'.repeat(3*1024*1024)}}), bb=Buffer.from(big), third=Math.floor(bb.length/3);
  page.sendRaw(maskFrame(1,bb.slice(0,third),{fin:false})); page.sendRaw(maskFrame(0,bb.slice(third,2*third),{fin:false})); page.sendRaw(maskFrame(0,bb.slice(2*third)));
  ack=await page.waitFor(x=>x.type==='planAck'&&x.key==='k2'); ck('a 3 MB plan in three fragments arrives whole',plans[1].blob.length===3*1024*1024);
  page.send({type:'approvals',types:['showMarketPath',5,'x'.repeat(100)]}); await sleep(80); ck('approvals are recorded (strings only, trimmed)',b.state().approvals.length===2&&b.state().approvals[0]==='showMarketPath'&&b.state().approvals[1].length===40);

  // effects: applied, denied, error status normalised, unknown id ignored
  let p=b.requestEffect({type:'showMarketPath',path:{id:'x'}},{why:'because'}); let req=await page.waitFor(x=>x.type==='effect');
  ck('the page receives the effect with an id and the reason',/^e\d+-/.test(req.id)&&req.effect.type==='showMarketPath'&&req.why==='because');
  page.send({type:'effectResult',id:'nope',status:'applied'}); page.send({type:'effectResult',id:req.id,status:'applied',note:'showing'});
  let r=await p; ck('an answered effect resolves with status and note',r.status==='applied'&&r.note==='showing');
  page.messages.length=0; p=b.requestEffect({type:'showProposals'}); req=await page.waitFor(x=>x.type==='effect'); page.send({type:'effectResult',id:req.id,status:'denied',note:'the user declined'}); r=await p; ck('denied is passed on',r.status==='denied');
  page.messages.length=0; p=b.requestEffect({type:'showProposals'}); req=await page.waitFor(x=>x.type==='effect'); page.send({type:'effectResult',id:req.id,status:'hacked'}); r=await p; ck('an unknown status becomes error',r.status==='error');
  // timeout → effectCancel
  page.messages.length=0; p=b.requestEffect({type:'showProposals'},{timeoutMs:150}); req=await page.waitFor(x=>x.type==='effect'); r=await p; const cancel=await page.waitFor(x=>x.type==='effectCancel');
  ck('no answer in time → timeout, and the page is told to forget the request',r.status==='timeout'&&cancel.id===req.id);
  page.send({type:'effectResult',id:req.id,status:'applied'}); await sleep(50); ck('a late answer is ignored',true);
  // busy
  page.messages.length=0; const many=[]; for(let i=0;i<9;i++) many.push(b.requestEffect({type:'showProposals'},{timeoutMs:300}));
  const rs=await Promise.all(many); ck('more than 8 waiting effects → busy',rs.filter(x=>x.status==='busy').length===1&&rs.filter(x=>x.status==='timeout').length===8);
  ck('bad effect objects are refused',(await b.requestEffect(null)).status==='error'&&(await b.requestEffect({})).status==='error');

  // a newer authenticated page replaces the old one; an unauthenticated one cannot
  const intruder=await connect(port); hello(intruder,'NOPE-NOPE-NOPE'); await intruder.waitClosed(); ck('a failed login does not kick the connected page',b.state().connected&&!page.closed);
  let pend=b.requestEffect({type:'showProposals'},{timeoutMs:3000}); await page.waitFor(x=>x.type==='effect');
  const page2=await connect(port); hello(page2,b.token); await page2.waitFor(x=>x.type==='welcome');
  r=await pend; ck('replacing the page ends its waiting effects (disconnected)',r.status==='disconnected');
  ck('the old page was told and closed',(await page.waitClosed()).code===1000&&page.messages.some(x=>x.type==='denied'&&/replaced/.test(x.reason)));
  ck('the new page is the session',b.state().connected&&b.state().session!==w.session);

  // disconnect
  let discon=0; b.on('disconnect',()=>discon++); page2.send({type:'bye'}); await page2.waitClosed(); await sleep(50);
  ck('bye disconnects',!b.state().connected&&discon>=0);
  ck('no page → noPage',(await b.requestEffect({type:'showProposals'})).status==='noPage');
  ck('the token never appears in the log except when replaced',!logs.some(l=>l.includes(T)&&!/new pairing code/.test(l)));

  await b.close(); ck('close stops listening',!b.state().listening);
  console.log('bridge_test: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})().catch(e=>{ console.log('ERR',e&&e.stack||e); process.exit(1); });
