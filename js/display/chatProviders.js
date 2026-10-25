'use strict';
// DISPLAY / CHAT PROVIDERS — the provider-neutral message list, each provider's request / response shapes (Anthropic, Gemini, OpenAI-compatible),
// error wording, retry timing (see chat.js).

// OpenAI-compatible endpoint: '<base>/chat/completions'. A key is only ever sent over https, or over http to this computer. → {url, host, local} | {error}
function chatOpenAIEndpoint(base) {
  const b = String(base == null || String(base).trim() === '' ? CHAT_PROVIDERS.openai.defaultBaseUrl : base).trim();
  const m = /^(https?):\/\/([^\/?#@\s]+)(\/[^?#\s]*)?$/i.exec(b);
  if (!m) return {error: 'The base URL must look like https://host/v1 (no spaces, user name, query or #).'};
  const scheme = m[1].toLowerCase(),
    hostport = m[2],
    host = hostport.replace(/:\d+$/, '').toLowerCase();
  const local = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/.test(host);
  if (scheme === 'http' && !local)
    return {error: 'Plain http is only allowed for a server on this computer (localhost or 127.0.0.1); use https for a remote server.'};
  let path = (m[3] || '').replace(/\/+$/, '');
  if (!/\/chat\/completions$/.test(path)) path += '/chat/completions';
  return {url: scheme + '://' + hostport + path, host, local};
}
const CHAT_KEY_KEYS = {
  // one storage key per provider (sessionStorage, or localStorage if "remember")
  anthropic: 'retirementPlannerChatApiKey_v1',
  gemini: 'retirementPlannerChatGeminiKey_v1',
  openai: 'retirementPlannerChatOpenAIKey_v1'
};

// ── Messages ──
// chatMessages (in memory only), in a provider-neutral shape; chatBuildRequest maps it to each provider:
//   {role:'user', content}
//   {role:'assistant', content, calls?:[{id, name, args, part?, nativeId?}]}   `part` = Gemini's own functionCall part, kept verbatim (Gemini 3 needs its thoughtSignature back)
//   {role:'tool', results:[{id, name, response, isError, nativeId?}]}          answers the calls of the assistant message before it
let chatCallSeq = 0;
const CHAT_DUMMY_SIGNATURE = 'skip_thought_signature_validator'; // Gemini's documented value for a function call the model did not produce itself (e.g. history from another provider)
function chatToolDeclList() {
  return typeof chatToolDecls === 'function' ? chatToolDecls() : [];
}

// Long tool results from earlier questions are shrunk before they are re-sent (the model can still call get_rows / show_chart with the run ids).
function chatCompactResponse(resp) {
  try {
    if (JSON.stringify(resp).length < 2500) return resp;
    const o = {note: 'earlier result shortened; run ids stay valid for show_chart and get_rows'};
    if (resp.yourScenario && resp.yourScenario.kpis) o.yourScenario = resp.yourScenario.kpis;
    else if (resp.yourScenario) o.yourScenario = resp.yourScenario;
    if (resp.scenarios)
      o.scenarios = resp.scenarios.map(s => ({
        runId: s.runId,
        label: s.label,
        kpis: s.kpis,
        levers: (s.levers || []).map(l => l.what + ' [' + l.status + ']')
      }));
    if (resp.results) o.results = resp.results.map(r => ({runId: r.runId, value: r.value, kpis: r.kpis}));
    return o;
  } catch (e) {
    return resp;
  }
}
// The most recent whole turns (a turn starts at a user message and includes its tool calls and results), at most CHAT_MAX_HISTORY messages,
// always ending with the current turn. A tool call is never separated from its result, which both APIs would reject.
function chatHistoryForRequest() {
  const starts = [];
  chatMessages.forEach((m, i) => {
    if (m.role === 'user') starts.push(i);
  });
  let f = 0;
  while (starts.length - f > 1 && chatMessages.length - starts[f] > CHAT_MAX_HISTORY) f++;
  const from = starts.length ? starts[f] : 0,
    lastStart = starts.length ? starts[starts.length - 1] : 0;
  return chatMessages
    .slice(from)
    .map((m, i) =>
      m.role === 'tool' && from + i < lastStart
        ? Object.assign({}, m, {results: m.results.map(r => Object.assign({}, r, {response: chatCompactResponse(r.response)}))})
        : m
    );
}
function chatGeminiContents(h) {
  return h.map(m => {
    if (m.role === 'user') return {role: 'user', parts: [{text: m.content}]};
    if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({text: m.content});
      (m.calls || []).forEach(c =>
        parts.push(
          c.part || {functionCall: {name: c.name, args: c.args && !c.args.__error ? c.args : {}}, thoughtSignature: CHAT_DUMMY_SIGNATURE}
        )
      );
      return {role: 'model', parts};
    }
    return {
      role: 'user',
      parts: m.results.map(r => ({functionResponse: Object.assign({name: r.name, response: r.response}, r.nativeId ? {id: r.id} : {})}))
    };
  });
}
function chatAnthropicMessages(h) {
  return h.map(m => {
    if (m.role === 'user') return {role: 'user', content: m.content};
    if (m.role === 'assistant') {
      if (!(m.calls && m.calls.length)) return {role: 'assistant', content: m.content};
      const blocks = [];
      if (m.content) blocks.push({type: 'text', text: m.content});
      m.calls.forEach(c => blocks.push({type: 'tool_use', id: c.id, name: c.name, input: c.args && !c.args.__error ? c.args : {}}));
      return {role: 'assistant', content: blocks};
    }
    return {
      role: 'user',
      content: m.results.map(r => ({type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.response), is_error: !!r.isError}))
    };
  });
}

const chatOpenAIId = id => String(id == null ? 'call' : id).slice(0, 40);
function chatOpenAIMessages(systemText, h) {
  const out = [{role: 'system', content: systemText}];
  h.forEach(m => {
    if (m.role === 'user') out.push({role: 'user', content: m.content});
    else if (m.role === 'assistant') {
      if (!(m.calls && m.calls.length)) out.push({role: 'assistant', content: m.content});
      else
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.calls.map(c => ({
            id: chatOpenAIId(c.id),
            type: 'function',
            function: {name: c.name, arguments: JSON.stringify(c.args && !c.args.__error ? c.args : {})}
          }))
        });
    } else m.results.forEach(r => out.push({role: 'tool', tool_call_id: chatOpenAIId(r.id), content: JSON.stringify(r.response)}));
  });
  return out;
}
// Tool calls arrive in pieces ({index, id?, function:{name?, arguments?}}); st.tc collects them until the stream says it is finished.
function chatOpenAIFlush(st) {
  const out = [];
  Object.keys(st.tc || {})
    .sort((a, b) => a - b)
    .forEach(i => {
      const b = st.tc[i];
      if (!b.name) return;
      let args;
      if (b.obj) args = b.obj;
      else {
        try {
          args = b.args ? JSON.parse(b.args) : {};
        } catch (e) {
          args = {__error: e.message};
        }
      } // a cut-off call is answered with an error the model can fix
      out.push({id: chatOpenAIId(b.id || 'call_' + ++chatCallSeq), name: b.name, args});
    });
  st.tc = {};
  return out;
}

// ── Provider request / response shapes ──
// Returns {url, headers, body} for one streamed chat turn. allowTools=false asks for a plain answer (the tool-round limit was reached).
function chatBuildRequest(prov, model, key, systemText, history, allowTools, opts) {
  const decls = chatToolDeclList();
  if (prov === 'openai') {
    const ep = chatOpenAIEndpoint(opts && opts.baseUrl);
    if (ep.error) throw Object.assign(new Error(ep.error), {handled: true});
    // No max_tokens: newer OpenAI models reject it (they want max_completion_tokens) while older servers want it, so the server's own default applies.
    const body = {model, stream: true, messages: chatOpenAIMessages(systemText, history)};
    if (decls.length) {
      body.tools = decls.map(d => ({type: 'function', function: {name: d.name, description: d.description, parameters: d.parameters}}));
      body.tool_choice = allowTools ? 'auto' : 'none';
    }
    const headers = {'content-type': 'application/json'};
    if (key) headers.authorization = 'Bearer ' + key;
    return {url: ep.url, headers, body};
  }
  if (prov === 'gemini') {
    const body = {
      systemInstruction: {parts: [{text: systemText}]},
      contents: chatGeminiContents(history),
      generationConfig: {maxOutputTokens: CHAT_MAX_TOKENS_GEMINI}
    };
    if (decls.length) {
      body.tools = [{functionDeclarations: decls.map(d => ({name: d.name, description: d.description, parameters: d.parameters}))}];
      body.toolConfig = {functionCallingConfig: {mode: allowTools ? 'AUTO' : 'NONE'}};
    }
    return {
      url: CHAT_PROVIDERS.gemini.url + encodeURIComponent(model.replace(/^models\//, '')) + ':streamGenerateContent?alt=sse',
      headers: {'content-type': 'application/json', 'x-goog-api-key': key},
      body
    };
  }
  const body = {
    model,
    max_tokens: CHAT_MAX_TOKENS,
    stream: true,
    // Rebuilt on every send so answers always reflect the inputs and charts as they are right now.
    system: [{type: 'text', text: systemText, cache_control: {type: 'ephemeral'}}],
    messages: chatAnthropicMessages(history)
  };
  if (decls.length) {
    body.tools = decls.map(d => ({name: d.name, description: d.description, input_schema: d.parameters}));
    body.tool_choice = {type: allowTools ? 'auto' : 'none'};
  }
  return {
    url: CHAT_PROVIDERS.anthropic.url,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': CHAT_PROVIDERS.anthropic.version,
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body
  };
}
// One parsed SSE event → {text, calls, stop, error}. stop is normalised: 'length' (hit the token cap), 'blocked:<why>', or 'end'.
// `st` is per-request parser state: Anthropic streams a tool call's JSON in pieces, Gemini sends each function call whole.
function chatParseEvent(prov, j, st) {
  if (prov === 'openai') {
    const out = {};
    if (j.error) {
      out.error = typeof j.error === 'string' ? j.error : j.error.message || 'The API reported an error.';
      return out;
    }
    const c = j.choices && j.choices[0];
    if (!c) return out;
    const d = c.delta || {};
    if (typeof d.content === 'string' && d.content) out.text = d.content;
    (Array.isArray(d.tool_calls) ? d.tool_calls : []).forEach(t => {
      if (!t || typeof t !== 'object') return;
      const i = t.index != null ? t.index : 0,
        b = st.tc[i] || (st.tc[i] = {id: null, name: '', args: '', obj: null}),
        f = t.function || {};
      if (t.id && !b.id) b.id = t.id;
      if (f.name && !b.name) b.name = String(f.name);
      if (typeof f.arguments === 'string') b.args += f.arguments;
      else if (f.arguments && typeof f.arguments === 'object') b.obj = f.arguments;
    });
    if (c.finish_reason) {
      const calls = chatOpenAIFlush(st);
      if (calls.length) out.calls = calls;
      out.stop = c.finish_reason === 'length' ? 'length' : c.finish_reason === 'content_filter' ? 'blocked:content_filter' : 'end';
    }
    return out;
  }
  if (prov === 'gemini') {
    const out = {};
    if (j.error) out.error = j.error.message || 'The API reported an error.';
    if (j.promptFeedback && j.promptFeedback.blockReason) out.stop = 'blocked:' + j.promptFeedback.blockReason;
    const c = j.candidates && j.candidates[0];
    if (c) {
      const parts = (c.content && c.content.parts) || [];
      const t = parts
        .filter(p => p && p.text && !p.thought)
        .map(p => p.text)
        .join('');
      if (t) out.text = t;
      const fc = parts.filter(p => p && p.functionCall);
      if (fc.length)
        out.calls = fc.map(p => ({
          id: p.functionCall.id || 'call_' + ++chatCallSeq,
          nativeId: !!p.functionCall.id,
          name: p.functionCall.name,
          args: p.functionCall.args || {},
          part: p
        }));
      if (c.finishReason) {
        out.stop = c.finishReason === 'MAX_TOKENS' ? 'length' : c.finishReason === 'STOP' ? 'end' : 'blocked:' + c.finishReason;
      }
    }
    return out;
  }
  if (j.type === 'content_block_start' && j.content_block && j.content_block.type === 'tool_use') {
    st.blocks[j.index] = {id: j.content_block.id, name: j.content_block.name, json: ''};
    return {};
  }
  if (j.type === 'content_block_delta' && j.delta) {
    if (j.delta.type === 'text_delta') return {text: j.delta.text};
    if (j.delta.type === 'input_json_delta' && st.blocks[j.index]) st.blocks[j.index].json += j.delta.partial_json || '';
    return {};
  }
  if (j.type === 'content_block_stop' && st.blocks[j.index]) {
    const b = st.blocks[j.index];
    delete st.blocks[j.index];
    let args;
    try {
      args = b.json ? JSON.parse(b.json) : {};
    } catch (e) {
      args = {__error: e.message};
    } // a cut-off call is answered with an error the model can fix
    return {calls: [{id: b.id, name: b.name, args}]};
  }
  if (j.type === 'message_delta' && j.delta && j.delta.stop_reason) return {stop: j.delta.stop_reason === 'max_tokens' ? 'length' : 'end'};
  if (j.type === 'error') return {error: (j.error && j.error.message) || 'The API reported an error.'};
  return {};
}

// Reads a streamed (SSE) response, calling onText for each text delta; returns {stop, calls}.
async function chatReadStream(res, prov, onText) {
  const reader = res.body.getReader(),
    dec = new TextDecoder(),
    st = {blocks: {}, tc: {}};
  let buf = '',
    stop = null;
  const calls = [];
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    buf = (buf + dec.decode(value, {stream: true})).replace(/\r\n/g, '\n'); // Gemini separates events with CRLF
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const evt = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = evt.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      let j;
      try {
        j = JSON.parse(line.slice(5).trim());
      } catch (e) {
        continue;
      }
      const e = chatParseEvent(prov, j, st);
      if (e.error) throw new Error(e.error);
      if (e.text) onText(e.text);
      if (e.calls) e.calls.forEach(c => calls.push(c));
      if (e.stop) stop = e.stop;
    }
  }
  if (prov === 'openai') chatOpenAIFlush(st).forEach(c => calls.push(c)); // a server that ends the stream without a finish_reason
  return {stop, calls};
}
function chatFriendlyError(status, message, prov) {
  const m = message || '';
  if (status === 401 || (status === 400 && /api key/i.test(m))) return 'The API key was rejected. Check it in ⚙ Settings.';
  if (status === 403) return 'This key is not allowed to use that model, feature or region (' + m + ').';
  if (status === 404) return 'Model not found — change the model in ⚙ Settings (' + m + ').';
  if (status === 429)
    return (
      (prov === 'gemini'
        ? 'Free-tier rate limit or daily quota reached — wait a minute (or until tomorrow if the daily cap is used)'
        : 'Rate limited or out of quota — try again in a moment') +
      ' (' +
      m +
      ').'
    );
  if (status === 529 || status >= 500) return 'The API is busy or unavailable right now — try again shortly.';
  return m || 'Request failed (HTTP ' + status + ').';
}
// "Please retry in 12.3s" (Gemini free tier) → 12.3, else null.
function chatRetrySeconds(message) {
  const r = /retry in ([\d.]+)\s*s/i.exec(message || '');
  return r ? parseFloat(r[1]) : null;
}
function chatSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
      },
      {once: true}
    );
  });
}

// One request/response round. Streams text into `bubble` (and into box.reply). A free-tier rate limit that clears within 30 s is waited out once.
// → {stop, calls}
async function chatStreamRound(prov, model, key, prefs, allowTools, ctrl, bubble, box) {
  const rq = chatBuildRequest(prov, model, key, buildChatSystemPrompt(prefs.includeNames), chatHistoryForRequest(), allowTools, {
    baseUrl: prefs.baseUrl
  });
  let waited = false;
  for (;;) {
    const res = await fetch(rq.url, {method: 'POST', signal: ctrl.signal, headers: rq.headers, body: JSON.stringify(rq.body)});
    if (res.ok) {
      return chatReadStream(res, prov, t => {
        box.reply += t;
        bubble.classList.remove('chat-pending');
        bubble.innerHTML = chatMarkdown(box.reply);
        const m = chatEl('chatMessages');
        m.scrollTop = m.scrollHeight;
      });
    }
    let msg = '';
    try {
      const j = await res.json();
      msg = (j && j.error && (typeof j.error === 'string' ? j.error : j.error.message)) || '';
    } catch (e) {}
    const wait = res.status === 429 ? chatRetrySeconds(msg) : null;
    if (wait != null && wait <= 30 && !waited) {
      waited = true;
      chatShowStatus('Rate limit: retrying in ' + Math.ceil(wait) + ' s…');
      await chatSleep(Math.ceil(wait * 1000) + 500, ctrl.signal);
      chatShowStatus('');
      continue;
    }
    throw Object.assign(new Error(chatFriendlyError(res.status, msg, prov)), {handled: true});
  }
}
