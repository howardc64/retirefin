'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CARD STACK — the two cards under the chart grid (Stress tests and Monte Carlo) sit in <div id="cardStack"> and can be dragged by their title bar
// to swap places: drop on the upper or lower half of the other card to put the dragged card before or after it. Default order: Stress tests above Monte Carlo.
// The order is a display preference, kept in its own localStorage key (not in the plan file), and Reset to defaults puts it back.
// Native HTML5 drag and drop, like the chart panels (chartPanels.js). Loaded after mcPanel.js and stressPanel.js.
// ═══════════════════════════════════════════════════════════════
const CARD_ORDER_KEY='retirementPlannerCardOrder_v1';
const CARD_ORDER_DEFAULT=['stressPanel','mcPanel'];
let _cardDrag=null;

function cardOrderLoad(){
  try{ const s=JSON.parse(localStorage.getItem(CARD_ORDER_KEY)||'null'); if(Array.isArray(s)&&s.length===CARD_ORDER_DEFAULT.length&&CARD_ORDER_DEFAULT.every(id=>s.includes(id))) return s; }catch(e){}
  return CARD_ORDER_DEFAULT.slice();
}
function cardOrderSave(){
  const host=document.getElementById('cardStack'); if(!host) return;
  try{ localStorage.setItem(CARD_ORDER_KEY,JSON.stringify([...host.children].map(c=>c.id))); }catch(e){}
}
function cardOrderApply(order){
  const host=document.getElementById('cardStack'); if(!host) return;
  order.forEach(id=>{ const el=document.getElementById(id); if(el) host.appendChild(el); });
}
// The cards rebuild their header when they are reset, so the draggable flag is (re)applied after every build.
function cardStackDecorate(){
  document.querySelectorAll('#cardStack > .panel > .mc-head').forEach(h=>{ h.draggable=true; h.classList.add('card-grab'); h.title='Drag to move this card above or below the other one'; });
}
function cardStackReset(){ try{ localStorage.removeItem(CARD_ORDER_KEY); }catch(e){} cardOrderApply(CARD_ORDER_DEFAULT); }

function cardStackInit(){
  const host=document.getElementById('cardStack'); if(!host) return;
  cardOrderApply(cardOrderLoad()); cardStackDecorate();
  const clear=()=>host.querySelectorAll('.card-dragging,.card-drop-before,.card-drop-after').forEach(n=>n.classList.remove('card-dragging','card-drop-before','card-drop-after'));
  host.addEventListener('dragstart',e=>{
    const head=e.target.closest&&e.target.closest('.mc-head'); if(!head||!head.draggable) return;
    const card=head.closest('.panel'); _cardDrag=card.id;
    try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',_cardDrag); e.dataTransfer.setDragImage(card,16,16); }catch(_){}
    card.classList.add('card-dragging');
  });
  host.addEventListener('dragend',()=>{ _cardDrag=null; clear(); });
  host.addEventListener('dragover',e=>{
    if(!_cardDrag) return;
    const over=e.target.closest('.panel'); if(!over||over.id===_cardDrag) return;
    e.preventDefault(); try{ e.dataTransfer.dropEffect='move'; }catch(_){}
    const r=over.getBoundingClientRect(), after=e.clientY>r.top+r.height/2;
    host.querySelectorAll('.card-drop-before,.card-drop-after').forEach(n=>n.classList.remove('card-drop-before','card-drop-after'));
    over.classList.add(after?'card-drop-after':'card-drop-before');
  });
  host.addEventListener('drop',e=>{
    if(!_cardDrag) return;
    const over=e.target.closest('.panel'), card=document.getElementById(_cardDrag); if(!over||!card||over===card){ clear(); return; }
    e.preventDefault();
    const r=over.getBoundingClientRect(), after=e.clientY>r.top+r.height/2;
    host.insertBefore(card, after?over.nextSibling:over);
    cardOrderSave(); _cardDrag=null; clear();
  });
}
document.addEventListener('DOMContentLoaded',cardStackInit);
