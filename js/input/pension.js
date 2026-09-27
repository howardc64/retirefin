'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / PENSION — "Pension" card (spec §4.4). Uses the shared
// agedItemCard() builder from input/controls.js.
// ═══════════════════════════════════════════════════════════════
function buildPensionCard(pid, p){
  return agedItemCard(pid, 'pension', 'Pension', p.pension, pid+'.pension');
}
