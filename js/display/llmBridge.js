'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / LLM BRIDGE — the page side of the live bridge (design phase 3, docs/LLM_INTEGRATION_DESIGN.md §6.3; server side: server/bridge.js + server/mcp.js --bridge).
// The 🤖 LLM popup's "Live bridge" tab connects this page to an MCP server on THIS computer (ws://127.0.0.1:<port>) so a host such as Claude Desktop works on the plan exactly as it is on
// screen, and can ask the page to show things. Off by default: nothing connects until the user types the server's pairing code and presses Connect.
//
//   page → server   the whole plan (what Save writes) after Connect and after every edit (debounced; hooked into autosave()), and the list of effect types the user has allowed.
//   server → page   EFFECTS: requests to change what is on screen. Only the kinds in LB_EFFECTS exist; anything else is answered "unsupported". Each kind needs the user's click the first
//                   time on a connection (Allow = for this connection, Deny = this request only); an allowed kind is applied without asking again until Disconnect.
// An effect never writes `state`: showMarketPath replays a (re-validated) path in the main charts like the B view, showProposals puts (re-validated, re-run) scenarios in the proposals list.
// The pairing code is kept in memory only (never in storage, `state` or a file). Everything the server sends is untrusted: sizes capped, shapes re-validated, text escaped.
// ═══════════════════════════════════════════════════════════════
const LB_MAX_IN=2000000, LB_MAX_PENDING=5, LB_PORT_KEY='retirementPlannerBridgePort_v1';
let lbSock=null, lbStatus='off', lbMsg='', lbMsgErr=false, lbSession=null, lbTimer=null, lbLastSent='', lbReplaced=false;
let lbForm={port:'8765',token:''}, lbApproved=new Set(), lbPending=[], lbLog=[], lbSync={at:null,key:null,ok:null,error:null}, lbEverWelcomed=false;
try{ const p=localStorage.getItem(LB_PORT_KEY); if(p&&/^\d{4,5}$/.test(p)) lbForm.port=p; }catch(e){}

const lbEsc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const lbClean=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n||80);
function lbNote(t){ lbLog.unshift(new Date().toLocaleTimeString()+'  '+t); if(lbLog.length>20) lbLog.length=20; }
function lbSay(msg,err){ lbMsg=msg; lbMsgErr=!!err; if(typeof renderLlmCard==='function') renderLlmCard(); }   // shown at the top of the Live bridge tab

// ── effects ──────────────────────────────────────────────────────
// Each: label (what the user is asked), what (a one-line description of this request), apply(effect) → {status:'applied'|'error', note}
const LB_EFFECTS={
  showMarketPath:{
    label:'Show a market scenario in the main charts',
    what(e){ const p=e&&e.path||{}; return '“'+lbClean(p.label,60)+'” ('+((p.returns&&p.returns.length)||0)+' yearly values) replayed in all the charts like the B view. Your plan is not changed; Back to plan returns.'; },
    apply(e){
      if(typeof msValidate!=='function'||typeof mcLoadMarketPath!=='function') return {status:'error',note:'this page cannot show market paths'};
      const v=msValidate(e&&e.path,{source:'mcp'}); if(v.errors.length) return {status:'error',note:'not a valid market path: '+v.errors[0]};
      const path=v.path, taken={}; msSaved().forEach(p=>{ taken[p.id]=1; }); apiBuiltinPaths().forEach(p=>{ taken[p.id]=1; }); Object.keys(msSession).forEach(k=>{ taken[k]=1; });
      if(taken[path.id]) path.id=msUniqueId(path.id,taken);   // never replace a saved or preset path of the same name
      msSessionAdd(path);
      if(!mcLoadMarketPath(path.id)) return {status:'error',note:'the page could not show it (is a Monte Carlo run in progress?)'};
      return {status:'applied',note:'showing "'+path.label+'"'};
    }},
  showPlan:{
    label:'Show a plan in the main charts',
    what(e){ return 'the plan “'+lbClean(e&&e.ref,60)+'” replayed in all the charts like the B view. Your plan is not changed; Back to plan returns.'; },
    apply(e){
      if(typeof plShow!=='function') return {status:'error',note:'this page cannot show plans'};
      const r=plShow(String(e&&e.ref||'')); return r.ok?{status:'applied',note:'showing "'+lbClean(r.label,60)+'"'}:{status:'error',note:r.why};
    }},
  showProposals:{
    label:'Add scenarios to the 🤖 LLM proposals list',
    what(e){ const l=(e&&e.spec&&Array.isArray(e.spec.scenarios))?e.spec.scenarios:[]; return l.length+' scenario'+(l.length===1?'':'s')+' ('+l.slice(0,4).map(s=>'“'+lbClean(s&&s.label,40)+'”').join(', ')+(l.length>4?', …':'')+') to review. Nothing is added to your plan; you choose what to do with each.'; },
    apply(e){
      if(typeof rrImport!=='function') return {status:'error',note:'this page cannot import scenarios'};
      const r=rrImport(e&&e.spec,{source:'mcp'}); if(r.error) return {status:'error',note:r.error};
      if(typeof openLlmCard==='function') openLlmCard('import');
      return {status:r.accepted.length?'applied':'error',note:r.accepted.length+' added'+(r.rejected.length?', '+r.rejected.length+' not accepted ('+r.rejected.map(x=>lbClean(x.label,30)).join(', ')+')':'')};
    }}
};
function lbReply(id,status,note){ lbRawSend({type:'effectResult',id,status,note:lbClean(note,300)}); }
function lbOnEffect(m){
  const e=m.effect, id=typeof m.id==='string'?m.id.slice(0,40):null;
  if(!id||!e||typeof e!=='object'||typeof e.type!=='string') return;
  if(!Object.prototype.hasOwnProperty.call(LB_EFFECTS,e.type)){ lbNote('refused an unknown effect type'); lbReply(id,'unsupported','this page does not know that effect'); return; }
  const req={id,effect:e,why:lbClean(m.why,200),at:Date.now()};
  if(lbApproved.has(e.type)){ lbRun(req); return; }
  if(lbPending.length>=LB_MAX_PENDING){ lbReply(id,'denied','too many requests are waiting for the user'); return; }
  lbPending.push(req); lbNote('asks to: '+LB_EFFECTS[e.type].label.toLowerCase());
  if(typeof openLlmCard==='function') openLlmCard('bridge'); else if(typeof renderLlmCard==='function') renderLlmCard();   // the user has to see the question
}
function lbRun(req){
  let r; try{ r=LB_EFFECTS[req.effect.type].apply(req.effect); }catch(err){ r={status:'error',note:String(err&&err.message||err)}; }
  lbNote((r.status==='applied'?'applied: ':'could not apply: ')+LB_EFFECTS[req.effect.type].label.toLowerCase()+(r.note?' ('+lbClean(r.note,100)+')':''));
  lbReply(req.id,r.status,r.note);
  if(typeof renderLlmCard==='function') renderLlmCard();
}
function lbAllow(id,remember){
  const i=lbPending.findIndex(p=>p.id===id); if(i<0) return; const req=lbPending[i]; lbPending.splice(i,1);
  if(remember!==false){ lbApproved.add(req.effect.type); lbSendApprovals(); }
  lbRun(req);
  if(remember!==false) lbPending.filter(p=>p.effect.type===req.effect.type).forEach(p=>{ lbPending.splice(lbPending.indexOf(p),1); lbRun(p); });   // the same kind, already waiting
}
function lbDeny(id){
  const i=lbPending.findIndex(p=>p.id===id); if(i<0) return; const req=lbPending[i]; lbPending.splice(i,1);
  lbNote('you refused: '+LB_EFFECTS[req.effect.type].label.toLowerCase()); lbReply(id,'denied','the user declined'); if(typeof renderLlmCard==='function') renderLlmCard();
}
function lbRevoke(type){ lbApproved.delete(type); lbSendApprovals(); lbNote('revoked: '+type); if(typeof renderLlmCard==='function') renderLlmCard(); }

// ── connection ───────────────────────────────────────────────────
function lbRawSend(o){ try{ if(lbSock&&lbSock.readyState===1) lbSock.send(JSON.stringify(o)); }catch(e){} }
function lbSendApprovals(){ lbRawSend({type:'approvals',types:Array.from(lbApproved)}); }
function lbSendPlan(force,syncId){
  if(lbStatus!=='connected'||!lbSock||lbSock.readyState!==1) return;
  let json; try{ json=JSON.stringify(state); }catch(e){ return; }
  if(!force&&json===lbLastSent) return;
  const rep=lbReplaced; lbLastSent=json; try{ lbSock.send('{"type":"plan"'+(syncId?',"syncId":'+JSON.stringify(syncId):'')+(rep?',"replaced":true':'')+',"plan":'+json+'}'); lbReplaced=false; }catch(e){ lbLastSent=''; }
}
// A different plan was loaded (file, sample, reset), as opposed to edited: the next plan sent says so, and the server drops the runs it holds for the old one. Called by the cards' reset.
function llmBridgeReplaced(){ if(lbStatus!=='connected') return; lbReplaced=true; lbLastSent=''; clearTimeout(lbTimer); lbTimer=setTimeout(()=>lbSendPlan(true),800); }
// A run finished in the page (Monte Carlo, stress tests, or both): send the plan it ran on and then the settings it used, so the server can reproduce it and the LLM can read it.
// The results themselves are not sent: the same plan, settings and seed give the same trials there. Called by the cards; does nothing without a connected bridge.
function llmBridgeRunDone(kind,mcCfgUsed,stCfgUsed){
  if(lbStatus!=='connected'||!lbSock||lbSock.readyState!==1) return;
  lbSendPlan(true);
  let msg; try{ msg=JSON.stringify({type:'pageRun',kind,mc:mcCfgUsed||null,stress:stCfgUsed||null}); }catch(e){ return; }
  try{ lbSock.send(msg); }catch(e){}
}
// The server asks for the plan before each tool call, so a tool never runs on a plan that is still waiting for the debounce. Unchanged → a tiny answer, no plan.
function lbOnSyncRequest(m){
  const id=typeof m.id==='string'?m.id.slice(0,40):null; if(!id||lbStatus!=='connected') return;
  let json; try{ json=JSON.stringify(state); }catch(e){ return; }
  clearTimeout(lbTimer);
  if(json===lbLastSent&&!lbReplaced) lbRawSend({type:'synced',id}); else lbSendPlan(true,id);
}
// Called by autosave() on every plan change; cheap when no bridge is connected.
function llmBridgeNotify(){ if(lbStatus!=='connected') return; clearTimeout(lbTimer); lbTimer=setTimeout(()=>lbSendPlan(false),800); }
function lbSetField(k,v){ lbForm[k]=v; }
function lbConnect(){
  if(lbSock) return;
  const port=Number(lbForm.port), token=String(lbForm.token||'').trim();
  if(!Number.isInteger(port)||port<1024||port>65535){ lbSay('The port must be a whole number from 1024 to 65535 (the server prints it).',true); return; }
  if(token.replace(/[\s-]/g,'').length<12){ lbSay('Enter the pairing code the server printed (12 letters and digits).',true); return; }
  if(typeof WebSocket==='undefined'){ lbSay('This browser has no WebSocket support.',true); return; }
  try{ localStorage.setItem(LB_PORT_KEY,String(port)); }catch(e){}
  let ws; try{ ws=new WebSocket('ws://127.0.0.1:'+port); }catch(e){ lbSay('Could not open the connection: '+lbClean(e&&e.message,120),true); return; }
  lbSock=ws; lbStatus='connecting'; lbEverWelcomed=false; lbMsg=''; lbLastSent='';
  ws.onopen=()=>{ try{ ws.send(JSON.stringify({type:'hello',token,client:'planner page'})); }catch(e){} };
  ws.onmessage=ev=>lbOnMessage(ws,ev.data);
  ws.onerror=()=>{};
  ws.onclose=ev=>lbClosed(ws,ev);
  if(typeof renderLlmCard==='function') renderLlmCard();
}
function lbOnMessage(ws,data){
  if(ws!==lbSock||typeof data!=='string'||data.length>LB_MAX_IN) return;
  let m; try{ m=JSON.parse(data); }catch(e){ return; }
  if(!m||typeof m!=='object') return;
  if(m.type==='welcome'){
    lbStatus='connected'; lbEverWelcomed=true; lbSession=lbClean(m.session,40); lbForm.token=''; lbNote('connected'); lbMsg='';
    lbSendApprovals(); lbSendPlan(true); if(typeof renderLlmCard==='function') renderLlmCard();
  } else if(m.type==='denied'){
    lbStatus='denied'; lbMsg=m.reason==='replaced by a newer page'?'Another page took over the connection.':'The server refused the pairing code. Check it (it changes after several wrong tries).'; lbMsgErr=true; lbNote('refused: '+lbClean(m.reason,60));
  } else if(m.type==='planAck'){
    lbSync={at:Date.now(),key:m.key?lbClean(m.key,16):null,ok:!!m.ok,error:m.ok?null:lbClean(m.error,160)}; if(typeof renderLlmCard==='function') renderLlmCard();
  } else if(m.type==='effect'){ lbOnEffect(m); }
  else if(m.type==='syncRequest'){ lbOnSyncRequest(m); }
  else if(m.type==='effectCancel'){ const n=lbPending.length; lbPending=lbPending.filter(p=>p.id!==m.id); if(lbPending.length!==n){ lbNote('the request timed out'); if(typeof renderLlmCard==='function') renderLlmCard(); } }
}
function lbClosed(ws,ev){
  if(ws!==lbSock) return;
  const was=lbStatus; lbSock=null; lbSession=null; lbApproved=new Set(); lbPending=[]; lbForm.token=''; clearTimeout(lbTimer); lbLastSent=''; lbReplaced=false;
  if(was==='denied') { /* message already set */ }
  else if(was==='connecting'&&!lbEverWelcomed){ lbMsg='Could not connect. Is the server running with --bridge, and are the port and the code right? (An https page may be blocked from ws://127.0.0.1 by the browser.)'; lbMsgErr=true; }
  else if(was==='connected'){ lbMsg='Disconnected.'; lbMsgErr=false; lbNote('disconnected'); }
  lbStatus='off'; lbSync={at:null,key:null,ok:null,error:null};
  if(typeof renderLlmCard==='function') renderLlmCard();
}
function lbDisconnect(){ if(!lbSock) return; lbRawSend({type:'bye'}); try{ lbSock.close(1000); }catch(e){} lbClosed(lbSock,null); }

// ── the tab ──────────────────────────────────────────────────────
function lbEffectHtml(req){
  const d=LB_EFFECTS[req.effect.type];
  return '<div class="llm-prop"><div class="llm-prop-h"><b>The connected program asks to: '+lbEsc(d.label.toLowerCase())+'</b></div>'+
    '<div class="llm-what">'+lbEsc(d.what(req.effect))+'</div>'+(req.why?'<div class="llm-why">'+lbEsc(req.why)+'</div>':'')+
    '<div class="llm-acts"><button class="btn btn-primary" onclick="lbAllow(\''+lbEsc(req.id)+'\')" title="Do it now, and do not ask again for this kind of request until you disconnect">Allow</button>'+
    '<button class="btn" onclick="lbAllow(\''+lbEsc(req.id)+'\',false)" title="Do it this once; ask again next time">Allow once</button>'+
    '<button class="btn" onclick="lbDeny(\''+lbEsc(req.id)+'\')">Deny</button></div></div>';
}
function lbTabHtml(){
  let h=(lbMsg?'<div class="'+(lbMsgErr?'llm-err':'llm-ok')+'">'+lbEsc(lbMsg)+'</div>':'')+'<div class="llm-note">Lets an MCP host (Claude Desktop, a script) that runs <code>node server/mcp.js --bridge</code> <b>on this computer</b> work on the plan exactly as it is on screen, and ask this page to show things. '+
    'Off until you connect. The link stays on this computer (127.0.0.1) and needs the pairing code the server prints. <b>What is sent:</b> your whole plan, the same content as Save (names and birth years included; the server hides names from the LLM unless it was started with <code>--names</code>), again after each edit while connected. '+
    'The server cannot change your plan. It can only ask for the on-screen effects listed here, and each kind asks you first.</div>';
  if(lbStatus==='off'||lbStatus==='denied'||lbStatus==='connecting'){
    h+='<div class="llm-opts"><label>Port <input type="text" inputmode="numeric" size="6" value="'+lbEsc(lbForm.port)+'" oninput="lbSetField(\'port\',this.value)" autocomplete="off"></label>'+
      '<label>Pairing code <input type="password" size="18" value="'+lbEsc(lbForm.token)+'" oninput="lbSetField(\'token\',this.value)" onkeydown="if(event.key===\'Enter\')lbConnect()" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX"></label></div>'+
      '<div class="llm-acts"><button class="btn btn-primary" onclick="lbConnect()"'+(lbStatus==='connecting'?' disabled':'')+'>'+(lbStatus==='connecting'?'Connecting…':'Connect')+'</button></div>';
  } else {
    h+='<div class="llm-ok">Connected'+(lbSession?' <span class="llm-badge">'+lbEsc(lbSession)+'</span>':'')+'. '+
      (lbSync.ok===true?'The server has your plan (version '+lbEsc(lbSync.key||'?')+', '+new Date(lbSync.at).toLocaleTimeString()+').':(lbSync.ok===false?'<span class="llm-err">The server could not read the plan: '+lbEsc(lbSync.error)+'</span>':'Sending the plan…'))+'</div>'+
      '<div class="llm-acts"><button class="btn" onclick="lbDisconnect()">Disconnect</button><button class="btn" onclick="lbSendPlan(true)" title="Send the plan again now">Send plan now</button></div>';
    const kinds=Object.keys(LB_EFFECTS);
    h+='<div class="llm-note"><b>Effects it may ask for:</b></div><div class="llm-runs">'+kinds.map(k=>'<div class="llm-run"><span><b>'+lbEsc(LB_EFFECTS[k].label)+'</b> '+
      (lbApproved.has(k)?'<span class="llm-badge">allowed for this connection</span> <button class="btn" onclick="lbRevoke(\''+k+'\')">Revoke</button>':'<span class="llm-badge">asks first</span>')+'</span></div>').join('')+'</div>';
  }
  if(lbPending.length) h+=lbPending.map(lbEffectHtml).join('');
  if(lbLog.length) h+='<details class="llm-note"><summary>Activity</summary><pre class="llm-pre">'+lbEsc(lbLog.join('\n'))+'</pre></details>';
  return h;
}
