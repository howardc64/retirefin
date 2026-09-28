# Retirement Income Planner — Architecture Spec

*This replaces `retire.md`'s topic-based structure entirely. It is organized to mirror the codebase
file-for-file: one section per source file, each a self-contained contract (what it reads, what it
produces, what rules it enforces). To change behavior, edit the section for the file that owns that
behavior, then hand this document (or just the changed section, plus the file it names) to an LLM or
developer with "update the code to match." The section headers double as a table of contents into
`js/`.*

---

## 0. How to Use This Document

- **One section = one file.** Every `###` heading below names the exact file it governs. If you're
  changing what a field does, find the field in this doc, edit the rule, then point the LLM at that
  file.
- **State schema (§2) is the contract between Input and Compute.** If you add a field here, both an
  Input file (to edit it) and Compute's `projection.js` (to use it) usually need updating — this doc
  tells you which.
- **Projection row schema (§4.6) is the contract between Compute and Display.** Every chart in §6 only
  reads fields listed there. If a chart needs a new number, add it to the row schema first, then wire
  the chart to it.
- **When you add a new file**, add a new section here in the matching part (§3–§6), add its exported
  names to that part's summary table, and add its `<script>` tag to `index.html` (see §7.2 for load
  order rules).
- Every rule below states current, intended behavior — not history. Where a past decision is worth
  preserving context on, it's called out as a *Design note*, not mixed into the rule itself.

---

## 1. Architecture at a Glance

```
   INPUT (js/input/)              COMPUTE (js/compute/)             DISPLAY (js/display/)
   writes into `state`   ──────▶  reads `state`, produces  ──────▶  reads projection rows,
   via setPath()/onFieldInput      one row per projected year        draws Chart.js charts
                                   ("the projection")

        ▲                                                                   │
        │                                                                   │
        └──────────────────── js/app.js (recompute/renderCharts) ◀──────────┘
                     boots the app, wires input changes to recompute + rerender
```

- **`state`** (defined in `js/core/state.js`) is the single source of truth for every input value —
  household setup, every income source, every assumption. Nothing else holds input state.
- **The projection** (`computeProjection()` in `js/compute/projection.js`) is the single source of
  truth for every derived number — income, tax, balances, all in today's dollars, one row per
  projected year. Nothing in Display recomputes anything the projection already computed.
- **Display never touches `state` directly** and **Compute never touches the DOM**. If you're tempted
  to do either, the logic belongs in a different file.

### File tree

```
index.html
js/
  core/         constants.js  helpers.js  state.js
  compute/      socialSecurityCalc.js  rmd.js  tax.js  dates.js  ageRange.js
                projection.js  whatIf.js
  input/        controls.js  household.js  assumptions.js  loadMenu.js
                wage.js  socialSecurity.js  pension.js  rental.js
                brokerage.js  ira.js  roth.js  incomeForms.js
  display/      chartHelpers.js  overlayPlugin.js
                ssChart.js  incomeChart.js  tssChart.js  taxChart.js  assetChart.js  footer.js
                formulasPage.js  notesPage.js  excelExport.js
  app.js
misc/      Note4User.md        (user-facing notes; rendered to HTML by the Notes button, §6.10)
Samples/   *.json  manifest.json (example saved plans; each .json is one entry in the Load file menu, §5.6)
```

All files are plain (non-module) scripts sharing one global scope, loaded via `<script src>` in
`index.html` in dependency order (see §7.2) — this is what lets the app run via `file://` as well as
GitHub Pages, with no build step.

---

## 2. State Schema

This is the full shape of the `state` object, as produced by `defaultState()` in `js/core/state.js`.
Every Input file (§5) writes into one piece of this; every Compute file (§4) reads from it.

```js
state = {
  filingStatus: 'single' | 'married',
  inflation: number,              // e.g. 0.03 for 3%. SS COLA is assumed to equal this.
  people: [Person, Person],       // always length 2; only people[0] is used when single
  passing: { p1: number, p2: number },  // passing age per person id
  scgl: number,                   // Suspended Capital-Gain Loss pool, today's $
  futureTax: {
    enabled: boolean,
    niitStartYear: number,
    niitSingle: number,           // today's $
    niitMarried: number           // today's $
  }
}

Person = {
  id: 'p1' | 'p2',
  name: string,
  birthYear: number, birthMonth: 1-12,
  wage:    { enabled, hidden, amount, ar: AgeRange, change: Change },
  ss:      { enabled, hidden, pia, fra, started: boolean, claimAge },
  pension: { enabled, hidden, amount, ar: AgeRange, change: Change, bene: boolean },
  rental:  { enabled, hidden, amount, ar: AgeRange, change: Change, bene: boolean },
  brokerage: [BrokeragePortfolio, ...],   // 0 or more
  ira:  { enabled, hidden, balance, growth: Change, ar: AgeRange, bene: boolean, conv: number },
  roth: { enabled, hidden, balance, growth: Change, bene: boolean }
}

AgeRange = { startMode: 'now'|'custom'|'rmd', startVal: number,
             endMode: 'custom'|'passing',     endVal: number }

Change = { mode: 'fixed'|'inflation'|'offset'|'custom', value: number /* percent, for offset/custom */ }

BrokeragePortfolio = {
  id, name, balance, growth: Change, yield: number /* ODIV % */, qdivPct: number /* % of ODIV */,
  ar: AgeRange, bene: boolean, idgt: boolean,
  enabled: boolean,          // default true — whether this portfolio is used for compute/display
  hidden: boolean,           // default false — whether its card is collapsed on screen (§5.1)
  expense: boolean,          // gates taxDrag/fee/living/ltcg below
  taxDrag: number,           // % of household Total Tax
  fee: { mode: 'pct'|'fixed', value: number },
  living: number,            // annual withdrawal, today's $
  basis: number | null,      // cost basis, today's $. null/blank = not entered. Tracked (§4.6) when a number, or when Expenses is on (a blank basis then means no unrealized gain today). Realized LTCG has no input: it is always derived from basis (§4.6). Older saves' `ltcg`/`ltcgMode` are dropped on load
  irmaa: boolean,            // default false — include the household IRMAA surcharge as an expense (needs `expense`); see §4.6
  foreignPct: number,        // % of portfolio that's foreign assets — always active, ungated
  ftcPct: number             // foreign tax credit %, default 0.25 — always active, ungated
}
```

**`enabled` vs. `hidden` (every income item above has both — see §5.1):** `enabled` controls whether
that item's data is used for compute (§4) and therefore appears in any chart (§6) at all. `hidden`
controls only whether that item's *input card* is visually collapsed to save screen space — it has
zero effect on compute or on any chart. The two are fully independent: an item can be enabled and
hidden (computed and charted, but its input card collapsed), enabled and shown, disabled and hidden,
or disabled and shown (its fields still visible/editable, just not yet counted).

- `resolveAgeRange(ar, person)` (§4.5) is the only place that turns an `AgeRange` into concrete ages —
  every consumer of an age range goes through it, never reads `startMode`/`endMode` directly.
- `realGrowth(change, inflation)` (§4.6) is the only place that turns a `Change` into a real
  (today's-$) annual growth rate.

---

## 3. Core (`js/core/`)

### 3.1 `constants.js`
**Purpose:** pure data tables — nothing in this file computes anything. Data only, no logic.
| Export | Contents |
|---|---|
| `MFJ_ORD`, `SGL_ORD` | Ordinary tax brackets `[{lim, r}]`, married/single |
| `STD_MFJ`, `STD_SGL` | Standard deduction, married/single |
| `MFJ_QDIV`, `SGL_QDIV` | Qualified-dividend/LTCG brackets |
| `IRMAA_MFJ`, `IRMAA_SGL` | IRMAA tiers `[{magi, label, surch}]` |
| `NIIT_RATE`, `NIIT_THRESH_MFJ`, `NIIT_THRESH_SGL` | NIIT rate + un-indexed thresholds |
| `RMD_TABLE` | IRS Uniform Lifetime Table, age → divisor |
| `THIS_YEAR`, `THIS_MONTH` | Anchor for all age/date math |

**Rule:** when the IRS publishes new brackets/IRMAA tiers for a new tax year, this is the only file
that changes.

### 3.2 `helpers.js`
**Purpose:** generic, dependency-free utilities used everywhere.
| Export | Contract |
|---|---|
| `fmt(n)` | `$1,234` / `-$1,234` — rounds to whole dollars |
| `fmtM(n)` | `fmt(n)+'/mo'` |
| `clamp(v,lo,hi)` | numeric clamp |
| `uid()` | short random id string, for new list items (e.g. a new brokerage portfolio) |
| `escHtml(s)`, `escAttr(s)` | HTML/attribute escaping for any user-entered string rendered into a template literal |

### 3.3 `state.js`
**Purpose:** owns `state` (§2) end to end — defaults, save/restore, autosave, dot-path mutation.
| Export | Contract |
|---|---|
| `defaultState()`, `defaultPerson(idx)`, `defaultBrokeragePortfolio(balance,n)`, `defaultChange`, `defaultAgeRange`, `defaultIncomeItem`, `defaultAgeRangedItem` | Canonical default shapes (§2). **If you add a field to the schema, add its default here.** |
| `pfBasisEntered(b)`, `pfTracksBasis(b)` | Cost-basis tracking predicates (§4.6): a cost basis was entered (`basis` is a number; `null`/blank is *not* the same as `0`); and that OR Expenses on (`pfExpense`) — whether a portfolio's basis/unrealized gain is tracked at all |
| `pfExpense(b)` | Whether a portfolio's Expenses panel is "on" — `b.expense` if present, else true if legacy `taxDrag`/`fee.value` is nonzero |
| `hydrateState(loaded)` | Deep-merges a loaded/imported object onto `defaultState()`: missing fields get defaults, unknown/stale fields are dropped, arrays keep every entry (not just as many as the default has) |
| `state` | The live, mutable object every other file reads/writes |
| `autosave()` / `loadAutosave()` | Silent per-browser `localStorage` save/restore, so a reload doesn't lose work |
| `resetState()` | Confirms, then resets `state` to defaults (with `applyDefaultHiddenFromEnabled`) and re-renders |
| `saveToFile()` | Downloads `state` as `retirement-plan.json` (File System Access API where available) |
| `loadFromFile()` | The **Choose file from local directory…** menu entry's action (§5.6). Uses `showOpenFilePicker` (with a stable `id: 'retirementPlannerLoad'`, so browsers that support it remember the last-used folder across sessions) when available; otherwise clicks the hidden `<input type="file" id="importFile">`. **Limitation (browser security, not fixable here):** no web API lets a page force its *first-ever* file dialog to open in a chosen folder such as `Samples/` — the Load file menu (§5.6) lists the shipped `Samples/` folder instead; after the user opens a file from it once, supporting browsers remember it. |
| `applyLoadedFileText(text)` | Shared by both load paths: parse JSON → **destroy every chart → reset to defaults → hydrate the loaded file on top → `applyDefaultHiddenFromEnabled`** — always in that order, so no stale state or chart instance survives a restore |
| `applyDefaultHiddenFromEnabled(s)` | Sets `hidden = !enabled` on every income item and brokerage portfolio (§8 "Default coupling"). Called by load and reset — deliberately **not** by autosave-restore, so manual Hide/Show survives a page reload |
| `setPath(path, value)` | Dot-path set into `state`, e.g. `setPath('people.0.wage.amount', 5000)` — every input control's `onchange` goes through this (via `onFieldInput`/`onNumberInput` in `controls.js`) |

**Rule:** this is the *only* file allowed to declare what a default value is. Every Input file reads
a value from `state`; none of them invent a fallback default inline.

---

## 4. Compute (`js/compute/`)

Nothing in this part touches the DOM. Every function here is a pure function of its arguments and/or
`state`.

### 4.1 `socialSecurityCalc.js`
| Export | Rule |
|---|---|
| `fraForBirthYear(y)` | SSA's Full Retirement Age table (65 → 67 by birth year) |
| `ssOwnFactor(claimAge, fra)` | Early claim: −5/9%/mo for first 36 months early, −5/12%/mo beyond; delayed claim: +8%/yr up to age 70 |
| `ssSpousalFactor(claimAge, fra)` | Same shape, different statutory rate for a spousal benefit: −25/36%/mo first 36 months, −5/12%/mo beyond; no delayed credit past FRA |

### 4.2 `rmd.js`
| Export | Rule |
|---|---|
| `rmdDivisor(age)` | IRS Uniform Lifetime Table lookup for age ≥ 72; below 72, a linear approximation for voluntary early withdrawals |
| `rmdAgeForBirthYear(y)` | 72 / 73 / 75 depending on birth year (current-law RMD start age) |

### 4.3 `tax.js`
| Export | Rule |
|---|---|
| `calcOrdTax(ti, brackets)` | Standard marginal-bracket tax on taxable income |
| `calcQualTax(ordTI, qualIncome, qdivBrackets)` | Qualified income (QDIV+LTCG) taxed at its own brackets, stacked on top of ordinary taxable income |
| `qualTaxTiers(ordTI, qualIncome, qBrackets)` | Same as above but returns the per-tier dollar amounts (0%/15%/20% bands), for the tax chart's stacked segments |
| `computeTaxableSS(nonSS, totalSS, filing, f)` | Provisional-income formula → taxable SS dollar amount. `f` deflates the un-indexed $25k/$32k/$34k/$44k thresholds since everything else here is in today's $ |
| `computeSSTAndMarginal(...)` | **SST** = the incremental tax caused by taxable SS (actual total tax minus a hypothetical with no SS taxed) — not the taxable-SS dollar amount itself. **marginalRate** = true marginal rate on the next dollar of ordinary income, via a $100 numerical derivative — this is what captures the "torpedo effect" (an extra dollar pushing more SS into taxability, taxed on top of itself) |
| `computeNIIT(nii, magi, filing, f, futureTax, year)` | 3.8% of lesser of net investment income or MAGI-over-threshold. If `futureTax.enabled` and `year >= futureTax.niitStartYear`, uses the configured today's-$ threshold instead of the statutory (deflated) one |

**Design note:** foreign tax credit (from brokerage portfolios) is *not* computed here — it's computed
per-portfolio in `projection.js` (§4.6) since it depends on portfolio balance, and subtracted from
Total Tax there, not folded into any of these functions.

### 4.4 `dates.js`
| Export | Rule |
|---|---|
| `currentAge(person)` | From `birthYear`/`birthMonth` and `THIS_YEAR`/`THIS_MONTH` |
| `olderPersonIndex()` | Which person is P0 — married households only; anchors every chart's X axis |

### 4.5 `ageRange.js`
| Export | Rule |
|---|---|
| `resolveAgeRange(ar, person)` | `startMode`: `'now'`→current age, `'rmd'`→`rmdAgeForBirthYear`, `'custom'`→`startVal`. `endMode`: `'passing'`→that person's passing age, `'custom'`→`endVal`. Returns `[startAge, endAge]` |

### 4.6 `projection.js`
**Purpose:** the core year-by-year model. `computeProjection()` takes no arguments (reads `state`
directly) and returns `{ rows, people, idxP0, married }`. **This is the contract every Display file
consumes — nothing in `js/display/` should recompute anything listed in the row schema below.**

**`realGrowth(change, inflation)`** — converts a `Change` spec (§2) into a real (today's-$) annual
rate: `fixed`→erodes with inflation, `inflation`→0% real, `offset`→`value/(1+inflation)`,
`custom`→`(1+value)/(1+inflation)-1`.

**Per-year order of operations** (one iteration of the row loop, `k` = years from now):
1. Compute each living person's age this year; stop the whole loop once nobody is alive.
2. Wages, per person, gated by their age range.
3. Social Security per person: own benefit (with early/delayed factor) or spousal benefit if higher,
   gated by claim age; on a spouse's death, the survivor gets the larger of the two amounts (SSSBR).
4. Pension / rental, per person, via the shared `personAgedItemActive()` — respects survivor-benefit
   continuation using the *deceased's last living year's* age range, so a `passing`-mode end age
   doesn't cut a survivor benefit off immediately.
5. Brokerage portfolios, per portfolio: ODIV, QDIV, LTCG, and
   **foreign tax credit** (`balance × foreignPct × ftcPct`) — always active, independent of the
   `expense` toggle and `idgt` flag (unlike tax drag/fee/withdrawal/LTCG, which do require `expense`).
   **Realized LTCG** is not an input: it is derived from tracked cost basis whenever the `expense` toggle
   is on (see *Cost basis & unrealized gain* below) — the year's expenses are paid by other household
   income, then by dividends, and only the shortfall is sold. Its tax-drag term uses **prior-year Total Tax** (`rows[k-1].totalTax`, `$0` in year
   0) — deliberately: this year's TT depends on this year's LTCG, so using it would be circular; the
   one-year lag avoids any fixed-point iteration.
6. Pre-tax IRA: RMD (or voluntary early withdrawal) via `rmdDivisor`, plus a separate **Roth
   conversion withdrawal** (`rothConvByPerson`/`rothConvTotal`) — a real withdrawal on top of the RMD,
   taxed exactly like the RMD, continuing until the balance hits $0. Requires the matching Roth IRA
   to be enabled. On the owner's death, conversions stop; RMDs continue to a surviving spouse if the
   IRA is marked to continue.
7. Roth IRA: grows tax-free, receiving that year's conversion amount (if any) from step 6.
8. Ordinary income = wages + pension + rental + IRA RMD + **Roth conversion (pre-tax IRA withdraw)**
   + (ODIV − QDIV).
9. Taxable Social Security via `computeTaxableSS`; filing status for the year is `'single'` the
   moment either spouse has died.
10. AGI = ordinary income + taxable SS + QDIV + LTCG (net of SCGL, see next point).
11. LTCG net of SCGL: available `scgl` shields realized LTCG dollar-for-dollar (pool depletes across
    years); only the net amount is taxed/displayed.
12. Total Tax = ordinary+qualified tax (via `calcOrdTax`/`calcQualTax`) **minus foreign tax credit**
    (floored at 0) **plus NIIT** (`computeNIIT`, calculated on the *pre-credit* ordinary+qualified tax
    basis — the credit doesn't offset NIIT).
13. SST/marginal rate via `computeSSTAndMarginal`, using the pre-credit ordinary+qualified tax as its
    basis (foreign tax credit is unrelated to SS taxation).
14. Roll every brokerage balance forward: `+growth −(tax drag(% of Total Tax) + fee drag + IRMAA + withdrawal)`,
    paid only from that portfolio's own dividends and share sales (never household income), only when that
    portfolio's Expenses is on (foreign tax credit itself doesn't touch the balance).
    Tracked portfolios also roll their cost basis forward (next block).

**IRMAA as an expense** (optional, per portfolio via `irmaa`; part of every expense calculation below — dividend/sale waterfall, LTCG estimate, roll-forward):
- **Household surcharge** = `irmaaSurcharge` = surcharge of the IRMAA tier (`IRMAA_MFJ`/`IRMAA_SGL`, this year's filing status) reached by the **prior year's AGI** × the number of living people age ≥ 65. Year 0 is `$0`. The one-year lag avoids the circularity (this year's AGI ← LTCG ← expenses ← surcharge) and mirrors IRMAA's real look-back; same idea as the prior-year TT for tax drag. Tier tables are indexed, so no deflation. The row always reports `irmaaSurcharge`; it only becomes an expense where a portfolio has the box checked.
- **Allocation:** charged once per household, split pro rata to start-of-year balance across the portfolios that are enabled, funded, Expenses-on and IRMAA-checked (IDGTs included — they pay from their own dividends/sales like their other expenses, same as every other portfolio).

**Cost basis & unrealized gain** (per portfolio; only when `pfTracksBasis(b)` — i.e. a basis was entered or Expenses is on;
otherwise nothing below applies: no LTCG, and dividends simply compound with the balance). Average-cost method, all in today's $:
- **Start:** `basis` = the entered cost basis, clamped to `[0, balance]`; a blank basis (Expenses on)
  starts at `basis = balance` (no unrealized gain today). **Gain fraction** `f = max(0, (bal − basis) / bal)`.
- **Expenses and the payment waterfall:** a portfolio's `expenses = withdrawal + fee + taxDrag + irmaa` (via the shared
  `pfOutflows(b, bal, k, tt, irmaaAmt)` helper, each capped at what the portfolio can pay in the order fee, tax drag, IRMAA, withdrawal; only when Expenses is on; `irmaa` only when that portfolio's `irmaa` box is checked).
  Paid **only from this portfolio's own money — never from household income** (wages, Social Security,
  pension, rental, IRA withdrawals/RMDs never offset a portfolio's expenses), in this order:
  1. **This portfolio's own dividends** (ODIV = `balance × yield`) pay what they can; `reinvested = max(0,
     ODIV − expenses)` is added to basis. A portfolio's dividends never pay another portfolio's expenses.
  2. **Sale** of shares for the `shortfall = max(0, expenses − ODIV)`.
  Only what dividends and sales pay leaves the portfolio: `balance ← bal×(1+g) − expenses`.
- **Realized LTCG:** `ltcg = shortfall × f` (Expenses on only), feeding the same SCGL → qualified income →
  AGI → NIIT path as any other LTCG. The shortfall is *estimated* with `pfOutflows(..., priorTT)`, because
  this year's tax drag depends on this year's TT, which depends on this year's LTCG (circular); the
  one-year lag means year 0 has no tax-drag term. The roll-forward uses the actual (this-year-TT) expenses,
  so the taxed LTCG and the basis removed can differ slightly when tax drag is on.
- **Basis roll-forward, each year (every tracked portfolio):**
  `basis ← (basis − sold×(1 − f) + reinvested) / (1 + inflation)`, clamped to `[0, end-of-year balance]`.
  Sales remove basis in proportion to cost share (expenses paid by dividends remove none);
  reinvested dividends (already-taxed income) add basis;
  and because basis is a fixed nominal amount while the model is in today's $, it **erodes by inflation**
  each year (so gains — and LTCG on later sales — grow in real terms). With Expenses off there are no
  expenses, so all dividends are reinvested.
- **Step-up at death:** in the first year the owner has passed *and* the portfolio continues to a
  surviving spouse (`bene`), a **non-IDGT** portfolio's basis resets to its balance (unrealized gain → 0;
  that year's auto LTCG is $0). **IDGT** portfolios keep carryover basis (outside the owner's estate) and
  are never stepped up. A portfolio that does not continue leaves the model at the owner's death.
- **Embedded gain:** each row reports per-portfolio `basis`/`unrealizedGain` and household totals
  `embeddedGain` (non-IDGT) and `embeddedGainIdgt`, all at start of year after any step-up.

**Row schema** (every field on each element of `rows[]`):

| Field | Meaning |
|---|---|
| `k`, `age0`, `ages`, `alive` | Year index, P0's age this row, each person's age, each person's alive flag |
| `filing` | `'married'` or `'single'` for this year |
| `wageByPerson`, `wageTotal` | Wage income |
| `ssByPerson`, `totalSS` | Social Security income |
| `pension`, `pensionByPerson`, `rental`, `rentalByPerson` | Pension/rental income |
| `odiv`, `qdiv`, `odivNQ`, `odivByPerson`, `qdivByPerson`, `odivNQByPerson` | Dividend income (total, qualified, non-qualified) |
| `ltcg`, `ltcgGross`, `ltcgByPerson`, `scglUsed`, `scglRemaining` | Realized LTCG net/gross of SCGL, and the SCGL pool's state |
| `ftcByPerson`, `foreignTaxCredit` | Foreign tax credit per person and household total |
| `iraByPerson`, `iraTotal`, `iraBalByPerson` | IRA RMD/withdrawal and end-of-year balance |
| `rothConvByPerson`, `rothConvTotal`, `rothBalByPerson` | Roth conversion (pre-tax IRA withdraw) amount and Roth balance |
| `portfoliosByPerson` | Per-portfolio detail: `{id, name, balance, idgt, expense, taxDrag, feeDrag, irmaaDrag, livingCost, ltcg, growthPct, netGrowthPct, tracked, basis, unrealizedGain, steppedUp, divUsed, divReinvested, sold}` — the last seven are the cost-basis / expense-waterfall fields (§4.6): `basis`/`unrealizedGain` are `null` when `tracked` is false; `steppedUp` is true only in the year the death step-up applied; `divUsed`/`divReinvested`/`sold` are the expense-waterfall amounts (0 unless tracked), paid only from this portfolio's own dividends and sales (never household income), with `taxDrag + feeDrag + irmaaDrag + livingCost = divUsed + sold` |
| `embeddedGain`, `embeddedGainIdgt` | Household unrealized gain across tracked portfolios, non-IDGT / IDGT (start of year, after any step-up) |
| `nonSSOrdinary`, `taxableSS`, `provisional` | Ordinary income ex-SS; taxable SS; provisional income |
| `ordIncome`, `std`, `ordTI`, `ordTax` | AGI components → ordinary taxable income → ordinary tax |
| `qualIncome`, `qualTax` | QDIV+LTCG and its tax |
| `sst`, `marginalRate` | Social Security tax and true marginal rate (torpedo effect) |
| `niiIncome`, `niit` | Net investment income and NIIT |
| `irmaaSurcharge` | Household IRMAA surcharge for the year (prior-year-AGI tier × enrolled people 65+); only charged to portfolios with `irmaa` checked |
| `totalTax` | Final Total Tax: `max(0, ordTax+qualTax−foreignTaxCredit) + niit` |
| `agi` | Adjusted gross income |

Also exported: `displayPersonName(person, idx)` (falls back to `"Person N"`), `p0Name(proj)`,
`ageAxisLabel(proj)` (`"{p0Name}'s age"`) — used by every age-axis chart's X-axis title.

### 4.7 `whatIf.js`
**Purpose:** runs the projection engine against a *temporary* clone of `state`, without touching the
real `state`, real inputs, or any on-screen chart — used exclusively by the SS breakeven chart (§6.3).
| Export | Contract |
|---|---|
| `pickIdxP0FromState()` | Which person index is P0, from the real `state` |
| `withTempState(mutator, fn)` | Clones `state`, applies `mutator` to the clone, runs `fn(tempState)`, restores the real `state` — used so `computeProjection()` can be called with a hypothetical without any side effects |
| `computeSSScenario(claimAge)` | Runs a full projection with P0's SS claim age forced to `claimAge`; returns lifetime household SS total and the per-year series |
| `ssROI(scenarioA, scenarioB)` | Real annualized ROI of choosing one claiming age's cash flows over another's |

---

## 5. Input (`js/input/`)

Every file here renders HTML into the DOM and writes into `state` via `setPath`/`onFieldInput`/
`onNumberInput` (from `controls.js`). None of them compute anything beyond what's needed to render a
default or a label — all real computation happens in Compute (§4).

### 5.1 `controls.js` — shared widgets
| Export | Contract |
|---|---|
| `onFieldInput(path, val)`, `onNumberInput(path, val)` | Generic `setPath` + recompute + autosave, used by nearly every input in the app |
| `renderChangeRow(path, change, defaultPct?, fixedLabel?)` / `onChangeMode(...)` | Renders/handles the shared **Annual change** selector (§2 `Change`) |
| `renderAgeRangeRow(path, ar, startOptions, endOptions)` / `onAgeRangeMode(...)` | Renders/handles the shared **Age range** selector (§2 `AgeRange`) |
| `toggleItem(el)` | Expand/collapse an element with no persisted state of its own — currently only the outer "Brokerage portfolio income" section header (§5.4), which has no single enabled/hidden flag of its own since it's a container for multiple portfolios |
| `cardHeader(title, enablePath, enabled, hidePath, hidden, extraRight?)` | **The enable/hide header every income-source card uses** (§2's `enabled`/`hidden` convention). Renders an Enable checkbox (left, wraps `title`) and a Hide checkbox (right, labeled "Hide"), with `extraRight` (e.g. a brokerage portfolio's Remove button) placed between them. Every card in §5.4 calls this instead of hand-rolling its own header. |
| `onEnableToggle(path, checked)` | Sets `enabled`, then `recompute()` — does **not** touch the card's collapsed state; enabling/disabling never changes what's on screen, only what's computed |
| `onHideToggle(path, checked, itemEl)` | Sets `hidden`, then toggles that item's `.item-body`'s `open` class directly (no recompute — hiding is purely visual, so there's nothing to recompute) |
| `agedItemCard(pid, key, title, item, checkboxPath)` | Shared card builder for the two income types that are just "amount + age range + change + survivor benefit": Pension and Rental. Calls `cardHeader` internally. |

**Rule:** any new income-type field that needs an age range, an annual-change mode, or an
enable/hide header uses these — don't hand-roll a new version of any of them. A card's body is open
(visible) whenever `!item.hidden`, full stop — never conditioned on `enabled`.

### 5.2 `household.js`
Renders: filing status radios, per-person name/birth year/birth month, read-only current-age display,
passing-age sliders (30–100, default 85/90), inflation slider (default 3%). `relabel()` pushes a name
change into every place a person's name appears without a full re-render (so typing doesn't lose
focus).

### 5.3 `assumptions.js`
Renders the speculative future-tax-threshold panel: a checkbox that, when on, reveals `niitStartYear`
+ `niitSingle`/`niitMarried` (today's $) fields feeding `state.futureTax` (§2), consumed by
`computeNIIT` (§4.3). The Social Security Taxation Threshold field is a documented placeholder — not
yet implemented in Compute.

### 5.4 Income-source cards
One file per income type; `incomeForms.js` (§5.5) calls each in sequence. **Every card below has an
Enable + Hide header via `cardHeader` (§5.1)** — omitted from the Fields column since it's identical
across all of them; the brokerage row calls it out separately since it applies per-portfolio, not once
for the whole "Brokerage portfolio income" card.

| File | Card | Fields |
|---|---|---|
| `wage.js` | Wage | Age range (default end 65), annual change |
| `socialSecurity.js` | Social Security | Already-started flag (else FRA, default 67), PIA, claim-age slider (62–70, default = FRA or started age) |
| `pension.js` | Pension | `agedItemCard` — amount, age range, change (the fixed option is worded **Fixed $ (no COLA)** here via `renderChangeRow`'s `fixedLabel`; elsewhere **Fixed $ (no growth)**), survivor benefit |
| `rental.js` | Rental income | `agedItemCard` — same shape as Pension |
| `brokerage.js` | Brokerage portfolio(s) | Add/remove multiple; **each portfolio has its own Enable + Hide header** (name, **age range (start/end) directly below the name**, **start balance**, growth (default inflation+4%), ODIV yield % (default 1.5%), QDIV % of ODIV (default 70%), foreign asset % + foreign tax credit % (default 0.25%) — always active, shown before and independent of the Expenses toggle and IDGT flag —, IDGT flag, **optional cost basis (today's $; blank = not tracked)** right under the balance, Expenses toggle gating tax drag/fee drag/withdrawal/IRMAA-surcharge checkbox/realized LTCG — LTCG has **no input**: the panel just shows a note that it is automatic (expenses are paid only from the portfolio's own dividends, and only a shortfall is sold and realizes gain from the cost basis) —, age range, survivor benefit). A new portfolio's `name` starts blank; both the card title and the name field's placeholder fall back to position-based "Portfolio N", and `onPortfolioName` patches the title live as you type (no re-render, so focus is kept). The outer "Brokerage portfolio income" card itself has no enable/hide of its own — it's just a container with an Add button, collapsed via the older `toggleItem` (no persisted state, since there's no single flag to persist for a container of several independently-enabled portfolios). |
| `ira.js` | Pre-tax IRA / 401(k) | Balance, age range (default start = RMD age), growth (default inflation+3%), survivor benefit, annual Roth conversion amount |
| `roth.js` | Roth IRA | Balance, growth (default inflation+3%), survivor benefit — no withdrawal fields; only grows, fed by the linked IRA's conversion |

### 5.5 `incomeForms.js`
**Purpose:** orchestrates the person-column(s), calling each §5.4 builder in the same fixed order for
every person-column, so the two-column grid (married) keeps every income type's row aligned via CSS
subgrid. Also owns every handler shared by more than one card: SS-started toggle, SS claim-age slider,
brokerage expense/fee-mode toggles, cost-basis input (`onBasisInput`: blank → `null`, not `0`), survivor-benefit toggle, portfolio name/add/remove.

**Rule:** a handler used by exactly one card lives in that card's own file (§5.4); a handler used by
two or more cards lives here.

### 5.6 `loadMenu.js` — the **Load file ▾** dropdown
Replaces the old single "Load from file" button (now labeled **Load file ▾**, `#loadMenuBtn`). Menu entries:
1. **Choose file from local directory…** → `loadFromFile()` (§3.3).
2. A **Samples** group: one entry per saved-plan JSON in `Samples/`, labeled with the file name minus
   `.json`; clicking fetches `Samples/<name>` and feeds it to `applyLoadedFileText()` (§3.3), so a sample
   loads exactly like a local file (reset → hydrate → collapse disabled cards).

| Export | Contract |
|---|---|
| `discoverSamples()` | Returns the sample file names. Tries **`Samples/manifest.json`** (a JSON array of names — authoritative, required on hosts with no folder listing such as GitHub Pages), then falls back to parsing the server's directory-listing page for `.json` links. Throws if neither is readable. |
| `toggleLoadMenu(ev)` / `closeLoadMenu()` | Opens the menu instantly with the local-file entry, then fills in Samples when discovery resolves; closes on outside click or Escape |
| `buildLoadMenu(menu, samples)` | `null` = still looking, `undefined` = discovery failed (shows an explanation), array = entries. Builds via DOM `textContent`, never HTML strings, so odd file names can't inject markup |
| `loadSample(name)` | Fetch + `applyLoadedFileText`; failures `alert` |

**To add a sample:** put the `.json` in `Samples/` and add its name to `Samples/manifest.json`.
**Limitation:** the browser can't list a folder, and Chrome blocks `fetch` of sibling files under
`file://` — there the Samples group shows an explanatory note, while *Choose file from local directory…*
keeps working.

---

## 6. Display (`js/display/`)

Every chart here reads projection rows (§4.6) — nothing here reads `state` directly, and nothing here
computes a number the projection doesn't already provide (chart-local formatting/aggregation for
presentation is fine; new financial logic is not).

### 6.1 `chartHelpers.js` — shared conventions (read this before touching any chart file)
| Export | Contract |
|---|---|
| `showDetails` / `toggleOverlayMode()` / `overlayMode` / `OV()` | The `show_details` flag and the light/dark dashed-reference-line toggle — both read live by every chart's tooltip/plugin, no rebuild needed to react to a toggle |
| `mrow`, `tipLines`, `tipPad`, `justifyTip`, `TIP_STYLE` | Tooltip layout: label left-justified, value right-justified |
| `CHART_BASE`, `ageXAxis`, `AXIS_COLOR`, `AXIS_TICKS`, `axisTitle` | Shared Chart.js base config — chart width = 2/3 page width, height = width, X axis = P0's age from current age to the younger person's age-100 |
| `chartMaxAge()` | The locked X-axis upper bound described above |
| `chartYMax` / `rescaleChart(key)` | Per-chart locked Y-max state and its manual "Rescale" reset |
| `updateChartInPlace(chart, labels, datasets)` | Mutates an existing Chart.js instance's data arrays in place (instead of replacing the chart) so points animate smoothly from their prior value instead of resetting to zero |

### 6.2 `overlayPlugin.js`
`incomeOverlayPlugin` — a Chart.js plugin drawing dashed horizontal bracket lines with label
decluttering (`declutterLabels`); shared by the income chart (IRMAA tiers) and the tax chart (tax
brackets).

### 6.3 `ssChart.js` — Social Security start-age breakeven
Reads: `js/compute/whatIf.js`'s `computeSSScenario` for a fixed set of candidate ages (`VZ_SS_AGES =
[62,64,66,68,70]`). Y axis = cumulative combined household SS, locked. One line per candidate age plus
a dashed line for P0's actual selected age; each line stops once both people have passed. Tooltip:
cursor-intersection only (hit radius 8), monthly SS for all persons, at most one line's data if two
intersect. The per-person age lines (title) and the per-person / total monthly SS lines (body) share one
**left-aligned** value column (labels padded to a common width) rather than `mrow`'s right-justified values.

### 6.4 `incomeChart.js` — Annual household income
Reads rows' `pension`, `wageTotal`, `rothConvTotal`, `iraTotal`, `rental`, `qdiv`, `odivNQ`, `ltcg`,
`ssByPerson` fields. Stack order (bottom→top): **pension, wage, pre-tax IRA withdraw, IRA RMD, rental,
QDIV, ODIV−QDIV, LTCG, SS(P0), SS(other)**. IRMAA-tier dashed overlay via `overlayPlugin.js`, labeled
"IRMAA Tier #". Y axis locked at $150k default, auto-raises. Tooltip: total income + SCGL remaining always (SCGL is a fixed **today's-$** pool consumed by today's-$ LTCG, so the figure shown is in today's $);
filing status + AGI under `show_details`.

*Design note:* pre-tax IRA withdraw (the Roth-conversion amount) has its own band, separate from IRA
RMD — it's a real, separately-taxed withdrawal on top of the RMD, so folding it into the RMD band (or
omitting it) would make the visible stack not match what's actually being taxed.

### 6.5 `tssChart.js` — Taxable Social Security
Reads rows' `totalSS`, `sst`, `marginalRate`, `provisional`. Two lines: TSS height and SST height. Y
axis = TSS, locked. Tooltip: TSS, SST, SST% (`sst/totalSS`), top marginal rate always; provisional
income under `show_details`. Surfaces the torpedo effect via the marginal-rate figure.

### 6.6 `taxChart.js` — Total Income Tax
Reads rows' `ordTax`, `qdiv`, `ordTI`, `ltcg`, `niit`, `foreignTaxCredit`, `totalTax`, `agi`. Stacked
segments bottom→top: ordinary tax, then each QDIV bracket tier, then each LTCG bracket tier, then
NIIT — with **foreign tax credit netted out of the ordinary/QDIV/LTCG segments first, in that order**
(a waterfall reduction), so the stack's total height always equals `totalTax`. Overlaid dashed lines:
effective rate (red, `totalTax/agi`) and marginal rate (green). Y axis locked, % axis on the right.
Tooltip: Effective Tax Rate, Marginal Tax Rate, **Total Tax** always shown; under `show_details`, also
filing status, TI, standard deduction, every income component, provisional income, foreign tax credit,
and NIIT detail if nonzero.

### 6.7 `assetChart.js` — Asset value
Reads rows' `portfoliosByPerson` (excluding `idgt` ones), `iraBalByPerson`, `rothBalByPerson`. One
chart for brokerage (ex-IDGT) + IRA + Roth balances, each portfolio/account its own color; a second
chart (only if any IDGT portfolio exists) for IDGT balances alone. Tooltip: age, balances, and (if
Expenses is on) annual growth % net of drag, with expenses (tax drag, fee drag, IRMAA surcharge, withdrawal, LTCG) shown under `show_details`.
**Cost basis (§4.6):** under `show_details` only, tracked portfolios add *Expenses paid by other income*, *Dividends used for expenses*,
*Dividends reinvested*, *Sold to cover shortfall*, *Cost basis* and *Unrealized gain
($ and % of value)* lines to the tooltip on both charts, plus *Basis stepped up at death* in the year of a
step-up. Below each chart's note, an **"Unrealized gain at end of plan"** line (created by `setGainNote()`;
hidden when no portfolio on that chart is tracked) reports the final row's unrealized gain vs. value across
that chart's tracked portfolios — with a per-portfolio split when there are several — and a one-line
reminder of the tax treatment: non-IDGT gets a step-up at death, IDGT keeps carryover basis.

### 6.8 `footer.js`
`renderFooter()` — one static line summarizing the app's simplifying tax/benefit assumptions, shown
beneath the charts.

### 6.9 `formulasPage.js`
`openFormulasPage()` — triggered by the **Formulas** button (§7.2), opens a new browser tab (via
`window.open` + `document.write`, so it works the same under `file://` as on a hosted page) containing
a standalone reference document: the acronym glossary, every current reference-data table, and every
formula described in §4, written out in full for someone to check the app's math against by hand.

**Rule — this file must never hardcode a number Compute already owns.** Every reference-data table
on the page (`fpBracketTable`, `fpIrmaaTable`, `fpRmdTable`) is built at open-time directly from the
same `js/core/constants.js` globals Compute uses (`MFJ_ORD`, `IRMAA_MFJ`, `RMD_TABLE`, etc.) — so a
tax-year bracket update in `constants.js` (§3.1) is automatically reflected here with no second edit.
Only the *formula prose* is hand-maintained (formulas change far less often than bracket numbers) —
if you change a formula in §4, update its description on this page in the same change.

### 6.10 `notesPage.js`
`openNotesPage()` — the **Notes** button (immediately right of **Formulas**). Opens a new tab, `fetch`es
`misc/Note4User.md`, converts it to HTML **at the moment of opening** with the file's own small
Markdown converter `mdToHtml()` (headings, bold/italic, inline code, fenced code, links, lists,
blockquotes, rules, paragraphs — extend that function rather than adding a CDN library, so it keeps
working offline), wraps it in `mdPageHtml()`, and `document.write`s it. Editing `Note4User.md` therefore
needs no code change — the next click shows the new text.

### 6.11 `excelExport.js`
`exportToExcel()` — the **📊 Export to Excel** button (topbar, right of **Notes**) downloads the current
plan's full projection as a `.xlsx` workbook via the SheetJS (`XLSX`) library (loaded from a pinned CDN
`<script>` tag in `index.html`, same pattern as Chart.js). Two sheets: **Projection by year** — one row
per projected year, every field in the row schema (§4.6) a chart could plot (income sources, taxes,
SST/NIIT/IRMAA, AGI, effective/marginal rate, IRA/Roth/brokerage balances) — and **Brokerage portfolios**
— one row per person × portfolio × year, the cost-basis/expense-waterfall detail (§4.6) that doesn't fit
a one-row-per-year shape. Read-only: reads `lastProjection` (§7.1), never writes into `state`. If
`lastProjection` has no rows (no income source enabled) or the `XLSX` library failed to load, shows an
`alert()` instead of downloading an empty/broken file.

**Limitation:** `fetch` of a sibling file only works when the app is served over `http(s)` (GitHub
Pages, any local static server); Chrome blocks it under `file://`. On failure the new tab shows an
explanation and the two workarounds instead of failing silently. The file also lives at a fixed path
(`misc/Note4User.md`), so it must ship alongside `index.html`.

---

## 7. App (`js/app.js`, `index.html`)

### 7.1 `app.js`
| Export | Contract |
|---|---|
| `recompute()` | `computeProjection()` → `renderCharts()` — the one place Compute and Display meet |
| `recomputeDebounced` / `saveDebounced` | 80ms / 500ms debounced wrappers, for slider/typing inputs (checkboxes and add/remove buttons call the un-debounced versions directly) |
| `destroyCharts()` | Tears down every Chart.js instance — called before a full state restore so no stale tooltip/plugin/hover state survives into a newly loaded plan |
| `renderCharts()` | Calls every §6 chart builder, in this fixed order: SS controls/section, income, TSS, tax, asset, IDGT |
| `renderAll()` | Full re-render: household setup, passing sliders, inflation/SCGL fields, future-tax panel, income forms, footer, then `recompute()` — called on boot and on a full state restore |
| *(boot)* | On `DOMContentLoaded`: load autosave if present, else `defaultState()`, then `renderAll()` |

### 7.2 `index.html`
- Layout: independent-scrolling input column (left, one pane per person) and output column (right,
  the charts) — see §1 for the overall shape. The topbar holds, in order: **Save to file**, **Load file ▾**
  (dropdown, §5.6), **Reset to defaults**, **Formulas** (§6.9), **Notes** (§6.10), **Export to Excel**
  (§6.11), and the `show_details` checkbox.
- **Script load order** (dependency-driven — a file may only use a name defined by a file *earlier* in
  this list):
  `core/constants → core/helpers → compute/socialSecurityCalc → compute/rmd → compute/tax →
  core/state → compute/dates → compute/ageRange → compute/projection → compute/whatIf →
  input/controls → input/household → input/assumptions → input/wage → input/socialSecurity →
  input/pension → input/rental → input/brokerage → input/ira → input/roth → input/incomeForms →
  input/loadMenu →
  display/chartHelpers → display/overlayPlugin → display/ssChart → display/incomeChart →
  display/tssChart → display/taxChart → display/assetChart → display/footer →
  display/formulasPage → display/notesPage → app.js`
- **Adding a file:** insert its `<script>` tag after everything it reads from and before everything
  that reads from it. Function *calls* deferred to a later event (a click, `DOMContentLoaded`) don't
  need this — only code that runs immediately when the script loads (top-level `let`/`const`
  initializers, immediate `addEventListener` calls) does.
- Save/restore UI (buttons for save-to-file, load-from-file, reset) call into `js/core/state.js`
  (§3.3).

---

## 8. Cross-Cutting Conventions

These apply everywhere, not to one file — listed once here instead of repeated in every section above.

- **Today's dollars.** Every number Display ever shows is in today's dollars. A value entered as a
  future year's dollars is converted via `realGrowth()` (§4.6); nothing in Display re-converts.
- **Filing status switches on death.** The moment either spouse has died, `filing` becomes `'single'`
  for that row forward (`projection.js`, step 9) — every tax/IRMAA calculation for that year uses the
  single brackets/thresholds/deduction.
- **Survivor benefit ("bene").** Any income source with a `bene` flag continues to the surviving
  spouse using the *deceased's own age-range rule*, evaluated at the deceased's last living age — not
  cut off by an `endMode: 'passing'` that would otherwise equal the deceased's own passing age.
- **Enable vs. Hide (§2, §5.1).** Every income-source item has both an `enabled` flag (compute/display
  inclusion) and a `hidden` flag (visual collapse only) — fully independent. Compute (§4) and Display
  (§6) only ever check `enabled`; nothing there ever reads `hidden`. Input (§5) only ever uses `hidden`
  to decide whether a card body is open; it never uses `hidden` to skip rendering a field's value into
  its input, since a hidden card's data must remain editable.
  **Default coupling:** at the moments a plan is *freshly established* — first-ever boot with no
  autosave, **Reset to defaults**, or **Load file** — `hidden` is set to `!enabled` for every
  item (`applyDefaultHiddenFromEnabled()` in `core/state.js`, §3.3), overriding whatever `hidden` value
  a loaded file carried, so the screen starts showing only what's turned on. Manual Hide/Show toggles
  made *during* a session persist through ordinary autosave-restore on reload; only load/reset re-derives
  them. A brand-new brokerage portfolio (via **+ Add**) starts enabled and visible.
- **`show_details`.** A single global flag (`chartHelpers.js`) every chart's tooltip reads live —
  toggling it needs no chart rebuild, just re-hovering.
- **Locked scales + Rescale.** Every chart's Y axis (and the SS/income charts' X axis) is locked so
  moving a slider doesn't make the chart jump; a per-chart "Rescale" control clears that lock so the
  next recompute re-fits it.
- **Smooth animation.** Every chart update goes through `updateChartInPlace()` (§6.1) rather than
  replacing the Chart.js instance, so points animate from their previous value.

---

## 9. Adding a New Feature — Checklist

Use this order; skipping ahead usually means redoing work.

1. **State (§2):** add the new field(s) to the relevant shape in `core/state.js`'s `default*()`
   functions (this doc's §2 tables need the same addition).
2. **Input (§5):** add the field to the matching card file (or a new one, if it's a new income type —
   see §5.4's table for the pattern), wired via `onFieldInput`/`onNumberInput`/`setPath`.
3. **Compute (§4.6):** thread the new field through `computeProjection()` and add whatever it produces
   to the row schema table.
4. **Display (§6):** if the new number should be visible, add it to the relevant chart's dataset
   and/or tooltip, and note it in that chart's section here.
5. **This doc:** update every section you touched, plus §1's file tree if you added a file.
