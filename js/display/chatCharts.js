'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHAT CHARTS — the cards the chat draws under an assistant message when a tool ran: a headline-numbers table with the list of
// "changes vs your plan", and Chart.js line / area / bar charts of the finished runs. Data comes ONLY from compute/scenarioSpec.js (through
// display/chatTools.js); the model supplies chart names and run ids, never numbers or code. Cards keep their own copy of the data, so a later plan
// edit never changes a card — it only gets a "plan edited since" badge (chatMarkStale, called from recompute()).
//
// Nothing here writes `state`. The three buttons on a summary card are the only way a scenario reaches the plan, and each is a user click:
//   Open in main charts / Save as Scenario → scnAddFromState() (display/scenarios.js) with the plan rebuilt from the lever list (specBuildState)
//   Copy spec → the scenario's lever list as JSON on the clipboard.
// The app's own overlay plugins (LTC bar, IRMAA lines …) are global; they are switched off per chart, as the Monte Carlo charts do.
// ═══════════════════════════════════════════════════════════════
const CHAT_COLORS=['#0f6e56','#b45309','#2563eb','#9333ea','#dc2626','#0891b2','#65a30d','#db2777'];
const CHAT_BASE_COLOR='#6b7280';
const CHAT_NO_OVERLAYS={unfundedYears:false,inhArrival:false,abGhost:false,ltcBar:false,incomeOverlay:false,magiOverlay:false,ordLabels:false,thinLine:false,lineHalo:false,stretchTint:false};
const CHAT_HYPO_NOTE='Hypothetical: your saved plan is unchanged.';
let chatCards=[];       // [{el, chart, data, planKey, badge}]
let chatZoom=null;      // {el, chart} while a card is enlarged

const ccEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function chatMoney(v){ if(v==null||!isFinite(v)) return '–'; const a=Math.abs(v), sg=v<0?'-':''; return a>=1e6?sg+'$'+(a/1e6).toFixed(a>=1e7?1:2)+'M':a>=1e3?sg+'$'+Math.round(a/1e3)+'k':sg+'$'+Math.round(a); }
function chatKpiFmt(kind,v){ if(v==null) return '–'; return kind==='$'?chatMoney(v):String(Math.round(v)); }
const chatPalette=i=>CHAT_COLORS[i%CHAT_COLORS.length];

// ── Chart.js configuration from a specChartData() result ──
function chatChartConfig(data,large){
  const fmt=data.kind==='$'||data.kind==null?chatMoney:(v=>String(Math.round(v)));
  let xTitle='Age'; try{ if(typeof ageAxisLabel==='function'&&typeof lastProjection!=='undefined'&&lastProjection) xTitle=ageAxisLabel(lastProjection); }catch(e){}
  const fontSize=large?12:11;
  const base={responsive:true,maintainAspectRatio:false,animation:{duration:250},interaction:{mode:'index',intersect:false},
    plugins:Object.assign({legend:{position:'top',align:'start',labels:{boxWidth:12,boxHeight:3,font:{size:fontSize}}},
      tooltip:{callbacks:{label:c=>(c.dataset.label?c.dataset.label+': ':'')+fmt(c.parsed.y!=null&&c.chart.options.indexAxis!=='y'?c.parsed.y:c.parsed.x)}}},CHAT_NO_OVERLAYS),
    scales:{x:{title:{display:true,text:xTitle,font:{size:fontSize}},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:large?16:9,font:{size:fontSize}},grid:{display:false}},
            y:{beginAtZero:true,ticks:{callback:v=>fmt(v),font:{size:fontSize}}}}};
  let ci=0;
  if(data.type==='bar'){
    const d=data.datasets[0];
    base.indexAxis='y'; base.plugins.legend={display:false};
    base.scales={x:{beginAtZero:true,ticks:{callback:v=>fmt(v),font:{size:fontSize}}},y:{ticks:{font:{size:fontSize}}}};
    let k=0; const colors=d.perBar.map(isBase=>isBase?CHAT_BASE_COLOR:chatPalette(k++));
    return {type:'bar',data:{labels:data.labels,datasets:[{label:d.label,data:d.data,backgroundColor:colors,borderWidth:0}]},options:base};
  }
  if(data.type==='sweep'){
    base.scales.x.title.text=data.xTitle||'value'; base.scales.x.ticks.autoSkip=false;
    const ds=[{label:data.datasets[0].label,data:data.datasets[0].data,borderColor:chatPalette(0),backgroundColor:chatPalette(0),borderWidth:2.25,pointRadius:4,pointHoverRadius:5,tension:0}];
    if(data.baseline!=null) ds.push({label:'Your plan as entered',data:data.labels.map(()=>data.baseline),borderColor:CHAT_BASE_COLOR,borderDash:[6,4],borderWidth:1.5,pointRadius:0,fill:false});
    base.scales.y.beginAtZero=false;
    return {type:'line',data:{labels:data.labels,datasets:ds},options:base};
  }
  if(data.type==='stack'){
    base.scales.y.stacked=true;
    const ds=data.datasets.map((d,i)=>({label:d.label,data:d.data,borderColor:chatPalette(i),backgroundColor:chatPalette(i)+'99',borderWidth:1,pointRadius:0,fill:true,tension:0}));
    return {type:'line',data:{labels:data.labels,datasets:ds},options:base};
  }
  const ds=data.datasets.map(d=>{
    const isBase=!!d.isBase, col=isBase?CHAT_BASE_COLOR:chatPalette(ci++);
    return {label:d.label,data:d.data,borderColor:col,backgroundColor:col,borderWidth:isBase?1.75:2.25,borderDash:isBase?[6,4]:[],pointRadius:0,pointHoverRadius:3,tension:0,spanGaps:false,fill:false};
  });
  return {type:'line',data:{labels:data.labels,datasets:ds},options:base};
}

// ── DOM helpers ──
function chatCardShell(title,cls){
  const el=document.createElement('div'); el.className='chat-card '+(cls||'');
  el.innerHTML='<div class="cc-head"><b class="cc-title"></b><span class="cc-badge" hidden>plan edited since</span><span class="cc-tools"></span></div><div class="cc-body"></div><div class="cc-note"></div>';
  el.querySelector('.cc-title').textContent=title;
  el.querySelector('.cc-note').textContent=CHAT_HYPO_NOTE;
  return el;
}
function chatToolBtn(label,title,fn){ const b=document.createElement('button'); b.type='button'; b.className='chat-icon cc-btn'; b.textContent=label; b.title=title; b.setAttribute('aria-label',title); b.addEventListener('click',fn); return b; }
function chatBtn(label,title,fn){ const b=document.createElement('button'); b.type='button'; b.className='btn cc-act'; b.textContent=label; b.title=title; b.addEventListener('click',fn); return b; }
function chatRunPlanKey(ids){ const r=(ids||[]).map(id=>typeof chatRuns!=='undefined'&&chatRuns[id]).find(Boolean); return (r&&r.planKey)||specPlanKey(); }

// ── a chart card ──
function chatRenderChartCard(desc,box){
  const data=desc.data, el=chatCardShell(data.title,'cc-chart'), body=el.querySelector('.cc-body');
  const wrap=document.createElement('div'); wrap.className='cc-canvas'; const canvas=document.createElement('canvas'); wrap.appendChild(canvas); body.appendChild(wrap);
  const tools=el.querySelector('.cc-tools');
  box.appendChild(el);
  let chart=null;
  if(typeof Chart==='undefined'){ wrap.textContent='Chart.js did not load, so the chart cannot be drawn.'; }
  else{ try{ chart=new Chart(canvas,chatChartConfig(data,false)); }catch(e){ wrap.textContent='Could not draw this chart: '+e.message; } }
  const card={el,chart,data,planKey:chatRunPlanKey(desc.runIds),badge:el.querySelector('.cc-badge')};
  tools.appendChild(chatToolBtn('⤢','Enlarge',()=>chatEnlarge(card)));
  tools.appendChild(chatToolBtn('PNG','Download as an image',()=>chatPng(card)));
  chatCards.push(card);
  return card;
}
function chatPng(card){
  if(!card.chart) return;
  const src=card.chart.canvas, t=document.createElement('canvas'); t.width=src.width; t.height=src.height;
  const g=t.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,t.width,t.height); g.drawImage(src,0,0);
  const a=document.createElement('a'); a.href=t.toDataURL('image/png'); a.download=(card.data.title||'chart').replace(/[^A-Za-z0-9]+/g,'_').slice(0,50)+'.png'; document.body.appendChild(a); a.click(); a.remove();
}
function chatCloseZoom(){ if(!chatZoom) return; try{ chatZoom.chart&&chatZoom.chart.destroy(); }catch(e){} chatZoom.el.remove(); chatZoom=null; }
function chatEnlarge(card){
  if(!card.chart) return; chatCloseZoom();
  const el=document.createElement('div'); el.className='chat-zoom';
  el.innerHTML='<div class="chat-zoom-box"><div class="cc-head"><b class="cc-title"></b><button type="button" class="chat-icon" aria-label="Close" title="Close">✕</button></div><div class="chat-zoom-canvas"><canvas></canvas></div><div class="cc-note"></div></div>';
  el.querySelector('.cc-title').textContent=card.data.title; el.querySelector('.cc-note').textContent=CHAT_HYPO_NOTE;
  el.addEventListener('click',e=>{ if(e.target===el||e.target.closest('button')) chatCloseZoom(); });
  document.body.appendChild(el);
  chatZoom={el,chart:new Chart(el.querySelector('canvas'),chatChartConfig(card.data,true))};
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&chatZoom) chatCloseZoom(); });

// ── the summary card: headline numbers, changes vs your plan, and the buttons that hand a scenario to the app ──
const CHAT_SUMMARY_KPIS=['finalTotal','lifetimeTax','peakIrmaaSurcharge','conversionsTotal','socialSecurityTotal','totalShortfall','firstUnfundedAge','lowestAssets'];
const CHAT_ALWAYS=['finalTotal','lifetimeTax','totalShortfall'];
const CHAT_GOOD={finalTotal:1,finalInvestable:1,lowestAssets:1,lifetimeTax:-1,peakIrmaaSurcharge:-1,peakAnnualTax:-1,totalShortfall:-1,unfundedYears:-1,firstUnfundedAge:1};
function chatKpiTable(batch){
  const runs=[batch.base].concat(batch.scenarios);
  const rows=CHAT_SUMMARY_KPIS.filter(k=>CHAT_ALWAYS.includes(k)||runs.some(r=>r.kpis[k]!==runs[0].kpis[k]));
  let h='<table class="cc-kpis"><thead><tr><th></th>'+runs.map(r=>'<th>'+ccEsc(r.id==='base'?'Your plan':r.label)+'</th>').join('')+'</tr></thead><tbody>';
  rows.forEach(k=>{
    const def=SPEC_KPIS[k]; h+='<tr><th>'+ccEsc(def.label)+'</th>';
    runs.forEach((r,i)=>{
      const v=r.kpis[k]; let extra='';
      if(i>0&&v!=null&&batch.base.kpis[k]!=null&&v!==batch.base.kpis[k]){
        const d=v-batch.base.kpis[k], good=CHAT_GOOD[k]; const cls=good?((d*good>0)?'cc-up':'cc-down'):'';
        extra=' <small class="'+cls+'">'+(d>0?'+':'−')+chatKpiFmt(def.kind,Math.abs(d))+'</small>';
      }
      h+='<td>'+chatKpiFmt(def.kind,v)+extra+'</td>';
    });
    h+='</tr>';
  });
  return h+'</tbody></table>';
}
function chatChangesList(batch){
  const ico={applied:'✓',ignored:'⚠',noEffect:'⚠'}, word={applied:'',ignored:'Ignored: ',noEffect:'No effect: '};
  let h='';
  batch.scenarios.forEach(r=>{
    h+='<div class="cc-scn"><b>'+ccEsc(r.label)+'</b><ul>'+r.notes.map(n=>'<li class="st-'+n.status+'"><span>'+ico[n.status]+'</span> '+ccEsc(n.label)+(n.note||n.status!=='applied'?' <small>'+ccEsc(word[n.status]+(n.note||''))+'</small>':'')+'</li>').join('')+'</ul>'+
      (r.market?'<small class="cc-market">Market stress: '+ccEsc(r.market.label)+', starting at age '+ccEsc(r.market.startAge)+' for '+ccEsc(r.market.years)+' years. A simulation overlay: it cannot be saved as a Scenario.</small>':'')+'</div>';
  });
  (batch.rejected||[]).forEach(r=>{ h+='<div class="cc-scn cc-rej"><b>'+ccEsc(r.label)+' — not run</b><ul>'+r.errors.map(e=>'<li class="st-ignored"><span>✕</span> '+ccEsc(e)+'</li>').join('')+'</ul></div>'; });
  return h;
}
function chatRenderSummaryCard(desc,box){
  const batch=desc.batch, el=chatCardShell(batch.scenarios.length?'Scenario results':'Scenarios not run','cc-summary'), body=el.querySelector('.cc-body');
  if(batch.scenarios.length) body.innerHTML=chatKpiTable(batch);
  const det=document.createElement('details'); det.className='cc-changes'; det.open=true; det.innerHTML='<summary>Changes vs your plan</summary>'+chatChangesList(batch); body.appendChild(det);
  if(batch.scenarios.length){
    const bar=document.createElement('div'); bar.className='cc-acts';
    const sel=document.createElement('select'); sel.className='cc-pick'; sel.setAttribute('aria-label','Scenario');
    batch.scenarios.forEach(r=>{ const o=document.createElement('option'); o.value=r.id; o.textContent=r.label.slice(0,48); sel.appendChild(o); });
    if(batch.scenarios.length>1) bar.appendChild(sel);
    const pick=()=>batch.scenarios.find(r=>r.id===sel.value)||batch.scenarios[0];
    const bOpen=chatBtn('Open in main charts','Add this scenario to the app and show it in the full chart grid',()=>chatOpenScenario(pick(),true));
    const bSave=chatBtn('Save as Scenario','Add this scenario to the app without switching to it',()=>chatOpenScenario(pick(),false));
    const bCopy=chatBtn('Copy spec','Copy the lever list as JSON',()=>chatCopySpec(pick()));
    const sync=()=>{ const m=!!pick().market; bOpen.disabled=bSave.disabled=m; bOpen.title=bSave.title=m?'A market-stress run is a simulation overlay and cannot be saved as a Scenario':bOpen.title; };
    sel.addEventListener('change',sync); bar.appendChild(bOpen); bar.appendChild(bSave); bar.appendChild(bCopy); body.appendChild(bar); sync();
  }
  box.appendChild(el);
  const card={el,chart:null,data:{title:'summary'},planKey:batch.planKey,badge:el.querySelector('.cc-badge')};
  chatCards.push(card); return card;
}
function chatCopySpec(run){
  const text=JSON.stringify({id:run.sid||run.id,label:run.label,levers:run.levers},null,2);
  const done=()=>chatShowStatus('Lever list copied.');
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done,()=>window.prompt('Copy the lever list:',text)); else window.prompt('Copy the lever list:',text);
}
// A click: rebuild the scenario's plan from its levers on the plan as it is NOW, then hand it to the Scenario machinery.
function chatOpenScenario(run,show){
  if(run.market){ chatShowStatus('A market-stress run cannot be saved as a Scenario.',true); return; }
  if(run.planKey!==specPlanKey()&&!confirm('Your plan was edited after this scenario was run. It will be rebuilt from the plan as it is now, so its numbers may differ from the card. Continue?')) return;
  const built=specBuildState(run.levers);
  const r=scnAddFromState(built.plan,(run.label||'Chat scenario'),show);
  if(r.error){ chatShowStatus(r.error,true); return; }
  chatShowStatus((show?'Showing ':'Saved as ')+'Scenario '+r.id+(show?' in the main charts.':'. Open the 🆎 Scenario button to switch to it.'));
  if(show&&typeof toggleChat==='function') toggleChat(false);
}

// A market scenario defined in the chat (compute/scenarioApi.js define_market_scenario): what the model asked for, as the engine read it, and three user-only actions.
// Show in main charts = the D view (a replay on a copy; the plan is not changed). Add to Stress test card = msSave into state.ui.marketPaths (saved with the plan).
function chatRenderMarketCard(desc,box){
  const p=desc.path, d=desc.describe, el=chatCardShell('Market scenario: '+p.label,'cc-market-card'), body=el.querySelector('.cc-body');
  const inf=d.inflation&&d.inflation.peakPct!=null?'inflation averages '+d.inflation.avgPct+'%, peaks at '+d.inflation.peakPct+'%':'the plan\'s own inflation';
  const rows=p.returns.slice(0,12).map((r,j)=>'<tr><td>'+(j+1)+'</td><td>'+(Math.round(r*1000)/10)+'%</td><td>'+(p.inflation?Math.round(p.inflation[j]*1000)/10+'%':'plan')+'</td></tr>').join('');
  body.innerHTML='<p class="cc-market">'+ccEsc(d.years)+' yearly values starting '+ccEsc(d.startsAt)+'; stocks '+ccEsc(d.compoundedReturnPct)+'% compounded (worst year '+ccEsc(d.worstYearPct)+'%); '+ccEsc(inf)+'; '+ccEsc(d.equityShare)+'% of each portfolio / IRA takes the stock return.'+
    (d.afterTheList?' After the list: '+ccEsc(JSON.stringify(d.afterTheList))+'.':'')+'</p><details><summary>Year by year (nominal)</summary><table class="cc-kpi"><thead><tr><th>#</th><th>Stocks</th><th>Inflation</th></tr></thead><tbody>'+rows+(p.returns.length>12?'<tr><td colspan="3">… '+(p.returns.length-12)+' more</td></tr>':'')+'</tbody></table></details>';
  const bar=document.createElement('div'); bar.className='cc-acts';
  bar.appendChild(chatBtn('Show in main charts','Replay this path in all the charts (the B view); your plan is not changed. Back to plan returns.',()=>{ const ok=typeof mcLoadMarketPath==='function'&&mcLoadMarketPath(p.id); chatShowStatus(ok?'Showing this scenario in the main charts (D view). Use Back to plan to return.':'Could not show it in the charts.',!ok); if(ok&&typeof toggleChat==='function') toggleChat(false); }));
  bar.appendChild(chatBtn('Add to Stress test card','Save this path in your plan (it appears in the Stress test card and is saved with the plan file)',()=>{ try{ stAddPath(p); chatShowStatus('Saved in the plan. It is now a row of the Stress test card.'); }catch(e){ chatShowStatus(String(e.message||e),true); } }));
  bar.appendChild(chatBtn('Copy JSON','Copy the scenario as JSON (the same form the app saves and the tools accept)',()=>{ const t=JSON.stringify(p,null,2); if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(()=>chatShowStatus('Scenario copied.'),()=>window.prompt('Copy the scenario:',t)); else window.prompt('Copy the scenario:',t); }));
  body.appendChild(bar); box.appendChild(el);
  const card={el,chart:null,data:{title:'market'},planKey:specPlanKey(),badge:el.querySelector('.cc-badge')}; chatCards.push(card); return card;
}

// ── public ──
function chatRenderCards(cards,box){
  (cards||[]).forEach(c=>{ try{ if(c.type==='summary') chatRenderSummaryCard(c,box); else if(c.type==='chart') chatRenderChartCard(c,box); else if(c.type==='market') chatRenderMarketCard(c,box); }catch(e){ console.error('chat card',e); } });
  if(box) box.scrollTop=box.scrollHeight;
}
function chatCardsClear(){ chatCloseZoom(); chatCards.forEach(c=>{ try{ c.chart&&c.chart.destroy(); }catch(e){} }); chatCards=[]; }
let chatStaleTimer=null;
function chatMarkStale(){
  if(!chatCards.length) return;
  clearTimeout(chatStaleTimer);
  chatStaleTimer=setTimeout(()=>{ const key=specPlanKey(); chatCards.forEach(c=>{ if(c.badge) c.badge.hidden=(c.planKey===key); }); },300);
}
