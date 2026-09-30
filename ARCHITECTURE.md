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
css/
  styles.css    (all page styling; linked from index.html)
tests/
  check.js  snapshot.js  compare.js  baseline.json  README.md   (Node regression harness; not loaded by the app)
js/
  core/         constants.js  helpers.js  state.js
  compute/      socialSecurityCalc.js  rmd.js  tax.js  dates.js  ageRange.js
                projection.js  whatIf.js
  input/        controls.js  household.js  assumptions.js  loadMenu.js
                wage.js  socialSecurity.js  pension.js  rental.js
                brokerage.js  ira.js  roth.js  incomeForms.js
  display/      chartHelpers.js  overlayPlugin.js
                ssChart.js  incomeChart.js  tssChart.js  taxChart.js  expenseChart.js  assetChart.js  footer.js
                formulasPage.js  notesPage.js  excelExport.js  chat.js
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
  living: number,                 // household living expenses per year, today's $ (flat in real terms); funded income → dividends → asset sales (§4.6)
  scgl: number,                   // Suspended Capital-Gain Loss pool, today's $
  ltc: {                          // Long Term Care (§4.6, Assumptions panel §5.3). Off by default
    enabled: boolean,
    people: [{startAge, cost}, {startAge, cost}],  // per person: the person's OWN age at which their LTC starts (default 85) and the LTC cost $/yr, today's $ (default 100000). people[1] is unused when single
    living1: number | null,       // household living expenses, today's $, once the 1st LTC has started (null = never set: follows `living`)
    living2: number               // household living expenses, today's $, once the 2nd person's LTC has also started (default 0)
  },
  aumFee: { mode: 'pct'|'fixed', value: number },  // AUM fee: 'pct' = % of the AUM balance (sum of balances of portfolios with `aum` checked); 'fixed' = $/yr in today's $ (flat nominal, so it shrinks with inflation). Household-level; UI is below SCGL in the Assumptions panel (§5.3)
  futureTax: {
    enabled: boolean,
    niitStartYear: number,
    niitSingle: number,           // today's $
    niitMarried: number           // today's $
  },
  ui: {                           // display-only flags that are nevertheless saved, autosaved, restored and reset with the plan
    hiddenSections: { assumptions, ss, income, tss, tax, expenses, assets: boolean }  // the section **Hide** checkboxes (§5.1, §6.1). true = checked + collapsed. Default: all true (`DEFAULT_SECTION_HIDDEN`, `core/state.js`). A save with no `ui.hiddenSections` (written before this existed) loads with every section shown
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
  ira:  { enabled, hidden, balance, growth: Change, ar: AgeRange, bene: boolean, conv: number /* annual Roth conversion, today's $ */, convStart: number /* age the conversions begin; 0 (default) = now. Effective start = max(current age, convStart) */, stretch: boolean, aum: boolean },
  roth: { enabled, hidden, balance, growth: Change, bene: boolean, stretch: boolean, aum: boolean }   // aum (default false): this account's start-of-year balance counts toward the AUM balance (§4.6)
}

AgeRange = { startMode: 'now'|'custom'|'rmd', startVal: number,
             endMode: 'custom'|'passing',     endVal: number }

Change = { mode: 'fixed'|'inflation'|'offset'|'custom', value: number /* percent, for offset/custom */ }

BrokeragePortfolio = {
  id, name, balance, growth: Change, yield: number /* ODIV % */, qdivPct: number /* % of ODIV */,
  ar: AgeRange, bene: boolean, idgt: boolean,
  enabled: boolean,          // default true — whether this portfolio is used for compute/display
  hidden: boolean,           // default false — whether its card is collapsed on screen (§5.1)
  payExp: boolean,           // default FALSE — "Pay expenses": only portfolios with this checked (IDGT or not) contribute dividends and asset sales to household expenses (§4.6). Saves that predate the field load as true for non-IDGT portfolios (their old behavior)
  aum: boolean,              // default false — this portfolio's balance counts toward the AUM balance the household AUM fee (`state.aumFee`) is charged on. Older saves' per-portfolio `expense`/`fee`/`irmaa` are dropped by `hydrateState` (a portfolio that had a fee on becomes `aum: true`; the household `aumFee` takes the first % fee found, or the sum of fixed fees)
  basisPct: number | null,   // cost basis as a % of the start balance (0–100). null/blank = not entered. Older saves' dollar `basis` is converted to a % in `hydrateState`. Every portfolio is tracked (§4.6); a blank basis means no unrealized gain today. Realized LTCG has no input: it is always derived from basis (§4.6). Older saves' `ltcg`/`ltcgMode`, per-portfolio `taxDrag` and `living` withdrawal are dropped on load (the withdrawals are summed into `state.living` by `hydrateState`)
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
| `defaultState()`, `defaultPerson(idx)`, `defaultBrokeragePortfolio(balance,n)`, `defaultChange`, `defaultAgeRange`, `defaultAgeRangedItem` | Canonical default shapes (§2). **If you add a field to the schema, add its default here.** |
| `pfBasisEntered(b)`, `pfTracksBasis(b)` | Cost-basis predicates (§4.6): a cost basis was entered (`basisPct` is a number; `null`/blank is *not* the same as `0`); and whether basis is tracked — now true for every portfolio, since household expenses can force a sale from any of them |
| `SECTION_HIDE_KEYS`, `DEFAULT_SECTION_HIDDEN`, `defaultHiddenSections(hidden?)` | The keys of `state.ui.hiddenSections` (must match each `data-hide-key` in `index.html`) and their default (`true` = a fresh session and **Reset to defaults** start with every section checked + collapsed; flip the constant to change that) |
| `hydrateState(loaded)` | Deep-merges a loaded/imported object onto `defaultState()`: missing fields get defaults, unknown/stale fields are dropped, arrays keep every entry (not just as many as the default has). Migration: if a loaded file has no `living`, it is set to the sum of the old enabled portfolios' `living` withdrawals. Hide migration (`fillLegacyHide`): a card with **no** `hidden` flag gets `!enabled`, and a file with no `ui.hiddenSections` shows every section — a `hidden` value that *is* in the file is never overridden. LTC migration: an old single-person `ltc {startAge, cost, living}` becomes `people[0]` + `living1`; an old per-person `ltc.people[i].living` becomes `living1` (the earlier-starting person's) and `living2` (the later's). A file with no `ltc` or no `ira.convStart` just gets the defaults |
| `state` | The live, mutable object every other file reads/writes |
| `autosave()` / `loadAutosave()` | Silent per-browser `localStorage` save/restore, so a reload doesn't lose work |
| `resetState()` | Confirms, then resets `state` to defaults (with `applyDefaultHiddenFromEnabled`) and re-renders |
| `saveToFile()` | Downloads `state` as `retirement-plan.json` (File System Access API where available) |
| `loadFromFile()` | The **Choose file from local directory…** menu entry's action (§5.6). Uses `showOpenFilePicker` (with a stable `id: 'retirementPlannerLoad'`, so browsers that support it remember the last-used folder across sessions) when available; otherwise clicks the hidden `<input type="file" id="importFile">`. **Limitation (browser security, not fixable here):** no web API lets a page force its *first-ever* file dialog to open in a chosen folder such as `Samples/` — the Load file menu (§5.6) lists the shipped `Samples/` folder instead; after the user opens a file from it once, supporting browsers remember it. |
| `applyLoadedFileText(text)` | Shared by both load paths: parse JSON → **destroy every chart → reset to defaults → hydrate the loaded file on top** — always in that order, so no stale state or chart instance survives a restore. Every Hide flag (per card and `state.ui.hiddenSections`) comes back exactly as saved |
| `applyDefaultHiddenFromEnabled(s)` | Sets `hidden = !enabled` on every income item and brokerage portfolio (§8 "Default coupling"). Called by **Reset to defaults only** — never by load or autosave-restore, which keep the saved `hidden` values |
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
directly) and returns `{ rows, stretch, people, idxP0, married }` (`stretch`: the post-passing IRA years, see §6.7). **This is the contract every Display file
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
5. Brokerage portfolios, per portfolio: ODIV, QDIV and **foreign tax credit** (`balance × foreignPct × ftcPct`) —
   the credit is always active, independent of the `expense` toggle and `idgt` flag. A portfolio outside its age
   range (or an owner who has passed with no `bene`) produces no dividends and is not sold; it just compounds.
   **Realized LTCG is not an input and is not computed per portfolio here** — it falls out of the household expense
   waterfall (step 5a).
5a. **Household expense funding waterfall + tax fixed point** (see *Expense funding* and *Tax ↔ LTCG iteration* below): expenses —
   living, the IRMAA surcharge, the AUM fee and **this year's income tax** — are paid by household income, then portfolio dividends (leftovers
   reinvested), then portfolio asset sales, which realize LTCG from tracked cost basis. Because that LTCG changes the tax,
   steps 5a–12 are iterated to convergence. The ordinary side of the return (steps 8–9, ordinary tax) does not depend on LTCG and is computed once, before the loop.
6. Pre-tax IRA: RMD (or voluntary early withdrawal) via `rmdDivisor`, plus a separate **Roth
   conversion withdrawal** (`rothConvByPerson`/`rothConvTotal`) — a real withdrawal on top of the RMD,
   taxed exactly like the RMD, continuing until the balance hits $0. Begins at the later of the owner's current age
   and `ira.convStart` ("Conversion start age"); before that age the conversion is $0 (RMDs are unaffected). Requires the matching Roth IRA
   to be enabled. On the owner's death, conversions stop; RMDs continue to a surviving spouse if the
   IRA is marked to continue.
7. Roth IRA: grows tax-free, receiving that year's conversion amount (if any) from step 6.
8. Ordinary income = wages + pension + rental + IRA RMD + **Roth conversion (pre-tax IRA withdraw)**
   + (ODIV − QDIV).
9. Taxable Social Security via `computeTaxableSS`; filing status for the year is `'single'` the
   moment either spouse has died. **Deduction** = `max(standard deduction, itemized)` where itemized =
   `max(0, LTC expense − 7.5% × AGI)` (see *Long Term Care* below); ordinary taxable income = `max(0, ordinary income − deduction)`.
   AGI includes realized LTCG, so the deduction is computed inside `taxOn()` and is solved with the tax.
10. AGI = ordinary income + taxable SS + QDIV + LTCG (net of SCGL, see next point).
11. LTCG net of SCGL: available `scgl` shields realized LTCG dollar-for-dollar (pool depletes across
    years); only the net amount is taxed/displayed.
12. Total Tax = ordinary+qualified tax (via `calcOrdTax`/`calcQualTax`) **minus foreign tax credit**
    (floored at 0) **plus NIIT** (`computeNIIT`, calculated on the *pre-credit* ordinary+qualified tax
    basis — the credit doesn't offset NIIT).
13. SST/marginal rate via `computeSSTAndMarginal`, using the pre-credit ordinary+qualified tax as its
    basis (foreign tax credit is unrelated to SS taxation).
14. Roll every brokerage balance forward: `+growth −(dividends used for expenses + shares sold)`, from the step-5a
   waterfall. Foreign tax credit doesn't touch the balance. Every portfolio also rolls its cost basis forward (below).

**Long Term Care (LTC)** (`state.ltc`, off by default; Assumptions panel §5.3). Each row, for each person `i` (only if `ltc.enabled`):
- **Started** if their LTC start age is *before* their passing age (`startAge < passing`, so an LTC that would begin after they pass never happens) **and** their age this year ≥ `startAge`. Once started it stays started for the rest of the projection, even after that person passes (`ltcStarted` counts started people, 0–2).
- **Cost:** a started person who is still **alive** adds `max(0, cost)` (today's $, flat in real terms) to `expLtc`; the row keeps each person's amount in `ltcCostByPerson`. The cost stops the year they pass.
- **Living expenses switch:** `expLiving` = `state.living` until anyone's LTC starts; `ltc.living1` (or `state.living` if `living1` is `null`) once exactly one person has started; `ltc.living2` once both have. A single-person household only ever uses `living1`.
- **LTC is a household expense**, added to the expense pool (see *Expense funding*) and paid income → dividends → asset sales like everything else.
- **Itemized deduction:** the LTC cost is also the only itemized deduction modelled: `itemized = max(0, expLtc − 7.5% × AGI)` (`agiFloor` = 7.5% × AGI). `usedItemized` is true when `itemized` exceeds the standard deduction; the deduction actually applied is `max(standard, itemized)`. Because AGI depends on LTCG, this sits inside the tax↔LTCG iteration.

**IRMAA as an expense** (always a household expense — there is no per-portfolio checkbox):
- **Household surcharge** = `irmaaSurcharge` = surcharge of the IRMAA tier (`IRMAA_MFJ`/`IRMAA_SGL`, this year's filing status) reached by the **AGI from two years earlier** (`rows[k−2].agi`) × the number of living people age ≥ 65. Years 0 and 1 are `$0`, because the model has no AGI from before the projection starts. The 2-year lag is IRMAA's real look-back (the premium for year Y is set from the Y−2 return); the tier uses *this* year's filing status. Tier tables are indexed, so no deflation. The row reports it as `irmaaSurcharge` and it is included in `expIrmaa`.
- **Payment:** part of the household expense pool below, so it is paid income → dividends → sales like everything else, by portfolios with Pay expenses checked.

**AUM fee** (household assumption `state.aumFee`; per-portfolio `aum` box):
- **AUM balance** (`aumBalance`) = sum of start-of-year balances of every brokerage portfolio that has `aum` checked and is enabled, alive, inside its age range and funded (IDGTs included if checked), **plus** every pre-tax IRA and Roth IRA with `aum` checked (`aumBalanceIra`, start-of-year, counted only while the household holds it: owner alive, or inherited by a living spouse — not while held by heirs under IRA stretch).
- **Fee** (`aumFee` on the row) = `aumBalance × value/100` (mode `pct`, "% AUM balance") or `value ÷ (1+inflation)^k` (mode `fixed`, charged only when `aumBalance > 0`).
- **Allocation:** split across the checked accounts pro rata to balance. Each account's share is informational (`feeDrag` on a portfolio row): the **whole fee is one household expense** (`expAum = aumFee`) paid by the pool, i.e. only by portfolios with **Pay expenses** checked — not by the account it is charged on unless that account also pays expenses. No portfolio, IDGT included, pays a fee share on its own account.

**Expense funding** (household-level; replaces the old per-portfolio withdrawal / tax-drag / own-money waterfall):
- **Expenses** = `expLiving` (`state.living`, flat in today's $, or the post-LTC living amount once LTC has started) + **`expLtc`** (Long Term Care cost, above) + **the year's income tax (`totalTax`, "tax drag")** + the **IRMAA surcharge** + the **AUM fee** (charged on the AUM-checked portfolios and IRAs, above). Income tax is an expense again, at household level (there is no per-portfolio *tax drag %* input);
  it is charged to the household pool only. Because it depends on this year's LTCG, it is solved by iteration (below), not lagged.
- **Funding order** (portfolio sources are only the in-range portfolios with **Pay expenses** checked — default off, IDGT or not; an unchecked portfolio reinvests all its dividends and is never sold for expenses, and if none is checked the shortfall shows as `expUnfunded`): (1) **household cash income** = wages + Social Security + pension + rental + IRA RMDs (the
  Roth-conversion amount is excluded — it moves to the Roth, it isn't spendable; it is gross, since the tax it triggers is itself one of the expenses), then
  (2) **portfolio dividends** (ODIV of the non-IDGT in-range portfolios), shared pro rata to each portfolio's ODIV — any dividend not
  needed is **reinvested** (adds basis), then (3) **asset sales**, shared pro rata to balance (a portfolio that runs out
  hands the remainder to the others). Anything still unpaid is reported as `expUnfunded`.
- **IDGT:** follows the same rule as any portfolio — it pays household expenses only if its own **Pay expenses** box is checked (off by default); otherwise it reinvests all its dividends and is never sold for expenses. It keeps carryover basis (no step-up) and its own chart.
- **Realized LTCG** = amount sold × the portfolio's gain fraction `f`, for every portfolio (IDGT on its own sales), feeding
  SCGL → qualified income → AGI → NIIT as before.

**Tax ↔ LTCG iteration** (per year; constants `TAX_TOL = 0.005`, `TAX_MAX_ITERS = 30` in `projection.js`). Tax → expenses → asset sales → LTCG → tax
is circular. `runWaterfall(taxExp)` runs the funding waterfall for a given tax expense and returns the funding split and gross LTCG;
`taxOn(ltcgGross)` returns the year's tax (SCGL applied without consuming the pool, AGI, the LTC itemized-vs-standard deduction, ordinary and qualified tax, NIIT, FTC, `totalTax`). The solver:
`T₀` = prior year's `totalTax` (0 in year 0); `Tₙ₊₁ = taxOn(runWaterfall(Tₙ).ltcgGross).totalTax`; stop when `|Tₙ₊₁ − Tₙ| < TAX_TOL`.
Each extra tax dollar produces well under a dollar of new tax (only the gain share of a sale is LTCG, taxed ≤ ~24% with NIIT), so the map is a
contraction and converges in ~6–8 rounds. After it settles, the SCGL pool is drawn down **once**, and SST/marginal rate are computed from the converged
LTCG. `expTax` is the tax that was funded; `totalTax` is the tax it produces (equal within `TAX_TOL`). `taxIters` / `taxConverged` report the solve.
The IRMAA surcharge uses the AGI from two years earlier — that is IRMAA's real look-back, and it also keeps IRMAA out of the circularity.

**Cost basis & unrealized gain** (every portfolio; average-cost method, all in today's $):
- **Start:** `basis` = `basisPct / 100 × balance`, clamped to `[0, balance]`; a blank basis starts at `basis = balance`
  (no unrealized gain today). **Gain fraction** `f = max(0, (bal − basis) / bal)`.
- **Basis roll-forward, each year:** `basis ← (basis − sold×(1 − f) + reinvested) / (1 + inflation)`, clamped to
  `[0, end-of-year balance]`. Sales remove basis in proportion to cost share (expenses paid by income or dividends remove
  none); reinvested dividends (already-taxed income) add basis; and because basis is a fixed nominal amount while the
  model is in today's $, it **erodes by inflation** each year (so gains — and LTCG on later sales — grow in real terms).
  `balance ← bal×(1+g) − dividends used − sold`.
- **Step-up at death:** in the first year the owner has passed *and* the portfolio continues to a surviving spouse (`bene`),
  a **non-IDGT** portfolio's basis resets to its balance (unrealized gain → 0; that year's LTCG is $0). **IDGT** portfolios keep
  carryover basis and are never stepped up. A portfolio that does not continue leaves the model at the owner's death.
- **Embedded gain:** each row reports per-portfolio `basis`/`unrealizedGain` and household totals `embeddedGain`
  (non-IDGT) and `embeddedGainIdgt`, all at start of year after any step-up.

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
| `portfoliosByPerson` | Per-portfolio detail: `{id, name, balance, idgt, aum, feeDrag, ltcg, growthPct, netGrowthPct, tracked, basis, unrealizedGain, steppedUp, divUsed, divReinvested, sold}` — the last seven are the cost-basis / expense-waterfall fields (§4.6): `basis`/`unrealizedGain` are `null` when `tracked` is false; `steppedUp` is true only in the year the death step-up applied; `divUsed`/`divReinvested`/`sold` are this portfolio's share of the household waterfall (dividends used, dividends reinvested, shares sold), so `divUsed + sold` is what this portfolio paid toward expenses (household income pays the rest) |
| `embeddedGain`, `embeddedGainIdgt` | Household unrealized gain across tracked portfolios, non-IDGT / IDGT (start of year, after any step-up) |
| `nonSSOrdinary`, `taxableSS`, `provisional` | Ordinary income ex-SS; taxable SS; provisional income |
| `ordIncome`, `std`, `stdDeduction`, `ordTI`, `ordTax` | Ordinary income (incl. taxable SS) → deduction → ordinary taxable income → ordinary tax. **`std` is the deduction actually applied** (the larger of standard and itemized); `stdDeduction` is always the standard-deduction amount for the filing status |
| `ltcStarted`, `ltcCostByPerson`, `agiFloor`, `itemized`, `usedItemized` | LTC (§4.6): how many people's LTC has started (0–2); each person's LTC cost this year (0 if not started or passed); 7.5% × AGI; the itemized deduction `max(0, expLtc − agiFloor)`; whether it beat the standard deduction |
| `qualIncome`, `qualTax` | QDIV+LTCG and its tax |
| `sst`, `marginalRate` | Social Security tax and true marginal rate (torpedo effect) |
| `niiIncome`, `niit` | Net investment income and NIIT |
| `aumBalanceIra` | The part of `aumBalance` that comes from AUM-checked IRAs / Roth IRAs |
| `expLiving`, `expLtc`, `expIrmaa`, `expAum`, `expTax`, `expTotal` | Household living expenses (the post-LTC amount once LTC has started); Long Term Care cost; IRMAA surcharge; the AUM fee (all of it — a household expense); income tax paid as an expense (tax drag); their sum |
| `aumBalance`, `aumFee` | AUM balance (start of year) and the total AUM fee charged this year (equals `expAum`) |
| `taxIters`, `taxConverged` | Rounds the tax↔LTCG iteration took (≥1) and whether it met `TAX_TOL` |
| `cashIncome`, `expFromIncome`, `expFromDiv`, `expFromSales`, `expUnfunded` | The expense-funding waterfall (§4.6): household cash income available (wage+SS+pension+rental+RMD), and the expense amount paid by income, by dividends, by asset sales, and left unfunded (`expTotal = expFromIncome + expFromDiv + expFromSales + expUnfunded`) |
| `irmaaSurcharge` | Household IRMAA surcharge for the year (tier of the AGI from two years earlier × enrolled people 65+; $0 in years 0 and 1) ; always charged as a household expense (`expIrmaa`) |
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
| `onSectionHide(cb)` | Handler for the **Hide** checkbox on every chart section header (§6) and the Assumptions panel title (§5.3). Writes `state.ui.hiddenSections[cb.dataset.hideKey]` (so it is saved/restored/reset with the plan, default all checked), then `applySectionHide()` toggles `.sec-hidden` on every sibling after the header up to the next `.sec-head`, so only the header and its checkbox remain. Compute and charts keep updating while hidden; on un-hide it calls `resizeAllCharts()` (`chartHelpers.js`) so canvases re-fit. |
| `syncSectionHide()` / `expandAllSections()` | `syncSectionHide()` sets every section Hide checkbox **and** its collapsed/expanded section from `state.ui.hiddenSections` — the only thing that decides what the boxes show, so "checked" and "hidden" can't disagree (a browser's form-state restore on reload used to leave a box checked over a visible section; the static boxes and every generated input also carry `autocomplete="off"`). `expandAllSections()` un-collapses DOM-only. `renderAll()` runs `expandAllSections()` → `recompute()` → `syncSectionHide()`, so charts are built in visible containers and then collapsed |
| `pairHtml(id, path, min, max, step, value, bounds?, moneyCls?)` / `onPair(id, path, val, src)` / `setPair(id, v)` | **Paired slider + number input** that always track each other (ids `<id>_r` range, `<id>_n` number), writing `path` via `setPath`. Dragging the slider sets `window.liveDrag` for that recompute so charts redraw without animation (§6.1); typing uses the debounced recompute. Used for the IRA **Annual Roth conversion** and **Conversion start age** (§5.4) and the LTC start ages (§5.3) |
| `personAgeBounds(i)` / `pairBounds(el)` / `refreshPairBounds()` | Dynamic slider limits. A range tagged `bounds={kind:'person',i}` runs from the person's current age (rounded up) to their passing age; `{kind:'ira',i}` runs 0 → 4 × that person's IRA balance. `refreshPairBounds()` re-applies them to every tagged slider; it is called when birth date, passing age or (for the IRA range) balance change |
| `agedItemCard(pid, key, title, item, checkboxPath)` | Shared card builder for the two income types that are just "amount + age range + change + survivor benefit": Pension and Rental. Calls `cardHeader` internally. |

**Rule:** any new income-type field that needs an age range, an annual-change mode, or an
enable/hide header uses these — don't hand-roll a new version of any of them. A card's body is open
(visible) whenever `!item.hidden`, full stop — never conditioned on `enabled`.

### 5.2 `household.js`
Renders: filing status radios, per-person name/birth year/birth month, read-only current-age display,
passing-age sliders (30–100, default 85/90), inflation slider (default 3%). `relabel()` pushes a name
change into every place a person's name appears (including the LTC panel headers) without a full re-render (so typing doesn't lose
focus). Birth year / month are applied only when they are a real value (year 1920–this year, month 1–12) — partial keystrokes such as "196" are ignored, and `onBirthCommit` restores the last valid value if the field is left invalid. `refreshAgeDependentUI()` updates the read-only age, raises any passing-age slider below the person's current age, and calls `refreshPairBounds()` (§5.1).

### 5.3 `assumptions.js` (+ the Assumptions panel in `index.html`)
The Assumptions panel in `index.html` holds two household fields, in this order below the passing-age sliders: **Living expenses** (`state.living`, `#livingInput`, $/yr in today's $, `onNumberInput('living', …)`) directly **above** the **SCGL** input (`state.scgl`), followed **below SCGL** by the **AUM fee** (`state.aumFee`): a mode select (`#aumFeeMode`: **% AUM balance** / **Fixed $ / yr**, `onAumFeeMode` resets the value because the units change) and a value input (`#aumFeeValue`, `onNumberInput('aumFee.value', …)`); `renderAumFee()` (in `assumptions.js`) writes both from `state`. AUM balance = sum of the balances of portfolios with their **AUM** box checked (§4.6). `renderAll()` writes both from `state`. The panel title reads "Assumptions — drag to adjust". Typing in Living expenses goes through `onLivingInput`, which also updates the **1st LTC living expenses** box while `ltc.living1` is still `null` (i.e. the user has not set it).

**Long Term Care panel** (`#ltcPanel`, between the AUM fee note and the future-tax panel; `renderLtcPanel()` / `onLtcToggle()`): an **LTC** checkbox (`state.ltc.enabled`). When on it shows, per person (one block when single; the person's name is the block header and is kept live by `relabel()`): **LTC start age** (paired slider/number, `pairHtml`, range = current age → passing age, written to `ltc.people.i.startAge`) and **LTC cost** ($/yr, today's $, `ltc.people.i.cost`). Below those: **1st LTC living expenses** (`ltc.living1`; labelled just "LTC living expenses" when single) and, when married, **2nd LTC living expenses** (`ltc.living2`). Compute rules are in §4.6.

Renders the speculative future-tax-threshold panel: a checkbox that, when on, reveals `niitStartYear`
+ `niitSingle`/`niitMarried` (today's $) fields feeding `state.futureTax` (§2), consumed by
`computeNIIT` (§4.3).

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
| `brokerage.js` | Brokerage portfolio(s) | Add/remove multiple; **each portfolio has its own Enable + Hide header** (name, **age range (start/end) directly below the name**, **start balance**, growth (default inflation+4%), ODIV yield % (default 1.5%), QDIV % of ODIV (default 70%), foreign asset % + foreign tax credit % (default 0.25%) — always active, independent of the AUM box and IDGT flag —, IDGT flag, **AUM checkbox** (counts this balance toward the AUM fee base), **Pay expenses checkbox** (`payExp`, default **off**; only checked portfolios' dividends and sales fund household expenses), **optional cost basis (% of start balance, 0–100; blank = no unrealized gain today)** right under the balance, there is **no** fee, IRMAA, tax drag or withdrawal field on the card (fee and IRMAA are household-level, §5.3) (living expenses are household-level, §5.3), and LTCG has **no input**: the panel just notes that expenses are paid household income → dividends → asset sales, and that sales realize gain from the cost basis —, age range, survivor benefit). A new portfolio's `name` starts blank; both the card title and the name field's placeholder fall back to position-based "Portfolio N", and `onPortfolioName` patches the title live as you type (no re-render, so focus is kept). The outer "Brokerage portfolio income" card itself has no enable/hide of its own — it's just a container with an Add button, collapsed via the older `toggleItem` (no persisted state, since there's no single flag to persist for a container of several independently-enabled portfolios). |
| `ira.js` | Pre-tax IRA / 401(k) | Balance, **AUM checkbox** (`ira.aum`), age range (default start = RMD age), growth (default inflation+3%), survivor benefit, **IRA stretch** checkbox, **Annual Roth conversion** (paired slider + number, $/yr today's $, slider range 0 → 4 × balance; `onIraBalance` re-ranges it and clamps the value when the balance is lowered) and **Conversion start age** (paired slider + number, current age → passing age, `ira.convStart`; conversions begin at the later of this and the current age, §4.6) |
| `roth.js` | Roth IRA | Balance, **AUM checkbox** (`roth.aum`), growth (default inflation+3%), survivor benefit — no withdrawal fields; only grows, fed by the linked IRA's conversion |

### 5.5 `incomeForms.js`
**Purpose:** orchestrates the person-column(s), calling each §5.4 builder in the same fixed order for
every person-column, so the two-column grid (married) keeps every income type's row aligned via CSS
subgrid. Also owns every handler shared by more than one card: SS-started toggle, SS claim-age slider,
cost-basis % input (`onBasisInput`: blank → `null`, not `0`; clamped to 0–100), survivor-benefit toggle, portfolio name/add/remove.

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

**Section Hide:** every chart section header (Social Security start age, Annual Household Income, Social Security Tax, Total Income Tax, Household Expenses, Asset Value incl. the IDGT card) carries a **Hide** checkbox (`onSectionHide`, §5.1; kept in `state.ui.hiddenSections`, so saved/restored/reset with the plan; default checked). Also on the Assumptions panel (§5.3).
| Export | Contract |
|---|---|
| `showDetails` / `toggleOverlayMode()` / `overlayMode` / `OV()` | The `show_details` flag and the light/dark dashed-reference-line toggle — both read live by every chart's tooltip/plugin, no rebuild needed to react to a toggle |
| `mrow`, `tipLines`, `tipPad`, `justifyTip`, `TIP_STYLE` | Tooltip layout: label left-justified, value right-justified |
| `CHART_BASE`, `ageXAxis`, `AXIS_COLOR`, `AXIS_TICKS`, `axisTitle` | Shared Chart.js base config — chart width = 2/3 page width, height = width, X axis = P0's age from current age to the younger person's age-100 |
| `chartMaxAge()` | The locked X-axis upper bound described above |
| `charts` / `allCharts()` | **Chart registry**: one live Chart.js instance per key (`ss`, `income`, `tss`, `tax`, `expense`, `asset`, `idgt`), `null` until first drawn. Chart files never declare their own chart variable; destroy/resize walk the registry, so adding a chart means adding a key here, not editing hand-written lists |
| `upsertLineChart(key, {canvasId, labels, datasets, yMax, tooltip, createOptions, refresh})` | The one create-or-update step every chart's builder ends with: the first call builds the chart from `createOptions()`; later calls update it via `updateChartInPlace`, set `scales.y.max`, apply the optional `refresh(options)` (per-render option changes, e.g. the income overlay), wrap `tooltip` in `justifyTip`, and `update()` — with animation suppressed (`update('none')`) while `window.liveDrag` is set, i.e. while a paired slider (§5.1) is being dragged, so charts follow the thumb without lag |
| `chartYMax` / `lockedYMax(key, compute)` / `resetChartYMax()` / `rescaleChart(key)` | Per-chart locked Y-max. `lockedYMax` computes it once and then holds it; `rescaleChart` (the Rescale button) clears one key and recomputes; `resetChartYMax()` clears **all** keys and is called on Reset to defaults and on file load |
| `popupPersonAgeLines(proj, r)` / `alignToAges(ages, values, labels)` / `ageLabelRange(fromAge, toAge)` | Shared tooltip title (each person's age in the row, or "-" once passed); aligning a series to the locked age labels (missing ages → `null`); building the integer age-label array for the X axis |
| `legendItem(text, color, style?)` | One legend entry (`<span class="li">` + swatch). `style` overrides the default solid-color swatch (dashed IRMAA key, dashed SS start-age line) |
| `resizeAllCharts()` / `destroyAllCharts()` | `resize()` / `destroy()` every live chart in the registry; `destroyAllCharts()` also nulls each entry. Resize is used after a hidden section is shown again |
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
filing status + AGI under `show_details`, plus (when there are expenses) the household expense funding split: total expenses (incl. income tax), paid by household income, by dividends, by asset sales, and any unfunded shortfall.

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
filing status, TI, the deduction applied (labelled **Itemized deduction (LTC)** in a year `usedItemized` is true, else **Standard deduction**; value `r.std`), every income component, provisional income, foreign tax credit,
and NIIT detail if nonzero.

### 6.6a `expenseChart.js` — Household Expenses
Sits between the Total Income Tax and Asset Value sections in `index.html` (`#expenseChart`, `#expenseLegend`,
Rescale key `'expense'`). Reads rows' `expLiving`, `expLtc`, `expTax`, `expIrmaa`, `expAum`, `expTotal`,
plus the funding split `expFromIncome`, `expFromDiv`, `expFromSales`, `expUnfunded`. Styled like the tax chart: stacked
filled bands, segments bottom→top: **living expenses, Long Term Care, income tax (tax drag), IRMAA surcharge, AUM fee**, so the stack's
height always equals `expTotal`. Single $ axis, Y locked (`chartYMax.expense`). Tooltip: one line per non-zero component
with its $ and % of the total; footer shows total expenses and how they were funded (household income → dividends →
asset sales, plus any unfunded shortfall); under `show_details`, also filing status, household cash income, AGI, AUM
balance, the IRMAA surcharge and the tax↔LTCG iteration count.

### 6.7 `assetChart.js` — Asset value
Reads rows' `portfoliosByPerson` (excluding `idgt` ones), `iraBalByPerson`, `rothBalByPerson`. One
chart for brokerage (ex-IDGT) + IRA + Roth balances, each portfolio/account its own color; a second
chart (only if any IDGT portfolio exists) for IDGT balances alone. Tooltip: age, balances, and (if the portfolio paid anything toward expenses that year) annual growth % net of expenses paid, with the AUM fee charged on the portfolio's balance and LTCG realized shown under `show_details`.
**IRA stretch (per account):** each pre-tax IRA card and each Roth IRA card has an **IRA stretch** checkbox (`ira.stretch` /
`roth.stretch`, default off; label reads "…until 10 years after the 2nd passing", or "this person's passing" when single). Unchecked
= the account ends as before. Checked = the account is *not* dropped when its owner passes unless a surviving spouse inherits it
(`bene`, unchanged): it is held by heirs — no RMDs/withdrawals/conversions, still compounding at its own real growth rate — through
the last projection row, and then `computeProjection()`'s extra `stretch` array carries it `STRETCH_YEARS` (10) more years
(`{k, stretchYear, age0, ages, alive:[false…], iraBalByPerson, rothBalByPerson}`; `[]` when no checked account has a balance). Heir
taxes are not modeled. The pseudo-rows are deliberately *not* in `rows`, so the income/tax/SS charts and the Excel summary never see
them. The **main** asset chart (not the IDGT chart) appends them: only stretched IRA bands continue, brokerage bands (null there)
stop, the x-axis is extended past the shared axis end if needed (the one age-axis chart not locked to `chartMaxAge`), and the
tooltip adds "IRAs held by heirs — year n of 10". In stretch years an account that isn't stretched is `null` (not 0), so it draws no line or band; and there is **no gap** at the last passing: a stretched band's line and fill run continuously from the last real year into the first stretch year (the connecting segment is drawn, sloping down over that one year from "everything" to "stretched IRAs only"), while accounts that do not continue end at the last real year. The Excel IRA / Roth sheets append the same years, flagged "After last passing
(heirs)", only for accounts with the box checked.

**Cost basis (§4.6):** under `show_details` only, portfolios add *Dividends used for expenses*,
*Dividends reinvested*, *Sold to cover shortfall*, *Cost basis* and *Unrealized gain
($ and % of value)* lines to the tooltip on both charts, plus *Basis stepped up at death* in the year of a
step-up. Under each chart, an **"Unrealized gain at end of plan"** line (`#assetChartGain` / `#idgtChartGain` in
`index.html`, filled by `setGainNote()`; empty, and hidden by `.cn:empty`, when no portfolio on that chart is tracked) reports the final row's unrealized gain vs. value across
that chart's tracked portfolios — with a per-portfolio split when there are several — and a one-line
reminder of the tax treatment: non-IDGT gets a step-up at death, IDGT keeps carryover basis.

### 6.8 `footer.js`
`renderFooter()` — one static line summarizing the app's simplifying tax/benefit assumptions, shown
beneath the charts. It states the 2026 tax basis (TCJA permanent under OBBBA), that the only itemized deduction modelled is Long Term Care cost above 7.5% of AGI, the NIIT threshold, the expense funding order and tax iteration, and the RMD table. **Keep it in step with Compute:** its IRMAA clause says the surcharge uses the AGI from two years earlier (2-year lookback), matching §4.6.

### 6.9 `formulasPage.js`
`openFormulasPage()` — triggered by the **Formulas** button (§7.2), opens a new browser tab (via
`window.open` + `document.write`, so it works the same under `file://` as on a hosted page) containing
a standalone reference document: the acronym glossary, every current reference-data table, and every
formula described in §4 (including the Long Term Care expense, the living-expense switch and the LTC itemized-deduction vs standard-deduction rule), written out in full for someone to check the app's math against by hand.
Equations are set as centered **display equations**, one per line, like a math textbook (helpers `fpEq`, `fpFr`
for stacked fractions, `fpPw` for piecewise definitions, `fpWhere` for a small "where …" caption); prose sentences
introduce each equation but never carry the math inline.

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
`<script>` tag in `index.html`, same pattern as Chart.js). **Projection by year** is always the first sheet —
one row per projected year, every field in the row schema (§4.6) a chart could plot (income sources, taxes,
SST/NIIT/IRMAA, AGI, effective/marginal rate, IRA/Roth/brokerage balances, plus the LTC cost per person, LTC-started count and LTC expense, and the deduction columns: standard deduction, 7.5% AGI floor, itemized deduction, deduction used). After it, **every enabled account
gets its own sheet** (one row per year; `xlsxAccountSheets`), in person order: each enabled brokerage portfolio
(`"<Person> - <Portfolio>"`, plus ` (IDGT)` when flagged — balance, growth %, drags, withdrawal, LTCG, cost
basis / unrealized gain, expense-waterfall amounts), then that person's **Pre-tax IRA** (RMD, Roth-conversion
withdraw, EOY balance) and **Roth IRA** (converted in, EOY balance). Disabled accounts are skipped, so the sheet
count follows the plan. Sheet names are sanitized and de-duplicated by `xlsxSheetName` (≤31 chars, no `[]:*?/\`).
Read-only: reads `lastProjection` (§7.1), never writes into `state`. If
`lastProjection` has no rows (no income source enabled) or the `XLSX` library failed to load, shows an
`alert()` instead of downloading an empty/broken file.

**Limitation:** `fetch` of a sibling file only works when the app is served over `http(s)` (GitHub
Pages, any local static server); Chrome blocks it under `file://`. On failure the new tab shows an
explanation and the two workarounds instead of failing silently. The file also lives at a fixed path
(`misc/Note4User.md`), so it must ship alongside `index.html`.

### 6.12 `chat.js` — "Ask about this plan" chat box
A floating **💬 Ask about this plan** button (bottom-right, markup `#chatDock` in `index.html`, hidden in print) opens a
chat panel. Each message goes straight from the browser to the chosen provider's API (`fetch`, streamed — there is no
backend) together with a system prompt that holds a **text snapshot of the current plan**, so the model can discuss the
user's own numbers. Read-only: it reads `state` and `lastProjection` (§7.1), never writes `state` or any chart, and
nothing from it is added to the saved plan file.

**Providers** (`CHAT_PROVIDERS`): **Anthropic Claude** (`x-api-key` + `anthropic-dangerous-direct-browser-access`, paid key)
and **Google Gemini** (`streamGenerateContent?alt=sse` on `generativelanguage.googleapis.com`, `x-goog-api-key` header —
never in the URL; the free AI Studio tier covers Flash / Flash-Lite models only, roughly 10–15 requests/min). The Model box
is free text with per-provider suggestions (`models`), because vendors rename and retire model ids often (e.g. Gemini
`-preview` ids) — when a provider returns "model not found", type the current id. Adding a provider = an entry in
`CHAT_PROVIDERS` + a branch in `chatBuildRequest` and `chatParseEvent`.

| Export | Contract |
|---|---|
| `buildChatSnapshot(includeNames)` | Household assumptions (JSON: filing status, inflation, living expenses, SCGL, AUM fee, passing ages, and the future-tax threshold when on — `longTermCare` — per-person start age and cost plus the post-1st / post-2nd-LTC living expenses — only when LTC is enabled, only as many people as the household has), each person's **enabled** income sources (JSON, `hidden`/`id` stripped; disabled ones only named), then one **CSV row per projection year** (year, ages, filing, income by type, AGI, taxable SS, marginal %, total tax, IRMAA, expense components incl. `exp_ltc`, unfunded expenses, brokerage / IDGT / IRA / Roth balances — 28 columns, whole dollars, today's $) plus the IRA-stretch tail. Built fresh on **every send**, so answers reflect the inputs as they are now |
| `buildChatSystemPrompt(includeNames)` | Instructions (ground answers in the snapshot, explain rather than recompute, say which input to change for "what if", concise, not financial advice) + a few model facts + the snapshot. Anthropic: one system block with `cache_control: ephemeral`; Gemini: `systemInstruction` |
| `chatBuildRequest(prov,model,key,system,history)` / `chatParseEvent(prov,j)` / `chatReadStream(res,prov,onText)` | Provider-specific request and SSE-event shapes; the reader handles CRLF separators and events split across chunks, ignores Gemini `thought` parts, and normalises the stop reason to `end` / `length` / `blocked:<why>` |
| `sendChat()` / `stopChat()` | Streams the reply into the last bubble; **Stop** keeps the partial text; a failed turn (HTTP error, network, blocked/empty reply) is dropped and the question restored to the input. Errors get plain-language messages (`chatFriendlyError`: key rejected, model not found, free-tier quota). History is in memory only (last 20 messages, always starting on a user turn; Gemini maps `assistant` → `model`) |
| `chatMarkdown(text)` | Tiny renderer (paragraphs, lists, bold, code, simple tables). **Everything is HTML-escaped first** — model output is never inserted as raw HTML |
| `chatGetKey(prov)` / `chatSetKey(prov,key,remember)` / `chatLoadPrefs` / `chatSavePrefs` | One API key **per provider** (`CHAT_KEY_KEYS`) in `sessionStorage` (forgotten when the tab closes) or `localStorage` if **Remember** is ticked; prefs `{provider, models:{…}, includeNames, remember}` in `localStorage` under `CHAT_PREFS_KEY` (prefs saved before Gemini support migrate). **Never in `state`**, so never in a plan file or autosave |

**Privacy rules (don't weaken):** the panel says every message sends the plan to the selected provider; for Gemini it also
states that on Google's free tier prompts/replies may be used to improve Google's products (paid tier: not) — that text is
`CHAT_PROVIDERS.gemini.privacy`; **Preview exactly what is sent** shows the full system prompt; names are withheld
("Person 1/2", portfolio names generic) and birth year/month are never sent (only current age) unless **Send names** is
ticked. **Adding a projection field the model should see** = add a column in `buildChatSnapshot` (header, the row array,
and the "Columns:" line) — the model only knows what the snapshot contains.

---

## 7. App (`js/app.js`, `index.html`)

### 7.1 `app.js`
| Export | Contract |
|---|---|
| `recompute()` | `computeProjection()` → `renderCharts()` — the one place Compute and Display meet |
| `recomputeDebounced` / `saveDebounced` | 80ms / 500ms debounced wrappers, for slider/typing inputs (checkboxes and add/remove buttons call the un-debounced versions directly) |
| `destroyCharts()` | `destroyAllCharts()` (§6.1) plus clearing `lastProjection` — tears down every Chart.js instance — called before a full state restore so no stale tooltip/plugin/hover state survives into a newly loaded plan |
| `renderCharts()` | Calls every §6 chart builder, in this fixed order: SS controls/section, income, TSS, tax, expenses, asset, IDGT |
| `renderAll()` | Full re-render: household setup, passing sliders, inflation/living/SCGL fields, AUM fee, future-tax panel, LTC panel, income forms, footer, then `recompute()` — called on boot and on a full state restore |
| *(boot)* | On `DOMContentLoaded`: load autosave if present, else `defaultState()`, then `renderAll()` |

### 7.2 `index.html`
- Page markup only: styling lives in `css/styles.css` (linked in `<head>`), behavior in `js/`.
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
  display/tssChart → display/taxChart → display/expenseChart → display/assetChart → display/footer →
  display/formulasPage → display/notesPage → display/excelExport → display/chat → app.js`
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
  **Default coupling:** a *fresh default* plan — first-ever boot with no autosave, or **Reset to defaults** —
  starts with `hidden = !enabled` on every item (`defaultState()` / `applyDefaultHiddenFromEnabled()` in
  `core/state.js`, §3.3), so the screen shows only what's turned on, and every section Hide checked.
  **A saved plan is different:** **Load file** and autosave-restore keep every Hide flag exactly as it was
  saved (per card, and `state.ui.hiddenSections` per section) — they are never re-derived from `enabled`.
  Only a legacy file that has no `hidden` flag falls back to `!enabled` (§3.3, `fillLegacyHide`).
  A brand-new brokerage portfolio (via **+ Add**) starts enabled and visible.
  **Single source of truth:** every Hide checkbox and the card/section it collapses are derived from `state`;
  nothing reads the checkbox's own DOM state back.
- **`show_details`.** A single global flag (`chartHelpers.js`) every chart's tooltip reads live —
  toggling it needs no chart rebuild, just re-hovering.
- **Locked scales + Rescale.** Every chart's Y axis (and the SS/income charts' X axis) is locked so
  moving a slider doesn't make the chart jump; a per-chart "Rescale" control clears that lock so the
  next recompute re-fits it.
- **Smooth animation.** Every chart update goes through `upsertLineChart()` / `updateChartInPlace()` (§6.1) rather than
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
