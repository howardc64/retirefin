'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CARD STACK — the two cards under the chart grid (Stress tests and Monte Carlo) sit in <div id="cardStack"> and can be dragged by their title bar
// to swap places: drop above or below the middle of the other card (anywhere on the page) to put the dragged card before or after it. Default order: Stress tests above Monte Carlo.
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
// The cards rebuild their header when they are reset, so the grip and the draggable flag are (re)applied after every build.
// The grip is the same ⠿ the chart panels show, so every card on the page looks draggable the same way.
function cardStackDecorate(){
  document.querySelectorAll('#cardStack > .panel > .mc-head').forEach(h=>{
    h.draggable=true; h.classList.add('card-grab'); h.title='Drag to move this card above or below the other one';
    const t=h.querySelector('.panel-title'); if(t&&!t.querySelector('.cp-grip')) t.insertAdjacentHTML('afterbegin','<span class="cp-grip" aria-hidden="true">\u283F</span>');
  });
}
function cardStackReset(){ try{ localStorage.removeItem(CARD_ORDER_KEY); }catch(e){} cardOrderApply(CARD_ORDER_DEFAULT); }

// Drag and drop is tracked on the whole document while a card is being dragged, so the drop does not have to land exactly on the other card: the dragged card goes before the
// other one when the pointer is above its middle and after it when below (anywhere on the page). Near the top or bottom edge of the window the page scrolls.
const _el=n=>n&&(n.nodeType===1?n:n.parentElement);   // Safari can report a text node as the event target
function cardStackInit(){
  const host=document.getElementById('cardStack'); if(!host) return;
  cardOrderApply(cardOrderLoad()); cardStackDecorate();
  const clear=()=>host.querySelectorAll('.card-dragging,.card-drop-before,.card-drop-after').forEach(n=>n.classList.remove('card-dragging','card-drop-before','card-drop-after'));
  const others=()=>[...host.children].filter(c=>c.id!==_cardDrag&&c.classList.contains('panel'));
  // the card the pointer is nearest to (vertically) among the others, and whether the dragged card would go after it
  const target=y=>{ let best=null,bd=Infinity; others().forEach(c=>{ const r=c.getBoundingClientRect(), d=y<r.top?r.top-y:(y>r.bottom?y-r.bottom:0); if(d<bd){ bd=d; best=c; } });
    if(!best) return null; const r=best.getBoundingClientRect(); return {card:best, after:y>r.top+r.height/2}; };
  host.addEventListener('dragstart',e=>{
    const t=_el(e.target), head=t&&t.closest&&t.closest('.mc-head'); if(!head||!head.draggable) return;
    const card=head.closest('.panel'); _cardDrag=card.id;
    try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',_cardDrag); e.dataTransfer.setDragImage(card,16,16); }catch(_){}
    card.classList.add('card-dragging');
  });
  document.addEventListener('dragend',()=>{ _cardDrag=null; clear(); });
  document.addEventListener('dragover',e=>{
    if(!_cardDrag) return;
    const t=target(e.clientY); if(!t) return;
    e.preventDefault(); try{ e.dataTransfer.dropEffect='move'; }catch(_){}
    host.querySelectorAll('.card-drop-before,.card-drop-after').forEach(n=>n.classList.remove('card-drop-before','card-drop-after'));
    t.card.classList.add(t.after?'card-drop-after':'card-drop-before');
    const edge=60; if(e.clientY<edge) window.scrollBy(0,-18); else if(e.clientY>window.innerHeight-edge) window.scrollBy(0,18);
  });
  document.addEventListener('drop',e=>{
    if(!_cardDrag) return;
    const card=document.getElementById(_cardDrag), t=target(e.clientY); if(!card||!t){ clear(); _cardDrag=null; return; }
    e.preventDefault();
    host.insertBefore(card, t.after?t.card.nextSibling:t.card);
    cardOrderSave(); _cardDrag=null; clear();
  });
}
document.addEventListener('DOMContentLoaded',cardStackInit);
