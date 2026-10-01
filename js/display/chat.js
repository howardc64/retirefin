'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHAT — "Ask about this plan" chat box. Sends the user's
// question, plus a compact text snapshot of the current inputs and the
// computed projection, to the Anthropic Messages API straight from the
// browser (no backend), and streams the answer back. Providers: Anthropic Claude or Google Gemini (free tier available).
//
// Read-only with respect to the plan: it never writes `state`, never
// changes a chart, and adds nothing to the saved plan file. The API key
// and chat settings live in the browser's own storage under their own
// keys (below) — never in `state`, so they cannot end up in a saved file
// or autosave. Chat history is in memory only.
//
// Privacy: every message sends the snapshot (ages, balances, income, tax,
// expenses) to the chosen provider's API. Names and birth years are NOT sent unless
// "Send names" is ticked (the model sees "Person 1/2" and current ages).
// ═══════════════════════════════════════════════════════════════
const CHAT_MAX_TOKENS = 2000;           // Anthropic reply cap
const CHAT_MAX_TOKENS_GEMINI = 8192;    // Gemini counts its "thinking" tokens against this cap, so it needs more room
const CHAT_MAX_HISTORY = 20;            // most recent messages kept per request
// Providers. `models` are suggestions only — the Model box accepts any id, because vendors rename/retire models often.
// Gemini: only Flash / Flash-Lite models have a free tier (Pro models are paid). Free-tier prompts can be used by Google
// to improve its products; the paid tier's are not (see `privacy`, shown in the panel).
const CHAT_PROVIDERS = {
  anthropic:{
    label:'Anthropic Claude (paid API key)',
    url:'https://api.anthropic.com/v1/messages', version:'2023-06-01',
    keyLabel:'Anthropic API key', keyPlaceholder:'sk-ant-…', keyHint:'Create a key at console.anthropic.com.',
    defaultModel:'claude-sonnet-5-5',
    models:[{id:'claude-sonnet-5-5',label:'Claude Sonnet 5.5 (default)'},{id:'claude-opus-5-5',label:'Claude Opus 5.5 (deeper, slower)'},{id:'claude-haiku-4-5-20251001',label:'Claude Haiku 4.5 (fastest)'}],
    sentTo:'Anthropic’s API',
    privacy:''
  },
  gemini:{
    label:'Google Gemini (free tier available)',
    url:'https://generativelanguage.googleapis.com/v1beta/models/', 
    keyLabel:'Google AI Studio API key', keyPlaceholder:'AIza…', keyHint:'Get a free key at aistudio.google.com/apikey (no credit card). The free tier covers Flash / Flash-Lite models only, at roughly 10–15 requests/minute.',
    defaultModel:'gemini-3-flash-preview',
    models:[{id:'gemini-3-flash-preview',label:'Gemini 3 Flash (preview)'},{id:'gemini-3.1-flash-lite',label:'Gemini 3.1 Flash-Lite (lightest)'},{id:'gemini-3.8-flash',label:'Gemini 3.8 Flash'},{id:'gemini-2.5-flash',label:'Gemini 2.5 Flash'}],
    sentTo:'Google’s Gemini API',
    privacy:'On Google’s free tier, prompts and replies may be used to improve Google’s products; paid-tier usage is not. Treat free-tier use as sharing this plan data with Google.'
  }
};
const CHAT_PREFS_KEY = 'retirementPlannerChat_v1';   // {provider, models:{anthropic,gemini}, includeNames, remember}
const CHAT_KEY_KEYS  = {                             // one storage key per provider (sessionStorage, or localStorage if "remember")
  anthropic:'retirementPlannerChatApiKey_v1',
  gemini:'retirementPlannerChatGeminiKey_v1'
};

let chatMessages = [];      // [{role:'user'|'assistant', content:string}] — in memory only
let chatAbort = null;       // AbortController while a reply is streaming
let chatProviderShown = 'anthropic';   // which provider the Settings fields currently show

// ── Settings storage (never part of `state`) ──
function chatLoadPrefs(){
  let p={}; try{ p=JSON.parse(localStorage.getItem(CHAT_PREFS_KEY)||'{}')||{}; }catch(e){}
  const models={}; Object.keys(CHAT_PROVIDERS).forEach(k=>{ models[k]=(p.models&&p.models[k])||CHAT_PROVIDERS[k].defaultModel; });
  if(!(p.models) && p.model) models.anthropic=p.model;      // prefs saved before Gemini support
  return {provider:CHAT_PROVIDERS[p.provider]?p.provider:'anthropic', models, includeNames:!!p.includeNames, remember:!!p.remember};
}
function chatSavePrefs(p){ try{ localStorage.setItem(CHAT_PREFS_KEY, JSON.stringify(p)); }catch(e){} }
function chatGetKey(prov){
  const k=CHAT_KEY_KEYS[prov]; if(!k) return '';
  try{ return sessionStorage.getItem(k) || localStorage.getItem(k) || ''; }catch(e){ return ''; }
}
function chatSetKey(prov, key, remember){
  const k=CHAT_KEY_KEYS[prov]; if(!k) return;
  try{ sessionStorage.removeItem(k); localStorage.removeItem(k); }catch(e){}
  if(!key) return;
  try{ (remember?localStorage:sessionStorage).setItem(k, key); }catch(e){}
}

// ── Snapshot of the plan + results, as text for the model ──
const chatRound = v => Math.round(Number(v)||0);
const chatSum = a => (Array.isArray(a)?a:[]).reduce((t,v)=>t+(Number(v)||0),0);
function chatStrip(o){ return JSON.parse(JSON.stringify(o,(k,v)=>(k==='hidden'||k==='id')?undefined:v)); }

function buildChatSnapshot(includeNames){
  const proj = lastProjection || computeProjection();
  const married = state.filingStatus==='married';
  const people = married ? state.people : [state.people[0]];
  const label = i => includeNames ? displayPersonName(people[i], i) : 'Person '+(i+1);
  const out = [];

  out.push(`Snapshot date: ${THIS_YEAR}. All dollar amounts are in today's dollars (inflation-adjusted) unless stated. "year" below is the calendar year.`);
  out.push('');
  out.push('## Household assumptions');
  const passing = {}; people.forEach((p,i)=>{ passing[label(i)] = state.passing[p.id]; });
  const hh = {
    filingStatus: state.filingStatus,
    inflationPct: Math.round(state.inflation*10000)/100,
    livingExpensesPerYear: state.living||0,
    scgl: state.scglEnabled===false?0:(state.scgl||0),
    aumFee: (state.aumFee&&state.aumFee.enabled===false)?{mode:state.aumFee.mode,value:0}:state.aumFee,
    plannedPassingAge: passing
  };
  if(state.futureTax && state.futureTax.enabled) hh.speculativeFutureNiitThreshold = chatStrip(state.futureTax);
  // Long Term Care: start age + cost per person (only as many as the household has), and the living expenses that apply after
  // the 1st / 2nd LTC start. living1 falls back to the household living expenses when never set (as in projection.js).
  if(state.ltc && state.ltc.enabled){
    const l = state.ltc;
    const ltcPeople = {}; people.forEach((p,i)=>{ const L=(l.people&&l.people[i])||{}; ltcPeople[label(i)] = {startAge:L.startAge, costPerYear:L.cost}; });
    hh.longTermCare = {people:ltcPeople, livingExpensesAfter1stLtcStart:(l.living1!=null?l.living1:(state.living||0))};
    if(married) hh.longTermCare.livingExpensesAfter2ndLtcStart = l.living2||0;
  }
  out.push(JSON.stringify(hh));
  out.push('');
  out.push('## People and income sources (only enabled sources are listed; a disabled source contributes nothing)');
  people.forEach((p,i)=>{
    const enabled = {}, disabled = [];
    ['wage','ss','pension','ira','roth'].forEach(k=>{ if(p[k] && p[k].enabled) enabled[k]=chatStrip(p[k]); else disabled.push(k); });
    const rentalProps=(Array.isArray(p.rentals)?p.rentals:[]).filter(r=>r.enabled!==false).map(r=>{ const c=chatStrip(r); if(!includeNames) c.name='Rental'; return c; });
    const pf = (Array.isArray(p.brokerage)?p.brokerage:[]).filter(b=>b.enabled!==false).map(b=>{
      const c=chatStrip(b); if(!includeNames) c.name='Portfolio'; return c;
    });
    const ann=(Array.isArray(p.annuities)?p.annuities:[]).filter(a=>a.enabled!==false).map(a=>{ const c=chatStrip(a); if(!includeNames) c.name='Annuity'; return c; });
    out.push(`${label(i)} (current age ${currentAge(p).toFixed(1)}):`);
    out.push(JSON.stringify({enabled, rentalProperties:rentalProps, brokeragePortfolios:pf, annuities:ann, notEnabled:disabled}));
  });
  out.push('');
  out.push('## Computed projection (one row per year, from the app; values are annual unless a balance)');
  out.push('Columns: year; ages (per person, "-" = deceased); filing; wages; ss (Social Security); pension; rental (taxable rental income); rental_dep (non-cash rental depreciation, added to cash income, untaxed); annuity_taxable / annuity_tax_exempt (annuity payouts: taxable part is ordinary income, tax-exempt part is untaxed; both are household income); tax_exempt (tax-exempt portfolio income, untaxed, part of household income); ira_dist (IRA distributions/RMDs); roth_conv (Roth conversions); div (all dividends); qdiv (qualified dividends, included in div); ltcg (realized long-term gains, net of SCGL); agi; magi (AGI + tax-exempt income, used for IRMAA); taxable_ss; senior_ded (enhanced senior deduction, Schedule 1-A, tax years 2025–2028); marginal_pct (marginal rate on the next dollar of ordinary income, includes the Social Security tax torpedo); tax_total (all income tax incl. NIIT); irmaa (Medicare surcharge); exp_living, exp_ltc, exp_tax, exp_irmaa, exp_aum, exp_total (household expenses); exp_unfunded (expenses no source could cover); excess_reinvested (household income left after all expenses, reinvested into portfolios with "Reinvest excess income" checked); bal_brokerage (excl. IDGT), bal_idgt, bal_ira, bal_roth (year balances).');
  const head = 'year,ages,filing,wages,ss,pension,rental,rental_dep,tax_exempt,annuity_taxable,annuity_tax_exempt,ira_dist,roth_conv,div,qdiv,ltcg,agi,magi,taxable_ss,senior_ded,marginal_pct,tax_total,irmaa,exp_living,exp_ltc,exp_tax,exp_irmaa,exp_aum,exp_total,exp_unfunded,excess_reinvested,bal_brokerage,bal_idgt,bal_ira,bal_roth,bal_annuity';
  out.push(head);
  (proj.rows||[]).forEach(r=>{
    let brk=0, idgt=0;
    (r.portfoliosByPerson||[]).forEach(list=>(list||[]).forEach(e=>{ if(e.idgt) idgt+=e.balance||0; else brk+=e.balance||0; }));
    out.push([
      THIS_YEAR+r.k,
      (r.ages||[]).map((a,i)=>(r.alive&&r.alive[i]===false)?'-':Math.floor(a)).join('/'),
      r.filing,
      chatRound(r.wageTotal), chatRound(r.totalSS), chatRound(r.pension), chatRound(r.rental), chatRound(r.rentalDep), chatRound(r.teIncome), chatRound(r.annuity), chatRound(r.annuityTE),
      chatRound(r.iraTotal), chatRound(r.rothConvTotal), chatRound(r.odiv), chatRound(r.qdiv), chatRound(r.ltcg),
      chatRound(r.agi), chatRound(r.magi), chatRound(r.taxableSS), chatRound(r.seniorDeduction), (Number(r.marginalRate)*100||0).toFixed(1),
      chatRound(r.totalTax), chatRound(r.irmaaSurcharge),
      chatRound(r.expLiving), chatRound(r.expLtc), chatRound(r.expTax), chatRound(r.expIrmaa), chatRound(r.expAum), chatRound(r.expTotal), chatRound(r.expUnfunded), chatRound(r.excessReinvested),
      chatRound(brk), chatRound(idgt), chatRound(chatSum(r.iraBalByPerson)), chatRound(chatSum(r.rothBalByPerson)), chatRound(r.annuityBalance)
    ].join(','));
  });
  if(proj.stretch && proj.stretch.length && proj.people.some(p=>(p.ira.enabled&&p.ira.stretch)||(p.roth&&p.roth.enabled&&p.roth.stretch))){
    const last=proj.stretch[proj.stretch.length-1];
    out.push(`IRA stretch: after the last passing, stretch-flagged IRAs keep growing for ${proj.stretch.length} more years to about ${fmt(chatSum(last.iraBalByPerson)+chatSum(last.rothBalByPerson))} (pre-tax + Roth) with no withdrawals modeled.`);
  }
  if(!(proj.rows||[]).length) out.push('(no projection rows — inputs are empty or incomplete)');
  return out.join('\n');
}

function buildChatSystemPrompt(includeNames){
  return [
`You are an assistant built into a retirement income planner web app. The user is looking at the app's charts and wants to discuss their own plan. Below is a snapshot of their current inputs and of the app's computed projection.`,
``,
`How to answer:`,
`- Ground every answer in the snapshot. Quote specific years, ages and dollar amounts from it. If something is not in the snapshot, say so instead of guessing.`,
`- Explain and interpret the app's results (what drives a tax spike, when expenses go unfunded, how balances evolve); do not silently recompute taxes from scratch. If you do a back-of-envelope calculation, label it as such.`,
`- When the user asks "what if", say which input in the app to change and what you would expect to move — you cannot change the plan yourself.`,
`- Be concise and plain-spoken. Short paragraphs or a short list; a small table only when comparing years. No long preambles.`,
`- You are not a financial, tax or legal advisor. Mention that briefly only when the user asks for a recommendation or a decision, and lay out the trade-offs rather than a confident directive.`,
``,
`Model facts worth knowing: everything is in today's dollars; filing status switches to single the year after a spouse passes; income sources marked to continue to the spouse do so after a passing; household expenses (living costs, IRMAA, AUM fee, income tax) are paid from income first, then dividends of portfolios flagged "Pay expenses", then asset sales (which realize capital gains); Roth conversions and RMDs come from the pre-tax IRA; the projection ends at each person's planned passing age.`+(includeNames?'':` People are labeled Person 1 / Person 2 (names are withheld).`),
``,
`----- PLAN SNAPSHOT -----`,
buildChatSnapshot(includeNames)
  ].join('\n');
}

// ── Tiny, safe markdown → HTML (paragraphs, lists, bold, code, simple tables). Everything is escaped first. ──
function chatInline(s){
  return escHtml(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
}
function chatMarkdown(text){
  const blocks = String(text||'').replace(/\r/g,'').split(/\n{2,}/);
  return blocks.map(b=>{
    const lines=b.split('\n').filter(l=>l.trim().length);
    if(!lines.length) return '';
    if(lines.every(l=>/^\s*[-*•]\s+/.test(l))) return '<ul>'+lines.map(l=>'<li>'+chatInline(l.replace(/^\s*[-*•]\s+/,''))+'</li>').join('')+'</ul>';
    if(lines.every(l=>/^\s*\d+[.)]\s+/.test(l))) return '<ol>'+lines.map(l=>'<li>'+chatInline(l.replace(/^\s*\d+[.)]\s+/,''))+'</li>').join('')+'</ol>';
    if(lines.length>=2 && lines.every(l=>l.trim().startsWith('|'))){
      const rows=lines.filter(l=>!/^\s*\|?[\s:|-]+\|?\s*$/.test(l)).map(l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
      return '<div class="chat-tablewrap"><table>'+rows.map((r,i)=>'<tr>'+r.map(c=>(i===0?'<th>':'<td>')+chatInline(c)+(i===0?'</th>':'</td>')).join('')+'</tr>').join('')+'</table></div>';
    }
    if(/^#{1,4}\s/.test(lines[0])) return '<p><strong>'+chatInline(lines[0].replace(/^#{1,4}\s+/,''))+'</strong></p>'+(lines.length>1?'<p>'+lines.slice(1).map(chatInline).join('<br>')+'</p>':'');
    return '<p>'+lines.map(chatInline).join('<br>')+'</p>';
  }).join('');
}

// ── UI ──
const chatEl = id => document.getElementById(id);
function chatAddBubble(role, text){
  const box=chatEl('chatMessages'); if(!box) return null;
  const d=document.createElement('div');
  d.className='chat-msg chat-'+role;
  if(role==='assistant') d.innerHTML=chatMarkdown(text); else d.textContent=text;
  box.appendChild(d);
  box.scrollTop=box.scrollHeight;
  return d;
}
function chatSetBusy(busy){
  const send=chatEl('chatSend'), stop=chatEl('chatStop'), inp=chatEl('chatInput');
  if(send) send.style.display=busy?'none':'';
  if(stop) stop.style.display=busy?'':'none';
  if(inp) inp.disabled=busy;
}
function chatShowStatus(msg, isError){
  const s=chatEl('chatStatus'); if(!s) return;
  s.textContent=msg||''; s.classList.toggle('chat-error',!!isError);
}
function toggleChat(force){
  const panel=chatEl('chatPanel'), btn=chatEl('chatToggle'); if(!panel) return;
  const open = force===undefined ? !panel.classList.contains('open') : !!force;
  panel.classList.toggle('open',open);
  if(btn) btn.setAttribute('aria-expanded',open?'true':'false');
  if(open){
    if(!chatGetKey(chatProviderShown)) toggleChatSettings(true);
    const inp=chatEl('chatInput'); if(inp && !inp.disabled) inp.focus();
  }
}
function toggleChatSettings(force){
  const s=chatEl('chatSettings'); if(!s) return;
  s.classList.toggle('open', force===undefined?!s.classList.contains('open'):!!force);
}
// Settings fields → storage. The model/key fields belong to `chatProviderShown` (not necessarily the just-changed select).
function chatSaveFields(){
  const prefs=chatLoadPrefs(), prov=chatProviderShown;
  prefs.provider=prov;
  prefs.models[prov]=chatEl('chatModel').value.trim()||CHAT_PROVIDERS[prov].defaultModel;
  prefs.includeNames=chatEl('chatNames').checked;
  prefs.remember=chatEl('chatRemember').checked;
  chatSavePrefs(prefs);
  chatSetKey(prov, chatEl('chatKey').value.trim(), prefs.remember);
  return prefs;
}
// Storage → Settings fields, for one provider.
function chatLoadFields(prov){
  const P=CHAT_PROVIDERS[prov], prefs=chatLoadPrefs();
  chatProviderShown=prov;
  chatEl('chatProvider').value=prov;
  chatEl('chatKeyLabel').textContent=P.keyLabel;
  chatEl('chatKey').placeholder=P.keyPlaceholder;
  chatEl('chatKey').value=chatGetKey(prov);
  chatEl('chatKeyHint').textContent=P.keyHint;
  chatEl('chatModel').value=prefs.models[prov];
  chatEl('chatModelList').innerHTML=P.models.map(m=>`<option value="${escAttr(m.id)}">${escHtml(m.label)}</option>`).join('');
  chatEl('chatNames').checked=prefs.includeNames;
  chatEl('chatRemember').checked=prefs.remember;
  chatEl('chatPrivacy').firstChild.textContent='Each message sends your plan (ages, balances, income, tax and expense figures) to '+P.sentTo+'. '+(P.privacy?P.privacy+' ':'')+'The key stays in this browser and is never written to a saved plan file. ';
  chatRefreshPreview();
}
function onChatSettingsChange(){ chatSaveFields(); chatRefreshPreview(); }
function onChatProviderChange(){
  const next=chatEl('chatProvider').value;
  chatSaveFields();                 // persist what was typed for the provider we are leaving
  chatLoadFields(next);
  const prefs=chatLoadPrefs(); prefs.provider=next; chatSavePrefs(prefs);
  chatShowStatus('');
}
function chatRefreshPreview(){
  const pre=chatEl('chatPreview'); if(!pre || !pre.parentElement.open) return;
  try{ pre.textContent=buildChatSystemPrompt(chatEl('chatNames').checked); }catch(e){ pre.textContent='Could not build the snapshot: '+e.message; }
}
function chatForgetKey(){ chatEl('chatKey').value=''; chatSetKey(chatProviderShown,'',false); chatShowStatus('API key removed from this browser.'); }
function clearChat(){
  if(chatAbort){ chatAbort.abort(); }
  chatMessages=[]; const box=chatEl('chatMessages'); if(box) box.textContent=''; chatShowStatus('');
  chatAddBubble('assistant','Ask me anything about this plan — for example: why does tax jump in a particular year, when do expenses stop being fully funded, or what changes if Social Security starts later.');
}
function onChatKeydown(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); } }
function stopChat(){ if(chatAbort) chatAbort.abort(); }

// ── Provider request / response shapes ──
// Returns {url, headers, body} for one streamed chat turn.
function chatBuildRequest(prov, model, key, systemText, history){
  if(prov==='gemini'){
    return {
      url: CHAT_PROVIDERS.gemini.url+encodeURIComponent(model.replace(/^models\//,''))+':streamGenerateContent?alt=sse',
      headers:{'content-type':'application/json','x-goog-api-key':key},
      body:{
        systemInstruction:{parts:[{text:systemText}]},
        contents:history.map(m=>({role:m.role==='assistant'?'model':'user', parts:[{text:m.content}]})),
        generationConfig:{maxOutputTokens:CHAT_MAX_TOKENS_GEMINI}
      }
    };
  }
  return {
    url: CHAT_PROVIDERS.anthropic.url,
    headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':CHAT_PROVIDERS.anthropic.version,'anthropic-dangerous-direct-browser-access':'true'},
    body:{
      model, max_tokens:CHAT_MAX_TOKENS, stream:true,
      // Rebuilt on every send so answers always reflect the inputs and charts as they are right now.
      system:[{type:'text', text:systemText, cache_control:{type:'ephemeral'}}],
      messages:history
    }
  };
}
// One parsed SSE event → {text, stop, error}. stop is normalised: 'length' (hit the token cap), 'blocked:<why>', or 'end'.
function chatParseEvent(prov, j){
  if(prov==='gemini'){
    const out={};
    if(j.error) out.error=j.error.message||'The API reported an error.';
    if(j.promptFeedback && j.promptFeedback.blockReason) out.stop='blocked:'+j.promptFeedback.blockReason;
    const c=j.candidates&&j.candidates[0];
    if(c){
      const parts=(c.content&&c.content.parts)||[];
      const t=parts.filter(p=>p && p.text && !p.thought).map(p=>p.text).join('');
      if(t) out.text=t;
      if(c.finishReason){ out.stop = c.finishReason==='MAX_TOKENS'?'length' : (c.finishReason==='STOP'?'end':'blocked:'+c.finishReason); }
    }
    return out;
  }
  if(j.type==='content_block_delta' && j.delta && j.delta.type==='text_delta') return {text:j.delta.text};
  if(j.type==='message_delta' && j.delta && j.delta.stop_reason) return {stop:j.delta.stop_reason==='max_tokens'?'length':'end'};
  if(j.type==='error') return {error:(j.error&&j.error.message)||'The API reported an error.'};
  return {};
}

// Reads a streamed (SSE) response, calling onText for each text delta; returns the normalised stop reason.
async function chatReadStream(res, prov, onText){
  const reader=res.body.getReader(), dec=new TextDecoder();
  let buf='', stop=null;
  for(;;){
    const {done,value}=await reader.read(); if(done) break;
    buf=(buf+dec.decode(value,{stream:true})).replace(/\r\n/g,'\n');   // Gemini separates events with CRLF
    let i;
    while((i=buf.indexOf('\n\n'))>=0){
      const evt=buf.slice(0,i); buf=buf.slice(i+2);
      const line=evt.split('\n').find(l=>l.startsWith('data:')); if(!line) continue;
      let j; try{ j=JSON.parse(line.slice(5).trim()); }catch(e){ continue; }
      const e=chatParseEvent(prov,j);
      if(e.error) throw new Error(e.error);
      if(e.text) onText(e.text);
      if(e.stop) stop=e.stop;
    }
  }
  return stop;
}
// The most recent turns, always starting with a user message (both APIs require that).
function chatHistoryForRequest(){
  const h=chatMessages.slice(-CHAT_MAX_HISTORY);
  while(h.length && h[0].role!=='user') h.shift();
  return h;
}
function chatFriendlyError(status, message, prov){
  const m=message||'';
  if(status===401 || (status===400 && /api key/i.test(m))) return 'The API key was rejected. Check it in ⚙ Settings.';
  if(status===403) return 'This key is not allowed to use that model, feature or region ('+m+').';
  if(status===404) return 'Model not found — change the model in ⚙ Settings ('+m+').';
  if(status===429) return (prov==='gemini'?'Free-tier rate limit or daily quota reached — wait a minute (or until tomorrow if the daily cap is used)':'Rate limited or out of quota — try again in a moment')+' ('+m+').';
  if(status===529||status>=500) return 'The API is busy or unavailable right now — try again shortly.';
  return m||('Request failed (HTTP '+status+').');
}

async function sendChat(){
  if(chatAbort) return;
  const inp=chatEl('chatInput'); const text=(inp.value||'').trim(); if(!text) return;
  const prefs=chatSaveFields(), prov=prefs.provider, model=prefs.models[prov], key=chatGetKey(prov);
  if(!key){ toggleChatSettings(true); chatShowStatus('Paste your '+CHAT_PROVIDERS[prov].keyLabel+' in ⚙ Settings first.',true); return; }

  inp.value=''; chatShowStatus('');
  chatMessages.push({role:'user',content:text}); chatAddBubble('user',text);
  const bubble=chatAddBubble('assistant','…'); bubble.classList.add('chat-pending');
  const ctrl=new AbortController(); chatAbort=ctrl; chatSetBusy(true);
  let reply='', stop=null;
  try{
    const rq=chatBuildRequest(prov, model, key, buildChatSystemPrompt(prefs.includeNames), chatHistoryForRequest());
    const res=await fetch(rq.url,{method:'POST', signal:ctrl.signal, headers:rq.headers, body:JSON.stringify(rq.body)});
    if(!res.ok){
      let msg=''; try{ const j=await res.json(); msg=(j&&j.error&&j.error.message)||''; }catch(e){}
      throw Object.assign(new Error(chatFriendlyError(res.status,msg,prov)),{handled:true});
    }
    stop=await chatReadStream(res, prov, t=>{
      reply+=t; bubble.classList.remove('chat-pending'); bubble.innerHTML=chatMarkdown(reply);
      const box=chatEl('chatMessages'); box.scrollTop=box.scrollHeight;
    });
    if(!reply){
      const why=(stop&&stop.startsWith('blocked:'))?('The reply was blocked by the provider ('+stop.slice(8)+'). Try rephrasing.'):'The model returned an empty reply.';
      throw Object.assign(new Error(why),{handled:true});
    }
    if(stop==='length') chatShowStatus('Reply was cut off at the length limit — ask it to continue.');
    chatMessages.push({role:'assistant',content:reply});
  }catch(err){
    if(err && err.name==='AbortError'){
      if(reply){ chatMessages.push({role:'assistant',content:reply}); chatShowStatus('Stopped.'); }
      else { bubble.remove(); chatMessages.pop(); chatShowStatus('Stopped.'); }
    }else{
      bubble.remove(); chatMessages.pop();            // drop the failed turn so it can be resent
      inp.value=text;
      chatShowStatus((err&&err.handled)?err.message:('Could not reach the API: '+(err&&err.message?err.message:err)+' (network, CORS or an ad/privacy blocker?)'),true);
    }
  }finally{
    chatAbort=null; chatSetBusy(false); bubble.classList.remove('chat-pending');
    if(chatEl('chatPanel').classList.contains('open')) inp.focus();
  }
}

function initChat(){
  if(!chatEl('chatPanel')) return;
  chatEl('chatProvider').innerHTML=Object.keys(CHAT_PROVIDERS).map(k=>`<option value="${k}">${escHtml(CHAT_PROVIDERS[k].label)}</option>`).join('');
  chatEl('chatPreviewWrap').addEventListener('toggle',chatRefreshPreview);
  chatLoadFields(chatLoadPrefs().provider);
  clearChat();
}
window.addEventListener('DOMContentLoaded', initChat);
