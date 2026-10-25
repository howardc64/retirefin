'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHAT — "Ask about this plan" chat box. Sends the user's
// question, plus a compact text snapshot of the current inputs and the
// computed projection, to the Anthropic Messages API straight from the
// browser (no backend), and streams the answer back. Providers: Anthropic Claude, Google Gemini (free tier available), or any OpenAI-compatible server (OpenAI, OpenRouter, a local Ollama / LM Studio / llama.cpp server: base URL + key + model).
//
// Scenario tools (display/chatTools.js, display/chatCharts.js, compute/scenarioSpec.js): the model can call run_scenarios / sweep / show_chart /
// get_rows. Each call is run by the app's own projection engine on a private copy of the scenario and drawn as chart cards under the reply; the model
// never computes or draws a number. Gemini function calling is the first-class path (free tier); Anthropic tool use is wired the same way.
//
// Split by job: chatSnapshot.js (the plan as text + the system prompt), chatProviders.js (message list and each provider's request / response shapes),
// this file (settings, the chat panel UI, sending and streaming).
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
const CHAT_MAX_TOKENS = 4000; // Anthropic reply cap (a tool call's JSON must not be cut off)
const CHAT_MAX_TOKENS_GEMINI = 8192; // Gemini counts its "thinking" tokens against this cap, so it needs more room
const CHAT_MAX_HISTORY = 30; // most recent messages kept per request (whole turns only: a tool call is never split from its result)
const CHAT_MAX_TOOL_ROUNDS = 4; // model → tools → model … per question; the last round is asked for a plain answer
// Providers. `models` are suggestions only — the Model box accepts any id, because vendors rename/retire models often.
// Gemini: only Flash / Flash-Lite models have a free tier (Pro models are paid). Free-tier prompts can be used by Google
// to improve its products; the paid tier's are not (see `privacy`, shown in the panel).
const CHAT_PROVIDERS = {
  gemini: {
    label: 'Google Gemini (free tier available)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/',
    keyLabel: 'Google AI Studio API key',
    keyPlaceholder: 'AIza…',
    keyHint:
      'Get a free key at aistudio.google.com/apikey (no credit card). The free tier covers Flash / Flash-Lite models only, at roughly 10–15 requests/minute.',
    defaultModel: 'gemini-3-flash-preview',
    models: [
      {id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)'},
      {id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (lightest)'},
      {id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash'},
      {id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash'}
    ],
    sentTo: 'Google’s Gemini API',
    privacy:
      'On Google’s free tier, prompts and replies may be used to improve Google’s products; paid-tier usage is not. Treat free-tier use as sharing this scenario data with Google.'
  },
  anthropic: {
    label: 'Anthropic Claude (paid API key)',
    url: 'https://api.anthropic.com/v1/messages',
    version: '2023-06-01',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-…',
    keyHint: 'Create a key at console.anthropic.com.',
    defaultModel: 'claude-sonnet-5-5',
    models: [
      {id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (default)'},
      {id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (deeper, slower)'},
      {id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)'}
    ],
    sentTo: 'Anthropic’s API',
    privacy: ''
  },
  // Any server that speaks OpenAI's /chat/completions (design phase 3, §6.4): the base URL, key and model are the user's. The key is optional for a server on this computer.
  openai: {
    label: 'OpenAI-compatible (OpenAI, OpenRouter, Ollama, LM Studio…)',
    baseUrlEditable: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyLabel: 'API key (leave empty for a server on this computer)',
    keyPlaceholder: 'sk-…',
    keyOptional: true,
    keyHint:
      'Set the base URL of the server (for example https://api.openai.com/v1, https://openrouter.ai/api/v1, or http://localhost:11434/v1 for Ollama). The browser talks to it directly, so the server must allow this page’s origin (CORS: for Ollama set OLLAMA_ORIGINS, for LM Studio turn on “Enable CORS”). The model must support tool calls for what-ifs to work.',
    defaultModel: 'gpt-4.1-mini',
    models: [
      {id: 'gpt-4.1-mini', label: 'gpt-4.1-mini'},
      {id: 'gpt-4.1', label: 'gpt-4.1'},
      {id: 'llama3.1', label: 'llama3.1 (Ollama)'},
      {id: 'qwen2.5', label: 'qwen2.5 (Ollama)'}
    ],
    sentTo: prefs => {
      const ep = chatOpenAIEndpoint(prefs && prefs.baseUrl);
      return ep.error
        ? 'the server whose address you enter above'
        : ep.local
          ? 'the server on this computer (' + ep.host + ')'
          : 'the server at ' + ep.host;
    },
    privacy: 'What the server does with prompts is up to that server’s operator; check its policy.'
  }
};
const CHAT_PREFS_KEY = 'retirementPlannerChat_v1'; // {provider, models:{anthropic,gemini,openai}, baseUrl (openai), includeNames, remember}

let chatMessages = []; // [{role:'user'|'assistant', content:string}] — in memory only
let chatAbort = null; // AbortController while a reply is streaming
let chatProviderShown = 'gemini'; // which provider the Settings fields currently show

// ── Settings storage (never part of `state`) ──
function chatLoadPrefs() {
  let p = {};
  try {
    p = JSON.parse(localStorage.getItem(CHAT_PREFS_KEY) || '{}') || {};
  } catch (e) {}
  const models = {};
  Object.keys(CHAT_PROVIDERS).forEach(k => {
    models[k] = (p.models && p.models[k]) || CHAT_PROVIDERS[k].defaultModel;
  });
  if (!p.models && p.model) models.anthropic = p.model; // prefs saved before Gemini support
  return {
    provider: CHAT_PROVIDERS[p.provider] ? p.provider : 'gemini',
    models,
    baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl.slice(0, 300) : '',
    includeNames: !!p.includeNames,
    remember: !!p.remember,
    wide: !!p.wide
  };
}
function chatSavePrefs(p) {
  try {
    localStorage.setItem(CHAT_PREFS_KEY, JSON.stringify(p));
  } catch (e) {}
}
function chatGetKey(prov) {
  const k = CHAT_KEY_KEYS[prov];
  if (!k) return '';
  try {
    return sessionStorage.getItem(k) || localStorage.getItem(k) || '';
  } catch (e) {
    return '';
  }
}
function chatSetKey(prov, key, remember) {
  const k = CHAT_KEY_KEYS[prov];
  if (!k) return;
  try {
    sessionStorage.removeItem(k);
    localStorage.removeItem(k);
  } catch (e) {}
  if (!key) return;
  try {
    (remember ? localStorage : sessionStorage).setItem(k, key);
  } catch (e) {}
}

// ── Markdown → HTML for a reply: the shared converter (core/markdown.js), tuned for a chat bubble (line breaks kept, flat headings, scrolling tables, no links). ──
function chatMarkdown(text) {
  return mdToHtml(String(text || ''), {breaks: true, flatHeadings: true, tableWrap: 'chat-tablewrap', links: false});
}

// ── UI ──
const chatEl = id => document.getElementById(id);
function chatAddBubble(role, text) {
  const box = chatEl('chatMessages');
  if (!box) return null;
  const d = document.createElement('div');
  d.className = 'chat-msg chat-' + role;
  if (role === 'assistant') d.innerHTML = chatMarkdown(text);
  else d.textContent = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d;
}
function chatSetBusy(busy) {
  const send = chatEl('chatSend'),
    stop = chatEl('chatStop'),
    inp = chatEl('chatInput');
  if (send) send.style.display = busy ? 'none' : '';
  if (stop) stop.style.display = busy ? '' : 'none';
  if (inp) inp.disabled = busy;
}
function chatShowStatus(msg, isError) {
  const s = chatEl('chatStatus');
  if (!s) return;
  s.textContent = msg || '';
  s.classList.toggle('chat-error', !!isError);
}
function toggleChat(force) {
  const panel = chatEl('chatPanel'),
    btn = chatEl('chatToggle');
  if (!panel) return;
  const open = force === undefined ? !panel.classList.contains('open') : !!force;
  panel.classList.toggle('open', open);
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    if (!chatGetKey(chatProviderShown)) toggleChatSettings(true);
    const inp = chatEl('chatInput');
    if (inp && !inp.disabled) inp.focus();
  }
}
function toggleChatSettings(force) {
  const s = chatEl('chatSettings');
  if (!s) return;
  s.classList.toggle('open', force === undefined ? !s.classList.contains('open') : !!force);
}
// Settings fields → storage. The model/key fields belong to `chatProviderShown` (not necessarily the just-changed select).
function chatSaveFields() {
  const prefs = chatLoadPrefs(),
    prov = chatProviderShown;
  prefs.provider = prov;
  prefs.models[prov] = chatEl('chatModel').value.trim() || CHAT_PROVIDERS[prov].defaultModel;
  if (prov === 'openai' && chatEl('chatBaseUrl')) prefs.baseUrl = chatEl('chatBaseUrl').value.trim().slice(0, 300);
  prefs.includeNames = chatEl('chatNames').checked;
  prefs.remember = chatEl('chatRemember').checked;
  chatSavePrefs(prefs);
  chatSetKey(prov, chatEl('chatKey').value.trim(), prefs.remember);
  return prefs;
}
// Storage → Settings fields, for one provider.
function chatLoadFields(prov) {
  const P = CHAT_PROVIDERS[prov],
    prefs = chatLoadPrefs();
  chatProviderShown = prov;
  chatEl('chatProvider').value = prov;
  chatEl('chatKeyLabel').textContent = P.keyLabel;
  chatEl('chatKey').placeholder = P.keyPlaceholder;
  chatEl('chatKey').value = chatGetKey(prov);
  chatEl('chatKeyHint').textContent = P.keyHint;
  const bu = chatEl('chatBaseUrlRow');
  if (bu) bu.style.display = P.baseUrlEditable ? '' : 'none';
  if (P.baseUrlEditable && chatEl('chatBaseUrl')) {
    chatEl('chatBaseUrl').value = prefs.baseUrl || '';
    chatEl('chatBaseUrl').placeholder = P.defaultBaseUrl;
  }
  chatEl('chatModel').value = prefs.models[prov];
  chatEl('chatModelList').innerHTML = P.models.map(m => `<option value="${escAttr(m.id)}">${escHtml(m.label)}</option>`).join('');
  chatEl('chatNames').checked = prefs.includeNames;
  chatEl('chatRemember').checked = prefs.remember;
  chatEl('chatPrivacy').firstChild.textContent =
    'Each message sends your scenario (ages, balances, income, tax and expense figures) to ' +
    (typeof P.sentTo === 'function' ? P.sentTo(prefs) : P.sentTo) +
    ', and so do the results of any scenarios the model runs (headline numbers and a few sampled years). ' +
    (P.privacy ? P.privacy + ' ' : '') +
    'The key stays in this browser and is never written to a saved plan file. ';
  chatRefreshPreview();
}
function onChatSettingsChange() {
  chatSaveFields();
  chatRefreshPreview();
}
function onChatProviderChange() {
  const next = chatEl('chatProvider').value;
  chatSaveFields(); // persist what was typed for the provider we are leaving
  chatLoadFields(next);
  const prefs = chatLoadPrefs();
  prefs.provider = next;
  chatSavePrefs(prefs);
  chatShowStatus('');
}
function chatRefreshPreview() {
  const pre = chatEl('chatPreview');
  if (!pre || !pre.parentElement.open) return;
  try {
    pre.textContent =
      buildChatSystemPrompt(chatEl('chatNames').checked) +
      '\n\n----- SCENARIO TOOLS (function declarations sent with every request) -----\n' +
      JSON.stringify(chatToolDeclList(), null, 1);
  } catch (e) {
    pre.textContent = 'Could not build the snapshot: ' + e.message;
  }
}
// Wide mode: the panel grows so chart cards have room. Saved with the chat settings (browser only).
function chatApplyWide(on) {
  const p = chatEl('chatPanel');
  if (p) p.classList.toggle('wide', !!on);
  const b = chatEl('chatWide');
  if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function toggleChatWide() {
  const p = chatEl('chatPanel');
  if (!p) return;
  const on = !p.classList.contains('wide');
  chatApplyWide(on);
  const prefs = chatLoadPrefs();
  prefs.wide = on;
  chatSavePrefs(prefs);
}
function chatForgetKey() {
  chatEl('chatKey').value = '';
  chatSetKey(chatProviderShown, '', false);
  chatShowStatus('API key removed from this browser.');
}
function clearChat() {
  if (chatAbort) {
    chatAbort.abort();
  }
  chatMessages = [];
  const box = chatEl('chatMessages');
  if (box) box.textContent = '';
  chatShowStatus('');
  if (typeof chatCardsClear === 'function') chatCardsClear(); // destroy the chart cards (display/chatCharts.js) and forget the finished runs (display/chatTools.js)
  if (typeof chatClearRuns === 'function') chatClearRuns();
  chatAddBubble(
    'assistant',
    'Ask me anything about this scenario — for example: why does tax jump in a particular year, or when do expenses stop being fully funded. I can also run what-ifs and chart them: “What if Person 1 claims Social Security at 70?”, “Compare converting $40k and $80k a year to Roth”, or “Show claim ages 62 to 70”. Your scenario is never changed.'
  );
}
function onChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}
function stopChat() {
  if (chatAbort) chatAbort.abort();
}

// A one-line note in the transcript for each tool call, so the user can see what ran.
function chatToolNote(c) {
  const a = c.args || {};
  if (c.name === 'run_scenarios') {
    const n = Array.isArray(a.scenarios) ? a.scenarios.length : 0;
    return (
      'Ran ' +
      n +
      ' scenario' +
      (n === 1 ? '' : 's') +
      (n
        ? ': ' +
          a.scenarios
            .map(s => (s && s.label ? s.label : '?'))
            .slice(0, 6)
            .join(' · ')
        : '')
    );
  }
  if (c.name === 'sweep')
    return (
      'Swept ' +
      (a.param || 'a parameter') +
      ' of ' +
      ((a.template && a.template.lever) || 'a lever') +
      ' over ' +
      (Array.isArray(a.values) ? a.values.length : 0) +
      ' values'
    );
  if (c.name === 'show_chart') return 'Drew chart: ' + (a.chart || '?');
  if (c.name === 'get_rows') return 'Read yearly rows: ' + (Array.isArray(a.fields) ? a.fields.join(', ') : '?');
  return 'Tool: ' + c.name;
}
function chatAddToolNote(text, isError) {
  const box = chatEl('chatMessages');
  if (!box) return;
  const d = document.createElement('div');
  d.className = 'chat-tool' + (isError ? ' chat-tool-err' : '');
  d.textContent = '▸ ' + text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

async function sendChat() {
  if (chatAbort) return;
  const inp = chatEl('chatInput');
  const text = (inp.value || '').trim();
  if (!text) return;
  const prefs = chatSaveFields(),
    prov = prefs.provider,
    model = prefs.models[prov],
    key = chatGetKey(prov);
  if (prov === 'openai') {
    const ep = chatOpenAIEndpoint(prefs.baseUrl);
    if (ep.error) {
      toggleChatSettings(true);
      chatShowStatus(ep.error, true);
      return;
    }
    if (!key && !ep.local) {
      toggleChatSettings(true);
      chatShowStatus('Paste the server’s API key in ⚙ Settings first (only a server on this computer can be used without one).', true);
      return;
    }
  } else if (!key) {
    toggleChatSettings(true);
    chatShowStatus('Paste your ' + CHAT_PROVIDERS[prov].keyLabel + ' in ⚙ Settings first.', true);
    return;
  }

  inp.value = '';
  chatShowStatus('');
  toggleChatSettings(false); // the key is in place: give the transcript the room
  const turnStart = chatMessages.length;
  chatMessages.push({role: 'user', content: text});
  chatAddBubble('user', text);
  const ctrl = new AbortController();
  chatAbort = ctrl;
  chatSetBusy(true);
  let toolsRan = false,
    rounds = 0,
    bubble = null,
    box = {reply: ''};
  try {
    for (;;) {
      const allowTools = rounds < CHAT_MAX_TOOL_ROUNDS && chatToolDeclList().length > 0;
      box = {reply: ''};
      bubble = chatAddBubble('assistant', '…');
      bubble.classList.add('chat-pending');
      const {stop, calls} = await chatStreamRound(prov, model, key, prefs, allowTools, ctrl, bubble, box);
      const reply = box.reply;
      if (!calls.length) {
        if (!reply) {
          const why =
            stop && stop.startsWith('blocked:')
              ? 'The reply was blocked by the provider (' + stop.slice(8) + '). Try rephrasing.'
              : 'The model returned an empty reply.';
          throw Object.assign(new Error(why), {handled: true});
        }
        if (stop === 'length') chatShowStatus('Reply was cut off at the length limit — ask it to continue.');
        chatMessages.push({role: 'assistant', content: reply});
        break;
      }
      // Tool round: run every call on a private copy of the scenario, show the cards, and give the results back to the model.
      if (!reply) bubble.remove();
      else bubble.classList.remove('chat-pending');
      chatShowStatus('Running scenarios…');
      await new Promise(r => setTimeout(r, 30)); // let the status paint before the (synchronous) engine runs
      if (ctrl.signal.aborted) throw Object.assign(new Error('aborted'), {name: 'AbortError'});
      const results = [],
        cards = [],
        chatExecEffects = [];
      calls.forEach(c => {
        const r = chatExecTool(c.name, c.args);
        chatExecEffects.push(r.isError ? [] : r.effects || []);
        results.push({id: c.id, nativeId: c.nativeId, name: c.name, response: r.response, isError: !!r.isError});
        chatAddToolNote(
          r.isError ? chatToolNote(c) + ' — rejected: ' + ((r.response && r.response.error) || 'error') : chatToolNote(c),
          !!r.isError
        );
        (r.cards || []).forEach(x => cards.push(x));
      });
      chatMessages.push({role: 'assistant', content: reply, calls}); // pushed together, after the run, so the pair is never split
      chatMessages.push({role: 'tool', results});
      toolsRan = true;
      rounds++;
      bubble = null;
      box = {reply: ''};
      chatRenderCards(cards, chatEl('chatMessages'));
      const fx = [];
      results.forEach((x, i) => {
        (chatExecEffects[i] || []).forEach(e => fx.push(e));
      });
      chatApplyEffects(fx).forEach(n => chatAddToolNote(n, false)); // what the tools asked to show on the main charts
      chatShowStatus('');
    }
  } catch (err) {
    const aborted = err && err.name === 'AbortError',
      partial = box.reply;
    if (toolsRan) {
      // Earlier rounds finished and their cards are on screen: keep them, and close the turn with a plain assistant message so roles keep alternating.
      if (bubble && !partial) bubble.remove();
      const why = aborted
        ? 'Stopped.'
        : err && err.handled
          ? err.message
          : 'Could not reach the API: ' + (err && err.message ? err.message : err);
      chatMessages.push({role: 'assistant', content: partial || '(No answer: ' + why + ')'});
      chatShowStatus(
        aborted ? 'Stopped. The results above are still valid.' : why + ' The results above are still valid; ask again to continue.',
        !aborted
      );
    } else if (aborted) {
      if (partial) {
        chatMessages.push({role: 'assistant', content: partial});
        chatShowStatus('Stopped.');
      } else {
        if (bubble) bubble.remove();
        chatMessages.length = turnStart;
        chatShowStatus('Stopped.');
      }
    } else {
      if (bubble) bubble.remove();
      chatMessages.length = turnStart; // drop the failed turn so it can be resent
      inp.value = text;
      chatShowStatus(
        err && err.handled
          ? err.message
          : 'Could not reach the API: ' + (err && err.message ? err.message : err) + ' (network, CORS or an ad/privacy blocker?)',
        true
      );
    }
  } finally {
    chatAbort = null;
    chatSetBusy(false);
    if (bubble) bubble.classList.remove('chat-pending');
    if (chatEl('chatPanel').classList.contains('open')) inp.focus();
  }
}

function initChat() {
  if (!chatEl('chatPanel')) return;
  chatEl('chatProvider').innerHTML = Object.keys(CHAT_PROVIDERS)
    .map(k => `<option value="${k}">${escHtml(CHAT_PROVIDERS[k].label)}</option>`)
    .join('');
  chatEl('chatPreviewWrap').addEventListener('toggle', chatRefreshPreview);
  chatLoadFields(chatLoadPrefs().provider);
  chatApplyWide(chatLoadPrefs().wide);
  clearChat();
}
window.addEventListener('DOMContentLoaded', initChat);
