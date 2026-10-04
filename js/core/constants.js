'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / CONSTANTS — 2026 simplified federal tax model (TCJA permanent / OBBBA)
// Pure data tables only. Logic that USES these tables lives in js/compute/*.
// ═══════════════════════════════════════════════════════════════

// Ordinary brackets & standard deduction: IRS Rev. Proc. 2025-32 (tax year 2026, OBBBA-adjusted).
const MFJ_ORD=[{lim:24800,r:.10},{lim:100800,r:.12},{lim:211400,r:.22},{lim:403550,r:.24},{lim:512450,r:.32},{lim:768700,r:.35},{lim:Infinity,r:.37}];
const SGL_ORD=[{lim:12400,r:.10},{lim:50400,r:.12},{lim:105700,r:.22},{lim:201775,r:.24},{lim:256225,r:.32},{lim:640600,r:.35},{lim:Infinity,r:.37}];
const STD_MFJ=32200, STD_SGL=16100;
// Enhanced deduction for seniors (Schedule 1-A Part V; IRC §151(d)(5)(C), added by the One Big Beautiful Bill Act): $6,000 per
// eligible individual (age 65 by year-end — for 2025 that means born before 1/2/1961), reduced by 6% of MAGI over $75,000
// ($150,000 joint), tax years 2025–2028 only. Fixed dollar amounts, not indexed. Taken on top of the standard/itemized deduction.
const SENIOR_DED=6000, SENIOR_THRESH_SGL=75000, SENIOR_THRESH_MFJ=150000, SENIOR_RATE=0.06, SENIOR_FIRST_YEAR=2025, SENIOR_LAST_YEAR=2028;
// Qualified dividend / LTCG brackets: IRS Rev. Proc. 2025-32 (tax year 2026).
const MFJ_QDIV=[{lim:98900,r:0},{lim:613700,r:.15},{lim:Infinity,r:.20}];
const SGL_QDIV=[{lim:49450,r:0},{lim:545500,r:.15},{lim:Infinity,r:.20}];
// IRMAA (2026 premium year, based on 2024 MAGI): CMS fact sheet, Nov 14 2025.
// surch = combined annual Part B + Part D surcharge per enrolled person.
// Part B premium increase over the standard premium at IRMAA tiers 1–5 (the beneficiary pays 35/50/65/80/85% of the Part B cost vs 25% standard).
const IRMAA_PART_B_INCREASE=[40,100,160,220,240];
// Roth-conversion "below brackets" slider stops. Semantics: stay BELOW the chosen bracket. 0 = below the first bracket = no conversion;
// null (the last stop) = no limit of that kind. Rates are the same for every filing status; the dollar amounts shown/used come from the
// filing status's own tables.
const CONV_ORD_STOPS=[0,10,12,22,24,32,35,37,null];
const CONV_IRMAA_STOPS=[0,...IRMAA_PART_B_INCREASE,null];
// Roth-conversion START trigger "when the ordinary tax bracket is below x%": the discrete brackets the slider can pick (no 0 / no-limit stop).
const CONV_START_BRACKET_STOPS=[10,12,22,24,32,35,37];
function convStopIndex(stops, v){
  if(v==null||v==='') return stops.length-1;
  let bi=0; stops.forEach((s,i)=>{ if(s!=null&&Math.abs(s-v)<Math.abs((stops[bi]==null?1e9:stops[bi])-v)) bi=i; });
  return bi;
}
// Top of taxable ordinary income that stays below the r% bracket (= where that bracket starts). Infinity = no limit; -1 = below everything (no conversion).
function convOrdTop(v, brk){
  if(v==null||v==='') return Infinity;
  if(!(v>0)) return -1;
  let j=0; brk.forEach((b,i)=>{ if(Math.abs(b.r*100-v)<Math.abs(brk[j].r*100-v)) j=i; });
  return j>0?brk[j-1].lim:0;
}
// MAGI ceiling that stays below the IRMAA line labeled with this Part B % increase. Infinity = no limit; -1 = no conversion.
function convMagiCap(v, tiers){
  if(v==null||v==='') return Infinity;
  if(!(v>0)) return -1;
  let j=0; IRMAA_PART_B_INCREASE.forEach((x,i)=>{ if(Math.abs(x-v)<Math.abs(IRMAA_PART_B_INCREASE[j]-v)) j=i; });
  return tiers[j].magi-1;   // strictly below the tier's MAGI threshold
}
const IRMAA_MFJ=[{magi:218000,label:'T1',surch:1148},{magi:274000,label:'T2',surch:2885},{magi:342000,label:'T3',surch:4620},{magi:410000,label:'T4',surch:6355},{magi:750000,label:'T5+',surch:6936}];
const IRMAA_SGL=[{magi:109000,label:'T1',surch:1148},{magi:137000,label:'T2',surch:2885},{magi:171000,label:'T3',surch:4620},{magi:205000,label:'T4',surch:6355},{magi:500000,label:'T5+',surch:6936}];
// Net Investment Income Tax (NIIT, IRC §1411): 3.8% on the LESSER of (a) net investment income
// (here: non-qualified + qualified dividends + realized LTCG — the investment-income items already
// modeled) or (b) MAGI over the threshold. Thresholds are statutory and, like the SS provisional-
// income thresholds, are NOT indexed for inflation — deflated the same way (factor `f`) — UNLESS
// the speculative future-threshold-change assumption (spec §4.5) is enabled and this year is at or
// after its configured start year, in which case the configured threshold applies instead, held
// flat in today's-dollar terms (no deflation): the scenario being modeled is a future law that
// sets an inflation-indexed threshold, unlike current law's frozen nominal one.
const NIIT_RATE=0.038, NIIT_THRESH_MFJ=250000, NIIT_THRESH_SGL=200000;
// IRS Uniform Lifetime Table (ages 72-105); ages below 72 are a linear approximation
// used only if the user chooses to start IRA withdrawals earlier than their RMD age.
const RMD_TABLE={72:27.4,73:26.5,74:25.5,75:24.6,76:23.7,77:22.9,78:22.0,79:21.1,
  80:20.2,81:19.4,82:18.5,83:17.7,84:16.8,85:16.0,86:15.2,87:14.4,88:13.7,89:12.9,
  90:12.2,91:11.5,92:10.8,93:10.1,94:9.5,95:8.9,96:8.4,97:7.8,98:7.3,99:6.8,
  100:6.4,101:6.0,102:5.6,103:5.2,104:4.9,105:4.6};

const THIS_YEAR = new Date().getFullYear();
const THIS_MONTH = new Date().getMonth()+1;
