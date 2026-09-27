'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / SOCIAL SECURITY — FRA and claim-age adjustment factors
// (spec §6). Taxation of Social Security lives in compute/tax.js.
// ═══════════════════════════════════════════════════════════════
function fraForBirthYear(y){
  // SSA full retirement age table, expressed in decimal years
  if(y<=1937) return 65;
  if(y<=1942) return 65 + (y-1937)*2/12;
  if(y<=1954) return 66;
  if(y<=1959) return 66 + (y-1954)*2/12;
  return 67;
}
// Social Security early/delayed retirement factor applied to a PIA (own benefit).
function ssOwnFactor(claimAge, fra){
  if(claimAge>=fra){
    const yrsDelay=Math.min(70,claimAge)-fra;
    return 1+yrsDelay*0.08;
  }
  const moEarly=(fra-claimAge)*12;
  const first36=Math.min(moEarly,36)*(5/9/100);
  const rest=Math.max(moEarly-36,0)*(5/12/100);
  return Math.max(0,1-(first36+rest));
}
// Spousal-benefit reduction factor (different statutory rate than own-benefit reduction).
function ssSpousalFactor(claimAge, fra){
  if(claimAge>=fra) return 1;
  const moEarly=(fra-claimAge)*12;
  const first36=Math.min(moEarly,36)*(25/36/100);
  const rest=Math.max(moEarly-36,0)*(5/12/100);
  return Math.max(0,1-(first36+rest));
}
