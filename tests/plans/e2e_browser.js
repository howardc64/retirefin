// Real-browser check of the master plan list: loads the actual app in Chromium (Chart.js and xlsx replaced by recording stand-ins: the CDN is not reachable here),
// loads a sample plan, runs the Stress test and Monte Carlo cards through their own buttons, then drives list_plans / get_plan / plShow / plDelete / the page effects.
//   node tests/plans/e2e_browser.js [appRoot]   (default: this project); Chart.js and xlsx are replaced by stand-ins, so no network is needed
const http=require('http'), fs=require('fs'), path=require('path');
let pw; try{ pw=require('playwright-core'); }catch(e){ pw=require('playwright'); }   // needs playwright(-core) and a Chromium: CHROMIUM=/path/to/chrome
const {chromium}=pw;
const APP=path.resolve(process.argv[2]||path.join(__dirname,'..','..'));
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.md':'text/markdown','.png':'image/png'};
let fails=0,n=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m); } else console.log('  ok: '+m); };
const srv=http.createServer((q,r)=>{ let f=path.join(APP,decodeURIComponent(q.url.split('?')[0])); if(f.endsWith('/')) f+='index.html';
  if(!f.startsWith(APP)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ r.writeHead(404); r.end(); return; }
  r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
const CHART_STUB=`window.Chart=class Chart{constructor(c,cfg){this.canvas=c;this.config=cfg;this.data=cfg&&cfg.data;this.options=cfg&&cfg.options;} update(){} destroy(){} resize(){} toBase64Image(){return ''} };
Chart.registry={plugins:{get(){return null}}}; Chart.register=()=>{}; Chart.defaults={font:{},plugins:{legend:{labels:{}}}}; Chart.instances={}; Chart.getChart=()=>null;`;
const XLSX_STUB='window.XLSX={utils:{},write(){},writeFile(){}};';
(async()=>{
  await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1400,height:1000}});
  const errors=[]; page.on('pageerror',e=>errors.push('pageerror: '+e.message)); page.on('console',m=>{ if(m.type()==='error'&&!/Failed to load resource/.test(m.text())) errors.push('console: '+m.text()); });   // (blocked external requests such as web fonts are the test's doing)
  await page.route('**/*',route=>{ const u=route.request().url();
    const local=u.startsWith('http://127.0.0.1')||u.startsWith('http://localhost');
    if(!local&&/cdnjs\.cloudflare\.com.*Chart\.js/i.test(u)) return route.fulfill({contentType:'text/javascript',body:CHART_STUB});
    if(!local&&/cdnjs\.cloudflare\.com.*xlsx/i.test(u)) return route.fulfill({contentType:'text/javascript',body:XLSX_STUB});
    if(!u.startsWith('http://127.0.0.1')&&!u.startsWith('http://localhost')) return route.abort();
    return route.continue(); });
  await page.goto('http://127.0.0.1:'+port+'/index.html'); await page.waitForTimeout(500);
  ok(errors.length===0,'the page loads with no script errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
  ok(await page.evaluate(()=>typeof plList==='function'&&typeof plShow==='function'&&typeof apiCall==='function'&&typeof scnDeleteOther==='function'),'plan store, plShow, tools and scnDeleteOther are all defined in the page');
  await page.evaluate(()=>loadSample('Couple_Heir.json')); await page.waitForTimeout(500);
  const ev=(fn,arg)=>page.evaluate(fn,arg);
  const call=(name,args)=>page.evaluate(([n,a])=>apiCall(n,a),[name,args||{}]);

  // scenarios: create B (a copy that spends more), go back to A
  await ev(()=>{ scnCreate(); state.living=state.living*1.3; scnSwitch('A'); });
  let keys=await ev(()=>{ plSyncAll(); return plList().map(p=>p.key); });
  ok(keys.join()==='scn:A,scn:B','after creating B the list has scn:A and scn:B');
  ok(await ev(()=>plGet('scn:B').input.state.living>plGet('scn:A').input.state.living),'scn:B holds B\'s own inputs');

  // the cards, through their own buttons
  await ev(()=>{ document.getElementById('stRunBtn').click(); });
  await page.waitForFunction(()=>typeof stResults!=='undefined'&&stResults&&stResults.results,null,{timeout:60000});
  await ev(()=>{ const t=document.getElementById('mcTrials'); if(t){ t.value='60'; t.dispatchEvent(new Event('change')); } const s=document.getElementById('mcSeed'); if(s){ s.value='7'; s.dispatchEvent(new Event('change')); } document.getElementById('mcRunBtn').click(); });
  await page.waitForFunction(()=>typeof mcResults!=='undefined'&&mcResults&&mcResults.results&&mcResults.results.length>=50,null,{timeout:120000});
  await ev(()=>{ document.getElementById('stRunMcBtn').click(); });
  await page.waitForFunction(()=>stResults&&stResults.mc&&stResults.mc.rows&&stResults.mc.rows.every(r=>r.res.length>=50),null,{timeout:240000});
  let r=await call('list_plans',{}); const L=r.response.plans, ks=L.map(p=>p.ref);
  ok(!r.isError&&['scn:A','scn:B','st:lost','st:stag','st:y1966'].every(k=>ks.includes(k)),'list_plans (in the page) lists scenarios and the Stress card rows: '+ks.length+' plans');
  ok(ks.some(k=>/^mc:trial:\d+$/.test(k))&&ks.some(k=>/^stmc:\w+:\d+$/.test(k)),'…and exemplar trials of Monte Carlo and stress + Monte Carlo');
  ok(L.every(p=>!p.stale&&p.kpis&&p.kpis.finalTotal>0),'all current, all with headline numbers');
  ok(r.response.monteCarloRuns.some(g=>g.group==='mc:run'&&g.trials>=50),'Monte Carlo runs listed');

  // show in the charts
  r=await ev(()=>plShow('scenario B')); ok(r.ok&&await ev(()=>scnActive==='B'),'plShow("scenario B") switches the screen to B');
  r=await ev(()=>plShow('scenario A')); ok(r.ok&&await ev(()=>scnActive==='A'),'plShow("scenario A") switches back');
  await ev(()=>{ if(typeof mcTrialExit==='function'&&mcTrialView) mcTrialExit(); });
  r=await ev(()=>plShow('stress Lost Decade')); ok(r.ok&&await ev(()=>!!mcTrialView&&mcTrialView.view==='D'),'plShow("stress Lost Decade") opens the D view');
  r=await ev(()=>plShow('mc trial 3')); const t3=await ev(()=>({v:!!mcTrialView,trial:mcTrialView&&mcTrialView.trial,view:mcTrialView&&mcTrialView.view}));
  ok(r.ok&&t3.v&&t3.trial===3,'plShow("mc trial 3") loads Monte Carlo trial 3 (view '+t3.view+')');
  const st7=await ev(()=>{ const row=stResults.mc.rows.find(x=>x.stressDef); return row?row.id:null; });
  r=await ev(id=>plShow('stmc:'+id+':5'),st7); const t5=await ev(()=>({trial:mcTrialView&&mcTrialView.trial,view:mcTrialView&&mcTrialView.view}));
  ok(r.ok&&t5.trial===5&&/^[EF]$/.test(t5.view),'plShow("stmc:'+st7+':5") loads that trial in the '+t5.view+' view');
  r=await ev(()=>plShow('stmc:none:5')); ok(!r.ok&&/no stress/.test(r.why),'the no-stress row is refused with a reason');
  await ev(()=>{ mcTrialExit(); });
  ok(await ev(()=>!mcTrialView||!mcTrialView.view),'Back to plan clears the trial view');

  // the effect paths: chat and the live bridge
  const note=await ev(()=>chatApplyEffects([{type:'showPlan',ref:'st:stag'}])); ok(/Showing/.test(note[0]),'chat effect showPlan: '+note[0]);
  const lb=await ev(()=>LB_EFFECTS.showPlan.apply({ref:'scn:A'})); ok(lb.status==='applied','bridge effect showPlan applies');
  ok((await ev(()=>LB_EFFECTS.showPlan.apply({ref:'nope nope'}))).status==='error','bridge effect showPlan reports a ref it cannot find');
  await ev(()=>{ if(mcTrialView) mcTrialExit(); });

  // a tool asks for a trial by number, then the page shows it
  r=await call('get_plan',{ref:'mc trial 41',detail:'inputs'}); ok(!r.isError&&r.response.inputs.overlay.trial===41&&r.response.inputs.overlay.seed===7,'get_plan inputs for a trial asked by number: seed 7, trial 41');

  // the Plans tab in the LLM card
  await ev(()=>{ openLlmCard('plans'); });
  ok(await ev(()=>/Scenario B/.test(document.getElementById('llmCard').innerHTML)&&/llmPlanDelete/.test(document.getElementById('llmCard').innerHTML)),'Plans tab shows the plans with delete buttons');
  await ev(()=>{ closeLlmCard(); });

  // delete: the user's own path, then the tool's refusal
  r=await call('delete_plan',{ref:'scenario B'}); ok(r.isError,'a tool cannot delete the user\'s scenario');
  r=await ev(()=>plDelete('scn:A')); ok(!r.ok&&/on screen/.test(r.why),'the scenario on screen cannot be deleted: '+r.why);
  r=await ev(()=>plDelete('scn:B')); ok(r.ok&&await ev(()=>scnOrder.join()==='A'&&!scnSnaps.B&&plGet('scn:B')===null),'the user can delete scenario B: it is gone from the scenario set and from the plan list');
  ok(await ev(()=>{ plSyncAll(); return plList().filter(p=>p.input.baseKey).every(p=>!plIsStale(p)); }),'deleting B did not make the A-based plans stale');
  r=await ev(()=>plDelete('st:stag')); ok(r.ok&&!(await ev(()=>plSyncAll()&&plGet('st:stag'))),'a stress row can be hidden from the plan list');
  ok(await ev(()=>stResults.results.some(x=>x.id==='stag')),'…while the Stress card still shows it');
  // edit the plan: derived plans go stale; show refuses
  await ev(()=>{ state.living+=1000; recompute&&recompute(); });
  r=await call('list_plans',{}); ok(r.response.plans.filter(p=>p.stale).length>=3,'after an edit the derived plans are stale ('+r.response.plans.filter(p=>p.stale).length+')');
  r=await ev(()=>plShow('st:lost')); ok(!r.ok&&/edited/.test(r.why),'a stale plan is not shown: '+r.why);

  ok(errors.length===0,'no script errors during the whole run'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
  await browser.close(); srv.close();
  console.log(fails?('\n'+fails+' of '+n+' FAILED'):('\nall '+n+' passed')); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(2); });
