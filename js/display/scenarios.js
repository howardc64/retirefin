'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / A–B SCENARIOS — two saved plans, A and B, and chips that flip between them.
// Exactly one scenario is "live" at a time: it is `state`, so every input, chart and export works on it as usual.
// The other one sits in `abOther` as a plain snapshot. Flipping swaps them, rebuilds the input forms and re-draws every chart,
// so comparing two plans is a matter of flipping and watching the charts animate between them (the chart y-axis scale is kept across a flip).
// Layout settings (`state.ui`: hidden sections, devalue sliders…) belong to the viewer, not the plan, and stay put when flipping.
// A bar under the top bar names the scenarios and lists every input that differs. The pair is kept in localStorage.
// Nothing here changes how a plan is computed.
// ═══════════════════════════════════════════════════════════════
const AB_STORAGE_KEY='retirementPlannerAB_v1';
let abActive='A';          // letter of the scenario currently in `state`
let abOther=null;          // snapshot of the other scenario (a hydrated state object), or null when there is only one plan
const abNames={A:'',B:''};

function abOtherLetter(){ return abActive==='A'?'B':'A'; }
function abCopy(o){ return JSON.parse(JSON.stringify(o)); }
function abStamp(){ return new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
function abEsc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// Parsed plan file / saved object → fully hydrated state, without disturbing the live `state`.
function abHydrate(parsed){
  const saved=state;
  try{ state=defaultState(); return hydrateState(parsed); } finally{ state=saved; }
}

function abSave(){
  try{
    if(!abOther){ localStorage.removeItem(AB_STORAGE_KEY); return; }
    localStorage.setItem(AB_STORAGE_KEY,JSON.stringify({active:abActive,other:abOther,names:abNames}));
  }catch(e){}
}
function abRestore(){
  try{ localStorage.removeItem('retirementPlannerCompare_v1'); }catch(e){}   // leftover from the old single-Compare feature
  try{
    const raw=localStorage.getItem(AB_STORAGE_KEY); if(!raw) return;
    const o=JSON.parse(raw); if(!o||!o.other) return;
    abOther=abHydrate(o.other);
    abActive=o.active==='B'?'B':'A';
    abNames.A=(o.names&&o.names.A)||''; abNames.B=(o.names&&o.names.B)||'';
  }catch(e){ abOther=null; abActive='A'; }
}

// "Duplicate as B": the other scenario becomes a copy of the plan on screen.
function abDuplicate(){
  const other=abOtherLetter();
  if(abOther && !confirm('Replace scenario '+other+' with a copy of scenario '+abActive+'?')) return;
  abOther=abCopy(state);
  abNames[other]='Copy of '+abActive+' at '+abStamp();
  abSave(); renderAbBar();
  flashMsg('Scenario '+other+' = copy of '+abActive+'. Edit '+abActive+', then click the other chip to flip and compare.');
}
// Flip (the A / B chips in the bar): the scenario on screen goes to the side, the other one is loaded into every input and chart.
function abSwitch(){
  if(!abOther) return;
  const leaving=state, incoming=abOther;
  incoming.ui=leaving.ui;                 // layout stays as the viewer left it
  abOther=abCopy(leaving);
  abActive=abOtherLetter();
  state=incoming;
  renderAll();                            // rebuilds every input form; the charts are NOT destroyed, so renderCharts updates them in place and Chart.js animates the lines from plan A's values to plan B's
  autosave();
  flashMsg('Showing scenario '+abActive+(abNames[abActive]?' — '+abNames[abActive]:'')+'.');
}
// Drop the other scenario; what is on screen stays, as the only plan (A).
function abClear(){
  if(!abOther) return;
  if(!confirm('Remove scenario '+abOtherLetter()+'? Scenario '+abActive+' stays on screen.')) return;
  abOther=null; abActive='A'; abNames.A=abNames.B='';
  abSave(); renderAbBar();
}
function abLoadFile(){ document.getElementById('importAbFile').click(); }
document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('importAbFile'); if(!inp) return;
  inp.addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const other=abOtherLetter();
        abOther=abHydrate(JSON.parse(ev.target.result));
        abNames[other]=file.name.replace(/\.json$/i,'');
        abSave(); renderAbBar();
        flashMsg('Scenario '+other+' loaded from '+file.name+'. Click its chip to view it.');
      }catch(err){ alert('Could not read that file as a saved plan.'); }
    };
    reader.readAsText(file); e.target.value='';
  });
});

// ── Differences between the two plans ──
function abFlatten(o,path,out){
  if(o==null||typeof o!=='object'){ out[path]=o; return out; }
  Object.keys(o).forEach(k=>{
    if(k==='ui'&&path===''||k==='id'||k==='hidden') return;
    abFlatten(o[k],path?path+(Array.isArray(o)?'['+k+']':'.'+k):k,out);
  });
  return out;
}
function abDifferences(){
  const sa=abActive==='A'?state:abOther, sb=abActive==='A'?abOther:state;
  const a=abFlatten(sa,'',{}), b=abFlatten(sb,'',{}), out=[];
  const nameOf=m=>m.replace(/^people\[(\d)\]/,(s,i)=>displayPersonName(sa.people[+i]||{},+i));
  new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>{
    if(JSON.stringify(a[k])!==JSON.stringify(b[k])) out.push({path:nameOf(k),a:a[k],b:b[k]});
  });
  return out;
}

// ── Top-bar buttons and the bar under it ──
function renderAbBar(){
  const top=document.getElementById('abTop'), bar=document.getElementById('abBar');
  const other=abOtherLetter();
  if(top) top.innerHTML=
    `<button class="btn" onclick="abDuplicate()" title="Make the other scenario a copy of the plan on screen, then edit this one and flip to compare">🆎 Duplicate as ${other}</button>`+
    `<button class="btn" onclick="abLoadFile()" title="Load a saved plan file as scenario ${other}">🆎 Load file as ${other}</button>`+
    '';
  if(!bar) return;
  if(!abOther){ bar.style.display='none'; bar.innerHTML=''; return; }
  const diffs=abDifferences();
  const wasOpen=!!(bar.querySelector('details')&&bar.querySelector('details').open);   // keep the list open while editing
  const rows=diffs.slice(0,80).map(d=>`<tr><td>${abEsc(d.path)}</td><td>${abEsc(d.a==null?'—':d.a)}</td><td>${abEsc(d.b==null?'—':d.b)}</td></tr>`).join('')+
    (diffs.length>80?`<tr><td colspan="3">…and ${diffs.length-80} more</td></tr>`:'');
  const chip=L=>`<button class="ab-chip ab-${L}${abActive===L?' on':''}" ${abActive===L?'':'onclick="abSwitch()"'} title="${abActive===L?'On screen now':'Show scenario '+L}"><b>${L}</b>${abNames[L]?' '+abEsc(abNames[L]):''}${abActive===L?' (on screen)':''}</button>`;
  bar.style.display='block';
  bar.innerHTML=`<div class="ab-head">${chip('A')}${chip('B')}
    <button class="btn" onclick="abClear()">Remove ${other}</button>
    <span class="ab-note">Click the other chip to flip: the inputs switch to that scenario and the charts animate to its values. Edits apply to the scenario on screen.</span></div>
    <details class="ab-diff"${wasOpen?' open':''}><summary>${diffs.length} input difference${diffs.length===1?'':'s'}</summary>${diffs.length?`<table class="ab-table"><thead><tr><th>Input</th><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`:''}</details>`;
}
