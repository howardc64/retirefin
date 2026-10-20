'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / STRESS TEST PANEL — one card under the Monte Carlo card: choose the scenarios, press Run, read a table (does the money last, when
// does it run out, how far the invested assets fall) (every scenario can also be loaded into the chart grid with the D button of the Stress test card, which shows the detail).
// Deterministic and instant (a handful of projections), so unlike the Monte Carlo card it has no progress bar. Reads `state` only through
// compute/stressTest.js. Settings live in their own localStorage key (not in `state`), like the Monte Carlo card's.
// ═══════════════════════════════════════════════════════════════
const ST_STORE_KEY='retirementPlannerStress_v1';
let stCfg=null, stResults=null, stStateAtRun=null;
const stEl=id=>document.getElementById(id);
const stMoney=v=>v==null||!isFinite(v)?'–':(Math.abs(v)>=1e6?'$'+(v/1e6).toFixed(2)+'M':'$'+Math.round(v/1000)+'k');

function stLoadCfg(){
  const d=JSON.parse(JSON.stringify(ST_DEFAULTS)); d.hidden=true;   // starts collapsed; a saved choice still wins
  try{ const s=JSON.parse(localStorage.getItem(ST_STORE_KEY)||'null'); if(s) for(const k in d){ if(s[k]!==undefined) d[k]=(d[k]&&typeof d[k]==='object')?Object.assign(d[k],s[k]):s[k]; } }catch(e){}
  return d;
}
function stSaveCfg(){ try{ localStorage.setItem(ST_STORE_KEY,JSON.stringify(stCfg)); }catch(e){} }

function buildStressPanel(){
  const host=stEl('stressPanel'); if(!host) return;
  stCfg=stLoadCfg();
  const num=(id,label,val,min,max,step)=>'<label class="mc-f">'+label+'<input type="number" id="'+id+'" value="'+val+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';
  const grp=(id,title,on,body)=>'<fieldset class="mc-grp" id="'+id+'Grp"><legend><label><input type="checkbox" id="'+id+'"'+(on?' checked':'')+'> '+title+'</label></legend><div class="mc-row">'+body+'</div></fieldset>';
  const chk=(id,label,on)=>'<label class="mc-f mc-chk"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+'>'+label+'</label>';
  host.innerHTML=
    '<div class="mc-head"><div class="panel-title">Stress tests <small>(sequence-of-returns and inflation shocks)</small></div><label class="hide-cb"><input type="checkbox" id="stHide"'+(stCfg.hidden?' checked':'')+' autocomplete="off">Hide</label></div>'+
    '<div id="stBody"><p class="mc-note">Forces a fixed, historical-style bad stretch onto your plan on the first day of retirement, then lets the plan run as entered (your passing ages, Social Security, Long Term Care and taxes are unchanged). '+
      'Unlike the Monte Carlo card these are single, repeatable scenarios: they show whether the plan survives <i>that</i> decade, not how likely it is. Results are in today\'s $.</p>'+
    '<div class="mc-grid">'+
      '<fieldset class="mc-grp"><legend>When the shock starts</legend><div class="mc-row"><label class="mc-f">Starts<select id="stStartMode"><option value="retire">Day 1 of retirement (first year without wages)</option><option value="now">Today</option><option value="custom">Years from now…</option></select></label>'+
        '<span id="stYearsWrap">'+num('stYears','Years from now',stCfg.start.years,0,60,1)+'</span>'+num('stShare','Share of assets hit %',stCfg.equityShare,0,100,5)+
        '<div class="mc-src">Each portfolio and IRA: this % earns the scenario\'s stock return, the rest keeps the plan\'s own return. Property is unchanged.</div></div></fieldset>'+
      grp('stLost','Lost Decade <small>(2000–2009 actual S&amp;P 500)</small>',stCfg.lost.enabled,chk('stLostInf','Also use that decade\'s actual inflation',stCfg.lost.actualInflation))+
      grp('stStag','Stagflation <small>(flat stocks, rising inflation)</small>',stCfg.stag.enabled,num('stStagY','Years',stCfg.stag.years,1,30,1)+num('stStagEq','Stock return % / yr',stCfg.stag.eqReturn,-20,20,0.5)+num('stStagI0','Inflation, first year %',stCfg.stag.inflStart,0,30,0.5)+num('stStagI1','Inflation, last year %',stCfg.stag.inflEnd,0,30,0.5))+
      grp('stY66','1966 retiree <small>(1966–1981 actual stocks and CPI)</small>',stCfg.y1966.enabled,'<div class="mc-src">16 years of the worst starting date for a retiree: two bear markets inside a decade of rising inflation.</div>')+
      grp('stMed','Late-life medical shock <small>(liquidity and tax test)</small>',stCfg.med.enabled,
        '<label class="mc-f">Whose age<select id="stMedWho"></select></label>'+num('stMedAge','From age',stCfg.med.age,50,110,1)+num('stMedYears','For (years)',stCfg.med.years,1,15,1)+num('stMedCost','Cost per year ($, today\'s)',stCfg.med.cost,0,2000000,10000)+
        chk('stMedOrd','Also compare four withdrawal orders',stCfg.med.orders)+'<div class="mc-src">An extra itemized medical cost on top of any Long Term Care card, paid from the accounts in the plan\'s withdrawal order. Shows what it forces you to sell, the capital gains and tax it triggers, and how that changes with the order. Independent of the market scenarios above; tick only this one to run it alone.</div>')+
    '</div>'+
    '<div class="mc-row mc-run"><button type="button" class="btn btn-primary" id="stRunBtn">Run stress tests</button><span id="stNote" class="mc-prog"></span></div>'+
    '<div id="stStale" class="mc-stale" style="display:none">The plan or settings changed since this run. Run again to refresh.</div>'+
    '<div id="stOut" style="display:none"><div id="stSummary"></div><div class="mc-note" id="stCaveats"></div></div></div>';
  const applyHide=()=>{ host.classList.toggle('mc-collapsed',stEl('stHide').checked); };
  stEl('stHide').addEventListener('change',()=>{ stCfg.hidden=stEl('stHide').checked; stSaveCfg(); applyHide(); }); applyHide();
  stEl('stStartMode').value=stCfg.start.mode; stSyncMedWho(stCfg.med.person);
  const syncMode=()=>{ stEl('stYearsWrap').style.display=stEl('stStartMode').value==='custom'?'':'none'; };
  stEl('stStartMode').addEventListener('change',syncMode); syncMode();
  ['stLost','stStag','stY66','stMed'].forEach(id=>{ const el=stEl(id), sync=()=>stEl(id+'Grp').classList.toggle('mc-off',!el.checked); el.addEventListener('change',sync); sync(); });
  if(typeof cardStackDecorate==='function') cardStackDecorate();   // draggable title bar (display/cardStack.js)
  stEl('stRunBtn').onclick=stStart;
  host.addEventListener('input',()=>{ if(stResults) stMarkStale(); });
}

// "Whose age" choices carry the names entered on the plan (Person 1 / Person 2 only when no name is entered); a single filer has just the one. Called when the card is built and after every
// recompute (app.js → stMarkStale), so a name typed or a plan loaded later shows up here; the choice is kept.
function stSyncMedWho(want){
  const sel=stEl('stMedWho'); if(!sel||typeof state==='undefined'||!state) return;
  const n=state.filingStatus==='married'?2:1, cur=want!=null?(want===1?1:0):(parseInt(sel.value,10)===1?1:0);
  const names=(state.people||[]).slice(0,n).map((p,i)=>displayPersonName(p,i)), sig=names.join('\u0001');
  if(sel.dataset.sig!==sig){ sel.innerHTML=names.map((nm,i)=>'<option value="'+i+'">'+nm.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</option>').join(''); sel.dataset.sig=sig; }
  sel.value=String(cur<names.length?cur:0);
}
function stReadCfg(){ stFormCfg(stCfg); stSaveCfg(); return stCfg; }
// what a run depends on: the plan (without its display-only `ui` block) and the card's scenario settings (not its Hide state)
const stKey=c=>JSON.stringify(Object.assign({},state,{ui:null}))+'|'+JSON.stringify(Object.assign({},c,{hidden:undefined}));

function stStart(){
  const cfg=JSON.parse(JSON.stringify(stReadCfg()));
  if(!(cfg.lost.enabled||cfg.stag.enabled||cfg.y1966.enabled||cfg.med.enabled)){ stEl('stNote').textContent='Tick at least one scenario.'; return; }
  stEl('stNote').textContent='';
  stResults=Object.assign(stRunAll(cfg),{cfg, planKey:JSON.stringify(Object.assign({},state,{ui:null}))}); stStateAtRun=stKey(stCfg);
  stEl('stStale').style.display='none';
  stRender();
}

// Called by the D button (mcPanel.js): make sure there are stress results for the plan as it is now (runs them with the card's current settings if not).
function stEnsureFresh(){ if(!stResults||stResults.planKey!==JSON.stringify(Object.assign({},state,{ui:null}))) stStart(); }

function stRender(){
  const R=stResults, cfg=R.cfg, base=R.base;
  stEl('stOut').style.display='';
  const age=v=>v==null?'–':Math.round(v);
  const startTxt=R.startCovered?'age '+R.startAge.toFixed(0)+(cfg.start.mode==='retire'?' (first year without wages)':''):'beyond the end of the projection, so the plan is unaffected';
  const rows=[{label:'Plan as entered', m:base, estate:R.baseEstate, atEnd:null, planAtEnd:null, low:null, gapYears:base.failK>=0?0:0, years:0, plan:true}].concat(R.results);
  const verdict=r=>r.m.failK<0?'<span class="st-ok">funded to the end</span>':'<span class="st-bad">money runs out at age '+age(r.m.failAge)+'</span>';
  const tr=rows.map((r,ri)=>'<tr'+(r.plan?' class="st-plan"':'')+'><td><b>'+r.label+'</b>'+(r.plan?'':' <button type="button" class="btn st-show" onclick="mcLoadStress('+(ri-1)+')" title="Load this stress test into the charts (the D button of the Stress test card)">Show in charts</button>')+(r.note?'<div class="st-note">'+r.note+'</div>':'')+'</td><td>'+verdict(r)+'</td>'+
    '<td>'+(r.plan?'–':(r.m.failK<0?'–':stMoney(r.m.shortfall)+' <small>('+r.gapYears+' yr'+(r.gapYears===1?'':'s')+')</small>'))+'</td>'+
    '<td>'+(r.atEnd==null?'–':stMoney(r.atEnd)+' <small>('+(r.planAtEnd>0?Math.round(r.atEnd/r.planAtEnd*100)+'% of plan':'–')+')</small>')+'</td>'+
    '<td>'+(r.plan?'–':(r.low==null?'–':stMoney(r.low)+' <small>at '+age(r.lowAge)+'</small>'))+'</td>'+
    '<td>'+stMoney(r.estate)+(r.plan?'':' <small>('+(R.baseEstate>0?Math.round(r.estate/R.baseEstate*100)+'% of plan':'–')+')</small>')+'</td></tr>').join('');
  stEl('stSummary').innerHTML='<p class="mc-note">Shock starts '+startTxt+'. '+(cfg.equityShare<100?cfg.equityShare+'% of each portfolio / IRA takes the scenario\'s stock return; the rest keeps the plan\'s own return.':'Every portfolio and IRA takes the scenario\'s stock return.')+'</p>'+
    '<table class="mc-tbl mc-ftbl st-tbl"><tr><th>Scenario</th><th>Does the money last?</th><th>Unpaid expenses</th><th>Invested assets at the end of the shock</th><th>Lowest invested assets after the start</th><th>Assets in the last projected year</th></tr>'+tr+'</table>';
  // Spending guardrails (Expenses card): where each scenario trips the first cut, how far spending has to fall, and what the same scenario does without guardrails.
  if(R.results.some(r=>r.guard)){
    const out=r=>r.off.failAge==null?'<span class="st-ok">funded</span>':'<span class="st-bad">runs out at '+age(r.off.failAge)+'</span>';
    const gr=R.results.filter(r=>r.guard).map(r=>{ const g=r.guard;
      return '<tr><td><b>'+r.label+'</b></td><td>'+out(g)+'</td><td>'+(r.m.failK<0?'<span class="st-ok">funded</span>':'<span class="st-bad">runs out at '+age(r.m.failAge)+'</span>')+'</td>'+
        '<td>'+(g.firstCutAge==null?'no cut needed':'age '+age(g.firstCutAge))+'</td><td>'+(g.firstCutBal==null?'–':stMoney(g.firstCutBal))+'</td>'+
        '<td>'+(g.cutYears?Math.round((1-g.minMult)*100)+'% of discretionary':'–')+'</td><td>'+(g.cutYears?g.cutYears+' yr'+(g.cutYears===1?'':'s'):'–')+'</td><td>'+(g.cutTotal>0?stMoney(g.cutTotal):'–')+'</td></tr>'; }).join('');
    stEl('stSummary').innerHTML+='<p class="mc-note"><b>Spending guardrails are on.</b> The table above already includes their cuts. The first cut fires when the invested balance at the start of a year falls below the tripwire for that year\'s spending; the balance shown is the one that tripped it.</p>'+
      '<table class="mc-tbl mc-ftbl st-tbl"><tr><th>Scenario</th><th>Without guardrails</th><th>With guardrails</th><th>First cut</th><th>Invested balance that tripped it</th><th>Deepest cut</th><th>Years with a cut</th><th>Spending given up (today\'s $, total)</th></tr>'+gr+'</table>';
  }
  if(R.med) stEl('stSummary').innerHTML+=stMedHtml(R.med,cfg);
  stEl('stCaveats').innerHTML='The <b>D &middot; Stress Test</b> button of the Stress test card (top of the charts) cycles through these scenarios in the charts. '+'Data: S&amp;P 500 total return (Damodaran, NYU Stern) and CPI-U December-to-December change (BLS). Social Security COLA, living expenses and the tax brackets are assumed to track inflation, so a higher price level hurts through the assets (nominal returns below inflation) and through anything fixed in nominal dollars: a pension without a COLA, un-indexed tax thresholds, cost basis. '+
    'Lifespans, Long Term Care and the rest of the plan are as entered; compare with the Monte Carlo card for likelihood.';
}

// A different plan was loaded (or Reset to defaults): drop the old results. `settings` also restores the card's own defaults.
function stResetCard(settings){
  stResults=null; stStateAtRun=null;
  if(settings){ try{ localStorage.removeItem(ST_STORE_KEY); }catch(e){} buildStressPanel(); if(typeof cardStackReset==='function') cardStackReset(); return; }
  ['stOut','stStale'].forEach(id=>{ const e=stEl(id); if(e) e.style.display='none'; });
  ['stSummary','stCaveats'].forEach(id=>{ const e=stEl(id); if(e) e.innerHTML=''; });
}
// Called from recompute() (app.js) and on any edit inside the card: flag results that no longer match the plan or the settings.
function stPersonName(i){ const n=state.filingStatus==='married'?2:1, k=(i===1&&n>1)?1:0, p=(state.people||[])[k]; return String(displayPersonName(p,k)).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function stMarkStale(){ stSyncMedWho();
  const el=stEl('stStale'); if(!el||!stResults) return;
  let cur=stStateAtRun; try{ cur=stKey(stFormCfg(JSON.parse(JSON.stringify(stCfg)))); }catch(e){}
  el.style.display=(cur!==stStateAtRun)?'':'none';
}
// the form's current values as a settings object (what stReadCfg would produce), without touching stCfg or storage
function stFormCfg(c){
  const n=(id,d)=>{ const e=stEl(id), v=e?parseFloat(e.value):NaN; return isFinite(v)?v:d; };
  c.start={mode:stEl('stStartMode').value, years:Math.max(0,Math.min(60,Math.round(n('stYears',0))))};
  c.equityShare=Math.max(0,Math.min(100,n('stShare',100)));
  c.lost={enabled:stEl('stLost').checked, actualInflation:stEl('stLostInf').checked};
  c.stag={enabled:stEl('stStag').checked, years:Math.max(1,Math.min(30,Math.round(n('stStagY',10)))), eqReturn:n('stStagEq',0), inflStart:Math.max(0,n('stStagI0',6)), inflEnd:Math.max(0,n('stStagI1',11))};
  c.y1966={enabled:stEl('stY66').checked};
  c.med={enabled:stEl('stMed').checked, person:parseInt(stEl('stMedWho').value,10)===1?1:0, age:Math.max(50,Math.min(110,n('stMedAge',80))), years:Math.max(1,Math.min(15,Math.round(n('stMedYears',3)))), cost:Math.max(0,n('stMedCost',100000)), orders:stEl('stMedOrd').checked};
  return c;
}
document.addEventListener('DOMContentLoaded',buildStressPanel);

// Late-life medical shock (stress card): what the extra cost forces the household to sell, the gains and tax that follow, and how the withdrawal order changes it.
function stMedHtml(M,cfg){
  const $=v=>'$'+Math.round(v).toLocaleString('en-US'), sgn=v=>(v<0?'−':'+')+$(Math.abs(v)), age=v=>v==null?'–':Math.round(v), c=cfg.med;
  const head='<p class="mc-note"><b>Late-life medical shock:</b> '+$(c.cost)+' a year for '+c.years+' year'+(c.years===1?'':'s')+' from age '+c.age+' of '+stPersonName(c.person)+' (today\'s $).</p>';
  if(!M.covered) return head+'<p class="mc-note">That age falls outside the projection (the person is not alive then or the plan ends first), so nothing changes.</p>';
  const S=M.sum, lasts=(f,b)=>(f==null?'<span class="st-ok">funded to the end</span>':'<span class="st-bad">runs out at age '+age(f)+'</span>');
  const who=[['Income','income'],['Dividends','dividends'],['Asset sales','sales'],['Pre-tax IRA','ira'],['Roth','roth'],['Property sales','property']].filter(x=>Math.abs(S.paid[x[1]])>=500).map(x=>x[0]+' '+$(S.paid[x[1]])).join(' · ');
  const row=(a,b)=>'<tr><td>'+a+'</td><td>'+b+'</td></tr>';
  let h=head+'<table class="mc-tbl st-tbl"><tr><th></th><th>Ages '+age(S.startAge)+'–'+age(S.endAge)+'</th></tr>'+
    row('Does the money last?','without the shock: '+lasts(S.failAgeBase)+' &nbsp;·&nbsp; with it: '+lasts(S.failAge))+
    row('Extra money the accounts had to pay in those years',$(Object.values(S.paid).reduce((a,b)=>a+b,0))+' &nbsp;('+(who||'–')+')')+
    row('Capital gains realised in those years (extra)',sgn(S.ltcgRealized)+' <small>of '+$(S.embeddedGain)+' unrealised gain at the start</small>')+
    row('Itemized deduction the shock creates',$(S.itemized)+' <small>(medical cost above 7.5% of AGI; itemizing beats the standard deduction in '+S.itemizedYears+' of '+S.years+' years)</small>')+
    row('Highest AGI in those years','with: '+$(S.peakAgi)+' &nbsp;·&nbsp; without: '+$(S.peakAgiBase))+
    row('Income tax: extra in those years / through two years after',sgn(S.taxShockYears)+' / '+sgn(S.taxThroughTail))+
    row('Income tax over the whole plan, and IRMAA',sgn(S.taxLifetime)+' <small>('+$(S.lifetimeTax)+' in total)</small> &nbsp;·&nbsp; IRMAA '+sgn(S.irmaaLifetime))+
    row('Estate at the end','with: '+stMoney(S.estate)+' &nbsp;·&nbsp; without: '+stMoney(S.estateBase)+' <small>('+sgn(S.estate-S.estateBase)+')</small>')+'</table>';
  if(S.notConverged>0) h+='<p class="mc-note"><b>Note:</b> the tax calculation did not settle in '+S.notConverged+' year(s); treat the tax figures there as approximate.</p>';
  if(M.orders&&M.orders.length){
    const best=M.orders.reduce((a,o)=>o.sum.estate>a.sum.estate?o:a,M.orders[0]);
    h+='<p class="mc-note">The same shock under four withdrawal orders (taxable = the portfolios that pay expenses). &#9733; marks the highest final estate.</p><table class="mc-tbl mc-ftbl st-tbl"><tr><th>Order</th><th>Money lasts?</th><th>Asset sales</th><th>IRA</th><th>Roth</th><th>Gains realised</th><th>Extra tax: shock years + 2</th><th>Tax over the plan</th><th>Estate</th></tr>'+
      M.orders.map(o=>{ const x=o.sum; return '<tr><td><b>'+o.label+'</b></td><td>'+lasts(x.failAge)+'</td><td>'+$(x.paid.sales)+'</td><td>'+$(x.paid.ira)+'</td><td>'+$(x.paid.roth)+'</td><td>'+sgn(x.ltcgRealized)+'</td><td>'+sgn(x.taxThroughTail)+'</td><td>'+$(x.lifetimeTax)+'</td><td>'+stMoney(x.estate)+(o===best?' &#9733;':'')+'</td></tr>'; }).join('')+'</table>';
  }
  return h;
}
