'use strict';
// CORE / PLAN SLOTS — which autosave this browser tab uses, and the storage keys for it (see state.js).

// Plan slot = which autosave this tab uses, so two tabs (two running copies of the app) never overwrite each other's autosave and can be linked live (input/liveLink.js).
//   '' = the 1st app (the original keys: an existing session loads as before); '2', '3' … = further apps; ?plan=NAME in the address asks for a named slot.
// claimPlanSlot() (run once at start, before the state is loaded) picks the slot with the Web Locks API: a tab holds the lock of its slot until it closes (a crash releases it), so the
// choice is atomic. Order: the address's ?plan= > the slot this tab already used (sessionStorage, survives a reload) > the 1st app > the first free number. A tab that gets a numbered
// slot it did not use before starts in the DEFAULT state; when that slot still holds an autosave, a dialog asks "Restore previous 2nd app session?" (Start fresh is the default answer).
// Without Web Locks (old browser, page not served over https / localhost) only ?plan= separates tabs, and liveLink.js warns about a shared slot.
let PLAN_INSTANCE = (() => {
  try {
    return (new URLSearchParams(location.search).get('plan') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  } catch (e) {
    return '';
  }
})();
const PLAN_EXPLICIT = PLAN_INSTANCE; // the slot asked for in the address, if any
function planKeys(slot) {
  const s = slot ? '_' + slot : '';
  return {state: 'retirementPlannerState_v1' + s, scn: 'retirementPlannerScenarios_v2' + s, ts: 'retirementPlannerState_v1' + s + '_ts'};
}
let STORAGE_KEY = planKeys(PLAN_INSTANCE).state;
function planSlotLabel(slot) {
  if (!slot) return '1st app';
  if (/^\d+$/.test(slot)) {
    const n = +slot,
      v = n % 100,
      suf = v >= 11 && v <= 13 ? 'th' : {1: 'st', 2: 'nd', 3: 'rd'}[n % 10] || 'th';
    return n + suf + ' app';
  }
  return slot;
}
function planApplySlot(slot) {
  PLAN_INSTANCE = slot;
  STORAGE_KEY = planKeys(slot).state;
  if (typeof SCN_STORAGE_KEY !== 'undefined') SCN_STORAGE_KEY = planKeys(slot).scn;
  if (slot && !document.title.includes(planSlotLabel(slot))) document.title += ' \u2013 ' + planSlotLabel(slot);
}
function planSlotInfo(slot) {
  try {
    const raw = localStorage.getItem(planKeys(slot).state);
    if (!raw || !raw.trim()) return null;
    const s = JSON.parse(raw),
      ppl = (s.people || [])
        .slice(0, s.filingStatus === 'married' ? 2 : 1)
        .map((p, i) => (p && p.name && String(p.name).trim()) || 'Person ' + (i + 1));
    const ts = Number(localStorage.getItem(planKeys(slot).ts));
    return {names: ppl.join(' & '), when: ts ? new Date(ts).toLocaleString() : ''};
  } catch (e) {
    return null;
  }
}
function planSlotWipe(slot) {
  const k = planKeys(slot);
  try {
    [k.state, k.scn, k.ts].forEach(x => localStorage.removeItem(x));
  } catch (e) {}
}
// The question; resolves true = restore, false = start fresh. (A function of its own so a test can replace it.)
function planSlotAsk(slot, info) {
  return new Promise(res => {
    const ov = document.createElement('div');
    ov.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:inherit';
    const lbl = planSlotLabel(slot),
      detail = [info && info.names ? 'scenario for ' + info.names : '', info && info.when ? 'last used ' + info.when : '']
        .filter(Boolean)
        .join(', ');
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="background:#fff;color:#222;max-width:440px;width:calc(100% - 40px);border-radius:12px;padding:22px 24px;box-shadow:0 10px 40px rgba(0,0,0,.3)">' +
      '<div style="font-size:17px;font-weight:600;margin-bottom:8px">Restore previous ' +
      lbl +
      ' session?</div>' +
      '<div style="font-size:13px;line-height:1.5;margin-bottom:16px">This is the ' +
      lbl +
      ' open in this browser. A session saved by an earlier ' +
      lbl +
      ' is still stored' +
      (detail ? ' (' + detail + ')' : '') +
      '. Start fresh opens the default scenario; the stored session is then discarded.</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn" id="planRestoreBtn">Restore previous session</button><button type="button" class="btn btn-primary" id="planFreshBtn">Start fresh</button></div></div>';
    document.body.appendChild(ov);
    const done = v => {
      ov.remove();
      document.removeEventListener('keydown', key);
      res(v);
    };
    const key = e => {
      if (e.key === 'Escape') done(false);
    };
    document.addEventListener('keydown', key);
    ov.querySelector('#planRestoreBtn').onclick = () => done(true);
    const f = ov.querySelector('#planFreshBtn');
    f.onclick = () => done(false);
    f.focus();
  });
}
async function claimPlanSlot() {
  if (typeof navigator === 'undefined' || !navigator.locks || !navigator.locks.request) return;
  const tryLock = name =>
    new Promise(res => {
      try {
        navigator.locks
          .request('retirementPlannerSlot:' + name, {ifAvailable: true}, lock => {
            if (!lock) {
              res(false);
              return;
            }
            res(true);
            return new Promise(() => {});
          })
          .catch(() => res(false));
      } catch (e) {
        // held until the tab closes
        res(false);
      }
    });
  let remembered = null;
  try {
    remembered = sessionStorage.getItem('planSlot');
  } catch (e) {}
  const wanted = PLAN_EXPLICIT || (remembered != null ? remembered : '');
  const cands = [wanted, ''];
  for (let n = 2; n <= 9; n++) cands.push(String(n));
  let got = null;
  for (const c of [...new Set(cands)]) {
    if (await tryLock(c)) {
      got = c;
      break;
    }
  }
  if (got === null) got = 't' + Math.random().toString(36).slice(2, 6); // nine apps already open: a private slot
  const reload = remembered != null && remembered === got,
    ask = !reload && got !== '' && got !== PLAN_EXPLICIT;
  planApplySlot(got);
  try {
    sessionStorage.setItem('planSlot', got);
  } catch (e) {}
  if (ask) {
    const info = planSlotInfo(got);
    if (info) {
      const restore = await planSlotAsk(got, info);
      if (!restore) planSlotWipe(got);
    }
  }
}

// LTC household living-expense defaults (today's $/yr). Single: the one LTC amount defaults to $7,500. Married: the 1st LTC amount
// defaults to the household's original living expenses (it follows `state.living` while ltc.living1 is null) and the 2nd to $15,000.
