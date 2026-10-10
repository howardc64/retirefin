'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / LOAD MENU — the "Load file ▾" dropdown in the topbar:
//   1. "Choose file from local directory…"  → loadFromFile() (core/state.js)
//   2. One entry per saved-plan JSON file found in Samples/
//
// Browsers give a page no way to list a folder, so Samples/ is
// discovered at menu-open time, in this order:
//   a. Samples/manifest.json — a JSON array of file names (authoritative;
//      required on hosts with no directory listing, e.g. GitHub Pages)
//   b. the server's own directory-listing page for Samples/, if it serves
//      one (e.g. `python3 -m http.server`) — every link ending in .json
// Reading either needs http(s); Chrome blocks it under file://, in which
// case the menu says so instead of silently showing nothing.
// ═══════════════════════════════════════════════════════════════
const SAMPLES_DIR = 'Samples/';

async function discoverSamples(){
  try{
    const res = await fetch(SAMPLES_DIR+'manifest.json', {cache:'no-store'});
    if(res.ok){
      const list = await res.json();
      if(Array.isArray(list)) return list.filter(n=>typeof n==='string' && /\.json$/i.test(n) && !/^manifest\.json$/i.test(n));
    }
  }catch(e){ /* fall through to directory listing */ }
  const res = await fetch(SAMPLES_DIR, {cache:'no-store'}); // throws if blocked (file://) or offline
  if(!res.ok) throw new Error('HTTP '+res.status);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const names = [...doc.querySelectorAll('a[href]')]
    .map(a=>decodeURIComponent(a.getAttribute('href').split('?')[0].split('/').pop()))
    .filter(n=>/\.json$/i.test(n) && !/^manifest\.json$/i.test(n));
  return [...new Set(names)].sort();
}

function closeLoadMenu(){
  const m=document.getElementById('loadMenu'); if(!m) return;
  m.classList.remove('open');
  document.getElementById('loadMenuBtn').setAttribute('aria-expanded','false');
}

async function toggleLoadMenu(ev){
  if(ev) ev.stopPropagation();
  const m=document.getElementById('loadMenu');
  if(m.classList.contains('open')){ closeLoadMenu(); return; }
  buildLoadMenu(m, null);           // show the local-file entry immediately
  m.classList.add('open');
  document.getElementById('loadMenuBtn').setAttribute('aria-expanded','true');
  try{ buildLoadMenu(m, await discoverSamples()); }
  catch(e){ buildLoadMenu(m, undefined); }
}

// samples: null = still loading, undefined = discovery failed, array = discovered names.
function buildLoadMenu(menu, samples){
  menu.textContent='';
  const add=(tag,cls,text,onclick)=>{
    const el=document.createElement(tag);
    if(cls) el.className=cls;
    if(text!=null) el.textContent=text;
    if(onclick){ el.type='button'; el.setAttribute('role','menuitem'); el.addEventListener('click',onclick); }
    menu.appendChild(el); return el;
  };
  add('button',null,'Choose file from local directory…',()=>{ closeLoadMenu(); loadFromFile(); });
  menu.appendChild(document.createElement('hr'));
  add('div','dd-head','Samples');
  if(samples===null) add('div','dd-note','Looking for sample files…');
  else if(samples===undefined) add('div','dd-note',"Couldn't read the Samples/ folder. Reading it needs the app served over http(s) (e.g. GitHub Pages or a local static server) — browsers block it when index.html is opened directly as a file.");
  else if(!samples.length) add('div','dd-note','No .json files found in Samples/.');
  else samples.forEach(name=>add('button',null,name.replace(/\.json$/i,''),()=>loadSample(name)));
}

async function loadSample(name){
  closeLoadMenu();
  try{
    const res = await fetch(SAMPLES_DIR+encodeURIComponent(name), {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    applyLoadedFileText(await res.text());
    setSaveTarget(null,name);   // sample plans are never overwritten: Save asks where to save a copy
  }catch(err){
    alert('Could not load sample "'+name+'": '+(err&&err.message?err.message:err));
  }
}

document.addEventListener('click', e=>{ if(!e.target.closest('#loadDropdown')) closeLoadMenu(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeLoadMenu(); });
