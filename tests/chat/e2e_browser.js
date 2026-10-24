// End-to-end browser test of the chat's scenario tools: real Chromium, the real app, a SCRIPTED Gemini / Anthropic API (no key, no network).
//   needs (not part of the app): npm i playwright-core chart.js@4.4.1   in tests/chat/   and a Chromium
//   node tests/chat/e2e_browser.js [appRoot] [screenshotDir]      env: CHROMIUM=/path/to/chrome  CHARTJS_UMD=/path/to/chart.umd.js
const http=require('http'), fs=require('fs'), path=require('path');
const {chromium}=require('playwright-core');
const APP=path.resolve(process.argv[2]||path.join(__dirname,'..','..'));
const OUT=process.argv[3]||require('os').tmpdir();
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.md':'text/markdown'};
let fails=0,n=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m);} else console.log('  ok: '+m); };

const srv=http.createServer((q,r)=>{ let f=path.join(APP,decodeURIComponent(q.url.split('?')[0])); if(f.endsWith('/')) f+='index.html';
  if(!f.startsWith(APP)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ r.writeHead(404); r.end(); return; }
  r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(r); });

// ── scripted APIs ──
const sse=(res,events,eol='\r\n')=>{ res.status=200; res.headers={'content-type':'text/event-stream'}; res.body=events.map(e=>'data: '+JSON.stringify(e)+eol+eol).join(''); return res; };
const gem=(parts,fin)=>({candidates:[{content:{role:'model',parts},finishReason:fin||undefined}]});
const geminiCalls=[]; let g429=0;
function geminiHandler(body, forceMode){
  geminiCalls.push(body);
  const last=body.contents[body.contents.length-1], lastText=last.parts.map(p=>p.text||'').join('');
  const hasResp=last.parts.some(p=>p.functionResponse);
  if(hasResp){
    const name=last.parts[0].functionResponse.name;
    if(name==='sweep') return [gem([{text:'Claiming later raises the guaranteed income, '}]),gem([{text:'but the best age depends on how long you live.'}],'STOP')];
    return [gem([{text:'Person 1 already claims at 70, so that lever changed nothing. '}]),gem([{text:'The Roth conversion is the real difference: see the table above.'}],'STOP')];
  }
  if(/sweep/i.test(lastText)) return [gem([{functionCall:{name:'sweep',args:{template:{lever:'ssClaimAge',person:2},param:'age',values:[62,64,66,68,70],metric:'finalTotal'}},thoughtSignature:'SIG_SWEEP'}],'STOP')];
  if(/rate/i.test(lastText)) return 'RATE';
  return [gem([{text:'Let me run that. '}]),gem([{functionCall:{name:'run_scenarios',args:{scenarios:[
    {id:'S1',label:'SS at 70 + $60k conversions',levers:[{lever:'ssClaimAge',person:1,age:70},{lever:'rothConversion',person:1,mode:'fixed',amount:60000},{lever:'returns',deltaPct:-2}]},
    {id:'S2',label:'Living +15%',levers:[{lever:'living',pctChange:15}]}],charts:['assets','annualTax']}},thoughtSignature:'SIG_RUN'}],'STOP')];
}
const anthCalls=[];
function anthropicHandler(body){
  anthCalls.push(body);
  const last=body.messages[body.messages.length-1];
  if(Array.isArray(last.content)&&last.content[0].type==='tool_result') return [{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'Stress hurts: see the chart.'}},{type:'message_delta',delta:{stop_reason:'end_turn'}}];
  const json=JSON.stringify({scenarios:[{id:'M',label:'Lost Decade',levers:[{lever:'marketStress',kind:'lostDecade',startsAt:'now'}]}],charts:['assets']});
  return [{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'toolu_01',name:'run_scenarios'}},
    {type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:json.slice(0,40)}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:json.slice(40)}},
    {type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'tool_use'}}];
}

(async()=>{
  await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const base='http://127.0.0.1:'+srv.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); const page=await ctx.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
  await page.route('**/*',async route=>{
    const u=route.request().url();
    if(u.startsWith(base)) return route.continue();
    if(u.includes('Chart.js')) return route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(process.env.CHARTJS_UMD||path.join(__dirname,'node_modules/chart.js/dist/chart.umd.js'))});
    if(u.includes('xlsx')) return route.fulfill({status:200,contentType:'text/javascript',body:'window.XLSX=undefined;'});
    if(u.includes('generativelanguage.googleapis.com')){
      const body=JSON.parse(route.request().postData()); const ev=geminiHandler(body);
      if(ev==='RATE'){ if(g429===0){ g429=1; return route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:{code:429,message:'You exceeded your current quota. Please retry in 1.2s.',status:'RESOURCE_EXHAUSTED'}})}); } g429=2; return route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify(gem([{text:'Retried fine.'}],'STOP'))+'\r\n\r\n'}); }
      return route.fulfill({status:200,contentType:'text/event-stream',body:ev.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')});
    }
    if(u.includes('api.anthropic.com')){ const ev=anthropicHandler(JSON.parse(route.request().postData())); return route.fulfill({status:200,contentType:'text/event-stream',body:ev.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join('')}); }
    return route.abort();
  });
  await page.goto(base+'/index.html'); await page.waitForFunction(()=>typeof state!=='undefined'&&document.getElementById('chatPanel'));
  // load a sample plan, set a key
  const plan=fs.readFileSync(path.join(APP,'Samples/Couple_Heir.json'),'utf8');
  await page.evaluate(t=>{ applyLoadedFileText(t); },plan);
  const keyBefore=await page.evaluate(()=>specScenarioKey()), stateBefore=await page.evaluate(()=>JSON.stringify(state));

  console.log('\n== Gemini: run_scenarios');
  ok(await page.evaluate(()=>chatLoadPrefs().provider)==='gemini','Gemini is the default provider');
  await page.click('#chatToggle'); await page.fill('#chatKey','AIzaTEST'); await page.dispatchEvent('#chatKey','change'); await page.fill('#chatInput','What if Person 1 claims Social Security at 70, converts 60k a year, and returns are 2 points lower? Also living +15%.');
  await page.click('#chatSend');
  try{ await page.waitForFunction(()=>document.querySelectorAll('.chat-card').length>=3&&!chatAbort,null,{timeout:12000}); }
  catch(e){ console.log('DEBUG status:',await page.evaluate(()=>document.getElementById('chatStatus').textContent),'| msgs:',await page.evaluate(()=>JSON.stringify(chatMessages).slice(0,600)),'| errors:',errors.join(' || '),'| gemini calls',geminiCalls.length); await page.screenshot({path:OUT+'/debug.png'}); process.exit(3); }
  ok(geminiCalls.length===2,'two API requests: the call and the answer (got '+geminiCalls.length+')');
  const r1=geminiCalls[0]; ok(r1.tools&&r1.tools[0].functionDeclarations.map(d=>d.name).join()==='run_scenarios,sweep,show_chart,get_rows','request 1 declares the four tools'); ok(r1.toolConfig.functionCallingConfig.mode==='AUTO','tool mode AUTO');
  const r2=geminiCalls[1], modelTurn=r2.contents.find(c=>c.role==='model');
  ok(modelTurn&&modelTurn.parts.some(p=>p.functionCall&&p.thoughtSignature==='SIG_RUN'),'request 2 replays the function call with its thoughtSignature');
  const fr=r2.contents[r2.contents.length-1].parts[0].functionResponse; ok(fr&&fr.name==='run_scenarios'&&fr.response.scenarios.length===2,'request 2 carries the functionResponse with 2 scenarios');
  ok(fr.response.scenarios[0].levers.find(l=>l.lever==='ssClaimAge').status==='ignored','response flags the already-claiming lever as ignored');
  ok(fr.response.scenarios[0].levers.find(l=>l.lever==='rothConversion').status==='applied','conversion lever applied (fixed mode set with the amount)');
  ok(JSON.stringify(fr.response).length<9000,'tool response is compact ('+JSON.stringify(fr.response).length+' chars)');
  const cards=await page.evaluate(()=>({n:document.querySelectorAll('.chat-card').length,charts:chatCards.filter(c=>c.chart).length,kpi:document.querySelector('.cc-kpis').innerText,changes:document.querySelector('.cc-changes').innerText,titles:[...document.querySelectorAll('.cc-title')].map(e=>e.textContent),note:document.querySelector('.cc-note').textContent}));
  ok(cards.n===3&&cards.charts===2,'3 cards: summary + 2 charts drawn with Chart.js');
  console.log('KPI TEXT:',JSON.stringify(cards.kpi).slice(0,400));
  ok(/your plan/i.test(cards.kpi)&&/assets at the end/i.test(cards.kpi)&&/lifetime federal/i.test(cards.kpi),'KPI table lists your plan and the headline numbers');
  ok(/Ignored: .*already claims at 70/.test(cards.changes),'changes list shows "Ignored: already claims at 70"');
  ok(/Hypothetical/.test(cards.note),'hypothetical label present');
  ok(await page.evaluate(()=>specScenarioKey())===keyBefore&&await page.evaluate(()=>JSON.stringify(state))===stateBefore,'live plan identical after tool runs');
  const bubbleTexts=await page.evaluate(()=>[...document.querySelectorAll('.chat-assistant')].map(e=>e.innerText));
  ok(bubbleTexts.some(t=>/Let me run that/.test(t))&&bubbleTexts.some(t=>/already claims at 70/.test(t)),'assistant text streamed before and after the tool call');
  ok(await page.evaluate(()=>document.querySelectorAll('.chat-tool').length)===1,'tool note shown in the transcript');
  await page.screenshot({path:OUT+'/shot1_cards.png'}); await page.locator('.cc-summary').screenshot({path:OUT+'/shot_summary.png'});

  console.log('\n== wide, enlarge, PNG');
  await page.click('#chatWide'); ok(await page.evaluate(()=>document.getElementById('chatPanel').classList.contains('wide')),'wide mode on');
  await page.waitForTimeout(400); await page.screenshot({path:OUT+'/shot2_wide.png'});
  await page.click('.cc-chart .cc-btn[title="Enlarge"]'); ok(await page.evaluate(()=>!!chatZoom&&!!chatZoom.chart),'enlarge opens a large chart'); await page.waitForTimeout(400); await page.screenshot({path:OUT+'/shot3_zoom.png'}); await page.keyboard.press('Escape'); ok(await page.evaluate(()=>chatZoom===null),'Escape closes it');
  const dl=page.waitForEvent('download'); await page.click('.cc-chart .cc-btn[title="Download as an image"]'); const d=await dl; ok(/\.png$/.test(d.suggestedFilename()),'PNG download: '+d.suggestedFilename());

  console.log('\n== hand-off buttons');
  await page.click('.cc-acts .btn:has-text("Save as Scenario")');
  ok(await page.evaluate(()=>scnOrder.length)===2&&await page.evaluate(()=>scnActive)==='A','Save as Scenario adds B without switching');
  ok(await page.evaluate(()=>JSON.stringify(state))===stateBefore,'live plan still unchanged after Save');
  const diffs=await page.evaluate(()=>scnDifferences().map(d=>d.path+': '+d.vals.join(' | ')));
  ok(diffs.some(x=>/convMode|conv:|\.conv/.test(x)),'saved scenario differs by the conversion fields: '+diffs.slice(0,4).join('; '));
  await page.selectOption('.cc-pick','r2').catch(()=>{});
  await page.click('.cc-acts .btn:has-text("Open in main charts")');
  ok(await page.evaluate(()=>scnActive)==='C','Open in main charts adds C and switches to it');
  ok(!(await page.evaluate(()=>document.getElementById('chatPanel').classList.contains('open'))),'chat closes so the main charts are visible');
  await page.waitForTimeout(900); await page.screenshot({path:OUT+'/shot4_main.png'});
  const mainFin=await page.evaluate(()=>{ const m=mcMeasure(lastProjection,{pass:[0,0],ltcYears:[0,0]}); return Math.round(m.estateFin+m.estateRe); });
  const cardFin=await page.evaluate(()=>{ const r=Object.values(chatRuns).find(r=>r.sid==='S2'); return r.kpis.finalTotal; });
  ok(mainFin===cardFin,'main charts show the same final assets as the card ('+mainFin+' = '+cardFin+')');
  await page.evaluate(()=>scnSwitch('A')); await page.click('#chatToggle');

  console.log('\n== stale badge');
  await page.evaluate(()=>{ state.living+=1000; recompute(); }); await page.waitForTimeout(600);
  ok(await page.evaluate(()=>chatCards.every(c=>!c.badge.hidden)),'every card shows "plan edited since" after an edit');
  await page.evaluate(()=>{ state.living-=1000; recompute(); }); await page.waitForTimeout(600);
  ok(await page.evaluate(()=>chatCards.every(c=>c.badge.hidden)),'badge clears when the plan matches again');

  console.log('\n== second question: sweep + history');
  await page.fill('#chatInput','sweep the claim age for Person 2'); await page.click('#chatSend');
  try{ await page.waitForFunction(()=>chatCards.length>=4&&!chatAbort,null,{timeout:10000}); }catch(e){ console.log('DEBUG sweep status:',await page.evaluate(()=>document.getElementById('chatStatus').textContent),'| last msgs:',await page.evaluate(()=>JSON.stringify(chatMessages.slice(-3)).slice(0,900)),'| errors:',errors.join(' || ')); process.exit(3); }
  const sweepReq=geminiCalls[geminiCalls.length-1]; const sweepFR=sweepReq.contents[sweepReq.contents.length-1].parts[0].functionResponse;
  ok(sweepFR.name==='sweep'&&sweepFR.response.results.length===5,'sweep returned 5 results');
  const firstTool=sweepReq.contents.find(c=>c.parts.some(p=>p.functionResponse&&p.functionResponse.name==='run_scenarios'));
  ok(!!firstTool,'earlier turn kept with its tool result (calls and results stay paired)');
  const sweepCard=await page.evaluate(()=>{ const c=chatCards[chatCards.length-1]; return {t:c.data.type,pts:c.data.datasets[0].data.length,title:c.data.title}; });
  ok(sweepCard.t==='sweep'&&sweepCard.pts===5,'sweep chart card with 5 points: '+sweepCard.title);
  await page.screenshot({path:OUT+'/shot5_sweep.png'});

  console.log('\n== free-tier rate limit retry');
  await page.fill('#chatInput','rate test'); await page.click('#chatSend');
  await page.waitForFunction(()=>[...document.querySelectorAll('.chat-assistant')].some(e=>/Retried fine/.test(e.innerText)),null,{timeout:15000});
  ok(g429===2,'429 with "retry in 1.2s" was waited out and retried once');

  console.log('\n== Anthropic path (streamed tool_use JSON)');
  await page.evaluate(()=>{ clearChat(); toggleChatSettings(true); }); await page.selectOption('#chatProvider','anthropic'); await page.fill('#chatKey','sk-ant-TEST'); await page.dispatchEvent('#chatKey','change');
  await page.fill('#chatInput','lost decade please'); await page.click('#chatSend');
  await page.waitForFunction(()=>chatCards.length>=2&&!chatAbort,null,{timeout:20000});
  const a2=anthCalls[1]; ok(a2.tools&&a2.tool_choice.type==='auto'&&a2.tools[0].input_schema,'Anthropic request has tools + input_schema');
  const asst=a2.messages.find(m=>m.role==='assistant'); ok(asst.content.some(b=>b.type==='tool_use'&&b.id==='toolu_01'&&b.input.scenarios[0].levers[0].kind==='lostDecade'),'partial JSON pieces were assembled into the tool_use input');
  const tr=a2.messages[a2.messages.length-1].content[0]; ok(tr.type==='tool_result'&&tr.tool_use_id==='toolu_01'&&!tr.is_error,'tool_result paired by id');
  ok(/Market stress: Lost Decade/.test(await page.evaluate(()=>document.querySelector('.cc-changes').innerText)),'market-stress card notes it is a simulation overlay');
  const dis=await page.evaluate(()=>[...document.querySelectorAll('.cc-acts .btn')].filter(b=>/Save|Open/.test(b.textContent)).every(b=>b.disabled));
  ok(dis,'Save / Open are disabled for a market-stress run');
  await page.screenshot({path:OUT+'/shot6_anthropic.png'});

  console.log('\n== clear');
  await page.evaluate(()=>clearChat()); ok(await page.evaluate(()=>chatCards.length===0&&Object.keys(chatRuns).length===0&&document.querySelectorAll('canvas.chartjs-render-monitor, .chat-card').length===0),'clear destroys cards and forgets runs');
  const real=errors.filter(e=>!/Failed to load resource|fonts|ERR_FAILED|net::/.test(e)); ok(real.length===0,'no page errors'+(real.length?': '+real.join(' | '):''));
  await browser.close(); srv.close();
  console.log('\n'+(n-fails)+'/'+n+' checks passed'); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(2); });
