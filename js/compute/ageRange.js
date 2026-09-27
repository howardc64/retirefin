'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / AGE RANGE — resolve an age-range input spec (spec §4.3
// "Shared Field Types") into concrete [startAge, endAge] numbers for
// a given person. The UI for editing this spec lives in input/controls.js.
// ═══════════════════════════════════════════════════════════════
// where "now"->current age, "passing"->that person's passing age, "rmd"->that person's RMD age.
function resolveAgeRange(ar, person){
  const start = ar.startMode==='now' ? currentAge(person)
    : ar.startMode==='rmd' ? rmdAgeForBirthYear(person.birthYear)
    : ar.startVal;
  const end = ar.endMode==='passing' ? state.passing[person.id]
    : ar.endVal;
  return[start,end];
}
