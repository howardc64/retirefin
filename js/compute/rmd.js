'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / RMD — Required Minimum Distribution schedule (spec §8.1).
// Uses the RMD_TABLE data table from core/constants.js.
// ═══════════════════════════════════════════════════════════════
function rmdDivisor(age) {
  const a = Math.floor(age);
  if (a >= 72) return RMD_TABLE[Math.min(a, 105)] || 4.0;
  if (a < 40) return null;
  return RMD_TABLE[72] + (72 - a) * 0.9; // approximation for voluntary early withdrawals
}
// Single Life Expectancy factor for a beneficiary's age (inherited IRAs); ages above 120 use 1.0, a negative age the age-0 factor.
function sleFactor(age) {
  const a = Math.max(0, Math.min(120, Math.floor(age)));
  return SLE_TABLE[a];
}
// Statutory RMD starting age (IRC §401(a)(9)(C), as amended by the SECURE Act and SECURE 2.0). The birth MONTH matters only in 1949:
//   born before July 1, 1949   → 70½ (the pre-SECURE rule; these owners have been taking RMDs for years)
//   July 1, 1949 – Dec 31, 1950 → 72
//   1951 – 1959                 → 73   (1959 is where SECURE 2.0's "73 until 2032" and "75 from 2033" wordings overlap; IRS guidance treats it as 73)
//   1960 or later               → 75
// `m` is the birth month 1–12 (the app stores no birth day, so all of July 1949 counts as "on or after July 1"); a missing month is read as January, as everywhere else.
function rmdAgeForBirthYear(y, m) {
  y = Number(y);
  m = Number(m) || 1;
  if (y < 1949 || (y === 1949 && m < 7)) return 70.5;
  if (y <= 1950) return 72;
  if (y <= 1959) return 73;
  return 75;
}
// The calendar year the owner reaches the RMD age (the "first distribution calendar year") and the deadline for that first RMD: it may be delayed to
// April 1 of the following year (the required beginning date); every later RMD is due December 31 of its own year. Delaying means taking two RMDs in
// that second year. (The projection takes each RMD in the year the owner reaches the RMD age; it does not model the April 1 delay.)
function rmdFirstDistribution(y, m) {
  y = Number(y);
  m = Number(m) || 1;
  const age = rmdAgeForBirthYear(y, m);
  const year = age === 70.5 ? (m + 6 > 12 ? y + 71 : y + 70) : y + age; // 70½ falls 6 months after the 70th birthday, which can roll into the next calendar year
  return {age, year, firstDeadline: {year: year + 1, month: 4, day: 1}, laterDeadlineMonthDay: '12-31'};
}
