'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / CONSTANTS — 2026 simplified federal tax model (TCJA permanent / OBBBA)
// Pure data tables only. Logic that USES these tables lives in js/compute/*.
// ═══════════════════════════════════════════════════════════════

// Ordinary brackets & standard deduction: IRS Rev. Proc. 2025-32 (tax year 2026, OBBBA-adjusted).
const MFJ_ORD = [
  {lim: 24800, r: 0.1},
  {lim: 100800, r: 0.12},
  {lim: 211400, r: 0.22},
  {lim: 403550, r: 0.24},
  {lim: 512450, r: 0.32},
  {lim: 768700, r: 0.35},
  {lim: Infinity, r: 0.37}
];
const SGL_ORD = [
  {lim: 12400, r: 0.1},
  {lim: 50400, r: 0.12},
  {lim: 105700, r: 0.22},
  {lim: 201775, r: 0.24},
  {lim: 256225, r: 0.32},
  {lim: 640600, r: 0.35},
  {lim: Infinity, r: 0.37}
];
const STD_MFJ = 32200,
  STD_SGL = 16100;
// Additional standard deduction for age 65 or older (Rev. Proc. 2025-32, tax year 2026): $1,650 per qualifying person on a joint return, $2,050 for an unmarried filer.
// (The extra amount for blindness is not modeled.) Separate from, and in addition to, the enhanced senior deduction below.
const STD_AGE65_MFJ = 1650,
  STD_AGE65_SGL = 2050;
// Enhanced deduction for seniors (Schedule 1-A Part V; IRC §151(d)(5)(C), added by the One Big Beautiful Bill Act): $6,000 per
// eligible individual (age 65 by year-end — for 2025 that means born before 1/2/1961), reduced by 6% of MAGI over $75,000
// ($150,000 joint), tax years 2025–2028 only. Fixed dollar amounts, not indexed. Taken on top of the standard/itemized deduction.
const SENIOR_DED = 6000,
  SENIOR_THRESH_SGL = 75000,
  SENIOR_THRESH_MFJ = 150000,
  SENIOR_RATE = 0.06,
  SENIOR_FIRST_YEAR = 2025,
  SENIOR_LAST_YEAR = 2028;
// Qualified dividend / LTCG brackets: IRS Rev. Proc. 2025-32 (tax year 2026).
const MFJ_QDIV = [
  {lim: 98900, r: 0},
  {lim: 613700, r: 0.15},
  {lim: Infinity, r: 0.2}
];
const SGL_QDIV = [
  {lim: 49450, r: 0},
  {lim: 545500, r: 0.15},
  {lim: Infinity, r: 0.2}
];
// IRMAA (2026 premium year, based on 2024 MAGI): CMS fact sheet, Nov 14 2025.
// surch = combined annual Part B + Part D surcharge per enrolled person.
// Part B premium increase over the standard premium at IRMAA tiers 1–5 (the beneficiary pays 35/50/65/80/85% of the Part B cost vs 25% standard).
const IRMAA_PART_B_INCREASE = [40, 100, 160, 220, 240];
// Roth-conversion "below brackets" slider stops. Semantics: stay BELOW the chosen bracket. 0 = below the first bracket = no conversion;
// null (the last stop) = no limit of that kind. Rates are the same for every filing status; the dollar amounts shown/used come from the
// filing status's own tables.
const CONV_ORD_STOPS = [0, 10, 12, 22, 24, 32, 35, 37, null];
const CONV_IRMAA_STOPS = [0, ...IRMAA_PART_B_INCREASE, null];
// Roth-conversion START trigger "when the ordinary tax bracket is below x%": the discrete brackets the slider can pick (no 0 / no-limit stop).
// Brokerage-withdraw "fill the LTCG bracket" slider stops (rate of the bracket whose top the withdraw fills; 20 = top bracket = no limit).
const LTCG_STOPS = [0, 15, 20];
const CONV_START_BRACKET_STOPS = [10, 12, 22, 24, 32, 35, 37];
function convStopIndex(stops, v) {
  if (v == null || v === '') return stops.length - 1;
  let bi = 0;
  stops.forEach((s, i) => {
    if (s != null && Math.abs(s - v) < Math.abs((stops[bi] == null ? 1e9 : stops[bi]) - v)) bi = i;
  });
  return bi;
}
// Top of taxable ordinary income that stays below the r% bracket (= where that bracket starts). Infinity = no limit; -1 = below everything (no conversion).
function convOrdTop(v, brk) {
  if (v == null || v === '') return Infinity;
  if (!(v > 0)) return -1;
  let j = 0;
  brk.forEach((b, i) => {
    if (Math.abs(b.r * 100 - v) < Math.abs(brk[j].r * 100 - v)) j = i;
  });
  return j > 0 ? brk[j - 1].lim : 0;
}
// MAGI ceiling that stays below the IRMAA line labeled with this Part B % increase. Infinity = no limit; -1 = no conversion.
function convMagiCap(v, tiers) {
  if (v == null || v === '') return Infinity;
  if (!(v > 0)) return -1;
  let j = 0;
  IRMAA_PART_B_INCREASE.forEach((x, i) => {
    if (Math.abs(x - v) < Math.abs(IRMAA_PART_B_INCREASE[j] - v)) j = i;
  });
  return tiers[j].magi - 1; // strictly below the tier's MAGI threshold
}
const IRMAA_MFJ = [
  {magi: 218000, label: 'T1', surch: 1148},
  {magi: 274000, label: 'T2', surch: 2885},
  {magi: 342000, label: 'T3', surch: 4620},
  {magi: 410000, label: 'T4', surch: 6355},
  {magi: 750000, label: 'T5+', surch: 6936}
];
const IRMAA_SGL = [
  {magi: 109000, label: 'T1', surch: 1148},
  {magi: 137000, label: 'T2', surch: 2885},
  {magi: 171000, label: 'T3', surch: 4620},
  {magi: 205000, label: 'T4', surch: 6355},
  {magi: 500000, label: 'T5+', surch: 6936}
];
// Net Investment Income Tax (NIIT, IRC §1411): 3.8% on the LESSER of (a) net investment income
// (here: non-qualified + qualified dividends + realized LTCG — the investment-income items already
// modeled) or (b) MAGI over the threshold. Thresholds are statutory and, like the SS provisional-
// income thresholds, are NOT indexed for inflation — deflated the same way (factor `f`) — UNLESS
// the speculative future-threshold-change assumption (spec §4.5) is enabled and this year is at or
// after its configured start year, in which case the configured threshold applies instead, held
// flat in today's-dollar terms (no deflation): the scenario being modeled is a future law that
// sets an inflation-indexed threshold, unlike current law's frozen nominal one.
const NIIT_RATE = 0.038,
  NIIT_THRESH_MFJ = 250000,
  NIIT_THRESH_SGL = 200000;
// ── State income tax (Tax & Optimizations panel). Figures for tax year 2026 (the base year of the federal tables above), treated as today's $ and held flat in
// today's $ like the federal tables (they are inflation-indexed by the states). Options offered in the panel: California, Washington.
const STATE_TAX_OPTIONS = [
  ['CA', 'California'],
  ['WA', 'Washington'],
  ['NY', 'New York State'],
  ['NYC', 'New York State + New York City (resident)']
];
// ── Payroll taxes (employee side) on wages and on stock-option gains that count as wages (compute/tax.js computePayrollTax). Tax year 2026.
// Social Security (OASDI) 6.2% on wages up to the wage base; Medicare 1.45% on all wages; Additional Medicare Tax 0.9% on wages above $250,000 (married filing jointly,
// both spouses' wages together) / $200,000 (single) — the statutory thresholds are NOT indexed, so like the NIIT thresholds they are deflated by `f` in today's $; FUTA (the
// federal unemployment tax, net 0.6% after the state credit) on the first $7,000 of each person's wages (also not indexed). The wage base is indexed, so it is flat in today's $.
const PAYROLL_SS_RATE = 0.062,
  PAYROLL_SS_BASE = 184500,
  PAYROLL_MED_RATE = 0.0145,
  PAYROLL_ADDL_MED_RATE = 0.009,
  PAYROLL_ADDL_MED_THRESH_MFJ = 250000,
  PAYROLL_ADDL_MED_THRESH_SGL = 200000,
  FUTA_RATE = 0.006,
  FUTA_BASE = 7000,
  // State payroll taxes, 2026: California SDI (employee-paid, no wage cap since 2024); Washington Paid Family & Medical Leave (total premium 1.13% up to the Social Security wage base, the
  // employee pays 71.43%) and WA Cares long-term-care premium (employee-paid, no wage cap; a person with an approved private LTC policy can be exempt).
  CA_SDI_RATE = 0.013,
  WA_PFML_RATE = 0.0113,
  WA_PFML_EMPLOYEE_SHARE = 0.7143,
  WA_CARES_RATE = 0.0058;
// ── New York State (resident) income tax, tax year 2026: rate schedule after the 2025 budget's 0.1-point cut of the first five rates (the 5.4% bracket is the one the
// recapture below is measured from), the standard deduction, and the $20,000 pension / annuity exclusion for age 59½+ (Social Security is not taxed).
const NY_ORD_SGL = [
  {lim: 8500, r: 0.039},
  {lim: 11700, r: 0.044},
  {lim: 13900, r: 0.0515},
  {lim: 80650, r: 0.054},
  {lim: 215400, r: 0.059},
  {lim: 1077550, r: 0.0685},
  {lim: 5000000, r: 0.0965},
  {lim: 25000000, r: 0.103},
  {lim: Infinity, r: 0.109}
];
const NY_ORD_MFJ = [
  {lim: 17150, r: 0.039},
  {lim: 23600, r: 0.044},
  {lim: 27900, r: 0.0515},
  {lim: 161550, r: 0.054},
  {lim: 323200, r: 0.059},
  {lim: 2155350, r: 0.0685},
  {lim: 5000000, r: 0.0965},
  {lim: 25000000, r: 0.103},
  {lim: Infinity, r: 0.109}
];
const NY_STD_SGL = 8000,
  NY_STD_MFJ = 16050,
  NY_PENSION_EXCL = 20000;
// Tax-benefit recapture ("supplemental tax", IT-201-I tax computation worksheets): once NY AGI is over $107,650 the benefit of the lower brackets is taken back, a
// tier at a time, over $50,000 of NY AGI each (see nyTax in compute/tax.js).
const NY_RECAPTURE_START = 107650,
  NY_RECAPTURE_BAND = 50000;
// New York City resident tax on the same New York taxable income (no recapture, no deduction of its own). Rates do not change with the 2025 state cut.
const NYC_ORD_SGL = [
  {lim: 12000, r: 0.03078},
  {lim: 25000, r: 0.03762},
  {lim: 50000, r: 0.03819},
  {lim: Infinity, r: 0.03876}
];
const NYC_ORD_MFJ = [
  {lim: 21600, r: 0.03078},
  {lim: 45000, r: 0.03762},
  {lim: 90000, r: 0.03819},
  {lim: Infinity, r: 0.03876}
];
// California: Schedule X / Y brackets (MFJ limits are exactly double the single ones), standard deduction and exemption credits (FTB Tax News, October 2026, "2026 Indexing").
// California does not tax Social Security and taxes capital gains as ordinary income. A 1% Mental Health Services surcharge applies to
// taxable income over $1,000,000 (all filing statuses; fixed by statute, not indexed).
const CA_ORD_SGL = [
  {lim: 11456, r: 0.01},
  {lim: 27157, r: 0.02},
  {lim: 42861, r: 0.04},
  {lim: 59498, r: 0.06},
  {lim: 75197, r: 0.08},
  {lim: 384109, r: 0.093},
  {lim: 460927, r: 0.103},
  {lim: 768213, r: 0.113},
  {lim: Infinity, r: 0.123}
];
const CA_ORD_MFJ = CA_ORD_SGL.map(b => ({lim: b.lim * 2, r: b.r}));
const CA_STD_SGL = 5900,
  CA_STD_MFJ = 11800;
const CA_PERSONAL_CREDIT = 158,
  CA_SENIOR_CREDIT = 158; // per person; the senior credit is for age 65+
// Phase-out of the exemption credits (Form 540 line 32, "AGI Limitation Worksheet"): when FEDERAL AGI is over the threshold for the filing status, every personal and every
// senior credit is reduced by $6 for each $2,500 (or part of $2,500) of the excess, never below zero. A married couple's $12 is two credits at $6 each, so it is the same per-person rule.
// The thresholds are indexed with the other California amounts (held flat in today's $); the $2,500 step and the $6 reduction are fixed in statute, so like the $1M surcharge
// threshold they shrink with the deflator f. FTB's official figures: 2024 $244,857 / $489,719, 2025 $252,203 / $504,411. FTB has not yet published the 2026 thresholds (Tax News October
// 2026: "complete 2026 tax rates and exemption amounts ... late December"), so these are the 2025 figures × 1.034 (the 2026 CCPI rate), the rule that reproduces 2025 from 2024
// and every 2026 amount in that newsletter. Replace with FTB's published numbers when they appear.
const CA_CREDIT_PHASEOUT_SGL = 260778,
  CA_CREDIT_PHASEOUT_MFJ = 521561,
  CA_CREDIT_PHASEOUT_BAND = 2500,
  CA_CREDIT_PHASEOUT_STEP = 6;
const CA_MH_THRESH = 1000000,
  CA_MH_RATE = 0.01;
// Washington: no income tax, but a capital-gains excise tax on long-term gains from stocks, bonds and similar assets (not real estate, not
// retirement accounts): 7% on the gain above an annual deduction ($278,000 for 2025, indexed, one deduction per married couple), and 9.9% on the
// part of the taxable gain above $1,000,000 (that $1M is not indexed).
const WA_CG_DEDUCTION = 278000,
  WA_CG_RATE = 0.07,
  WA_CG_TIER2 = 1000000,
  WA_CG_RATE2 = 0.099;
// IRS Uniform Lifetime Table (ages 72-105); ages below 72 are a linear approximation
// used only if the user chooses to start IRA withdrawals earlier than their RMD age.
const RMD_TABLE = {
  72: 27.4,
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6
};

// IRS Single Life Expectancy Table (Treas. Reg. §1.401(a)(9)-9(c), effective for distribution calendar years beginning on or after Jan 1, 2022; IRS Pub. 590-B Table I).
// Used for the annual RMDs of an inherited IRA (non-spouse beneficiaries: the factor for the beneficiary's age in the first RMD year, reduced by 1 each later year).
const SLE_TABLE = [
  84.6, 83.7, 82.8, 81.8, 80.8, 79.8, 78.8, 77.9, 76.9, 75.9, 74.9, 73.9, 72.9, 71.9, 70.9, 69.9, 69.0, 68.0, 67.0, 66.0, 65.0, 64.1, 63.1,
  62.1, 61.1, 60.2, 59.2, 58.2, 57.3, 56.3, 55.3, 54.4, 53.4, 52.5, 51.5, 50.5, 49.6, 48.6, 47.7, 46.7, 45.7, 44.8, 43.8, 42.9, 41.9, 41.0,
  40.0, 39.0, 38.1, 37.1, 36.2, 35.3, 34.3, 33.4, 32.5, 31.6, 30.6, 29.8, 28.9, 28.0, 27.1, 26.2, 25.4, 24.5, 23.7, 22.9, 22.0, 21.2, 20.4,
  19.6, 18.8, 18.0, 17.2, 16.4, 15.6, 14.8, 14.1, 13.3, 12.6, 11.9, 11.2, 10.5, 9.9, 9.3, 8.7, 8.1, 7.6, 7.1, 6.6, 6.1, 5.7, 5.3, 4.9, 4.6,
  4.3, 4.0, 3.7, 3.4, 3.2, 3.0, 2.8, 2.6, 2.5, 2.3, 2.2, 2.1, 2.1, 2.1, 2.0, 2.0, 2.0, 2.0, 2.0, 1.9, 1.9, 1.8, 1.8, 1.6, 1.4, 1.1, 1.0
]; // index = age 0…120

const THIS_YEAR = new Date().getFullYear();
const THIS_MONTH = new Date().getMonth() + 1;
