'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / CONSTANTS — 2026 simplified federal tax model (TCJA permanent / OBBBA)
// Pure data tables only. Logic that USES these tables lives in js/compute/*.
// ═══════════════════════════════════════════════════════════════

// Ordinary brackets & standard deduction: IRS Rev. Proc. 2025-32 (tax year 2026, OBBBA-adjusted).
const MFJ_ORD=[{lim:24800,r:.10},{lim:100800,r:.12},{lim:211400,r:.22},{lim:403550,r:.24},{lim:512450,r:.32},{lim:768700,r:.35},{lim:Infinity,r:.37}];
const SGL_ORD=[{lim:12400,r:.10},{lim:50400,r:.12},{lim:105700,r:.22},{lim:201775,r:.24},{lim:256225,r:.32},{lim:640600,r:.35},{lim:Infinity,r:.37}];
const STD_MFJ=32200, STD_SGL=16100;
// Qualified dividend / LTCG brackets: IRS Rev. Proc. 2025-32 (tax year 2026).
const MFJ_QDIV=[{lim:98900,r:0},{lim:613700,r:.15},{lim:Infinity,r:.20}];
const SGL_QDIV=[{lim:49450,r:0},{lim:545500,r:.15},{lim:Infinity,r:.20}];
// IRMAA (2026 premium year, based on 2024 MAGI): CMS fact sheet, Nov 14 2025.
// surch = combined annual Part B + Part D surcharge per enrolled person.
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
