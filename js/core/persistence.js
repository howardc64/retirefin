'use strict';
// CORE / PERSISTENCE — autosave, load, reset, and save / load of a plan file (see state.js).

function autosave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(STORAGE_KEY + '_ts', String(Date.now()));
  } catch (e) {
    console.error('Autosave failed', e);
  }
  if (typeof scnSave === 'function') scnSave(); // the other scenarios are kept alongside (scenarios.js)
  if (typeof llmBridgeNotify === 'function') llmBridgeNotify(); // a connected live bridge gets the new plan (display/llmBridge.js)
}
function loadAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !raw.trim()) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return false;
    state = hydrateState(parsed);
    return true;
  } catch (e) {
    console.error('Autosave load failed', e);
    state = defaultState();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    return false;
  }
}
function flashMsg(text) {
  const m = document.getElementById('saveMsg');
  m.textContent = text;
  setTimeout(() => {
    if (m.textContent === text) m.textContent = '';
  }, 3000);
}
// Reset to defaults (and a first visit with nothing saved) starts every income-source and asset card AND every chart panel collapsed (Hide checked), enabled or not. This is applied ONLY to a
// fresh default state (Reset) — never to a loaded file or an autosave, whose own saved `hidden` values (per card and, in
// `state.ui`, per chart panel) are restored exactly as saved.
function applyDefaultHiddenFromEnabled(s) {
  (s.people || []).forEach(p => {
    ['wage', 'ss', 'pension', 'ira', 'roth'].forEach(key => {
      if (p[key]) p[key].hidden = true;
    });
    ['rentals', 'annuities', 'brokerage', 'realEstate'].forEach(key =>
      (p[key] || []).forEach(x => {
        x.hidden = true;
      })
    );
    if (p.inheritance) p.inheritance.hidden = true;
  });
  if (s.ui) s.ui.chartHidden = defaultChartHidden(true); // starting fresh: every chart panel is collapsed to its title bar too
  return s;
}
function resetState() {
  if (!confirm('Reset all inputs to defaults? This cannot be undone.')) return;
  if (typeof stResetCard === 'function') stResetCard(true); // Stress test results and settings back to the defaults (display/stressPanel.js)
  if (typeof mcResetCard === 'function') mcResetCard(true); // Monte Carlo results, trial view and settings back to the defaults (display/mcPanel.js)
  state = applyDefaultHiddenFromEnabled(defaultState());
  setSaveTarget(null); // the default plan must not silently overwrite the file that was loaded
  if (typeof scnReset === 'function') scnReset(); // back to the single scenario A
  renderAll();
  if (typeof compactUnusedChartRows === 'function') compactUnusedChartRows(); // close the chart rows that hold nothing on screen (display/chartPanels.js)
  autosave();
  flashMsg('Reset to defaults.');
}
// Visible confirmation of a successful save: the Save button itself turns green and reads "✓ Saved" for two seconds, and a toast appears
// at the bottom of the window (the small text at the end of the top bar is easy to miss).
let saveDoneTimer = null,
  saveToastTimer = null;
function saveDone(msg) {
  flashMsg(msg);
  const b = document.getElementById('saveBtn');
  if (b) {
    if (!b.dataset.label) b.dataset.label = b.textContent;
    b.textContent = '✓ Saved';
    b.classList.add('saved');
    clearTimeout(saveDoneTimer);
    saveDoneTimer = setTimeout(() => {
      b.textContent = b.dataset.label;
      b.classList.remove('saved');
    }, 2000);
  }
  let t = document.getElementById('saveToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'saveToast';
    t.className = 'save-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(saveToastTimer);
  saveToastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
// ── Remembered plan file ──
// Loading a file with the File System Access picker remembers its handle, so Save then overwrites that same file with no dialog.
// Sample plans (and a plan that was never loaded or saved) have no handle: Save opens a Save As picker instead, and the file chosen there
// becomes the remembered one. Browsers without the API can only download, so there Save always downloads. Kept for this page session only,
// never across a reload, so a fresh page can't silently overwrite an old file with a default plan.
let saveHandle = null; // FileSystemFileHandle Save writes to, or null
let saveName = ''; // its file name, for messages and the button tooltip
let saveFromSample = ''; // name of the sample plan on screen (never written to), or ''
function setSaveTarget(handle, sampleName) {
  saveHandle = handle || null;
  saveName = handle ? handle.name : '';
  saveFromSample = sampleName || '';
  const b = document.getElementById('saveBtn');
  if (b)
    b.title = saveHandle
      ? 'Save over ' + saveName + ' (no prompt)'
      : saveFromSample
        ? 'Sample plans cannot be overwritten: Save asks where to save a copy'
        : 'Save the plan; asks where to save the first time';
}
async function saveToFile() {
  const dataStr = JSON.stringify(typeof scnFileData === 'function' ? scnFileData() : state, null, 2); // every scenario goes into the file (scenarios.js)
  if (window.showSaveFilePicker) {
    if (saveHandle) {
      // the loaded / last-saved file: overwrite it without asking
      try {
        let perm = await saveHandle.queryPermission({mode: 'readwrite'});
        if (perm !== 'granted') perm = await saveHandle.requestPermission({mode: 'readwrite'}); // the browser's own one-time permission prompt
        if (perm === 'granted') {
          const w = await saveHandle.createWritable();
          await w.write(dataStr);
          await w.close();
          saveDone('Saved to ' + saveName + '.');
          return;
        }
      } catch (err) {
        console.error('Could not overwrite the remembered file, asking where to save instead', err);
      }
    }
    try {
      const base = saveFromSample ? saveFromSample.replace(/\.json$/i, '') + ' (my copy).json' : saveName || 'retirement-plan.json';
      const opts = {suggestedName: base, types: [{description: 'Retirement Plan JSON', accept: {'application/json': ['.json']}}]};
      if (saveHandle) opts.startIn = saveHandle;
      const handle = await window.showSaveFilePicker(opts);
      const writable = await handle.createWritable();
      await writable.write(dataStr);
      await writable.close();
      setSaveTarget(handle); // later Saves overwrite this file
      saveDone('Saved to ' + handle.name + '.');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled the picker
      console.error('showSaveFilePicker failed, falling back to download', err);
    }
  }
  // Fallback for browsers without the File System Access API (e.g. Firefox, Safari): a page cannot open a Save As dialog or overwrite a
  // file there, so the user is asked for the file name first (remembered as the next default) and the plan is downloaded under that name;
  // the browser's own settings may also ask where to put it.
  const dflt = saveFromSample ? saveFromSample.replace(/\.json$/i, '') + ' (my copy).json' : saveName || 'retirement-plan.json';
  let name = window.prompt('Save the plan as this file name:', dflt);
  if (name === null) return; // cancelled
  name = name.trim().replace(/[\\/:*?"<>|]+/g, '-') || dflt;
  if (!/\.json$/i.test(name)) name += '.json';
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  saveName = name; // next Save offers the same name (no handle, so it is still a download each time)
  saveDone('Saved ' + name + ' to your downloads.');
}
// Shared by both load paths below: parses a save file's raw text and applies it on top of a
// clean default state, exactly like the file-import spec (§11) requires ("reset state before
// loading the saved data").
function applyLoadedFileText(text) {
  const parsed = JSON.parse(text); // throws on malformed JSON — caller decides how to report it
  if (typeof stResetCard === 'function') stResetCard(true); // Stress test results belong to the old plan, and its settings go back to the defaults, collapsed (display/stressPanel.js)
  if (typeof mcResetCard === 'function') mcResetCard(true); // Monte Carlo results / loaded trial belong to the old plan; its settings go back to the defaults, collapsed (display/mcPanel.js)
  destroyCharts(); // discard every visual/data closure from the old plan
  state = defaultState(); // reset before restoring, per spec
  state = hydrateState(parsed); // then apply the restored file on top of that clean default (its Hide flags are kept as saved)
  if (typeof scnLoadFromFile === 'function') scnLoadFromFile(parsed); // the file's other scenarios (or just A) replace the current set
  renderAll();
  autosave();
  flashMsg('Loaded from file.');
}
// "Load from file" (spec §4.4/§11). Prefers the File System Access API's open-file picker, which
// supports a stable `id` so the browser remembers this app's last-used folder across sessions —
// there is no web-platform API that can force a *first-ever* picker open in an arbitrary bundled
// folder (browsers deliberately disallow a page from choosing where its own file dialog starts, to
// keep sites from probing the local filesystem); the closest available approximation is this
// per-origin memory once the user has opened the Samples/ folder once. Falls back to the classic
// hidden <input type="file"> for browsers without the API (e.g. Firefox, Safari), which has no
// such memory but works everywhere, including plain file:// use.
async function loadFromFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        id: 'retirementPlannerLoad',
        types: [{description: 'Retirement Plan JSON', accept: {'application/json': ['.json']}}]
      });
      const file = await handle.getFile();
      applyLoadedFileText(await file.text());
      setSaveTarget(handle); // Save now overwrites this file
      flashMsg('Loaded ' + handle.name + '. Save will overwrite it.');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled the picker
      console.error('showOpenFilePicker failed, falling back to classic file input', err);
    }
  }
  document.getElementById('importFile').click();
}
document.getElementById('importFile').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    try {
      applyLoadedFileText(ev.target.result);
      setSaveTarget(null);
    } catch (err) {
      // no file handle from a plain <input>: Save downloads
      alert('Could not read that file as a saved plan.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});
