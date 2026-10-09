'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / INPUT ELEMENT INFO — the "Input Element Info" checkbox (header, left of "Chart Element Info").
// When checked (default), hovering an input on the input side (Household Setup, Income & Assets) or the chart side (section Hide boxes,
// Rescale buttons, Asset Value devalue sliders, …) or a header toggle shows a popup describing it. Drop-down menus are opened as a custom
// list so hovering each choice shows a description of that choice too — a native <select> popup cannot show tooltips.
// Texts live in inputInfoText.js. The popup (#inputTip) follows the Popup background slider (tipTheme(), chartHelpers.js); styles in styles.css.
// Read-only: only reads the DOM; never writes into `state` (a menu pick just sets the <select> and fires its own `change` event).
// ═══════════════════════════════════════════════════════════════
let inputInfo=true;   // default on; the header checkbox (index.html) starts checked to match

const II_ROOTS='.input-col, .chart-col, .topbar';   // where hovering is described
const II_MENU='#iiMenu';

function setInputInfo(on){
  inputInfo=!!on;
  iiCloseMenu();
}

// ── Find the control a hover refers to, its label and its description ────────────────────────────────────────────────
const iiClean=t=>String(t||'').replace(/\s+/g,' ').trim();
const iiKind=c=>c.tagName==='SELECT'?'s':((c.type==='checkbox'||c.type==='radio')?'c':'n');

// The input / select / button under the pointer, or the control belonging to a hovered label or slider caption.
function iiControlAt(t){
  if(!t||!t.closest||!t.closest(II_ROOTS)) return null;
  const direct=t.closest('input, select, textarea, button'); if(direct) return direct;
  const l=t.closest('label, .sl'); if(!l) return null;
  return l.querySelector('input, select') || (l.matches('.item-head > label') ? l.parentElement.querySelector('input[type=checkbox]')
    : (l.parentElement&&l.parentElement.querySelector('input, select')));
}
// Which kind of card an Enable checkbox heads (nested cards are titled with the user's own name, so go by class).
function iiCardKind(c){
  const nested={'.portfolio-card':'Portfolio','.rental-card':'Rental','.annuity-card':'Annuity','.realestate-card':'Real estate'};
  for(const sel in nested) if(c.closest(sel)) return nested[sel];
  const lab=c.closest('.item-head, .panel-title')?.querySelector('label');
  return lab?iiClean(lab.textContent):'';
}
// The text that identifies a control: its own label, else the nearest caption before it, else its card's title.
function iiLabel(c){
  if(iiKind(c)==='c'){
    if(c.matches('[data-hide-key]') || c.closest('.hide-toggle')) return 'Hide';
    if(c.closest('.item-head')) return 'ENABLE:'+iiCardKind(c);
    return iiClean(c.closest('label')?.textContent);
  }
  if(c.tagName==='BUTTON') return iiClean(c.textContent);
  for(let n=c.parentElement; n && !n.matches(II_ROOTS); n=n.parentElement){
    const cap=[...n.children].find(ch=>ch.matches('label, .sl') && !ch.contains(c));
    if(cap) return iiClean(cap.textContent);
    if(n.matches('.item')) break;
  }
  return iiClean(c.closest('.item')?.querySelector(':scope > .item-head label')?.textContent);
}
function iiDescribe(c){
  if(c.id && II_IDS[c.id]) return II_IDS[c.id];
  const label=iiLabel(c), kind=c.tagName==='BUTTON'?'':iiKind(c);
  const hit=II_FIELDS.find(([re,k])=>(!k||k===kind||c.tagName==='BUTTON') && re.test(label));
  return hit?hit[2]:null;
}
function iiOptionText(sel, opt){
  const label=iiLabel(sel), t=iiClean(opt.textContent);
  const hit=II_OPTIONS.find(([lre,ore])=>lre.test(label) && ore.test(t));
  return hit?hit[2]:null;
}

// ── Popup ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function iiTip(){
  let el=document.getElementById('inputTip');
  if(!el){ el=document.createElement('div'); el.id='inputTip'; document.body.appendChild(el); }
  const th=tipTheme(); el.style.background=th.bg; el.style.color=th.fg; el.style.borderColor=th.border;
  return el;
}
function iiHide(){ const el=document.getElementById('inputTip'); if(el){ el.style.opacity=0; el._for=null; } }
// Show `text` beside rect `r` (right of it, or left when there is no room; kept inside the window).
function iiShow(text, r, owner){
  const el=iiTip(), W=window.innerWidth, H=window.innerHeight;
  if(el._for===owner && el.textContent===text){ el.style.opacity=1; return; }
  el._for=owner; el.textContent=text; el.style.opacity=1;
  const w=el.offsetWidth, h=el.offsetHeight;
  let left=r.right+8; if(left+w>W-8) left=Math.max(8, r.left-8-w);
  if(left<r.right && left+w>r.left) left=Math.max(8, Math.min(r.left, W-w-8));   // no room either side: overlap rather than leave the window
  el.style.left=left+'px';
  el.style.top=Math.max(8, Math.min(r.top+r.height/2-h/2, H-h-8))+'px';
}

// ── Custom drop-down menu (replaces the native popup so each choice can show its description) ───────────────────────
let _iiMenu=null;
function iiCloseMenu(){ if(_iiMenu){ _iiMenu.remove(); _iiMenu=null; } iiHide(); }
function iiPick(sel, opt){
  const changed=sel.value!==opt.value;
  iiCloseMenu();
  if(changed){ sel.value=opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
  sel.focus();
}
function iiOpenMenu(sel){
  iiCloseMenu();
  const m=document.createElement('div'); m.id='iiMenu'; m.setAttribute('role','listbox');
  m.style.font=getComputedStyle(sel).font;
  [...sel.options].forEach(o=>{
    const it=document.createElement('div'); it.setAttribute('role','option');
    it.textContent=(o.selected?'✓ ':'   ')+o.textContent;
    it.classList.toggle('sel',o.selected); it.classList.toggle('dis',o.disabled);
    if(!o.disabled){
      it.addEventListener('mouseenter',()=>{ const d=iiOptionText(sel,o); if(d) iiShow(d, it.getBoundingClientRect(), o); else iiHide(); });
      it.addEventListener('mouseleave',iiHide);
      it.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation(); iiPick(sel,o); });
    }
    m.appendChild(it);
  });
  document.body.appendChild(m);
  const r=sel.getBoundingClientRect(), H=window.innerHeight;
  m.style.minWidth=r.width+'px'; m.style.maxHeight=(H-16)+'px';
  const mh=m.offsetHeight;
  m.style.top=(r.bottom+2+mh>H-8 ? Math.max(8,r.top-2-mh) : r.bottom+2)+'px';
  m.style.left=Math.max(8, Math.min(r.left, window.innerWidth-m.offsetWidth-8))+'px';
  _iiMenu=m;
}

// ── Wiring (event delegation; the input forms are re-rendered often) ───────────────────────────────────────────────
// A native title= would pop up a second, competing tooltip, so it is set aside while the pointer is over the element.
function iiSuspendTitle(t){ const e=t.closest('[title]'); if(e&&e.closest(II_ROOTS)){ e.dataset.iiTitle=e.title; e.removeAttribute('title'); } }
function iiRestoreTitle(t){ const e=t.closest('[data-ii-title]'); if(e){ e.title=e.dataset.iiTitle; delete e.dataset.iiTitle; } }

document.addEventListener('mouseover',e=>{
  if(!inputInfo || !e.target.closest || e.target.closest(II_MENU)) return;   // the menu shows its own choices' text
  const c=iiControlAt(e.target), txt=c&&iiDescribe(c);
  if(c) iiSuspendTitle(e.target);
  if(txt) iiShow(txt, c.getBoundingClientRect(), c); else iiHide();
});
document.addEventListener('mouseout',e=>{
  if(!e.target.closest) return;
  iiRestoreTitle(e.target);
  const to=e.relatedTarget;
  if(!to || !to.closest || !to.closest(II_ROOTS+', '+II_MENU)) iiHide();
});
document.addEventListener('mousedown',e=>{
  const t=e.target; if(!t.closest) return;
  if(_iiMenu && !t.closest(II_MENU)) iiCloseMenu();
  if(!inputInfo || e.button!==0) return;
  const sel=t.closest('select');
  if(sel && !sel.disabled && sel.closest(II_ROOTS)){ e.preventDefault(); iiHide(); sel.focus(); iiOpenMenu(sel); }
  else iiHide();
}, true);
document.addEventListener('keydown',e=>{ if(e.key==='Escape') iiCloseMenu(); });
// Scrolling the page closes the menu (as a native one does). Wheel / touch rather than `scroll`, which also fires for the browser's own scroll-into-view.
const iiOnScroll=e=>{ if(!(e.target.closest&&e.target.closest(II_MENU))) iiCloseMenu(); };
window.addEventListener('wheel',iiOnScroll,{capture:true,passive:true});
window.addEventListener('touchmove',iiOnScroll,{capture:true,passive:true});
window.addEventListener('resize',iiCloseMenu);
