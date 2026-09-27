'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / RENTAL — "Rental income" card (spec §4.4). Uses the shared
// agedItemCard() builder from input/controls.js.
// ═══════════════════════════════════════════════════════════════
function buildRentalCard(pid, p){
  return agedItemCard(pid, 'rental', 'Rental income', p.rental, pid+'.rental');
}
