# Retirement Income Planner — Summary & Specification

**File:** `index.html` — single-file, self-contained, runs entirely in the browser (no server, no build step, no external data calls except two CDN assets: Chart.js and Google Fonts). **Tax year modeled:** 2026 (IRS Rev. Proc. 2025-32; CMS IRMAA release Nov. 14, 2025).

**Contents:** [1 Purpose](#1-purpose) · [2 Principles](#2-core-design-principles) · [3 Inputs](#3-data-model-input) · [4 Calculations](#4-calculation-engine) · [5 Charts](#5-charts) · [6 Save/Restore](#6-save--restore) · [7 Constants](#7-tax--benefit-constants-2026-hard-coded-sourced-and-dated-in-code-comments) · [8 Simplifications](#8-known-simplifications-documented-in-app) · [9 Code map](#9-code-map) · [10 Change log](#10-change-log) · [11 Roadmap](#11-roadmap)

---

## 1. Purpose

A local, private "what-if" tool for a single/widowed person or a married couple to project household retirement income year-by-year until the younger person reaches 100, see how each income source stacks, and see the resulting Social Security taxation, income tax, and IRMAA surcharge — all expressed in **today's dollars** so the numbers stay intuitive regardless of the inflation assumption.

It is explicitly a *planning* tool, not a tax-prep tool: tax logic is simplified (no credits, no itemizing, no state tax) and is documented as such in the UI.

---

## 2. Core Design Principles

| Principle | Implementation |
| --- | --- |
| **Local-only, private** | No backend. All state lives in browser memory; nothing is transmitted anywhere. |
| **Today's-dollars framing** | All inputs are entered in today's $ (entering an amount in a future year's $ is in the spec but not yet built — see Roadmap). Every chart/table is displayed in today's $. |
| **Two independent, scrollable columns** | Left = inputs (per-person panes), right = output charts. Each scrolls independently so a user can tune an input while watching a chart lower on the page. |
| **Live, non-destructive recompute** | Every input change re-runs the full projection (debounced) and redraws charts in place rather than rebuilding them, so lines animate smoothly instead of flashing. |
| **Resumable sessions** | Full state autosaves to `localStorage` continuously, and can also be explicitly exported/imported as a JSON file to move between devices or archive a scenario. |

---

## 3. Data Model (Input)

### 3.1 Household

- Filing status: **Single/widowed** or **Married**.
- Per person: name, birth year, birth month (drives current age, FRA, and RMD start age).
- `$P1`/`$P2` = person 1 / person 2; `$P0` = the older of the two (used to anchor the chart X-axis).

### 3.2 Global assumptions

- **Inflation / COLA slider** — one slider, default 3%. Social Security COLA is assumed equal to the inflation rate (per spec).
- **Passing-age sliders** — P1 default 85, P2 default 90; same 30–100 scale and width.

### 3.3 Income sources (per person, married mode shows both side-by-side, columns row-aligned)

| Source | Fields |
| --- | --- |
| **Wage** | amount, age range (default ends at 65), annual change mode |
| **Social Security** | already-started flag, claim age (defaults to FRA), benefit amount |
| **Pension** | amount, age range, annual change, survivor-benefit (bene) checkbox |
| **Rental income** | amount, age range, annual change, bene |
| **Pre-tax IRA** | balance, withdrawal age range (default start = RMD age), annual growth (default inflation +3%), bene |
| **Brokerage portfolio(s)** | user can add multiple; each has balance, age range, annual growth (default inflation +4%), bene, an ODIV yield % (default 1.5%), a Qualified Dividend % of ODIV (default 70%), an **IDGT** checkbox, and an **Expenses** checkbox that, when checked, adds tax drag (% of annual total tax), fee drag (% of balance or fixed $/yr), a living-cost withdrawal (flat in today's $, i.e. inflation-adjusted) and realized LTCG (either $/yr in today's $ — inflation-adjusted — a % of that year's total tax, or that % scaled by the younger household member's age/100 clamped to 1 — a rough stand-in for unrealized gains; solved by fixed-point iteration since TT depends on the LTCG; taxed at the QDIV/LTCG rates and counted in AGI/NIIT). Annual balance change = growth − tax drag − fee drag − living-cost withdrawal. |

Every "annual change" field supports four modes: fixed $ (no growth), tracks inflation, inflation ± offset, or a custom nominal %.

### 3.4 Filing-status transition

When one spouse passes, filing status automatically switches to Single for all downstream tax/IRMAA/TSS calculations from that year forward.

---

## 4. Calculation Engine

### 4.1 Today's-$ vs. future-$ normalization

All inputs are entered in today's $, and the whole projection runs in real (inflation-adjusted) terms:

- **Growth:** a fixed-$ item erodes at the inflation rate; "tracks inflation" is flat in real terms; "inflation ± x" grows at x/(1+inflation) real; a custom nominal % grows at (1+nominal)/(1+inflation) − 1. Fixed-$ portfolio fees are deflated by (1+inflation)^k.
- **Social Security:** COLA = inflation, so benefits are flat in real terms.
- **Indexed tax tables** (ordinary brackets, standard deduction, QDIV/LTCG tiers, IRMAA tiers) are assumed to track inflation, so they are constant in today's $.
- **Un-indexed SS-tax thresholds** ($25k/$34k single, $32k/$44k married provisional income) are fixed in nominal terms by law, so they shrink by 1/(1+inflation)^k in today's $ (`ssThresholdFactor`). This is what makes taxable SS grow as a share of income over time.

### 4.2 Social Security

- **FRA** computed from birth year (`fraForBirthYear`).
- **Claim-age factors** for both the worker's own benefit (`ssOwnFactor`) and the spousal benefit (`ssSpousalFactor`), applied for claiming before/after FRA.
- **Spousal Benefit Rule** logic adjusts a spouse's benefit when it qualifies, and re-evaluates the survivor's benefit when the higher earner passes.
- **Break-even analysis**: a dedicated chart with the passing-age sliders (default P1=85, P2=90) and a claim-age slider per person, showing cumulative household SS income for every other candidate claim age (ages 62–70); the popup appears only when the cursor is within 8px of a line (one line reported if two overlap), locked X/Y scale, stopping when both have passed. An accompanying table lists monthly SS, total household SS, and real annual ROI % for each claim-age line, with a short plain-language explanation of the ROI method.

### 4.3 RMDs

- IRS Uniform Lifetime Table hard-coded (ages 72–105; ages below 72 linearly approximated for users who voluntarily withdraw early).
- RMD age itself is birth-year-dependent (72 / 73 / 75 per SECURE 2.0 schedule) via `rmdAgeForBirthYear`.
- Annual RMD = prior-year IRA balance ÷ table divisor for the owner's age that year.
- On the IRA owner's death, the balance and future RMD obligation pass to the surviving spouse.

### 4.4 Household income stacking

For every projection year (P0's current age → P0's age when the younger person reaches 100), income is aggregated by source: pension, wage, IRA RMD (today's $), rental, QDIV, ODIV minus QDIV, LTCG (realized from portfolios), SS for P0, SS for the other person (taxable interest is not modeled — the spec has no input for it) — each stopping when that person passes, and each respecting the Spousal Benefit Rule where relevant.

### 4.5 Taxable Social Security (TSS)

- Provisional income (PI) computed per year.
- TSS computed from PI thresholds, which are explicitly **not** inflation-adjusted (unchanged since the 1980s/90s) — the model does not COLA these limits, so TSS rises as a share of income over time, consistent with actual law.
- Filing-status change on first death is respected mid-projection.
- Chart calls out the "torpedo effect": additional ordinary income that pushes more SS into taxability is itself taxed, compounding the marginal rate.

### 4.6 Total income tax (TT)

- AGI = all non-SS income + TSS.
- Taxable income = AGI − standard deduction (status-dependent).
- Tax computed as ordinary tax on ordinary income (`calcOrdTax`) plus a qualified-dividend/LTCG stacked-bracket calculation (`calcQualTax`) that layers preferential-rate income on top of ordinary income.
- Chart shows stacked segments (ordinary → QDIV tiers → LTCG tiers) against current-year bracket lines.

### 4.7 IRMAA

- Tiers are set by MAGI (AGI + tax-exempt income + foreign tax credits, etc.). Only AGI is modeled and the income graph is treated as ~AGI ~ MAGI, so each tier is a plain horizontal dashed line (labeled "IRMAA T1 >$109k") following the year's filing status. A note above the chart says so; the popup shows AGI and the surcharge in effect.

### 4.8 Asset value

- Separate chart tracking every brokerage portfolio balance and every pre-tax IRA balance over time, in today's $.

---

## 5. Charts

All charts use Chart.js with in-place updates, locked axis scales, 2/3-page width (centered, height = width), and popups with left-justified labels / right-justified values (see §5.1).

1. **Social Security break-even** — cumulative household SS vs. age, one line per candidate claim age.
2. **Annual household income stacking** — thick stacked-by-source lines, IRMAA tier dashed overlays, income-tax bracket dashed overlays (rate labeled above/below each line), rescale button, light/dark dashed-line color toggle.
3. **Taxable Social Security (TSST)** — TSS line with effective tax % shown, filing-status-aware.
4. **Total tax (TT)** — stacked segments (ordinary/QDIV/LTCG tiers, plus NIIT) with distinct colors per segment, overlaid with a thick bright-red dashed effective-tax-rate line (TT ÷ AGI) and a thick bright-green dashed marginal-tax-rate line, both drawn above the stack (explicit Chart.js draw `order`) and read off their own right-hand % axis.
5. **Asset value** — all non-IDGT brokerage portfolio and pre-tax IRA balances over time; popup always shows each holder's age, value and the portfolio's configured (gross) annual growth %, and — only when that portfolio's **Expenses** checkbox is on — adds a net-of-expenses annual growth % (the actual balance-over-balance change once drags are subtracted), with the underlying tax drag, fee drag, living-cost withdrawal and realized LTCG shown only when **Show details** is on. A second **IDGT** chart appears only when at least one portfolio is flagged IDGT; its popup shows age, value and gross annual growth % always, with tax drag and fee drag shown only when Show details is on (no living-cost line, per spec §10).

### 5.1 Popup (tooltip) layout

All five chart popups share one layout helper so labels are left-justified and values right-justified per spec §5:

- `mrow(label, value)` tags a line as label + value; it no longer pads anything itself.
- `justifyTip(callbacks)` wraps each chart's tooltip callbacks, measures every line of the popup (title, body, footer), and pads them all to one common width, so every value ends on the same right edge.
- `TIP_STYLE` gives the title, body and footer the same monospace font at the same size (12px), with title and footer right-aligned to line up with body lines that Chart.js indents past the color swatch.
- Any new chart popup should build its lines with `mrow()` and wrap its callbacks in `justifyTip()`.

Every chart stops drawing a series once the relevant person(s) have passed, and every chart's popup includes the underlying components (e.g., taxable income, standard deduction, provisional income, IRA balance) so the user can see the "why," not just the line.

### 5.2 Show details mode

A checkbox labeled **"Show Details in Popup"** sits in the top bar (spec §3, `#showDetailsToggle`). It's a plain in-memory toggle (not saved to file or `localStorage`) read live by each tooltip, so switching it takes effect on the next hover — no chart rebuild. It reveals underlying calculation components the spec marks as show_details-only:

| Chart | Always shown | Show-details-only |
| --- | --- | --- |
| Annual Household Income | Total income | Filing status, AGI |
| Taxable Social Security | TSS, SST, SST%, top marginal rate | Provisional income (PI) |
| Total Tax | Effective tax rate, marginal tax rate | TT, filing status, taxable income, standard deduction, all income components (wages, pension, rental, IRA RMD, ordinary/qualified dividends, LTCG, taxable SS, AGI), provisional income, NII/NIIT |
| Asset value (non-IDGT) | Value, gross annual growth %, and (if Expenses is on) net-of-expenses growth % | Tax drag, fee drag, living-cost withdrawal, realized LTCG |
| Asset value (IDGT) | Value, gross annual growth % | Tax drag, fee drag |

(The Social Security break-even popup and the IRMAA/income warning line are unaffected — spec doesn't gate them.)

---

## 6. Save / Restore

- Continuous **autosave** to `localStorage` (debounced) so refreshing or closing the tab never loses progress.
- Explicit **Save to file** / **Load from file** buttons export/import the full state (all inputs + all slider positions) as a JSON file, so a user can checkpoint a scenario, share it, or resume on a different machine.
- **Reset to defaults** clears state back to a blank two-person or single-person starting point.

---

## 7. Tax & Benefit Constants (2026, hard-coded, sourced and dated in code comments)

| Constant | 2026 value | Source |
| --- | --- | --- |
| Ordinary brackets (MFJ / Single) | 10/12/22/24/32/35/37% at $24,800 / $100,800 / $211,400 / $403,550 / $512,450 / $768,700 (MFJ); half-ish for Single, see code | IRS Rev. Proc. 2025-32 |
| Standard deduction | $32,200 MFJ / $16,100 Single | IRS Rev. Proc. 2025-32 |
| QDIV/LTCG brackets | 0% to $98,900 / $49,450; 15% to $613,700 / $545,500; 20% above (MFJ/Single) | IRS Rev. Proc. 2025-32 |
| IRMAA tiers | $109k/$137k/$171k/$205k/$500k (Single), doubled for MFJ; $1,148–$6,936/yr per person combined Part B+D surcharge | CMS fact sheet, Nov. 14, 2025 |
| RMD divisors | IRS Uniform Lifetime Table | Unchanged since 2022 revision |
| NIIT rate / threshold | 3.8% on net investment income above $200k Single / $250k MFJ (not inflation-indexed) | IRC §1411 |

These constants are isolated at the top of the script specifically so they can be re-sourced and swapped each year without touching calculation logic.

---

## 8. Known Simplifications (documented in-app)

- All ordinary-rate assumptions; no itemized deductions, credits, state/local tax, or AMT. NIIT (3.8%) is modeled, but its investment-income base is limited to dividends (ODIV/QDIV) and realized LTCG — no taxable-interest input exists yet, and rental income is treated as ordinary per §9.1 rather than as NII.
- Single, simplified nationwide IRMAA/tax-bracket set (no MFS schedule, no HOH).
- Spousal Benefit Rule and survivor-benefit logic follow the general SSA rules but are not a substitute for an SSA benefit estimate.
- Spec §7 asks the model to "track dividend yield for IRA holdings." Since IRA/401(k) dividends aren't taxed until withdrawn, they're folded into the account's single annual-growth-rate input rather than modeled as a separate yield — only the RMD/withdrawal amount counts as income. This is noted in-app on the IRA card.

---

## 9. Code Map

`index.html` is one file: `<style>` (CSS variables, layout, container queries), the two-column markup, then one `<script>` organized in this order:

| Script section | Contents |
| --- | --- |
| Constants | 2026 brackets, standard deductions, QDIV/LTCG tiers, IRMAA tiers, RMD table |
| Helpers / State model / Path get-set | formatting, defaults, `state`, dot-path access, save/restore |
| Form rendering / Sub-components | per-person panes, age-range and annual-change selectors |
| Projection engine | `computeProjection()` — one row per year, all values in today's $ |
| What-if engine | runs the projection on a temporary clone (SS claim-age scenarios) |
| Visualization | colors, formatters, shared chart config (`CHART_BASE`, `ageXAxis`, `AXIS_*`), tooltip layout (`mrow`, `justifyTip`, `TIP_STYLE`), IRMAA / tax-bracket overlay plugins |
| Chart sections | SS break-even, Annual Income, Taxable SS, Total Tax, Asset Value (+ IDGT) — each builds its data, then creates or updates its chart in place |
| Footer / Wiring | assumptions note, event wiring, initial render |

A `#detailPanel` placeholder exists for the optional "Detailed Tax Calculation Age" PDF; it has no logic yet.

---

## 10. Change Log

1. Initial build per spec.
2. Cleanup: removed dead functions; verified no dangling IDs/handlers or duplicate IDs.
3. 2026 tax data refresh (ordinary brackets, standard deduction, IRMAA), with sourced comments.
4. Tooltips: values right-justified on a common edge in all five popups (`mrow` / `justifyTip` / `TIP_STYLE`).
5. Spec alignment: passing-age defaults 85/90; ODIV yield default 1.5%; asset popup shows real growth %, tax drag and fee drag; SS break-even popup requires a cursor hit (radius 8).
6. ODIV reinvest removed per updated spec: balance change = growth − tax drag − fee drag.
7. Refactor: shared Chart.js config replaces five copies of the same options; removed unused CSS; no behavior change.
8. X-axis per updated spec §6.2: every age-axis chart, including Annual Household Income, now runs from P0's current age to P0's age when the younger person reaches 100 (`chartMaxAge()`); single-person households still end at 100. The scale depends only on current ages, so it stays locked as sliders move.

9. Today's-$ review: the un-indexed SS-tax provisional-income thresholds are now deflated each year (they were held constant, i.e. implicitly indexed); "inflation ± x" growth now converts exactly to real terms (x/(1+inflation)) instead of using x directly.
10. X-axis title on all five age-axis charts is now the older person's name, e.g. "Alice's age" (`ageAxisLabel()`), and updates live when a name is edited.
11. Updated spec: SS section renamed "Start Age Analysis"; income chart note added (graph ~AGI ~ MAGI), IRMAA lines are plain tier values, the income popup shows AGI, and the X axis is defined once in spec §5 (P0's age, current age to the younger person reaching 100), which the income chart follows.
12. Bug fix: pension and rental survivor benefits ("continues to spouse") stopped the year the owner passed, because the default end age "passing" was compared against the owner's post-death age. The age range is now judged at the owner's last living year, so the stream continues for the surviving spouse (unless it had already ended at an earlier explicit end age).
13. Portfolio update per spec §4.3: standalone STCG and LTCG income cards removed; each brokerage portfolio gets an **Expenses** checkbox that reveals tax drag, fee drag, living-cost withdrawal and realized LTCG (both inflation-adjusted). Balance change = growth − tax drag − fee drag − living cost. Older saved files that had drag/fees are treated as Expenses-on.
14. Spec §4.3 update: realized LTCG on a portfolio can be a flat amount (today's $) or a % of annual total tax.
15. Spec §10 update: the non-IDGT Asset Value chart's popup now always shows value and gross annual growth %, and, only when a portfolio's Expenses checkbox is on, also shows tax drag, fee drag, living-cost withdrawal, realized LTCG, and a net-of-expenses annual growth % (actual balance change once those drags are subtracted). The IDGT chart's popup was intentionally left as-is (out of scope for this change).
16. Spec §9.4 NIIT: added the 3.8% Net Investment Income Tax as a new top segment on the Total Tax chart, labeled "NIIT (3.8% on QDIV/LTCG + NIIT)," computed as 3.8% × min(net investment income, MAGI over the un-indexed $200k Single / $250k MFJ threshold), where NII = ODIV−QDIV + QDIV + realized LTCG. Threshold is deflated to today's-$ terms the same un-indexed way as the SS provisional-income thresholds. NIIT is added to Total Tax (TT) — and therefore to portfolio tax drag — but is deliberately excluded from the Social Security Tax (SST) hypothetical in §9.3, so a MAGI-driven NIIT change isn't misattributed to taxing SS. Tooltip shows NII and the NIIT dollar amount whenever it's triggered; legend, chart note and section text updated to mention NIIT. Removed NIIT from the "not yet built" and "known simplifications" lists.
17. Spec §4.3 update: Realized LTCG on a portfolio gained a third mode — "% of TT × younger person's age/100" — which scales the entered % of total-tax by clamp(youngerHouseholdMemberAge/100, 0, 1) before the same fixed-point solve used by the plain "% of TT" mode; a rough stand-in for unrealized gains being realized more readily later in retirement. Fee drag's fixed-amount option is now entered and displayed in plain today's-$ dollars ("Fixed $ / yr") instead of thousands ("Fixed $k / yr") — the underlying stored value was already in full dollars, so no saved-file migration was needed, only the input's display/step changed.
18. Spec §4.0 (new section): any number entry that can hold a $ value — including fields that toggle between a $ amount and a %/other unit via an adjacent dropdown, like fee drag and Realized LTCG — now gets a `.money` CSS class with a 150px minimum width (≈12 digits) so large dollar amounts aren't clipped; the brokerage portfolio fields grid's minimum column width was bumped from 140px to 150px to match.
19. Spec §3 debug checkbox: added the previously-missing Debug toggle to the top bar, and wired it into the five tooltip locations the spec marks as debug-only (§8.3 filing status/AGI, §9.3.1 provisional income, §9.4 TT/TI/standard deduction/income components, §10 both asset charts' expense/drag breakdowns) — see §5.2. Nothing was previously gated by debug; all of that detail used to show unconditionally.
20. Spec §9.4: added the previously-missing effective-tax-rate line to the Total Tax chart (TT ÷ AGI) on its own locked 0–100% right-hand axis, shown unconditionally in the popup footer per spec, with TT/TI/standard-deduction/income-component detail moved behind Debug mode.
21. Spec §4.1 acronym audit: three displayed-text spots used bare "SS" with no full spelling nearby — the inflation-slider caption, the per-person Social Security series label/legend/tooltip on the Annual Income chart, and the footer assumptions line — all now read "Social Security (SS)". (TT/TSS/SST were already spelled out everywhere they appear; other bare "SS" occurrences sit directly beside a full "Social Security" mention and were left as-is.)
22. Spec §7 ("track dividend yield for IRA holdings"): documented as a deliberate simplification rather than left silently unhandled — IRA/401(k) dividends aren't taxed until withdrawn, so they're folded into the account's single growth-rate input; added a note on the IRA card and to Known Simplifications.
23. Spec renamed the §3 toggle from "debug checkbox" to "show_details checkbox" throughout (§8.3, §9.3.1, §9.4, §10). Renamed the app's toggle to match: `debugMode` → `showDetails`, `#debugToggle` → `#showDetailsToggle`, label "Debug" → "Show details" — no behavior change, same five gated tooltip locations as entry 19.
24. Spec §9.4 update: added a marginal-tax-rate line to the Total Tax chart alongside the existing effective-tax-rate line, both on the shared right-hand % axis, drawn on top of the $ stack (per spec, "after above list but below tooltip"). Reuses the same top-marginal-rate-on-the-next-dollar figure already computed for the Taxable Social Security chart, so it reflects the SS torpedo effect. Not added to the tooltip body — spec's popup list under §9.4 names only the effective rate.
25. Spec §3 label: the show_details checkbox's display label is now "Show Details in Popup" (was "Show details"), matching the spec text exactly.
26. Spec §9.4 tooltip: added the marginal tax rate to the Total Tax popup (now shown unconditionally alongside effective tax rate, per "Popup window should include: Effective Tax Rate, Marginal Tax Rate"), and, under Show Details, added the full list of income components (wages, pension, rental, IRA RMD, ordinary/qualified dividends, LTCG, taxable SS, AGI) that roll up to AGI, per "If show_details, show TT, TI, standard deduction, all income components."
27. Spec §9.4 chart-spec update: the effective- and marginal-tax-rate overlay lines are now drawn thick and dashed (previously solid), and colored bright red (effective) and bright green (marginal) per the updated spec, replacing the earlier dark/blue solid pair.
28. Bug fix: the effective- and marginal-tax-rate lines were being painted over by the stacked tax-segment fill areas because all ten Total Tax datasets shared the same default Chart.js draw `order`. Explicit `order` values (stacked segments = 2, rate lines = 1/0 — lower `order` draws on top in Chart.js) now keep both dashed rate lines visibly on top of the stack, as spec requires ("Overlay ... on top of other graph objects").

---

## 11. Roadmap

Not yet built:

- Entering an amount in a future year's dollars (spec §2) — all inputs are currently today's $.
- Provisional income for SS taxation should include QDIV and LTCG (currently only ordinary income + ½ SS); flagged in review, not yet changed.
- Detailed Tax Calculation Age PDF output (spec: optional stretch).
- Taxable interest income (in the spec's stack order, but no input exists).
- AUM fee.
- Annuities, real estate, tax-exempt income.
- State-tax overlay, senior additional standard deduction (OBBBA toggle); extend NIIT's income base to taxable interest once that input exists.
