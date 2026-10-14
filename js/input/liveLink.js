'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / LIVE LINK — two instances of the app (two browser tabs of the same page, each its own plan: open the second with ?plan=B) linked live.
// The PARENT plan (A) publishes what is left after its last passing every time its projection changes; the HEIR plan (B) has already imported A through the
// Inheritance card (input/inheritance.js), so its source row, its % per asset and its edits exist: the live link only replaces "re-import A's file" by "A pushes
// the same snapshot". B refreshes that source (inhApplySource: its % kept), syncInheritance() updates the created assets (a field the user changed stays), and B
// recomputes and redraws every chart. B's own inheritance inputs (%, ages, edited fields) work as always and redraw B at once.
// Only A → B influences a projection (the dependency is one-way; a loop A ← B ← A is refused by the `chain` check), so the two tabs cannot oscillate.
//
// Transport: BroadcastChannel (same origin, same browser, no server). Messages (all carry v:1 and the sender's tab id `inst`):
//   sub       B → all   "send me <targetId / fileName>"; repeated every LIVE_HEARTBEAT_MS; carries `have` (hash of the snapshot B holds)
//   snapshot  A → all   {liveId, name, fileName, chain, hash, startYear, assets[]} (the output of inhExtractFromProj), sent when it changed and a subscriber is alive
//   pong      A → B     the same header without assets, answer to a `sub` whose `have` is already current (keeps the link "connected")
//   discover / ann      "who is open?" / the answer {liveId, name, fileName, slot}, for the Link… button and the same-slot check
//   bye                 a tab closing
// A plan is found by `liveId` (state.liveId, made on first use, saved in the plan file) or, as in the file import, by its file name (saveName).
// Nothing is saved except the live fields on the source (`live`, `liveId`, `liveName`, `liveHash`, `liveChain`); when A is closed B keeps its last snapshot.
// ═══════════════════════════════════════════════════════════════
const LIVE_CHANNEL='retirementPlannerLive_v1';
const LIVE_INST=Math.random().toString(36).slice(2,10)+Date.now().toString(36);   // this tab
const LIVE_HEARTBEAT_MS=4000, LIVE_STALE_MS=12000, LIVE_PUBLISH_MS=150, LIVE_DEFER_MAX_MS=1500;
let liveCh=null;
const liveSubs=new Map();      // subscriber tab → {at}: tabs that want my snapshots
const liveRt={};               // source id → {at, name}: when a source's publisher was last heard (runtime only)
const livePending=new Map();   // source id → {m, i}: the newest snapshot waiting to be applied
let livePendingSince=0, livePubHash='', liveSeen=[], liveTimer=null;

function liveEnsureId(){ if(!state.liveId){ state.liveId='lp-'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); if(typeof saveDebounced==='function') saveDebounced(); } return state.liveId; }
function liveHash(o){ const s=JSON.stringify(o); let h=5381; for(let k=0;k<s.length;k++) h=((h<<5)+h+s.charCodeAt(k))|0; return String(h)+':'+s.length; }
function liveSend(msg){ if(liveCh){ try{ liveCh.postMessage(Object.assign({v:1,inst:LIVE_INST},msg)); }catch(e){} } }
function liveSources(){ const out=[]; state.people.forEach((p,i)=>((p.inheritance&&p.inheritance.sources)||[]).forEach((src,si)=>out.push({i,si,src}))); return out; }
function liveName(){
  const nm=(lastProjection&&lastProjection.people||[]).map((p,i)=>displayPersonName(p,i)).join(' & ');
  return [saveName||planSlotLabel(PLAN_INSTANCE), nm&&('('+nm+')')].filter(Boolean).join(' ')||'Plan';
}
// The plans upstream of this one (own id plus those of its live sources): a snapshot whose chain holds my id would make a loop, so it is refused.
function liveChain(){ const c=[liveEnsureId()]; liveSources().forEach(({src})=>{ if(src.live!==false&&src.liveId){ c.push(src.liveId); (src.liveChain||[]).forEach(x=>c.push(x)); } }); return [...new Set(c)]; }
function liveAnn(){ return {liveId:liveEnsureId(), name:liveName(), fileName:saveName||'', slot:PLAN_INSTANCE, chain:liveChain()}; }

// ── publisher (A) ────────────────────────────────────────────
function liveWantsPublish(){ const now=Date.now(); for(const [k,v] of liveSubs){ if(now-v.at>LIVE_STALE_MS) liveSubs.delete(k); } return liveSubs.size>0; }
let livePublishDebounced=null;   // made on first use: debounce() lives in app.js, which loads after this file
function liveAfterRecompute(){ if(liveCh&&liveWantsPublish()){ if(!livePublishDebounced) livePublishDebounced=debounce(()=>livePublish(false),LIVE_PUBLISH_MS); livePublishDebounced(); } }
function liveBody(){
  if(!lastProjection) return null;
  const res=inhExtractFromProj(state,lastProjection);
  return {startYear:res?res.startYear:null, assets:res?res.assets:[]};
}
function livePublish(force){
  const body=liveBody(); if(!body) return;
  const hash=liveHash(body);
  if(!force&&hash===livePubHash) return;
  livePubHash=hash;
  liveSend(Object.assign({t:'snapshot',hash,sentAt:Date.now()},liveAnn(),body));
  liveChip(); liveFlash();
}
function liveMatchesMe(m){ return (m.targetId&&m.targetId===state.liveId)||(m.fileName&&saveName&&inhSameFile(m.fileName,saveName)); }

// ── subscriber (B) ───────────────────────────────────────────
function liveSanitize(assets){
  if(!Array.isArray(assets)||assets.length>200) return null;
  const out=[];
  for(const a of assets){
    if(!a||typeof a!=='object'||typeof a.key!=='string'||!['pf','re','ira','roth'].includes(a.type)||!a.snap||typeof a.snap!=='object') return null;
    const v=Number(a.value); if(!Number.isFinite(v)) return null;
    out.push({key:a.key.slice(0,80), type:a.type, label:String(a.label||'').slice(0,160), value:v, snap:JSON.parse(JSON.stringify(a.snap))});
  }
  return out;
}
function liveFindSources(m){
  const out=[], now=Date.now();
  liveSources().forEach(({i,src})=>{
    if(src.live===false) return;
    if(src.liveId&&src.liveId===m.liveId){ out.push({i,src}); return; }
    const rt=liveRt[src.id];
    const same=m.fileName&&inhSameFile(m.fileName,src.file);
    if(same&&(!src.liveId||!rt||now-rt.at>LIVE_STALE_MS)) out.push({i,src,rebind:true});   // same file name as the import = the same plan; a changed id is taken over only if the old publisher is gone
  });
  return out;
}
function liveOnMessage(ev){
  const m=ev&&ev.data; if(!m||m.v!==1||m.inst===LIVE_INST||typeof m.t!=='string') return;
  if(m.to&&m.to!==LIVE_INST) return;
  switch(m.t){
    case 'sub':
      if(!liveMatchesMe(m)) return;
      liveSubs.set(m.inst,{at:Date.now()});
      { const body=liveBody(); if(!body) return;
        const hash=liveHash(body); livePubHash=hash;
        if(m.have!==hash) liveSend(Object.assign({t:'snapshot',to:m.inst,hash,sentAt:Date.now()},liveAnn(),body));
        else liveSend(Object.assign({t:'pong',to:m.inst,hash},liveAnn())); }
      liveChip(); break;
    case 'discover': liveSend(Object.assign({t:'ann',to:m.inst},liveAnn())); break;
    case 'ann': liveSeen.push(Object.assign({at:Date.now()},m)); if(m.slot===PLAN_INSTANCE&&!liveSlotWarned){ liveSlotWarned=true; alert('Another tab of this app uses the same plan slot'+(PLAN_INSTANCE?(' (?plan='+PLAN_INSTANCE+')'):'')+'; both would overwrite each other\'s autosave. Open the second plan with a different address, e.g. add ?plan=B.'); } break;
    case 'bye':
      liveSubs.delete(m.inst);
      liveSources().forEach(({src})=>{ if(src.liveId&&src.liveId===m.liveId&&liveRt[src.id]) liveRt[src.id].at=0; });
      liveRefreshStatus(); liveChip(); break;
    case 'snapshot': case 'pong': {
      const targets=liveFindSources(m);
      targets.forEach(({i,src,rebind})=>{
        if(Array.isArray(m.chain)&&state.liveId&&m.chain.includes(state.liveId)){ liveRt[src.id]={at:0,name:m.name,cycle:true}; return; }   // that plan inherits from this one
        if(rebind){ src.liveId=m.liveId; saveDebounced(); }
        liveRt[src.id]={at:Date.now(),name:m.name};
        if(src.liveName!==m.name||JSON.stringify(src.liveChain||[])!==JSON.stringify(m.chain||[])){ src.liveName=m.name; src.liveChain=m.chain||[]; }
        if(m.t==='snapshot'&&m.hash!==src.liveHash){ livePending.set(src.id,{m,i}); if(!livePendingSince) livePendingSince=Date.now(); liveFlushSoon(); }
      });
      liveRefreshStatus(); liveChip(); break; }
  }
}
let liveSlotWarned=false, liveFlushTimer=null;
function liveFlushSoon(){ if(liveFlushTimer) return; liveFlushTimer=setTimeout(()=>{ liveFlushTimer=null; liveFlush(); },60); }
// Apply the waiting snapshots. Rebuilding the input forms would drop the focus of a box the user is typing in, so while one is focused the update waits (at most LIVE_DEFER_MAX_MS).
function liveFlush(){
  if(!livePending.size){ livePendingSince=0; return; }
  const a=document.activeElement, typing=a&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)&&a.type!=='checkbox'&&a.type!=='button';
  if(typing&&Date.now()-livePendingSince<LIVE_DEFER_MAX_MS){ liveFlushTimer=setTimeout(()=>{ liveFlushTimer=null; liveFlush(); },250); return; }
  const touched=new Set();
  livePending.forEach(({m,i},id)=>{
    const p=state.people[i], src=p&&p.inheritance&&p.inheritance.sources.find(s=>s.id===id); if(!src||src.live===false) return;
    const assets=liveSanitize(m.assets); if(!assets) return;
    inhApplySource(p, src.file, {startYear:m.startYear!=null?m.startYear:src.startYear, assets});
    const ns=p.inheritance.sources.find(s=>s.id===id);
    ns.liveId=m.liveId; ns.liveName=m.name; ns.liveHash=m.hash; ns.liveChain=m.chain||[];
    touched.add(i);
  });
  livePending.clear(); livePendingSince=0;
  if(!touched.size) return;
  touched.forEach(i=>syncInheritance(i));
  renderIncomeForms(); recompute(); saveDebounced(); liveRefreshStatus(); liveChip(); liveFlash();
}
function liveBeat(){
  liveSources().forEach(({src})=>{ if(src.live!==false) liveSend({t:'sub',targetId:src.liveId||'',fileName:src.file,have:src.liveHash||'',from:liveEnsureId()}); });
  liveRefreshStatus(); liveChip();
}

// ── UI ───────────────────────────────────────────────────────
function liveState(src){
  if(src.live===false) return 'off';
  const rt=liveRt[src.id]; if(rt&&rt.cycle) return 'cycle';
  return rt&&Date.now()-rt.at<LIVE_STALE_MS?'on':'offline';
}
function liveStatusText(src){
  const st=liveState(src), nm=escHtml((liveRt[src.id]&&liveRt[src.id].name)||src.liveName||src.file);
  if(st==='on') return '<span style="color:var(--teal-text)">\u25CF Live from '+nm+'</span>';
  if(st==='cycle') return '<span style="color:#B3261E">\u25CF Not linked: that plan inherits from this one</span>';
  if(st==='off') return '<span style="opacity:.6">\u25CB Live link off</span>';
  return '<span style="opacity:.65" title="That plan is not open: this source keeps its last snapshot">\u25CB Waiting for '+escHtml(src.liveName||src.file)+'</span>';
}
function liveSourceHtml(s,i,si){
  if(!liveCh) return '';
  return '<div class="live-src">'+
    '<span class="live-status" data-live-src="'+escHtml(s.id)+'">'+liveStatusText(s)+'</span>'+
    '<label title="Follow that plan live while it is open in another tab (a snapshot of it is kept when it is closed). Your % and edited fields are never overwritten." style="display:inline-flex;gap:3px;align-items:center"><input type="checkbox" '+(s.live===false?'':'checked')+' onchange="onLiveToggle('+i+','+si+',this.checked)">Live</label>'+
    '<button type="button" class="btn" style="padding:2px 7px;font-size:10px" onclick="liveLinkClick('+i+','+si+')" title="Choose which open plan feeds this source">Link\u2026</button></div>';
}
function liveRefreshStatus(){
  document.querySelectorAll('[data-live-src]').forEach(el=>{
    const id=el.getAttribute('data-live-src'), f=liveSources().find(x=>x.src.id===id);
    if(f) el.innerHTML=liveStatusText(f.src);
  });
}
// The Live bar under the top buttons (index.html #liveBar): hidden without a live link; green when connected / sending, amber when every source is waiting for its plan.
// Becoming active gives a few pulses (CSS .attn, ~6 s); every update sent or received flashes it (liveFlash). The tab title carries a marker so the link is visible from the other tab too.
let liveBarState='', liveBaseTitle='';
function liveChip(){
  const el=document.getElementById('liveBar'); if(!el) return;
  const n=liveWantsPublish()?liveSubs.size:0;
  const act=liveSources().filter(x=>x.src.live!==false);
  const on=act.filter(x=>liveState(x.src)==='on'), waiting=act.filter(x=>liveState(x.src)==='offline');
  const parts=[];
  if(on.length) parts.push('receiving from '+on.map(x=>(liveRt[x.src.id]&&liveRt[x.src.id].name)||x.src.file).join(', '));
  if(n) parts.push('sending to '+n+' plan'+(n>1?'s':''));
  if(!parts.length&&waiting.length) parts.push('waiting for '+waiting.map(x=>x.src.liveName||x.src.file).join(', ')+' (not open: last snapshot in use)');
  const st=(on.length||n)?'on':(waiting.length?'wait':'');
  if(!st){ el.hidden=true; el.textContent=''; el.className='livebar'; liveBarState=''; liveSetTitle(false); return; }
  el.innerHTML='<span class="dot"></span><span><strong>Live link</strong> \u2014 '+escHtml(parts.join('; '))+'</span>';
  el.hidden=false;
  el.classList.toggle('wait',st==='wait');
  if(st==='on'&&liveBarState!=='on'){ el.classList.remove('attn'); void el.offsetWidth; el.classList.add('attn'); setTimeout(()=>el.classList.remove('attn'),6500); }   // just connected: draw the eye for a few seconds
  liveBarState=st; liveSetTitle(st==='on');
}
function liveFlash(){ const el=document.getElementById('liveBar'); if(!el||el.hidden) return; el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),450); }
function liveSetTitle(on){ if(!liveBaseTitle) liveBaseTitle=document.title; document.title=(on?'\uD83D\uDD17 ':'')+liveBaseTitle; }
function onLiveToggle(i,si,on){
  const src=state.people[i].inheritance.sources[si]; if(!src) return;
  src.live=on?undefined:false; if(!on) livePending.delete(src.id);
  saveDebounced(); liveRefreshStatus(); if(on) liveBeat(); liveChip();
}
async function liveLinkClick(i,si){
  const src=state.people[i].inheritance.sources[si]; if(!src) return;
  liveSeen=[]; liveSend({t:'discover'});
  await new Promise(r=>setTimeout(r,450));
  const mine=liveEnsureId(), found=liveSeen.filter(a=>a.liveId&&a.liveId!==mine&&!(Array.isArray(a.chain)&&a.chain.includes(mine)));
  const uniq=[...new Map(found.map(a=>[a.liveId,a])).values()];
  if(!uniq.length){ alert('No other open plan found. Open the app in another browser tab (add ?plan=A to its address), load the parent plan there and keep it open.'); return; }
  let pick=uniq[0];
  if(uniq.length>1){
    const ans=prompt('Link "'+src.file+'" to which open plan?\n'+uniq.map((a,k)=>(k+1)+'. '+a.name).join('\n'),'1');
    const k=Math.round(Number(ans)); if(!(k>=1&&k<=uniq.length)) return; pick=uniq[k-1];
  }else if(!confirm('Link "'+src.file+'" live to the open plan "'+pick.name+'"?')) return;
  src.liveId=pick.liveId; src.liveName=pick.name; src.liveHash=''; src.live=undefined;
  saveDebounced(); liveBeat();
}
function liveInit(){
  if(typeof BroadcastChannel==='undefined') return;
  try{ liveCh=new BroadcastChannel(LIVE_CHANNEL); }catch(e){ liveCh=null; return; }
  liveCh.onmessage=liveOnMessage;
  liveBaseTitle=document.title;
  window.addEventListener('pagehide',()=>liveSend({t:'bye',liveId:state.liveId||''}));
  liveSend({t:'discover'});   // also reveals another tab on the same plan slot (their `ann` → warning above)
  liveBeat();
  liveTimer=setInterval(()=>{ liveBeat(); },LIVE_HEARTBEAT_MS);
}
