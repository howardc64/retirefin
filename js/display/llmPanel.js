'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / LLM PANEL — the "🤖 LLM" button: hand every scenario and result to an external LLM, and review the scenarios an LLM proposes.
// Design: docs/LLM_INTEGRATION_DESIGN.md (phase 1). The data work is in compute/runRegistry.js; this file is only the popup.
//   Export tab: choose runs, detail and privacy, then Download / Copy the `planner.analysis/1` JSON (or preview its size).
//   Import tab: paste an LLM's reply (or load a file) in the `planner.scenarios/1` form; every scenario is validated, run on the scenario and listed as a PROPOSAL.
//   Live bridge tab (phase 3, display/llmBridge.js): connect this page to an MCP server on this computer; the user approves each kind of on-screen effect it may ask for.
// Nothing here writes the scenario except a click on a proposal's button (Add to Scenario set → scnAddFromState, Add to Stress test card → stAddPath).
// Proposals live in memory only (rrProposals); the popup keeps nothing in the saved plan.
// ═══════════════════════════════════════════════════════════════
let llmCardOpen = false,
  llmTab = 'export',
  llmMsg = '',
  llmMsgErr = false,
  llmPreview = '';
const llmOpts = {tier: 'summary', names: false, round: 1000},
  llmOff = new Set();
const llmEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const llmMoney = v => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString();
const LLM_KIND = {
  entered: 'as entered',
  user: 'your scenario',
  lever: 'what-if',
  market: 'market path',
  stress: 'stress test',
  stress_mc: 'stress + Monte Carlo',
  monte_carlo: 'Monte Carlo'
};

function toggleLlmCard() {
  llmCardOpen ? closeLlmCard() : openLlmCard();
}
function openLlmCard(tab) {
  if (tab) llmTab = tab;
  llmCardOpen = true;
  renderLlmCard();
}
function closeLlmCard() {
  llmCardOpen = false;
  renderLlmCard();
}
function llmSetTab(t) {
  llmTab = t;
  llmMsg = '';
  renderLlmCard();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && llmCardOpen && !document.getElementById('userNotesModal')) closeLlmCard();
});
function llmSay(msg, err) {
  llmMsg = msg;
  llmMsgErr = !!err;
  renderLlmCard();
}

function llmHeadline(r) {
  if (r.distribution)
    return (
      'funded in ' +
      Math.round(r.distribution.fundedShare * 100) +
      '% of ' +
      r.distribution.trials +
      ' trials; median final assets ' +
      llmMoney(r.distribution.finalAssets.p50)
    );
  if (r.kpis)
    return (
      'final assets ' +
      llmMoney(r.kpis.finalTotal) +
      (r.kpis.firstUnfundedAge != null ? '; money runs out at ' + r.kpis.firstUnfundedAge : '; stays funded')
    );
  return '';
}
function llmDeltaText(d) {
  const parts = Object.keys(d || {})
    .filter(k => SPEC_KPIS[k])
    .slice(0, 5)
    .map(k => {
      const kd = SPEC_KPIS[k].kind,
        v = d[k],
        sign = v > 0 ? '+' : '';
      return SPEC_KPIS[k].label + ' ' + (kd === '$' ? (v > 0 ? '+' : '') + llmMoney(v) : sign + v + (kd === 'age' ? ' yrs' : ''));
    });
  return parts.length ? parts.join(' · ') : 'no change in any headline number';
}
function llmSelectedRuns(list) {
  const off = list.filter(r => llmOff.has(r.id));
  return off.length ? list.filter(r => !llmOff.has(r.id)).map(r => r.id) : null;
}
function llmToggleRun(id, on) {
  if (on) llmOff.delete(id);
  else llmOff.add(id);
  llmPreview = '';
}
function llmSetOpt(k, v) {
  llmOpts[k] = k === 'round' ? Number(v) : k === 'names' ? !!v : v;
  llmPreview = '';
  renderLlmCard();
}
function llmBuild() {
  const list = rrListRuns();
  const b = rrBuildBundle({tier: llmOpts.tier, names: llmOpts.names, round: llmOpts.round, runs: llmSelectedRuns(list)}),
    text = rrBundleText(b);
  return {bundle: b, text, tokens: rrApproxTokens(text)};
}
function llmShowPreview() {
  try {
    const o = llmBuild();
    llmPreview =
      'About ' +
      o.tokens.toLocaleString() +
      ' tokens (' +
      Math.round(o.text.length / 1024) +
      ' KB). Exactly what will be sent (first part):\n\n' +
      JSON.stringify(o.bundle, null, 1).slice(0, 6000) +
      (o.text.length > 6000 ? '\n…' : '');
    llmMsg = '';
  } catch (e) {
    llmMsg = 'Could not build the file: ' + e.message;
    llmMsgErr = true;
  }
  renderLlmCard();
}
function llmDownload() {
  try {
    const o = llmBuild(),
      blob = new Blob([o.text], {type: 'application/json'}),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'retirement-plan-analysis-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    llmSay(
      'Downloaded about ' +
        o.tokens.toLocaleString() +
        ' tokens of JSON. Attach it to your LLM chat, then paste its reply in the Import tab.'
    );
  } catch (e) {
    llmSay('Could not build the file: ' + e.message, true);
  }
}
function llmCopyText(text, done) {
  const fail = () => window.prompt('Copy this text:', text.slice(0, 200000));
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
  else fail();
}
function llmCopy() {
  try {
    const o = llmBuild();
    llmCopyText(o.text, () => llmSay('Copied about ' + o.tokens.toLocaleString() + ' tokens. Paste it into your LLM chat.'));
  } catch (e) {
    llmSay('Could not build the file: ' + e.message, true);
  }
}

// ── import ──
function llmImportRun() {
  const t = document.getElementById('llmImportText');
  const text = t ? t.value : '';
  if (!text.trim()) {
    llmSay("Paste the LLM's reply (or load its file) first.", true);
    return;
  }
  const r = rrImport(text, {source: 'import'});
  if (r.error) {
    llmSay(r.error, true);
    return;
  }
  let m = 'Added ' + r.accepted.length + ' proposal' + (r.accepted.length === 1 ? '' : 's') + '.';
  if (r.rejected.length) m += ' Not accepted: ' + r.rejected.map(x => '"' + x.label + '" (' + x.errors.join('; ') + ')').join(' · ') + '.';
  if (r.warnings.length) m += ' ' + r.warnings.join(' ');
  llmSay(m, !r.accepted.length);
}
function llmImportFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const t = document.getElementById('llmImportText');
    if (t) t.value = String(rd.result || '');
    llmImportRun();
  };
  rd.readAsText(f);
  input.value = '';
}
const llmSpecOf = rrProposalSpec;
function llmAddLever(pid, show) {
  const p = rrProposalGet(pid);
  if (!p) return;
  if (
    rrProposals().find(x => x.pid === pid).stale &&
    !confirm(
      'Your scenario was edited after this proposal was run. It will be rebuilt from the scenario as it is now, so its numbers may differ from the card. Continue?'
    )
  )
    return;
  const built = specBuildState(p.levers);
  if (built.market) {
    llmSay('A market-stress lever cannot be saved as a Scenario; use a market path instead.', true);
    return;
  }
  const r = scnAddFromState(built.scenario, p.label, show);
  if (r.error) {
    llmSay(r.error, true);
    return;
  }
  llmMsgErr = false;
  llmMsg =
    (show ? 'Showing ' : 'Saved as ') +
    'Scenario ' +
    r.id +
    (show ? ' in the main charts.' : '. Open the 🆎 Scenario button to switch to it.');
  renderLlmCard();
}
// Stress / Monte Carlo proposals: put the settings in the card (and optionally run it). Never silently: a click, and not while a run is going.
function llmApplyCfg(pid, andRun) {
  const p = rrProposalGet(pid);
  if (!p) return;
  try {
    if (p.kind === 'stress') {
      if (typeof stMcRun !== 'undefined' && stMcRun) {
        llmSay('A stress + Monte Carlo run is in progress. Wait or cancel it first.', true);
        return;
      }
      const cfg = Object.assign(rrStripCfg(p.config), {hidden: false});
      cfg.med = stLoadCfg().med; // the card's own medical-shock setting stays
      state.ui.stressCfg = cfg;
      buildStressPanel();
      if (typeof saveDebounced === 'function') saveDebounced();
      if (andRun) stStart(false);
      llmSay(
        (andRun ? 'Applied to the Stress test card and ran it. ' : 'Applied to the Stress test card. ') +
          'Use the B button above the charts to look at a scenario.' +
          (p.includePathIds && p.includePathIds.length
            ? ' (Market paths named by the LLM are not part of the card; add them with Add to Stress test card first.)'
            : '')
      );
    } else {
      if (typeof mcRun !== 'undefined' && mcRun) {
        llmSay('A Monte Carlo run is in progress on the card. Wait or cancel it first.', true);
        return;
      }
      const cfg = Object.assign(rrStripCfg(p.config), {hidden: false});
      state.ui.mcCfg = cfg;
      buildMcPanel();
      if (typeof saveDebounced === 'function') saveDebounced();
      if (andRun) mcStart();
      llmSay(
        (andRun ? 'Applied to the Monte Carlo card and started it. ' : 'Applied to the Monte Carlo card. ') +
          'Open the card under the charts for the results.'
      );
    }
  } catch (e) {
    llmSay(String((e && e.message) || e), true);
  }
}
function llmShow(pid) {
  const p = rrProposalGet(pid);
  if (!p) return;
  if (p.kind === 'lever') {
    llmAddLever(pid, true);
    return;
  }
  const ok = typeof mcLoadMarketPath === 'function' && mcLoadMarketPath(p.path.id);
  llmSay(ok ? 'Showing "' + p.label + '" in the main charts (view B). Use Back to scenario to return.' : 'Could not show that path.', !ok);
}
function llmAdd(pid) {
  const p = rrProposalGet(pid);
  if (!p) return;
  if (p.kind === 'lever') {
    llmAddLever(pid, false);
    return;
  }
  try {
    stAddPath(p.path);
    llmSay('Saved in the scenario. It is now a row of the Stress test card.');
  } catch (e) {
    llmSay(String((e && e.message) || e), true);
  }
}
function llmCopyProposal(pid) {
  const p = rrProposalGet(pid);
  if (!p) return;
  llmCopyText(JSON.stringify({schema: 'planner.scenarios/1', scenarios: [llmSpecOf(p)]}, null, 1), () =>
    llmSay('Copied this scenario as JSON.')
  );
}
function llmDismiss(pid) {
  rrProposalDismiss(pid);
  llmMsg = '';
  renderLlmCard();
}
function llmClearAll() {
  rrProposalsClear();
  llmMsg = '';
  renderLlmCard();
}

// ── render ──
let llmPollTimer = null;
function llmJobLine(p) {
  const j = p.job;
  if (!j) return '';
  if (j.status === 'queued') return 'Waiting to run…';
  if (j.status === 'running') return 'Running: ' + j.done + ' of ' + j.total + ' trials (' + j.percent + '%)';
  if (j.status === 'error') return 'The run failed: ' + llmEsc(j.error || '');
  const runs = rrListRuns().filter(r => (j.runIds || []).includes(r.id));
  if (!runs.length) return 'Cancelled before any trial finished.';
  return (
    (j.status === 'cancelled' ? 'Stopped early. ' : '') +
    runs
      .map(
        r =>
          '<b>' +
          llmEsc(r.label.replace(/ \+ Monte Carlo.*$/, '').replace(/^Monte Carlo \(job.*$/, 'Monte Carlo alone')) +
          '</b>: funded in ' +
          Math.round(r.distribution.fundedShare * 100) +
          '% of ' +
          r.distribution.trials +
          ' trials, median final assets ' +
          llmMoney(r.distribution.finalAssets.p50)
      )
      .join('<br>')
  );
}
function llmProposalHtml(p) {
  if (p.kind === 'stress' || p.kind === 'montecarlo') {
    const isS = p.kind === 'stress';
    const body = isS
      ? '<table class="llm-table"><tr><th>Scenario</th><th>Money lasts?</th><th>Final assets</th><th>vs scenario</th></tr>' +
        p.rows
          .map(
            r =>
              '<tr><td>' +
              llmEsc(r.label) +
              '</td><td>' +
              (r.firstUnfundedAge == null ? 'yes' : 'runs out at ' + r.firstUnfundedAge) +
              '</td><td>' +
              llmMoney(r.finalAssets) +
              '</td><td>' +
              (r.deltaFinalAssets >= 0 ? '+' : '') +
              llmMoney(r.deltaFinalAssets) +
              '</td></tr>'
          )
          .join('') +
        '</table>'
      : '<div class="llm-what">' + llmJobLine(p) + '</div>';
    return (
      '<div class="llm-prop"><div class="llm-prop-h"><b>' +
      llmEsc(p.label) +
      '</b> <span class="llm-badge">' +
      (isS ? 'stress settings' : 'Monte Carlo settings') +
      '</span> <span class="llm-badge">from ' +
      llmEsc(p.source) +
      '</span>' +
      (p.stale ? ' <span class="llm-badge warn" title="The scenario was edited after this was run">scenario edited since</span>' : '') +
      '</div>' +
      (p.why ? '<div class="llm-why">' + llmEsc(p.why) + '</div>' : '') +
      body +
      '<div class="llm-acts"><button class="btn" onclick="llmApplyCfg(\'' +
      p.pid +
      '\',false)" title="Put these settings in the ' +
      (isS ? 'Stress test' : 'Monte Carlo') +
      ' card; nothing runs">Apply to the card</button>' +
      '<button class="btn" onclick="llmApplyCfg(\'' +
      p.pid +
      '\',true)" title="Put these settings in the card and run it there, with the app\'s normal results and views">Apply &amp; run</button>' +
      '<button class="btn" onclick="llmCopyProposal(\'' +
      p.pid +
      '\')">Copy JSON</button><button class="btn" onclick="llmDismiss(\'' +
      p.pid +
      '\')">Dismiss</button></div></div>'
    );
  }
  const what =
    p.kind === 'lever'
      ? p.notes
          .map(
            n =>
              llmEsc(n.what) + (n.status !== 'applied' ? ' <i>[' + llmEsc(n.status) + (n.note ? ': ' + llmEsc(n.note) : '') + ']</i>' : '')
          )
          .join('; ')
      : llmEsc(
          p.describe.years +
            ' yearly values from ' +
            p.describe.startsAt +
            '; stocks ' +
            p.describe.compoundedReturnPct +
            '% compounded (worst year ' +
            p.describe.worstYearPct +
            '%); ' +
            p.describe.equityShare +
            '% of each portfolio hit'
        );
  const addLbl = p.kind === 'lever' ? 'Add to Scenario set' : 'Add to Stress test card',
    showLbl = p.kind === 'lever' ? 'Show in main charts' : 'Show in main charts';
  return (
    '<div class="llm-prop"><div class="llm-prop-h"><b>' +
    llmEsc(p.label) +
    '</b> <span class="llm-badge">' +
    (p.kind === 'lever' ? 'what-if' : 'market path') +
    '</span> <span class="llm-badge">from ' +
    llmEsc(p.source) +
    '</span>' +
    (p.stale ? ' <span class="llm-badge warn" title="The scenario was edited after this was run">scenario edited since</span>' : '') +
    '</div>' +
    (p.why ? '<div class="llm-why">' + llmEsc(p.why) + '</div>' : '') +
    '<div class="llm-what">' +
    what +
    '</div><div class="llm-delta"><b>Against your scenario:</b> ' +
    llmEsc(llmDeltaText(p.deltas)) +
    '</div>' +
    '<div class="llm-acts"><button class="btn" onclick="llmShow(\'' +
    p.pid +
    '\')" title="Replay it in all the charts; your scenario is not changed">' +
    showLbl +
    '</button>' +
    '<button class="btn" onclick="llmAdd(\'' +
    p.pid +
    '\')" title="' +
    (p.kind === 'lever'
      ? 'Add it as a scenario of the 🆎 set without switching to it'
      : 'Save the path in your scenario; it becomes a row of the Stress test card') +
    '">' +
    addLbl +
    '</button>' +
    '<button class="btn" onclick="llmCopyProposal(\'' +
    p.pid +
    '\')">Copy JSON</button><button class="btn" onclick="llmDismiss(\'' +
    p.pid +
    '\')">Dismiss</button></div></div>'
  );
}
// Plans tab: the master scenario list (scenarios/scenarioStore.js), one row per plan with how it was made, a stale flag, headline numbers and a delete button.
function llmScenariosHtml() {
  let rows = [];
  try {
    scSyncAll();
    const fp = scFingerprint(state);
    rows = scList().map(p => ({p, stale: scIsStale(p, fp)}));
  } catch (e) {
    return '<div class="llm-err">Could not read the scenarios: ' + llmEsc(e.message) + '</div>';
  }
  const h = rows
    .map(({p, stale}) => {
      let sub = '';
      try {
        if (!stale) {
          const sm = scEnsureSummary(p.id);
          if (sm && sm.kpis) sub = ' · final total ' + llmMoney(sm.kpis.finalTotal);
        }
      } catch (e) {}
      return (
        '<div class="llm-run"><span style="flex:1"><b>' +
        llmEsc(p.label) +
        '</b> <span class="llm-badge">' +
        llmEsc(p.origin.kind.replace(/_/g, ' ')) +
        '</span>' +
        (stale ? ' <span class="llm-badge warn">stale</span>' : '') +
        '<br><span class="llm-sub">' +
        llmEsc(scHow(p)) +
        llmEsc(sub) +
        '</span></span>' +
        '<button class="btn" ' +
        (stale ? 'disabled ' : '') +
        'onclick="llmScenarioShow(\'' +
        llmEsc(p.key) +
        '\')">Show</button>' +
        '<button class="btn" onclick="llmScenarioDelete(\'' +
        llmEsc(p.key) +
        '\')">Delete</button></div>'
      );
    })
    .join('');
  return (
    '<div class="llm-note">Every scenario the planner holds, however it was made. This is what an LLM refers to by name. Deleting a stress or Monte Carlo scenario only hides it until that run is repeated; a scenario is removed for good.</div><div class="llm-runs" style="max-height:340px">' +
    (h || '<div class="llm-note">No scenarios yet.</div>') +
    '</div>'
  );
}
function llmScenarioShow(key) {
  const r = scShow(key);
  llmSay(r.ok ? 'Showing ' + r.label + '.' : r.why, !r.ok);
}
function llmScenarioDelete(key) {
  const p = scGet(key);
  if (!p) return;
  if (p.origin.kind === 'scenario' && !confirm('Delete ' + p.label + '? This cannot be undone.')) return;
  const r = scDelete(key);
  llmSay(r.ok ? 'Deleted ' + p.label + '.' : r.why || 'Not deleted.', !r.ok);
}

function renderLlmCard() {
  const btn = document.getElementById('llmBtn');
  if (btn) btn.classList.toggle('on', llmCardOpen);
  let card = document.getElementById('llmCard');
  if (!llmCardOpen) {
    if (card) card.remove();
    return;
  }
  if (!card) {
    card = document.createElement('div');
    card.id = 'llmCard';
    card.className = 'scn-card llm-card';
    document.body.appendChild(card);
  }
  const keepText = (document.getElementById('llmImportText') || {}).value || '';
  let body = '';
  if (llmTab === 'export') {
    let list = [];
    try {
      list = rrListRuns();
    } catch (e) {
      body = '<div class="llm-err">Could not read the results: ' + llmEsc(e.message) + '</div>';
    }
    const rows = list
      .map(
        r =>
          '<label class="llm-run"><input type="checkbox" ' +
          (llmOff.has(r.id) ? '' : 'checked ') +
          (r.id === 'entered' ? 'disabled ' : '') +
          'onchange="llmToggleRun(\'' +
          llmEsc(r.id) +
          '\',this.checked)"> <span><b>' +
          llmEsc(r.label) +
          '</b> <span class="llm-badge">' +
          LLM_KIND[r.kind] +
          '</span>' +
          (r.stale ? ' <span class="llm-badge warn">stale</span>' : '') +
          '<br><span class="llm-sub">' +
          llmEsc(llmHeadline(r)) +
          '</span></span></label>'
      )
      .join('');
    body +=
      '<div class="llm-note">Everything below comes from the planner\'s own engine. The file tells the LLM to quote these numbers and to answer scenario ideas in a form you can import here.</div>' +
      '<div class="llm-runs">' +
      rows +
      '</div>' +
      (list.length < 2
        ? '<div class="llm-note">Only your scenario so far. Run the <b>Stress tests</b> or <b>Monte Carlo</b> cards, make another 🆎 Scenario, or ask the chat for what-ifs, and they appear here.</div>'
        : '') +
      '<div class="llm-opts"><label>Detail <select onchange="llmSetOpt(\'tier\',this.value)"><option value="summary"' +
      (llmOpts.tier === 'summary' ? ' selected' : '') +
      '>Summary (headline numbers)</option><option value="standard"' +
      (llmOpts.tier === 'standard' ? ' selected' : '') +
      '>Standard (+ yearly values, example trials)</option></select></label>' +
      '<label>Round money to <select onchange="llmSetOpt(\'round\',this.value)">' +
      [
        [0, 'whole dollars'],
        [100, '$100'],
        [1000, '$1,000'],
        [10000, '$10,000']
      ]
        .map(o => '<option value="' + o[0] + '"' + (llmOpts.round === o[0] ? ' selected' : '') + '>' + o[1] + '</option>')
        .join('') +
      '</select></label>' +
      '<label><input type="checkbox" ' +
      (llmOpts.names ? 'checked ' : '') +
      'onchange="llmSetOpt(\'names\',this.checked)"> Include names</label></div>' +
      '<div class="llm-acts"><button class="btn btn-primary" onclick="llmDownload()">Download JSON</button><button class="btn" onclick="llmCopy()">Copy JSON</button><button class="btn" onclick="llmShowPreview()">Preview &amp; size</button></div>' +
      (llmPreview ? '<pre class="llm-pre">' + llmEsc(llmPreview) + '</pre>' : '');
  } else if (llmTab === 'scenarios') {
    body += llmScenariosHtml();
  } else if (llmTab === 'bridge') {
    body += typeof lbTabHtml === 'function' ? lbTabHtml() : '<div class="llm-note">The live bridge is not loaded.</div>';
  } else {
    const props = rrProposals();
    body +=
      '<div class="llm-note">Paste an LLM\'s reply, or load its file. Each scenario is checked, run on your scenario and listed below; <b>nothing changes in your scenario until you click a button</b>.</div>' +
      '<textarea id="llmImportText" rows="6" placeholder=\'{"schema":"planner.scenarios/1","scenarios":[…]}\'>' +
      llmEsc(keepText) +
      '</textarea>' +
      '<div class="llm-acts"><button class="btn btn-primary" onclick="llmImportRun()">Check &amp; add</button><label class="btn llm-file">Load file…<input type="file" accept=".json,application/json,text/plain" style="display:none" onchange="llmImportFile(this)"></label>' +
      (props.length ? '<button class="btn" onclick="llmClearAll()">Dismiss all</button>' : '') +
      '</div>' +
      (props.length ? props.map(llmProposalHtml).join('') : '<div class="llm-note">No proposals yet.</div>');
  }
  clearTimeout(llmPollTimer);
  if (llmTab === 'import' && rrProposals().some(p => p.job && (p.job.status === 'queued' || p.job.status === 'running')))
    llmPollTimer = setTimeout(() => {
      if (llmCardOpen) renderLlmCard();
    }, 700); // live progress of a proposed Monte Carlo run
  card.innerHTML =
    '<div class="scn-head"><b>🤖 LLM</b><button class="chat-icon" onclick="closeLlmCard()" title="Close" aria-label="Close">✕</button></div>' +
    '<div class="llm-tabs"><button class="btn' +
    (llmTab === 'export' ? ' on' : '') +
    '" onclick="llmSetTab(\'export\')">Send to an LLM</button><button class="btn' +
    (llmTab === 'import' ? ' on' : '') +
    '" onclick="llmSetTab(\'import\')">Scenarios from an LLM' +
    (rrProposals().length ? ' (' + rrProposals().length + ')' : '') +
    '</button>' +
    '<button class="btn' +
    (llmTab === 'scenarios' ? ' on' : '') +
    '" onclick="llmSetTab(\'scenarios\')">Scenarios</button>' +
    (typeof lbTabHtml === 'function'
      ? '<button class="btn' +
        (llmTab === 'bridge' ? ' on' : '') +
        '" onclick="llmSetTab(\'bridge\')">Live bridge' +
        (typeof lbStatus !== 'undefined' && lbStatus === 'connected' ? ' ●' : '') +
        (typeof lbPending !== 'undefined' && lbPending.length ? ' (' + lbPending.length + ' waiting)' : '') +
        '</button>'
      : '') +
    '</div>' +
    (llmMsg ? '<div class="' + (llmMsgErr ? 'llm-err' : 'llm-ok') + '">' + llmEsc(llmMsg) + '</div>' : '') +
    body;
}
