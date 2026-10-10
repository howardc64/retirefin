'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / SCENARIOS — any number of saved plans (A, B, C …) behind one "🆎 Scenario" button in the top bar.
// Exactly one scenario is "live" at a time: it is `state`, so every input, chart and export works on it as usual.
// The others sit in `scnSnaps` as plain snapshots. Switching swaps them, rebuilds the input forms and re-draws every chart,
// so comparing plans is a matter of switching and watching the charts animate between them (the chart y-axis scale is kept across a switch).
// Layout settings (`state.ui`: hidden sections, devalue sliders…) belong to the viewer, not the plan, and stay put when switching.
// The Scenario button opens a popup card that floats over the page: scenario chips (click one to show it), New scenario (a copy of the one on screen), Delete scenario (the one on screen, one at a time), a name box, and a collapsible list of every input that differs.
// The set is kept in localStorage and written into the plan file by Save. The first scenario is always A; the plan is the same as before until a second one is created.
// Nothing here changes how a plan is computed.
// ═══════════════════════════════════════════════════════════════
const SCN_STORAGE_KEY='retirementPlannerScenarios_v2';
const SCN_OLD_KEY='retirementPlannerAB_v1';     // previous two-scenario (A/B) format; read once and migrated
const SCN_MAX=26;                               // letters A–Z
let scnOrder=['A'];       // scenario ids in display order
let scnActive='A';        // id of the scenario currently in `state`
let scnSnaps={};          // id → snapshot (a hydrated state object) for every scenario that is NOT on screen
const scnNames={};        // id → optional user name

function scnCopy(o){ return JSON.parse(JSON.stringify(o)); }
function scnStamp(){ return new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
function scnEsc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function scnLabel(id){ return 'Scenario '+id+(scnNames[id]?' — '+scnNames[id]:''); }
function scnNextId(){ for(let i=0;i<SCN_MAX;i++){ const L=String.fromCharCode(65+i); if(!scnOrder.includes(L)) return L; } return null; }
function scnStateOf(id){ return id===scnActive?state:scnSnaps[id]; }

// Parsed plan file / saved object → fully hydrated state, without disturbing the live `state`.
function scnHydrate(parsed){
  const saved=state;
  try{ state=defaultState(); return hydrateState(parsed); } finally{ state=saved; }
}

function scnSave(){
  try{
    if(scnOrder.length<2){ localStorage.removeItem(SCN_STORAGE_KEY); return; }
    localStorage.setItem(SCN_STORAGE_KEY,JSON.stringify({active:scnActive,order:scnOrder,names:scnNames,snaps:scnSnaps}));
  }catch(e){}
}
function scnRestore(){
  try{ localStorage.removeItem('retirementPlannerCompare_v1'); }catch(e){}   // leftover from the old single-Compare feature
  try{
    const raw=localStorage.getItem(SCN_STORAGE_KEY);
    if(raw){
      const o=JSON.parse(raw);
      if(o&&Array.isArray(o.order)&&o.order.length>1&&o.snaps){
        const order=o.order.filter(id=>/^[A-Z]$/.test(id));
        const active=order.includes(o.active)?o.active:order[0];
        const snaps={};
        order.forEach(id=>{ if(id!==active&&o.snaps[id]) snaps[id]=scnHydrate(o.snaps[id]); });
        if(order.some(id=>id!==active&&!snaps[id])) return;       // incomplete save: stay with the single plan
        scnOrder=order; scnActive=active; scnSnaps=snaps;
        order.forEach(id=>{ scnNames[id]=(o.names&&o.names[id])||''; });
      }
      return;
    }
    // One-time migration of the old two-scenario save: { active, other, names:{A,B} }
    const old=localStorage.getItem(SCN_OLD_KEY); if(!old) return;
    const o=JSON.parse(old); if(!o||!o.other) return;
    const active=o.active==='B'?'B':'A', other=active==='A'?'B':'A';
    scnOrder=['A','B']; scnActive=active; scnSnaps={[other]:scnHydrate(o.other)};
    scnNames.A=(o.names&&o.names.A)||''; scnNames.B=(o.names&&o.names.B)||'';
    scnSave(); localStorage.removeItem(SCN_OLD_KEY);
  }catch(e){ scnOrder=['A']; scnActive='A'; scnSnaps={}; }
}

// Show scenario `id`: the one on screen is put aside, the chosen one is loaded into every input and chart.
function scnSwitch(id){
  if(id===scnActive||!scnSnaps[id]) return;
  const leaving=state, incoming=scnSnaps[id];
  incoming.ui=leaving.ui;                 // layout stays as the viewer left it
  scnSnaps[scnActive]=scnCopy(leaving);
  delete scnSnaps[id];
  scnActive=id;
  state=incoming;
  renderAll();                            // rebuilds every input form; the charts are NOT destroyed, so renderCharts updates them in place and Chart.js animates the lines between the two plans' values
  autosave();
  flashMsg('Showing '+scnLabel(id)+'.');
}
// New scenario: a copy of the plan on screen, which is then shown so the next edits go to the new one.
function scnCreate(){
  const id=scnNextId();
  if(!id){ alert('Up to '+SCN_MAX+' scenarios are supported.'); return; }
  const from=scnActive;
  scnSnaps[scnActive]=scnCopy(state);
  scnOrder.push(id);
  scnNames[id]='Copy of '+from+' at '+scnStamp();
  const copy=scnCopy(state); copy.ui=state.ui;
  scnActive=id; state=copy;
  renderAll(); autosave();
  flashMsg('Scenario '+id+' created as a copy of '+from+'. Edits now apply to '+id+'.');
}
// Delete the scenario on screen (one at a time); the first remaining scenario takes its place on screen.
function scnDelete(){
  if(scnOrder.length<2) return;
  if(!confirm('Delete '+scnLabel(scnActive)+'? This cannot be undone.')) return;
  const gone=scnActive, idx=scnOrder.indexOf(gone);
  scnOrder.splice(idx,1); delete scnNames[gone];
  const next=scnOrder[Math.max(0,idx-1)];
  const incoming=scnSnaps[next]; delete scnSnaps[next];
  incoming.ui=state.ui;
  scnActive=next; state=incoming;
  renderAll(); autosave();
  flashMsg('Scenario '+gone+' deleted. Showing '+scnLabel(next)+'.');
}
// Reset to defaults: every other scenario is removed and the plan on screen becomes the one scenario, A (called by resetState before it redraws).
function scnReset(){
  scnOrder=['A']; scnActive='A'; scnSnaps={}; Object.keys(scnNames).forEach(k=>delete scnNames[k]);
  scnSave();   // clears the stored scenario set
}
function scnRename(v){ scnNames[scnActive]=v.trim(); scnSave(); renderScenarioCard(); }
// ── Plan file: Save writes every scenario, Load restores them all ──
// A file with one scenario is a plain plan (the same format as before). With several, the scenario on screen is the plan itself and the
// others ride along under `scenarios` ({active, order, names, snaps}); older readers simply ignore that key.
function scnFileData(){
  if(scnOrder.length<2) return state;
  return Object.assign({}, state, {scenarios:{active:scnActive, order:scnOrder, names:scnNames, snaps:scnSnaps}});
}
// Called by applyLoadedFileText after the file's main plan is in `state`: replaces the whole scenario set with the file's.
function scnLoadFromFile(parsed){
  scnOrder=['A']; scnActive='A'; scnSnaps={}; Object.keys(scnNames).forEach(k=>delete scnNames[k]);
  const o=parsed&&parsed.scenarios;
  if(!o||!Array.isArray(o.order)||!o.snaps) return;
  const order=o.order.filter(id=>/^[A-Z]$/.test(id));
  if(!order.includes(o.active)||order.length<2) return;
  const snaps={};
  for(const id of order){ if(id===o.active) continue; if(!o.snaps[id]) return; snaps[id]=scnHydrate(o.snaps[id]); }
  scnOrder=order; scnActive=o.active; scnSnaps=snaps;
  order.forEach(id=>{ scnNames[id]=(o.names&&o.names[id])||''; });
}

// ── Differences between the scenarios ──
function scnFlatten(o,path,out){
  if(o==null||typeof o!=='object'){ out[path]=o; return out; }
  Object.keys(o).forEach(k=>{
    if(path===''&&(k==='ui'||k==='notes')||k==='id'||k==='hidden') return;
    scnFlatten(o[k],path?path+(Array.isArray(o)?'['+k+']':'.'+k):k,out);
  });
  return out;
}
function scnDifferences(){
  const flat={}; scnOrder.forEach(id=>{ flat[id]=scnFlatten(scnStateOf(id),'',{}); });
  const first=scnStateOf(scnOrder[0]), out=[], keys=new Set();
  scnOrder.forEach(id=>Object.keys(flat[id]).forEach(k=>keys.add(k)));
  const nameOf=m=>m.replace(/^people\[(\d)\]/,(s,i)=>displayPersonName(first.people[+i]||{},+i));
  keys.forEach(k=>{
    const vals=scnOrder.map(id=>flat[id][k]);
    if(vals.some(v=>JSON.stringify(v)!==JSON.stringify(vals[0]))) out.push({path:nameOf(k),vals});
  });
  return out;
}

// ── The button and the card ──
let scnCardOpen=false;
function toggleScenarioCard(){ scnCardOpen?closeScenarioCard():openScenarioCard(); }
function openScenarioCard(){ scnCardOpen=true; renderScenarioCard(); }
function closeScenarioCard(){ scnCardOpen=false; renderScenarioCard(); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&scnCardOpen&&!document.getElementById('userNotesModal')) closeScenarioCard(); });

function renderScenarioCard(){
  const btn=document.getElementById('scenarioBtn');
  if(btn){ btn.textContent='🆎 Scenario '+scnActive; btn.classList.toggle('on',scnCardOpen); }
  let card=document.getElementById('scnCard');
  if(!scnCardOpen){ if(card) card.remove(); return; }
  if(!card){ card=document.createElement('div'); card.id='scnCard'; card.className='scn-card'; document.body.appendChild(card); }
  const keepOpen=!!(card.querySelector('details')&&card.querySelector('details').open);   // keep the list open while editing
  const focusName=document.activeElement&&document.activeElement.id==='scnName';
  const many=scnOrder.length>1;
  const diffs=many?scnDifferences():[];
  const rows=diffs.slice(0,80).map(d=>`<tr><td>${scnEsc(d.path)}</td>${d.vals.map(v=>`<td>${scnEsc(v==null?'—':v)}</td>`).join('')}</tr>`).join('')+
    (diffs.length>80?`<tr><td colspan="${scnOrder.length+1}">…and ${diffs.length-80} more</td></tr>`:'');
  const chip=id=>`<button class="ab-chip ab-${id==='A'?'A':'B'}${scnActive===id?' on':''}" ${scnActive===id?'':`onclick="scnSwitch('${id}')"`} title="${scnActive===id?'On screen now':'Show scenario '+id}"><b>${id}</b>${scnNames[id]?' '+scnEsc(scnNames[id]):''}${scnActive===id?' (on screen)':''}</button>`;
  card.innerHTML=`<div class="scn-head"><b>Scenarios</b><button class="chat-icon" onclick="closeScenarioCard()" title="Close" aria-label="Close">✕</button></div>
    <div class="ab-head">${scnOrder.map(chip).join('')}</div>
    <div class="ab-head">
      <button class="btn" onclick="scnCreate()" title="Add a scenario that starts as a copy of the one on screen, and show it">➕ New scenario</button>
      <button class="btn btn-danger" onclick="scnDelete()" ${many?'':'disabled'} title="${many?'Delete the scenario on screen':'The only scenario cannot be deleted'}">🗑 Delete scenario ${scnActive}</button>
    </div>
    <label class="scn-name">Name of scenario ${scnActive} <input id="scnName" type="text" maxlength="60" value="${scnEsc(scnNames[scnActive]||'')}" placeholder="optional" onchange="scnRename(this.value)"></label>
    <div class="ab-note">Click a chip to switch: the inputs change to that scenario and the charts animate to its values. Edits apply to the scenario on screen.</div>
    ${many?`<details class="ab-diff"${keepOpen?' open':''}><summary>${diffs.length} input difference${diffs.length===1?'':'s'}</summary>${diffs.length?`<div class="scn-scroll"><table class="ab-table"><thead><tr><th>Input</th>${scnOrder.map(id=>`<th>${id}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`:''}</details>`:''}`;
  if(focusName){ const n=document.getElementById('scnName'); if(n) n.focus(); }
}
