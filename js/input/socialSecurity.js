'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / SOCIAL SECURITY — "Social Security" card: already-started
// flag, PIA/FRA, and the claim-age slider (spec §4.4).
// ═══════════════════════════════════════════════════════════════
function buildSSCard(pid, p, i, married){
  const s=p.ss;
  return `<div class="item">
      ${cardHeader('Social Security', pid+'.ss.enabled', s.enabled, pid+'.ss.hidden', !!s.hidden)}
      <div class="item-body ${s.hidden?'':'open'}">
        <div class="field full"><label><input type="checkbox" ${s.started?'checked':''} onchange="onSSStartedToggle(${i}, this.checked)"> Already started collecting</label></div>
        ${s.started?`
        <div class="field full"><label>Current monthly benefit (today's $)</label>
          <input type="number" class="money" min="0" step="10" value="${s.pia}" oninput="onNumberInput('${pid}.ss.pia', this.value)"></div>
        `:`
        <div class="field"><label>PIA at FRA ($/mo, today's $)</label>
          <input type="number" class="money" min="0" step="10" value="${s.pia}" oninput="onNumberInput('${pid}.ss.pia', this.value)"></div>
        <div class="field"><label>Full retirement age</label>
          <input type="number" min="62" max="70" step="0.1" value="${s.fra.toFixed(2)}" oninput="onNumberInput('${pid}.ss.fra', this.value)"></div>
        <div class="full" style="margin-top:2px">
          <label style="font-size:13px;color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:normal;display:block;margin-bottom:6px">Starts Social Security at age</label>
          <div style="display:flex;align-items:center;gap:12px">
            <input type="range" id="ssClaimSlider_${i}" min="62" max="70" step="1" value="${s.claimAge}" oninput="onSSClaimAge(${i}, this.value)" style="flex:1;min-width:0">
            <div class="sv" id="ssClaimVal_${i}" style="flex:0 0 auto;min-width:24px;text-align:right">${s.claimAge}</div>
          </div>
        </div>
        `}
      </div>
    </div>`;
}
