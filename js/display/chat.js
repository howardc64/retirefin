'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHAT — "Ask about this plan" chat box. Sends the user's
// question, plus a compact text snapshot of the current inputs and the
// computed projection, to the Anthropic Messages API straight from the
// browser (no backend), and streams the answer back. Providers: Anthropic Claude, Google Gemini (free tier available), or any OpenAI-compatible server (OpenAI, OpenRouter, a local Ollama / LM Studio / llama.cpp server: base URL + key + model).
//
// Scenario tools (display/chatTools.js, display/chatCharts.js, compute/scenarioSpec.js): the model can call run_scenarios / sweep / show_chart /
// get_rows. Each call is run by the app's own projection engine on a private copy of the plan and drawn as chart cards under the reply; the model
// never computes or draws a number. Gemini function calling is the first-class path (free tier); Anthropic tool use is wired the same way.
//
// Read-only with respect to the plan: it never writes `state` (a scenario reaches the plan only when the user clicks a button on a card), and adds nothing to the saved plan file. The API key
// and chat settings live in the browser's own storage under their own
// keys (below) — never in `state`, so they cannot end up in a saved file
// or autosave. Chat history is in memory only.
//
// Privacy: every message sends the snapshot (ages, balances, income, tax,
// expenses) to the chosen provider's API. Names and birth years are NOT sent unless
// "Send names" is ticked (the model sees "Person 1/2" and current ages).
// ═══════════════════════════════════════════════════════════════
const CHAT_MAX_TOKENS = 4000;           // Anthropic reply cap (a tool call's JSON must not be cut off)
const CHAT_MAX_TOKENS_GEMINI = 8192;    // Gemini counts its "thinking" tokens against this cap, so it needs more room
const CHAT_MAX_HISTORY = 30;            // most recent messages kept per request (whole turns only: a tool call is never split from its result)
const CHAT_MAX_TOOL_ROUNDS = 4;         // model → tools → model … per question; the last round is asked for a plain answer
// Providers. `models` are suggestions only — the Model box accepts any id, because vendors rename/retire models often.
// Gemini: only Flash / Flash-Lite models have a free tier (Pro models are paid). Free-tier prompts can be used by Google
// to improve its products; the paid tier's are not (see `privacy`, shown in the panel).
const CHAT_PROVIDERS = {
  gemini:{
    label:'Google Gemini (free tier available)',
    url:'https://generativelanguage.googleapis.com/v1beta/models/', 
    keyLabel:'Google AI Studio API key', keyPlaceholder:'AIza…', keyHint:'Get a free key at aistudio.google.com/apikey (no credit card). The free tier covers Flash / Flash-Lite models only, at roughly 10–15 requests/minute.',
    defaultModel:'gemini-3-flash-preview',
    models:[{id:'gemini-3-flash-preview',label:'Gemini 3 Flash (preview)'},{id:'gemini-3.1-flash-lite',label:'Gemini 3.1 Flash-Lite (lightest)'},{id:'gemini-3.8-flash',label:'Gemini 3.8 Flash'},{id:'gemini-2.5-flash',label:'Gemini 2.5 Flash'}],
    sentTo:'Google’s Gemini API',
    privacy:'On Google’s free tier, prompts and replies may be used to improve Google’s products; paid-tier usage is not. Treat free-tier use as sharing this plan data with Google.'
  },
  anthropic:{
    label:'Anthropic Claude (paid API key)',
    url:'https://api.anthropic.com/v1/messages', version:'2023-06-01',
    keyLabel:'Anthropic API key', keyPlaceholder:'sk-ant-…', keyHint:'Create a key at console.anthropic.com.',
    defaultModel:'claude-sonnet-5-5',
    models:[{id:'claude-sonnet-5-5',label:'Claude Sonnet 5.5 (default)'},{id:'claude-opus-5-5',label:'Claude Opus 5.5 (deeper, slower)'},{id:'claude-haiku-4-5-20251001',label:'Claude Haiku 4.5 (fastest)'}],
    sentTo:'Anthropic’s API',
    privacy:''
  },
  // Any server that speaks OpenAI's /chat/completions (design phase 3, §6.4): the base URL, key and model are the user's. The key is optional for a server on this computer.
  openai:{
    label:'OpenAI-compatible (OpenAI, OpenRouter, Ollama, LM Studio…)',
    baseUrlEditable:true, defaultBaseUrl:'https://api.openai.com/v1',
    keyLabel:'API key (leave empty for a server on this computer)', keyPlaceholder:'sk-…', keyOptional:true,
    keyHint:'Set the base URL of the server (for example https://api.openai.com/v1, https://openrouter.ai/api/v1, or http://localhost:11434/v1 for Ollama). The browser talks to it directly, so the server must allow this page’s origin (CORS: for Ollama set OLLAMA_ORIGINS, for LM Studio turn on “Enable CORS”). The model must support tool calls for what-ifs to work.',
    defaultModel:'gpt-4.1-mini',
    models:[{id:'gpt-4.1-mini',label:'gpt-4.1-mini'},{id:'gpt-4.1',label:'gpt-4.1'},{id:'llama3.1',label:'llama3.1 (Ollama)'},{id:'qwen2.5',label:'qwen2.5 (Ollama)'}],
    sentTo:prefs=>{ const ep=chatOpenAIEndpoint(prefs&&prefs.baseUrl); return ep.error?'the server whose address you enter above':(ep.local?'the server on this computer ('+ep.host+')':'the server at '+ep.host); },
    privacy:'What the server does with prompts is up to that server’s operator; check its policy.'
  }
};
const CHAT_PREFS_KEY = 'retirementPlannerChat_v1';   // {provider, models:{anthropic,gemini,openai}, baseUrl (openai), includeNames, remember}

// OpenAI-compatible endpoint: '<base>/chat/completions'. A key is only ever sent over https, or over http to this computer. → {url, host, local} | {error}
function chatOpenAIEndpoint(base){
  const b=String(base==null||String(base).trim()===''?CHAT_PROVIDERS.openai.defaultBaseUrl:base).trim();
  const m=/^(https?):\/\/([^\/?#@\s]+)(\/[^?#\s]*)?$/i.exec(b);
  if(!m) return {error:'The base URL must look like https://host/v1 (no spaces, user name, query or #).'};
  const scheme=m[1].toLowerCase(), hostport=m[2], host=hostport.replace(/:\d+$/,'').toLowerCase();
  const local=/^(localhost|127(\.\d{1,3}){3}|\[::1\])$/.test(host);
  if(scheme==='http'&&!local) return {error:'Plain http is only allowed for a server on this computer (localhost or 127.0.0.1); use https for a remote server.'};
  let path=(m[3]||'').replace(/\/+$/,''); if(!/\/chat\/completions$/.test(path)) path+='/chat/completions';
  return {url:scheme+'://'+hostport+path,host,local};
}
const CHAT_KEY_KEYS  = {                             // one storage key per provider (sessionStorage, or localStorage if "remember")
  anthropic:'retirementPlannerChatApiKey_v1',
  gemini:'retirementPlannerChatGeminiKey_v1',
  openai:'retirementPlannerChatOpenAIKey_v1'
};

let chatMessages = [];      // [{role:'user'|'assistant', content:string}] — in memory only
let chatAbort = null;       // AbortController while a reply is streaming
let chatProviderShown = 'gemini';   // which provider the Settings fields currently show

// ── Settings storage (never part of `state`) ──
function chatLoadPrefs(){
  let p={}; try{ p=JSON.parse(localStorage.getItem(CHAT_PREFS_KEY)||'{}')||{}; }catch(e){}
  const models={}; Object.keys(CHAT_PROVIDERS).forEach(k=>{ models[k]=(p.models&&p.models[k])||CHAT_PROVIDERS[k].defaultModel; });
  if(!(p.models) && p.model) models.anthropic=p.model;      // prefs saved before Gemini support
  return {provider:CHAT_PROVIDERS[p.provider]?p.provider:'gemini', models, baseUrl:typeof p.baseUrl==='string'?p.baseUrl.slice(0,300):'', includeNames:!!p.includeNames, remember:!!p.remember, wide:!!p.wide};
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
  if(state.stateTax && state.stateTax.enabled) hh.stateTax = state.stateTax.state;
  if(state.futureTax && state.futureTax.enabled) hh.speculativeFutureNiitThreshold = chatStrip(state.futureTax);
  // Long Term Care: start age + cost per person (only as many as the household has), and the living expenses that apply after
  // the 1st / 2nd LTC start. living1 falls back to the household living expenses (married) or $7,500 (single) when never set, as in projection.js.
  if(state.ltc && state.ltc.enabled){
    const l = state.ltc;
    const ltcPeople = {}; people.forEach((p,i)=>{ const L=(l.people&&l.people[i])||{}; ltcPeople[label(i)] = {startAge:L.startAge, costPerYear:L.cost}; });
    hh.longTermCare = {people:ltcPeople, livingExpensesAfter1stLtcStart:(l.living1!=null?l.living1:ltcLiving1Default(married))};
    if(married) hh.longTermCare.livingExpensesAfter2ndLtcStart = (l.living2!=null?l.living2:LTC_LIVING2_DEFAULT);
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
    const re=(Array.isArray(p.realEstate)?p.realEstate:[]).filter(r=>r.enabled!==false).map(r=>{ const c=chatStrip(r); if(!includeNames) c.name='Property'; return c; });
    out.push(`${label(i)} (current age ${currentAge(p).toFixed(1)}):`);
    out.push(JSON.stringify({enabled, rentalProperties:rentalProps, brokeragePortfolios:pf, realEstateAssets:re, annuities:ann, notEnabled:disabled}));
  });
  out.push('');
  out.push('## Computed projection (one row per year, from the app; values are annual unless a balance)');
  out.push('Columns: year; ages (per person, "-" = deceased); filing; wages; ss (Social Security); pension; rental (taxable rental income); rental_dep (non-cash rental depreciation, added to cash income, untaxed); annuity_taxable / annuity_tax_exempt (annuity payouts: taxable part is ordinary income, tax-exempt part is untaxed; both are household income); tax_exempt (tax-exempt portfolio income, untaxed, part of household income); ira_dist (IRA distributions/RMDs); roth_conv (Roth conversions); ira_exp (pre-tax IRA withdrawn to pay expenses once the portfolios are exhausted; taxable ordinary income); roth_exp (Roth IRA withdrawn to pay expenses after the pre-tax IRA is exhausted; untaxed); div (all dividends); qdiv (qualified dividends, included in div); ltcg (realized long-term gains, net of SCGL); agi; magi (AGI + tax-exempt income, used for IRMAA); taxable_ss; senior_ded (enhanced senior deduction, Schedule 1-A, tax years 2025–2028); marginal_pct (marginal rate on the next dollar of ordinary income, includes the Social Security tax torpedo); tax_total (all federal income tax incl. NIIT); state_tax (state income tax, 0 unless the State tax assumption is enabled; it is not in tax_total but exp_tax includes it); irmaa (Medicare surcharge); exp_living, exp_ltc, exp_tax, exp_irmaa, exp_aum, exp_total (household expenses); exp_unfunded (expenses no source could cover); excess_reinvested (household income left after all expenses, reinvested into portfolios with "Reinvest excess income" checked); bal_brokerage (excl. IDGT), bal_idgt, bal_ira, bal_roth, bal_annuity, bal_realestate (year balances; real estate values are after tax, counting exempt gains, and it pays no expenses).');
  const head = 'year,ages,filing,wages,ss,pension,rental,rental_dep,tax_exempt,annuity_taxable,annuity_tax_exempt,ira_dist,roth_conv,ira_exp,roth_exp,div,qdiv,ltcg,agi,magi,taxable_ss,senior_ded,marginal_pct,tax_total,state_tax,irmaa,exp_living,exp_ltc,exp_tax,exp_irmaa,exp_aum,exp_total,exp_unfunded,excess_reinvested,bal_brokerage,bal_idgt,bal_ira,bal_roth,bal_annuity,bal_realestate';
  out.push(head);
  (proj.rows||[]).forEach(r=>{
    let brk=0, idgt=0, reBal=0;
    (r.portfoliosByPerson||[]).forEach(list=>(list||[]).forEach(e=>{ if(e.idgt) idgt+=e.balance||0; else brk+=e.balance||0; }));
    (r.realEstateByPerson||[]).forEach(list=>(list||[]).forEach(e=>{ reBal+=e.balance||0; }));
    out.push([
      THIS_YEAR+r.k,
      (r.ages||[]).map((a,i)=>(r.alive&&r.alive[i]===false)?'-':Math.floor(a)).join('/'),
      r.filing,
      chatRound(r.wageTotal), chatRound(r.totalSS), chatRound(r.pension), chatRound(r.rental), chatRound(r.rentalDep), chatRound(r.teIncome), chatRound(r.annuity), chatRound(r.annuityTE),
      chatRound(r.iraTotal), chatRound(r.rothConvTotal), chatRound(r.iraExpTotal), chatRound(r.rothExpTotal), chatRound(r.odiv), chatRound(r.qdiv), chatRound(r.ltcg),
      chatRound(r.agi), chatRound(r.magi), chatRound(r.taxableSS), chatRound(r.seniorDeduction), (Number(r.marginalRate)*100||0).toFixed(1),
      chatRound(r.totalTax), chatRound(r.stateTax), chatRound(r.irmaaSurcharge),
      chatRound(r.expLiving), chatRound(r.expLtc), chatRound(r.expTax), chatRound(r.expIrmaa), chatRound(r.expAum), chatRound(r.expTotal), chatRound(r.expUnfunded), chatRound(r.excessReinvested),
      chatRound(brk), chatRound(idgt), chatRound(chatSum(r.iraBalByPerson)), chatRound(chatSum(r.rothBalByPerson)), chatRound(r.annuityBalance), chatRound(reBal)
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
`- You never change the user's plan. A "what if" is answered by running the scenario tools (below) on a copy of the plan; the app shows the results as charts in the chat.`,
`- Be concise and plain-spoken. Short paragraphs or a short list; a small table only when comparing years. No long preambles.`,
`- You are not a financial, tax or legal advisor. Mention that briefly only when the user asks for a recommendation or a decision, and lay out the trade-offs rather than a confident directive.`,
``,
`Model facts worth knowing: everything is in today's dollars; filing status switches to single the year after a spouse passes; income sources marked to continue to the spouse do so after a passing; household expenses (living costs, IRMAA, AUM fee, income tax) are paid from income first, then dividends of portfolios flagged "Pay expenses", then asset sales (which realize capital gains); Roth conversions and RMDs come from the pre-tax IRA; the projection ends at each person's planned passing age.`+(includeNames?'':` People are labeled Person 1 / Person 2 (names are withheld).`),
``,
`Scenario tools (run_scenarios, sweep, show_chart, get_rows, define_market_scenario, list_market_scenarios, run_market_scenarios, show_market_scenario_in_charts, list_runs, get_run, compare_runs, get_mc_summary, get_trial, get_stress_results, import_scenarios):`,
`- For any what-if, comparison or "which age is best" question, call a tool instead of describing what to change. The app runs your levers through the planner's own projection engine on a copy of the plan and draws the charts; the user's saved plan is never changed.`,
`- Quote only numbers that are in the plan snapshot or in tool results. Never compute projections yourself, and never invent a chart: ask for one with the charts argument or show_chart.`,
`- Put all scenarios to compare into ONE run_scenarios call (up to 6), and use sweep for "try every value of X". Normally one tool call is enough; do not call tools repeatedly.`,
`- Every lever comes back applied, ignored (with a reason) or noEffect. If one is ignored or has no effect, tell the user plainly; never present unchanged numbers as a finding. Market-stress levers are simulations and cannot be saved as a Scenario.`,
`- Market and inflation paths: when the user describes how the market or inflation should behave year by year (\"two bad years then recovery\", \"inflation at 8% for five years\"), call define_market_scenario with one nominal stock return per year (returnsPct, percent) and optionally one inflation value per year; use afterReturnPct / afterInflationPct to carry a long-run rate to the end of the plan. Set showInCharts true when they ask to SEE it on the main charts (it is a replay, their plan is never changed). list_market_scenarios and run_market_scenarios reuse the presets and earlier paths.`,
`- Results the user already has on screen (their other Scenarios, the Stress test card, Monte Carlo, stress + Monte Carlo): call list_runs, then get_run / compare_runs / get_mc_summary / get_trial / get_stress_results to read them instead of guessing; a run marked stale was made before the user edited the plan. Use import_scenarios only when the user wants proposals they can review and add themselves.`,
`- If the request is ambiguous (which person? from what age?), choose a sensible default, say in one line what you assumed, and run it. People are numbered 1 and 2 as in the snapshot.`,
`- After the results, answer in a few short sentences: what changed, why, and one caveat. The headline-numbers table and the charts are already on screen, so do not repeat every figure. Dollar amounts from tools are in today's dollars.`,
``,
`----- PLAN SNAPSHOT -----`,
buildChatSnapshot(includeNames)
  ].join('\n');
}

// ── Markdown → HTML for a reply: the shared converter (core/markdown.js), tuned for a chat bubble (line breaks kept, flat headings, scrolling tables, no links). ──
function chatMarkdown(text){ return mdToHtml(String(text||''),{breaks:true,flatHeadings:true,tableWrap:'chat-tablewrap',links:false}); }

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
  if(prov==='openai'&&chatEl('chatBaseUrl')) prefs.baseUrl=chatEl('chatBaseUrl').value.trim().slice(0,300);
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
  const bu=chatEl('chatBaseUrlRow'); if(bu) bu.style.display=P.baseUrlEditable?'':'none';
  if(P.baseUrlEditable&&chatEl('chatBaseUrl')){ chatEl('chatBaseUrl').value=prefs.baseUrl||''; chatEl('chatBaseUrl').placeholder=P.defaultBaseUrl; }
  chatEl('chatModel').value=prefs.models[prov];
  chatEl('chatModelList').innerHTML=P.models.map(m=>`<option value="${escAttr(m.id)}">${escHtml(m.label)}</option>`).join('');
  chatEl('chatNames').checked=prefs.includeNames;
  chatEl('chatRemember').checked=prefs.remember;
  chatEl('chatPrivacy').firstChild.textContent='Each message sends your plan (ages, balances, income, tax and expense figures) to '+(typeof P.sentTo==='function'?P.sentTo(prefs):P.sentTo)+', and so do the results of any scenarios the model runs (headline numbers and a few sampled years). '+(P.privacy?P.privacy+' ':'')+'The key stays in this browser and is never written to a saved plan file. ';
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
  try{
    pre.textContent=buildChatSystemPrompt(chatEl('chatNames').checked)+'\n\n----- SCENARIO TOOLS (function declarations sent with every request) -----\n'+JSON.stringify(chatToolDeclList(),null,1);
  }catch(e){ pre.textContent='Could not build the snapshot: '+e.message; }
}
// Wide mode: the panel grows so chart cards have room. Saved with the chat settings (browser only).
function chatApplyWide(on){ const p=chatEl('chatPanel'); if(p) p.classList.toggle('wide',!!on); const b=chatEl('chatWide'); if(b) b.setAttribute('aria-pressed',on?'true':'false'); }
function toggleChatWide(){ const p=chatEl('chatPanel'); if(!p) return; const on=!p.classList.contains('wide'); chatApplyWide(on); const prefs=chatLoadPrefs(); prefs.wide=on; chatSavePrefs(prefs); }
function chatForgetKey(){ chatEl('chatKey').value=''; chatSetKey(chatProviderShown,'',false); chatShowStatus('API key removed from this browser.'); }
function clearChat(){
  if(chatAbort){ chatAbort.abort(); }
  chatMessages=[]; const box=chatEl('chatMessages'); if(box) box.textContent=''; chatShowStatus('');
  if(typeof chatCardsClear==='function') chatCardsClear();   // destroy the chart cards (display/chatCharts.js) and forget the finished runs (display/chatTools.js)
  if(typeof chatClearRuns==='function') chatClearRuns();
  chatAddBubble('assistant','Ask me anything about this plan — for example: why does tax jump in a particular year, or when do expenses stop being fully funded. I can also run what-ifs and chart them: “What if Person 1 claims Social Security at 70?”, “Compare converting $40k and $80k a year to Roth”, or “Show claim ages 62 to 70”. Your saved plan is never changed.');
}
function onChatKeydown(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); } }
function stopChat(){ if(chatAbort) chatAbort.abort(); }

// ── Messages ──
// chatMessages (in memory only), in a provider-neutral shape; chatBuildRequest maps it to each provider:
//   {role:'user', content}
//   {role:'assistant', content, calls?:[{id, name, args, part?, nativeId?}]}   `part` = Gemini's own functionCall part, kept verbatim (Gemini 3 needs its thoughtSignature back)
//   {role:'tool', results:[{id, name, response, isError, nativeId?}]}          answers the calls of the assistant message before it
let chatCallSeq=0;
const CHAT_DUMMY_SIGNATURE='skip_thought_signature_validator';   // Gemini's documented value for a function call the model did not produce itself (e.g. history from another provider)
function chatToolDeclList(){ return (typeof chatToolDecls==='function')?chatToolDecls():[]; }

// Long tool results from earlier questions are shrunk before they are re-sent (the model can still call get_rows / show_chart with the run ids).
function chatCompactResponse(resp){
  try{
    if(JSON.stringify(resp).length<2500) return resp;
    const o={note:'earlier result shortened; run ids stay valid for show_chart and get_rows'};
    if(resp.yourPlan&&resp.yourPlan.kpis) o.yourPlan=resp.yourPlan.kpis; else if(resp.yourPlan) o.yourPlan=resp.yourPlan;
    if(resp.scenarios) o.scenarios=resp.scenarios.map(s=>({runId:s.runId,label:s.label,kpis:s.kpis,levers:(s.levers||[]).map(l=>l.what+' ['+l.status+']')}));
    if(resp.results) o.results=resp.results.map(r=>({runId:r.runId,value:r.value,kpis:r.kpis}));
    return o;
  }catch(e){ return resp; }
}
// The most recent whole turns (a turn starts at a user message and includes its tool calls and results), at most CHAT_MAX_HISTORY messages,
// always ending with the current turn. A tool call is never separated from its result, which both APIs would reject.
function chatHistoryForRequest(){
  const starts=[]; chatMessages.forEach((m,i)=>{ if(m.role==='user') starts.push(i); });
  let f=0; while(starts.length-f>1 && chatMessages.length-starts[f]>CHAT_MAX_HISTORY) f++;
  const from=starts.length?starts[f]:0, lastStart=starts.length?starts[starts.length-1]:0;
  return chatMessages.slice(from).map((m,i)=>(m.role==='tool'&&from+i<lastStart)?Object.assign({},m,{results:m.results.map(r=>Object.assign({},r,{response:chatCompactResponse(r.response)}))}):m);
}
function chatGeminiContents(h){
  return h.map(m=>{
    if(m.role==='user') return {role:'user',parts:[{text:m.content}]};
    if(m.role==='assistant'){
      const parts=[]; if(m.content) parts.push({text:m.content});
      (m.calls||[]).forEach(c=>parts.push(c.part||{functionCall:{name:c.name,args:(c.args&&!c.args.__error)?c.args:{}},thoughtSignature:CHAT_DUMMY_SIGNATURE}));
      return {role:'model',parts};
    }
    return {role:'user',parts:m.results.map(r=>({functionResponse:Object.assign({name:r.name,response:r.response},r.nativeId?{id:r.id}:{})}))};
  });
}
function chatAnthropicMessages(h){
  return h.map(m=>{
    if(m.role==='user') return {role:'user',content:m.content};
    if(m.role==='assistant'){
      if(!(m.calls&&m.calls.length)) return {role:'assistant',content:m.content};
      const blocks=[]; if(m.content) blocks.push({type:'text',text:m.content});
      m.calls.forEach(c=>blocks.push({type:'tool_use',id:c.id,name:c.name,input:(c.args&&!c.args.__error)?c.args:{}}));
      return {role:'assistant',content:blocks};
    }
    return {role:'user',content:m.results.map(r=>({type:'tool_result',tool_use_id:r.id,content:JSON.stringify(r.response),is_error:!!r.isError}))};
  });
}

const chatOpenAIId=id=>String(id==null?'call':id).slice(0,40);
function chatOpenAIMessages(systemText,h){
  const out=[{role:'system',content:systemText}];
  h.forEach(m=>{
    if(m.role==='user') out.push({role:'user',content:m.content});
    else if(m.role==='assistant'){
      if(!(m.calls&&m.calls.length)) out.push({role:'assistant',content:m.content});
      else out.push({role:'assistant',content:m.content||null,tool_calls:m.calls.map(c=>({id:chatOpenAIId(c.id),type:'function',function:{name:c.name,arguments:JSON.stringify((c.args&&!c.args.__error)?c.args:{})}}))});
    } else m.results.forEach(r=>out.push({role:'tool',tool_call_id:chatOpenAIId(r.id),content:JSON.stringify(r.response)}));
  });
  return out;
}
// Tool calls arrive in pieces ({index, id?, function:{name?, arguments?}}); st.tc collects them until the stream says it is finished.
function chatOpenAIFlush(st){
  const out=[]; Object.keys(st.tc||{}).sort((a,b)=>a-b).forEach(i=>{
    const b=st.tc[i]; if(!b.name) return;
    let args; if(b.obj) args=b.obj; else { try{ args=b.args?JSON.parse(b.args):{}; }catch(e){ args={__error:e.message}; } }   // a cut-off call is answered with an error the model can fix
    out.push({id:chatOpenAIId(b.id||('call_'+(++chatCallSeq))),name:b.name,args});
  });
  st.tc={}; return out;
}

// ── Provider request / response shapes ──
// Returns {url, headers, body} for one streamed chat turn. allowTools=false asks for a plain answer (the tool-round limit was reached).
function chatBuildRequest(prov, model, key, systemText, history, allowTools, opts){
  const decls=chatToolDeclList();
  if(prov==='openai'){
    const ep=chatOpenAIEndpoint(opts&&opts.baseUrl); if(ep.error) throw Object.assign(new Error(ep.error),{handled:true});
    // No max_tokens: newer OpenAI models reject it (they want max_completion_tokens) while older servers want it, so the server's own default applies.
    const body={model, stream:true, messages:chatOpenAIMessages(systemText,history)};
    if(decls.length){ body.tools=decls.map(d=>({type:'function',function:{name:d.name,description:d.description,parameters:d.parameters}})); body.tool_choice=allowTools?'auto':'none'; }
    const headers={'content-type':'application/json'}; if(key) headers.authorization='Bearer '+key;
    return {url:ep.url, headers, body};
  }
  if(prov==='gemini'){
    const body={
      systemInstruction:{parts:[{text:systemText}]},
      contents:chatGeminiContents(history),
      generationConfig:{maxOutputTokens:CHAT_MAX_TOKENS_GEMINI}
    };
    if(decls.length){ body.tools=[{functionDeclarations:decls.map(d=>({name:d.name,description:d.description,parameters:d.parameters}))}]; body.toolConfig={functionCallingConfig:{mode:allowTools?'AUTO':'NONE'}}; }
    return {
      url: CHAT_PROVIDERS.gemini.url+encodeURIComponent(model.replace(/^models\//,''))+':streamGenerateContent?alt=sse',
      headers:{'content-type':'application/json','x-goog-api-key':key},
      body
    };
  }
  const body={
    model, max_tokens:CHAT_MAX_TOKENS, stream:true,
    // Rebuilt on every send so answers always reflect the inputs and charts as they are right now.
    system:[{type:'text', text:systemText, cache_control:{type:'ephemeral'}}],
    messages:chatAnthropicMessages(history)
  };
  if(decls.length){ body.tools=decls.map(d=>({name:d.name,description:d.description,input_schema:d.parameters})); body.tool_choice={type:allowTools?'auto':'none'}; }
  return {
    url: CHAT_PROVIDERS.anthropic.url,
    headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':CHAT_PROVIDERS.anthropic.version,'anthropic-dangerous-direct-browser-access':'true'},
    body
  };
}
// One parsed SSE event → {text, calls, stop, error}. stop is normalised: 'length' (hit the token cap), 'blocked:<why>', or 'end'.
// `st` is per-request parser state: Anthropic streams a tool call's JSON in pieces, Gemini sends each function call whole.
function chatParseEvent(prov, j, st){
  if(prov==='openai'){
    const out={};
    if(j.error){ out.error=typeof j.error==='string'?j.error:(j.error.message||'The API reported an error.'); return out; }
    const c=j.choices&&j.choices[0]; if(!c) return out;
    const d=c.delta||{};
    if(typeof d.content==='string'&&d.content) out.text=d.content;
    (Array.isArray(d.tool_calls)?d.tool_calls:[]).forEach(t=>{
      if(!t||typeof t!=='object') return;
      const i=t.index!=null?t.index:0, b=st.tc[i]||(st.tc[i]={id:null,name:'',args:'',obj:null}), f=t.function||{};
      if(t.id&&!b.id) b.id=t.id; if(f.name&&!b.name) b.name=String(f.name);
      if(typeof f.arguments==='string') b.args+=f.arguments; else if(f.arguments&&typeof f.arguments==='object') b.obj=f.arguments;
    });
    if(c.finish_reason){
      const calls=chatOpenAIFlush(st); if(calls.length) out.calls=calls;
      out.stop=c.finish_reason==='length'?'length':(c.finish_reason==='content_filter'?'blocked:content_filter':'end');
    }
    return out;
  }
  if(prov==='gemini'){
    const out={};
    if(j.error) out.error=j.error.message||'The API reported an error.';
    if(j.promptFeedback && j.promptFeedback.blockReason) out.stop='blocked:'+j.promptFeedback.blockReason;
    const c=j.candidates&&j.candidates[0];
    if(c){
      const parts=(c.content&&c.content.parts)||[];
      const t=parts.filter(p=>p && p.text && !p.thought).map(p=>p.text).join('');
      if(t) out.text=t;
      const fc=parts.filter(p=>p && p.functionCall);
      if(fc.length) out.calls=fc.map(p=>({id:p.functionCall.id||('call_'+(++chatCallSeq)), nativeId:!!p.functionCall.id, name:p.functionCall.name, args:p.functionCall.args||{}, part:p}));
      if(c.finishReason){ out.stop = c.finishReason==='MAX_TOKENS'?'length' : (c.finishReason==='STOP'?'end':'blocked:'+c.finishReason); }
    }
    return out;
  }
  if(j.type==='content_block_start' && j.content_block && j.content_block.type==='tool_use'){ st.blocks[j.index]={id:j.content_block.id,name:j.content_block.name,json:''}; return {}; }
  if(j.type==='content_block_delta' && j.delta){
    if(j.delta.type==='text_delta') return {text:j.delta.text};
    if(j.delta.type==='input_json_delta' && st.blocks[j.index]) st.blocks[j.index].json+=j.delta.partial_json||'';
    return {};
  }
  if(j.type==='content_block_stop' && st.blocks[j.index]){
    const b=st.blocks[j.index]; delete st.blocks[j.index];
    let args; try{ args=b.json?JSON.parse(b.json):{}; }catch(e){ args={__error:e.message}; }   // a cut-off call is answered with an error the model can fix
    return {calls:[{id:b.id,name:b.name,args}]};
  }
  if(j.type==='message_delta' && j.delta && j.delta.stop_reason) return {stop:j.delta.stop_reason==='max_tokens'?'length':'end'};
  if(j.type==='error') return {error:(j.error&&j.error.message)||'The API reported an error.'};
  return {};
}

// Reads a streamed (SSE) response, calling onText for each text delta; returns {stop, calls}.
async function chatReadStream(res, prov, onText){
  const reader=res.body.getReader(), dec=new TextDecoder(), st={blocks:{},tc:{}};
  let buf='', stop=null; const calls=[];
  for(;;){
    const {done,value}=await reader.read(); if(done) break;
    buf=(buf+dec.decode(value,{stream:true})).replace(/\r\n/g,'\n');   // Gemini separates events with CRLF
    let i;
    while((i=buf.indexOf('\n\n'))>=0){
      const evt=buf.slice(0,i); buf=buf.slice(i+2);
      const line=evt.split('\n').find(l=>l.startsWith('data:')); if(!line) continue;
      let j; try{ j=JSON.parse(line.slice(5).trim()); }catch(e){ continue; }
      const e=chatParseEvent(prov,j,st);
      if(e.error) throw new Error(e.error);
      if(e.text) onText(e.text);
      if(e.calls) e.calls.forEach(c=>calls.push(c));
      if(e.stop) stop=e.stop;
    }
  }
  if(prov==='openai') chatOpenAIFlush(st).forEach(c=>calls.push(c));   // a server that ends the stream without a finish_reason
  return {stop,calls};
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
// "Please retry in 12.3s" (Gemini free tier) → 12.3, else null.
function chatRetrySeconds(message){ const r=/retry in ([\d.]+)\s*s/i.exec(message||''); return r?parseFloat(r[1]):null; }
function chatSleep(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal.aborted) return reject(Object.assign(new Error('aborted'),{name:'AbortError'}));
    const t=setTimeout(resolve,ms); signal.addEventListener('abort',()=>{ clearTimeout(t); reject(Object.assign(new Error('aborted'),{name:'AbortError'})); },{once:true});
  });
}

// One request/response round. Streams text into `bubble` (and into box.reply). A free-tier rate limit that clears within 30 s is waited out once.
// → {stop, calls}
async function chatStreamRound(prov, model, key, prefs, allowTools, ctrl, bubble, box){
  const rq=chatBuildRequest(prov, model, key, buildChatSystemPrompt(prefs.includeNames), chatHistoryForRequest(), allowTools, {baseUrl:prefs.baseUrl});
  let waited=false;
  for(;;){
    const res=await fetch(rq.url,{method:'POST', signal:ctrl.signal, headers:rq.headers, body:JSON.stringify(rq.body)});
    if(res.ok){
      return chatReadStream(res, prov, t=>{
        box.reply+=t; bubble.classList.remove('chat-pending'); bubble.innerHTML=chatMarkdown(box.reply);
        const m=chatEl('chatMessages'); m.scrollTop=m.scrollHeight;
      });
    }
    let msg=''; try{ const j=await res.json(); msg=(j&&j.error&&(typeof j.error==='string'?j.error:j.error.message))||''; }catch(e){}
    const wait=res.status===429?chatRetrySeconds(msg):null;
    if(wait!=null && wait<=30 && !waited){ waited=true; chatShowStatus('Rate limit: retrying in '+Math.ceil(wait)+' s…'); await chatSleep(Math.ceil(wait*1000)+500,ctrl.signal); chatShowStatus(''); continue; }
    throw Object.assign(new Error(chatFriendlyError(res.status,msg,prov)),{handled:true});
  }
}

// A one-line note in the transcript for each tool call, so the user can see what ran.
function chatToolNote(c){
  const a=c.args||{};
  if(c.name==='run_scenarios'){ const n=Array.isArray(a.scenarios)?a.scenarios.length:0; return 'Ran '+n+' scenario'+(n===1?'':'s')+(n?': '+a.scenarios.map(s=>s&&s.label?s.label:'?').slice(0,6).join(' · '):''); }
  if(c.name==='sweep') return 'Swept '+(a.param||'a parameter')+' of '+((a.template&&a.template.lever)||'a lever')+' over '+(Array.isArray(a.values)?a.values.length:0)+' values';
  if(c.name==='show_chart') return 'Drew chart: '+(a.chart||'?');
  if(c.name==='get_rows') return 'Read yearly rows: '+(Array.isArray(a.fields)?a.fields.join(', '):'?');
  return 'Tool: '+c.name;
}
function chatAddToolNote(text,isError){
  const box=chatEl('chatMessages'); if(!box) return;
  const d=document.createElement('div'); d.className='chat-tool'+(isError?' chat-tool-err':''); d.textContent='▸ '+text; box.appendChild(d); box.scrollTop=box.scrollHeight;
}

async function sendChat(){
  if(chatAbort) return;
  const inp=chatEl('chatInput'); const text=(inp.value||'').trim(); if(!text) return;
  const prefs=chatSaveFields(), prov=prefs.provider, model=prefs.models[prov], key=chatGetKey(prov);
  if(prov==='openai'){
    const ep=chatOpenAIEndpoint(prefs.baseUrl); if(ep.error){ toggleChatSettings(true); chatShowStatus(ep.error,true); return; }
    if(!key&&!ep.local){ toggleChatSettings(true); chatShowStatus('Paste the server’s API key in ⚙ Settings first (only a server on this computer can be used without one).',true); return; }
  } else if(!key){ toggleChatSettings(true); chatShowStatus('Paste your '+CHAT_PROVIDERS[prov].keyLabel+' in ⚙ Settings first.',true); return; }

  inp.value=''; chatShowStatus(''); toggleChatSettings(false);   // the key is in place: give the transcript the room
  const turnStart=chatMessages.length;
  chatMessages.push({role:'user',content:text}); chatAddBubble('user',text);
  const ctrl=new AbortController(); chatAbort=ctrl; chatSetBusy(true);
  let toolsRan=false, rounds=0, bubble=null, box={reply:''};
  try{
    for(;;){
      const allowTools=rounds<CHAT_MAX_TOOL_ROUNDS && chatToolDeclList().length>0;
      box={reply:''}; bubble=chatAddBubble('assistant','…'); bubble.classList.add('chat-pending');
      const {stop,calls}=await chatStreamRound(prov, model, key, prefs, allowTools, ctrl, bubble, box);
      const reply=box.reply;
      if(!calls.length){
        if(!reply){
          const why=(stop&&stop.startsWith('blocked:'))?('The reply was blocked by the provider ('+stop.slice(8)+'). Try rephrasing.'):'The model returned an empty reply.';
          throw Object.assign(new Error(why),{handled:true});
        }
        if(stop==='length') chatShowStatus('Reply was cut off at the length limit — ask it to continue.');
        chatMessages.push({role:'assistant',content:reply});
        break;
      }
      // Tool round: run every call on a private copy of the plan, show the cards, and give the results back to the model.
      if(!reply) bubble.remove(); else bubble.classList.remove('chat-pending');
      chatShowStatus('Running scenarios…');
      await new Promise(r=>setTimeout(r,30));     // let the status paint before the (synchronous) engine runs
      if(ctrl.signal.aborted) throw Object.assign(new Error('aborted'),{name:'AbortError'});
      const results=[], cards=[], chatExecEffects=[];
      calls.forEach(c=>{
        const r=chatExecTool(c.name,c.args); chatExecEffects.push(r.isError?[]:(r.effects||[]));
        results.push({id:c.id,nativeId:c.nativeId,name:c.name,response:r.response,isError:!!r.isError});
        chatAddToolNote(r.isError?(chatToolNote(c)+' — rejected: '+((r.response&&r.response.error)||'error')):chatToolNote(c),!!r.isError);
        (r.cards||[]).forEach(x=>cards.push(x));
      });
      chatMessages.push({role:'assistant',content:reply,calls});     // pushed together, after the run, so the pair is never split
      chatMessages.push({role:'tool',results});
      toolsRan=true; rounds++; bubble=null; box={reply:''};
      chatRenderCards(cards,chatEl('chatMessages'));
      const fx=[]; results.forEach((x,i)=>{ (chatExecEffects[i]||[]).forEach(e=>fx.push(e)); }); chatApplyEffects(fx).forEach(n=>chatAddToolNote(n,false));   // what the tools asked to show on the main charts
      chatShowStatus('');
    }
  }catch(err){
    const aborted=err && err.name==='AbortError', partial=box.reply;
    if(toolsRan){
      // Earlier rounds finished and their cards are on screen: keep them, and close the turn with a plain assistant message so roles keep alternating.
      if(bubble && !partial) bubble.remove();
      const why=aborted?'Stopped.':((err&&err.handled)?err.message:('Could not reach the API: '+(err&&err.message?err.message:err)));
      chatMessages.push({role:'assistant',content:partial||('(No answer: '+why+')')});
      chatShowStatus(aborted?'Stopped. The results above are still valid.':why+' The results above are still valid; ask again to continue.',!aborted);
    }else if(aborted){
      if(partial){ chatMessages.push({role:'assistant',content:partial}); chatShowStatus('Stopped.'); }
      else { if(bubble) bubble.remove(); chatMessages.length=turnStart; chatShowStatus('Stopped.'); }
    }else{
      if(bubble) bubble.remove(); chatMessages.length=turnStart;      // drop the failed turn so it can be resent
      inp.value=text;
      chatShowStatus((err&&err.handled)?err.message:('Could not reach the API: '+(err&&err.message?err.message:err)+' (network, CORS or an ad/privacy blocker?)'),true);
    }
  }finally{
    chatAbort=null; chatSetBusy(false); if(bubble) bubble.classList.remove('chat-pending');
    if(chatEl('chatPanel').classList.contains('open')) inp.focus();
  }
}

function initChat(){
  if(!chatEl('chatPanel')) return;
  chatEl('chatProvider').innerHTML=Object.keys(CHAT_PROVIDERS).map(k=>`<option value="${k}">${escHtml(CHAT_PROVIDERS[k].label)}</option>`).join('');
  chatEl('chatPreviewWrap').addEventListener('toggle',chatRefreshPreview);
  chatLoadFields(chatLoadPrefs().provider);
  chatApplyWide(chatLoadPrefs().wide);
  clearChat();
}
window.addEventListener('DOMContentLoaded', initChat);
