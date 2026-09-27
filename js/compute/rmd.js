'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / RMD — Required Minimum Distribution schedule (spec §8.1).
// Uses the RMD_TABLE data table from core/constants.js.
// ═══════════════════════════════════════════════════════════════
function rmdDivisor(age){
  const a=Math.floor(age);
  if(a>=72) return RMD_TABLE[Math.min(a,105)]||4.0;
  if(a<40) return null;
  return RMD_TABLE[72]+(72-a)*0.9; // approximation for voluntary early withdrawals
}
function rmdAgeForBirthYear(y){ return y>=1960?75:(y>=1951?73:72); }
