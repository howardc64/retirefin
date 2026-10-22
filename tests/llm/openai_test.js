'use strict';
// The OpenAI-compatible provider of the in-page chat (display/chat.js), real app scripts + stub DOM:  node tests/llm/openai_test.js
//   endpoint rules (keys only over https or to this computer), request shape, streamed text and tool calls (split, parallel, no finish_reason), errors, and one full tool round through sendChat.
const fs=require('fs'), path=require('path');
const head=fs.readFileSync(path.resolve(__dirname,'../mc/mc_ui_test.js'),'utf8').split('// ---- Monte Carlo trial view')[0];
const body=`
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
ctx.__plan=JSON.parse(fs.readFileSync(path.join(root,'Samples/Couple_Heir.json'),'utf8'));
run('state=hydrateState(__plan); recompute();');
ctx.setTimeout=(f)=>setTimeout(f,0); ctx.clearTimeout=clearTimeout; ctx.TextDecoder=TextDecoder; ctx.AbortController=AbortController;
const sessionStore={}; ctx.sessionStorage={getItem:k=>sessionStore[k]??null,setItem:(k,v)=>{sessionStore[k]=v},removeItem:k=>{delete sessionStore[k]}};
const J=x=>JSON.parse(JSON.stringify(x));
const ep=b=>J(run('chatOpenAIEndpoint('+JSON.stringify(b)+')'));

// ── endpoint rules ──
ok(ep('').url==='https://api.openai.com/v1/chat/completions','empty base URL → the OpenAI default');
ok(ep('https://openrouter.ai/api/v1/').url==='https://openrouter.ai/api/v1/chat/completions','trailing slash is dropped');
ok(ep('https://x.example/v1/chat/completions').url==='https://x.example/v1/chat/completions','a full endpoint is kept as is');
ok(ep('https://x.example').url==='https://x.example/chat/completions','a bare host gets /chat/completions');
ok(ep('http://localhost:11434/v1').url==='http://localhost:11434/v1/chat/completions'&&ep('http://localhost:11434/v1').local===true,'http to localhost is allowed and marked local');
ok(ep('http://127.0.0.1:1234/v1').local&&ep('http://[::1]:8080/v1').local,'127.0.0.1 and [::1] are local too');
ok(!!ep('http://192.168.1.5:11434/v1').error&&!!ep('http://api.example.com/v1').error,'plain http to any other host is refused (the key would travel in clear)');
ok(!!ep('https://user:pw@host/v1').error&&!!ep('https://host/v1?x=1').error&&!!ep('ftp://host/v1').error&&!!ep('not a url').error&&!!ep('https://host/v1#frag').error,'user info, query, fragment, other schemes and junk are refused');
ok(ep('http://localhost.evil.com/v1').error!==undefined,'a look-alike host is not "local"');
ok(ep('https://api.openai.com/v1').local===false&&ep('https://api.openai.com/v1').host==='api.openai.com','a remote https host is not local');

// ── provider table ──
ok(run('Object.keys(CHAT_PROVIDERS).join()')==='gemini,anthropic,openai'&&run('CHAT_PROVIDERS.openai.keyOptional===true&&CHAT_PROVIDERS.openai.baseUrlEditable===true'),'the provider list has openai after gemini and anthropic (default provider unchanged)');
ok(run('chatLoadPrefs().provider')==='gemini'&&run('chatLoadPrefs().baseUrl')==='','defaults: Gemini, no base URL');
ok(run('CHAT_PROVIDERS.openai.sentTo({baseUrl:"http://localhost:11434/v1"})')==='the server on this computer (localhost)'&&run('CHAT_PROVIDERS.openai.sentTo({baseUrl:"https://openrouter.ai/api/v1"})')==='the server at openrouter.ai','the privacy line names where the plan goes');

// ── request ──
const hist=[{role:'user',content:'What if I claim at 70?'},{role:'assistant',content:'Let me run it.',calls:[{id:'call_1',name:'run_scenarios',args:{scenarios:[{id:'a',label:'70',levers:[{lever:'ssClaimAge',person:1,age:70}]}]}},{id:'call_2',name:'sweep',args:{__error:'cut off'}}]},
  {role:'tool',results:[{id:'call_1',name:'run_scenarios',response:{ok:1},isError:false},{id:'call_2',name:'sweep',response:{error:'bad'},isError:true}]},{role:'user',content:'thanks'}];
ctx.__h=hist; const rq=J(run('chatBuildRequest("openai","gpt-x","sk-secret","SYSTEM TEXT",__h,true,{baseUrl:"https://api.example.com/v1"})'));
ok(rq.url==='https://api.example.com/v1/chat/completions'&&rq.headers.authorization==='Bearer sk-secret'&&rq.headers['content-type']==='application/json','URL and Bearer header');
ok(rq.body.model==='gpt-x'&&rq.body.stream===true&&rq.body.max_tokens===undefined&&rq.body.max_completion_tokens===undefined,'model, streaming, and no token cap (servers disagree on its name)');
ok(rq.body.messages[0].role==='system'&&rq.body.messages[0].content==='SYSTEM TEXT','the system text is the first message');
const am=rq.body.messages[2]; ok(am.role==='assistant'&&am.tool_calls.length===2&&am.tool_calls[0].type==='function'&&am.tool_calls[0].function.name==='run_scenarios'&&typeof am.tool_calls[0].function.arguments==='string'&&JSON.parse(am.tool_calls[0].function.arguments).scenarios[0].id==='a','an assistant turn with calls → tool_calls with JSON-string arguments');
ok(am.tool_calls[1].function.arguments==='{}','a call whose arguments were cut off is replayed as {}');
ok(rq.body.messages[3].role==='tool'&&rq.body.messages[3].tool_call_id==='call_1'&&JSON.parse(rq.body.messages[3].content).ok===1&&rq.body.messages[4].role==='tool'&&rq.body.messages[4].tool_call_id==='call_2'&&rq.body.messages[5].role==='user','each tool result is its own tool message, in order, then the next user message');
ok(rq.body.tools.length>=8&&rq.body.tools.every(t=>t.type==='function'&&t.function.name&&t.function.parameters&&t.function.parameters.type==='object')&&rq.body.tool_choice==='auto','the tool registry is sent as functions, tool_choice auto');
ok(J(run('chatBuildRequest("openai","m","k","S",__h,false,{baseUrl:""})')).body.tool_choice==='none','allowTools=false → tool_choice none');
ok(J(run('chatBuildRequest("openai","m","","S",__h,true,{baseUrl:"http://localhost:11434/v1"})')).headers.authorization===undefined,'no key → no Authorization header');
ok(!JSON.stringify(rq.body).includes('sk-secret'),'the key is never in the body');
let threw=''; try{ run('chatBuildRequest("openai","m","k","S",__h,true,{baseUrl:"http://evil.example/v1"})'); }catch(e){ threw=e.message; } ok(/Plain http/.test(threw),'building a request for a remote http URL throws (the key is never sent)');
ok(J(run('chatBuildRequest("anthropic","m","k","S",__h,true)')).url==='https://api.anthropic.com/v1/messages'&&J(run('chatBuildRequest("gemini","m","k","S",__h,true)')).headers['x-goog-api-key']==='k','the other two providers are unchanged');
ok(J(run('chatOpenAIMessages("S",[{role:"assistant",content:"hi"}])'))[1].content==='hi','a plain assistant turn stays plain');
ctx.__long=[{role:'assistant',content:'',calls:[{id:'x'.repeat(60),name:'n',args:{}}]},{role:'tool',results:[{id:'x'.repeat(60),name:'n',response:{}}]}];
const lm=J(run('chatOpenAIMessages("S",__long)')); ok(lm[1].tool_calls[0].id.length===40&&lm[1].tool_calls[0].id===lm[2].tool_call_id&&lm[1].content===null,'ids are cut to 40 characters on both sides of a call; empty text with calls is null');

// ── streamed events ──
const ev=(o,st)=>{ ctx.__j=o; ctx.__st=st; return J(run('chatParseEvent("openai",__j,__st)')); };
let st={blocks:{},tc:{}};
ok(ev({choices:[{delta:{content:'Hel'}}]},st).text==='Hel'&&ev({choices:[{delta:{role:'assistant',content:''}}]},st).text===undefined,'text deltas (an empty first chunk adds nothing)');
ok(ev({choices:[{delta:{},finish_reason:'stop'}]},st).stop==='end','finish_reason stop → end');
ok(ev({choices:[{delta:{},finish_reason:'length'}]},st).stop==='length','length → length');
ok(ev({choices:[{delta:{},finish_reason:'content_filter'}]},st).stop==='blocked:content_filter','content_filter → blocked');
ok(ev({error:{message:'bad key'}},st).error==='bad key'&&ev({error:'plain string'},st).error==='plain string','error events (object and string forms)');
ok(Object.keys(ev({choices:[]},st)).length===0&&Object.keys(ev({usage:{}},st)).length===0,'chunks without choices (usage, keep-alive) are ignored');
st={blocks:{},tc:{}};
ev({choices:[{delta:{tool_calls:[{index:0,id:'call_a',type:'function',function:{name:'run_scenarios',arguments:''}}]}}]},st);
ev({choices:[{delta:{tool_calls:[{index:0,function:{arguments:'{"scenarios":[{"id":"a",'}}]}}]},st);
ev({choices:[{delta:{tool_calls:[{index:1,id:'call_b',function:{name:'sweep',arguments:'{"param":"age"}'}}]}}]},st);
ev({choices:[{delta:{tool_calls:[{index:0,function:{name:'run_scenarios',arguments:'"label":"x","levers":[]}]}'}}]}}]},st);
const fin=ev({choices:[{delta:{},finish_reason:'tool_calls'}]},st);
ok(fin.calls.length===2&&fin.calls[0].id==='call_a'&&fin.calls[0].name==='run_scenarios'&&fin.calls[0].args.scenarios[0].label==='x'&&fin.calls[1].name==='sweep'&&fin.calls[1].args.param==='age'&&fin.stop==='end','two parallel tool calls, one split over three chunks, are assembled at finish_reason (a repeated name is not doubled)');
ok(J(run('Object.keys(__st.tc)')).length===0,'the collector is emptied');
st={blocks:{},tc:{}}; ev({choices:[{delta:{tool_calls:[{index:0,id:'c',function:{name:'sweep',arguments:'{"par'}}]}}]},st); const cut=ev({choices:[{delta:{},finish_reason:'length'}]},st);
ok(cut.calls[0].args.__error&&cut.stop==='length','a call cut off by the length limit becomes an __error call the model can correct');
st={blocks:{},tc:{}}; ev({choices:[{delta:{tool_calls:[{function:{name:'show_chart',arguments:{chart:'assets',runs:['base']}}}]}}]},st); const obj=ev({choices:[{finish_reason:'stop',delta:{}}]},st);
ok(obj.calls&&obj.calls[0].args.chart==='assets','a server that sends the arguments as an object (some local ones do) is accepted; a missing index means 0');

// ── a whole stream through chatReadStream (events cut at awkward places, comment lines, [DONE]) ──
const enc=new TextEncoder();
function streamOf(text,cut){ const bytes=enc.encode(text); const chunks=[]; for(let i=0;i<bytes.length;i+=cut) chunks.push(bytes.slice(i,i+cut)); let k=0; return {body:{getReader(){ return {read:async()=>k<chunks.length?{done:false,value:chunks[k++]}:{done:true}}; }}}; }
const sse=o=>'data: '+JSON.stringify(o)+'\\n\\n';
const txt=': OPENROUTER PROCESSING\\n\\n'+sse({choices:[{delta:{content:'Claiming '}}]})+sse({choices:[{delta:{content:'at 70 raises it.'}}]})+sse({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\\n\\n';
ctx.__res=streamOf(txt,7); ctx.__got=[]; ctx.__cb=t=>ctx.__got.push(t);
let out=null; ctx.__done=r=>{ out=r; }; run('chatReadStream(__res,"openai",__cb).then(__done)');
setTimeout(()=>{
  ok(out&&ctx.__got.join('')==='Claiming at 70 raises it.'&&out.stop==='end'&&out.calls.length===0,'a text stream cut into 7-byte pieces, with a comment line and [DONE], reads cleanly');
  const tc=sse({choices:[{delta:{tool_calls:[{index:0,id:'c9',function:{name:'get_rows',arguments:'{"run":"base","fields":["tax"]}'}}]}}]});   // the server just ends: no finish_reason, no [DONE]
  ctx.__res=streamOf(tc,13); let out2=null; ctx.__done2=r=>{ out2=r; }; run('chatReadStream(__res,"openai",()=>{}).then(__done2)');
  setTimeout(()=>{
    ok(out2&&out2.calls.length===1&&out2.calls[0].name==='get_rows'&&out2.calls[0].args.fields[0]==='tax','a stream that ends without finish_reason still yields its tool call');
    next();
  },20);
},20);

// ── chatStreamRound / sendChat with a mocked fetch ──
function next(){
  const calls=[]; let script=[];
  ctx.fetch=(url,opt)=>{ calls.push({url,opt,body:JSON.parse(opt.body)}); const r=script.shift(); return Promise.resolve(r); };
  const okRes=text=>Object.assign(streamOf(text,40),{ok:true,status:200});
  const errRes=(status,j)=>({ok:false,status,json:async()=>j});
  // settings → prefs
  ctx.document.getElementById('chatProvider').value='openai'; ctx.document.getElementById('chatBaseUrl').value='http://localhost:11434/v1'; ctx.document.getElementById('chatModel').value='llama3.1'; ctx.document.getElementById('chatKey').value='';
  run('chatProviderShown="openai"; chatSaveFields()');
  const pr=J(run('chatLoadPrefs()')); ok(pr.provider==='openai'&&pr.baseUrl==='http://localhost:11434/v1'&&pr.models.openai==='llama3.1','the base URL, model and provider are saved in the chat prefs');
  ok(!JSON.stringify(ctx.localStorage.getItem('retirementPlannerChat_v1')).includes('sk-'),'(no key in the prefs)');
  ctx.document.getElementById('chatKey').value='sk-test-123'; ctx.document.getElementById('chatRemember').checked=false; run('chatSaveFields()');
  ok(sessionStore.retirementPlannerChatOpenAIKey_v1==='sk-test-123'&&run('chatGetKey("openai")')==='sk-test-123'&&run('chatGetKey("anthropic")')==='','the key is kept per provider in session storage under its own name');
  run('chatSetKey("openai","",false)'); ctx.document.getElementById('chatKey').value='';
  // 1) a local server, no key, a tool call then a text answer
  const calls1=sse({choices:[{delta:{tool_calls:[{index:0,id:'call_z',function:{name:'list_market_scenarios',arguments:'{}'}}]}}]})+sse({choices:[{delta:{},finish_reason:'tool_calls'}]});
  const final=sse({choices:[{delta:{content:'Three presets exist.'}}]})+sse({choices:[{delta:{},finish_reason:'stop'}]});
  script=[okRes(calls1),okRes(final)]; ctx.document.getElementById('chatInput').value='Which market scenarios are there?';
  run('chatMessages=[]'); let sent=null; ctx.__sent=()=>{ sent=true; };
  run('sendChat().then(__sent)');
  setTimeout(()=>{
    ok(sent&&calls.length===2,'sendChat ran two rounds: the tool call, then the answer ('+calls.length+')');
    ok(calls[0].url==='http://localhost:11434/v1/chat/completions'&&calls[0].opt.headers.authorization===undefined,'a local server is called without a key');
    const m2=calls[1].body.messages; ok(m2.some(m=>m.role==='assistant'&&m.tool_calls&&m.tool_calls[0].id==='call_z')&&m2.some(m=>m.role==='tool'&&m.tool_call_id==='call_z'&&/scenarios/.test(m.content)),'the second request carries the tool call and its result from the app\\'s own engine');
    const cm=J(run('chatMessages')); ok(cm[cm.length-1].role==='assistant'&&cm[cm.length-1].content==='Three presets exist.','the answer is kept in the conversation');
    // 2) a remote server with no key is refused before any request
    ctx.document.getElementById('chatBaseUrl').value='https://api.openai.com/v1'; run('chatSaveFields()'); const n0=calls.length; ctx.document.getElementById('chatInput').value='hi';
    let s2=null; ctx.__s2=()=>{ s2=true; }; run('sendChat().then(__s2)');
    setTimeout(()=>{
      ok(s2&&calls.length===n0,'a remote server without a key makes no request');
      // 3) plain http to a remote host: refused before any request, key never sent
      ctx.document.getElementById('chatBaseUrl').value='http://api.example.com/v1'; ctx.document.getElementById('chatKey').value='sk-live'; run('chatSaveFields()'); ctx.document.getElementById('chatInput').value='hi';
      let s3=null; ctx.__s3=()=>{ s3=true; }; run('sendChat().then(__s3)');
      setTimeout(()=>{
        ok(s3&&calls.length===n0,'plain http to a remote host makes no request');
        // 4) an HTTP error with the OpenAI error shape, and with a bare string
        ctx.document.getElementById('chatBaseUrl').value='https://api.openai.com/v1'; run('chatSaveFields()');
        script=[errRes(401,{error:{message:'Incorrect API key provided'}})]; ctx.document.getElementById('chatInput').value='hi'; let s4=null; ctx.__s4=()=>{ s4=true; }; run('sendChat().then(__s4)');
        setTimeout(()=>{
          ok(s4&&calls[calls.length-1].opt.headers.authorization==='Bearer sk-live','a remote https server gets the key as a Bearer token');
          ok(/API key was rejected/.test(ctx.document.getElementById('chatStatus').textContent),'a 401 becomes the friendly "key rejected" message');
          ok(J(run('chatMessages')).length===cm.length,'a failed turn is dropped so it can be resent');
          script=[errRes(404,{error:'model not found, try pulling it'})]; ctx.document.getElementById('chatInput').value='hi'; let s5=null; ctx.__s5=()=>{ s5=true; }; run('sendChat().then(__s5)');
          setTimeout(()=>{
            ok(s5&&/Model not found/.test(ctx.document.getElementById('chatStatus').textContent)&&/pulling/.test(ctx.document.getElementById('chatStatus').textContent),'a 404 with a bare-string error is read too');
            ok(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('id="chatBaseUrl"'),'index.html has the Base URL field');
            console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
          },60);
        },60);
      },60);
    },60);
  },120);
}
`;
eval(head+body);
