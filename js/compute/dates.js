'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / DATES — a person's current age, and which person is "P0"
// (the older of the two, used to anchor every chart's X axis).
// ═══════════════════════════════════════════════════════════════
function currentAge(person){
  const now = THIS_YEAR + (THIS_MONTH-1)/12;
  const birth = person.birthYear + ((person.birthMonth||1)-1)/12;
  return now - birth;
}
function olderPersonIndex(){
  if(state.filingStatus!=='married') return 0;
  return currentAge(state.people[0])>=currentAge(state.people[1])?0:1;
}
