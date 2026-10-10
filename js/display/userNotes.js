'use strict';
// DISPLAY / USER NOTES — two buttons in the top bar, each opening a popup with a text box:
//   "📝 Notes"           global notes about the whole plan: the same text whichever scenario is on screen. Kept in `state.ui.globalNotes`
//                        (`ui` is carried across scenario switches), so it is saved with the plan file, restored on load, and autosaved.
//   "📝 Scenario Notes"  notes for the scenario on screen only: kept in `state.notes`, so each scenario has its own text.
function userNotesKey(kind){ return kind==='scenario'?'notes':'globalNotes'; }
function userNotesHolder(kind){ if(kind==='scenario') return state; if(!state.ui) state.ui={}; return state.ui; }
function openUserNotes(kind){
  kind=kind==='scenario'?'scenario':'global';
  if(document.getElementById('userNotesModal')) return;
  const ov=document.createElement('div');
  ov.id='userNotesModal'; ov.className='un-overlay'; ov.dataset.kind=kind;
  const scn=(typeof scnLabel==='function')?scnLabel(scnActive):'';
  const title=kind==='scenario'?'📝 Scenario Notes'+(scn?' — '+scn:''):'📝 Notes (all scenarios)';
  const hint=kind==='scenario'
    ?'Type notes about this scenario here. Each scenario has its own notes. They are saved in the plan file when you click Save.'
    :'Type notes about this plan here. They are the same for every scenario and are saved in the plan file when you click Save.';
  ov.innerHTML=`<div class="un-card" role="dialog" aria-modal="true" aria-label="${kind==='scenario'?'Scenario Notes':'Notes'}">
    <div class="un-head"><b>${title}</b><button class="btn" onclick="closeUserNotes()">Done</button></div>
    <textarea id="userNotesText" placeholder="${hint}"></textarea></div>`;
  document.body.appendChild(ov);
  const ta=document.getElementById('userNotesText'), key=userNotesKey(kind);
  ta.value=userNotesHolder(kind)[key]||'';
  ta.addEventListener('input',()=>{ userNotesHolder(kind)[key]=ta.value; saveDebounced(); });
  ov.addEventListener('mousedown',e=>{ if(e.target===ov) closeUserNotes(); });
  ta.focus();
}
function closeUserNotes(){
  const ov=document.getElementById('userNotesModal'); if(!ov) return;
  const ta=document.getElementById('userNotesText'), kind=ov.dataset.kind==='scenario'?'scenario':'global';
  if(ta) userNotesHolder(kind)[userNotesKey(kind)]=ta.value;
  ov.remove(); autosave();
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeUserNotes(); });
