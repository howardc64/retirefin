'use strict';
// DISPLAY / USER NOTES — the "📝 Notes" button (right of Tips): a popup with a text box for the user's own notes about the plan.
// The text lives in `state.notes`, so it is saved with the plan file (Save), restored on load, autosaved, and belongs to the scenario on screen.
function openUserNotes(){
  if(document.getElementById('userNotesModal')) return;
  const ov=document.createElement('div');
  ov.id='userNotesModal'; ov.className='un-overlay';
  const scn=(typeof scnLabel==='function')?scnLabel(scnActive):'';
  ov.innerHTML=`<div class="un-card" role="dialog" aria-modal="true" aria-label="Notes">
    <div class="un-head"><b>📝 Notes${scn?' — '+scn:''}</b><button class="btn" onclick="closeUserNotes()">Done</button></div>
    <textarea id="userNotesText" placeholder="Type notes about this plan here. They are saved in the plan file when you click Save."></textarea></div>`;
  document.body.appendChild(ov);
  const ta=document.getElementById('userNotesText');
  ta.value=state.notes||'';
  ta.addEventListener('input',()=>{ state.notes=ta.value; saveDebounced(); });
  ov.addEventListener('mousedown',e=>{ if(e.target===ov) closeUserNotes(); });
  ta.focus();
}
function closeUserNotes(){
  const ov=document.getElementById('userNotesModal'); if(!ov) return;
  const ta=document.getElementById('userNotesText'); if(ta) state.notes=ta.value;
  ov.remove(); autosave();
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeUserNotes(); });
