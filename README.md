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
| **Short-term capital gains (STCG)** | amount, annual change, bene |
| **Long-term capital gains (LTCG)** | amount, annual change, bene |
| **Pre-tax IRA** | balance, withdrawal age range (default start = RMD age), annual growth (default inflation +3%), bene |
| **Brokerage portfolio(s)** | user can add multiple; each has balance, age range, annual growth (default inflation +4%), bene, an ODIV yield % (default 1.5%), a Qualified Dividend % of ODIV (default 70%), tax drag (% of annual total tax), fee drag (% of balance or fixed $k/yr), and an **IDGT** checkbox. Annual balance change = growth − tax drag − fee drag. |

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

For every projection year (P0's current age → P0's age when the younger person reaches 100), income is aggregated by source: pension, wage, IRA RMD (today's $), rental, QDIV, ODIV minus QDIV, STCG, LTCG, SS for P0, SS for the other person (taxable interest is not modeled — the spec has no input for it) — each stopping when that person passes, and each respecting the Spousal Benefit Rule where relevant.

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

- MAGI-tier surcharge chart drawn as dashed overlay lines on the income chart, labeled by tier, following the year's filing status.

### 4.8 Asset value

- Separate chart tracking every brokerage portfolio balance and every pre-tax IRA balance over time, in today's $.

---

## 5. Charts

All charts use Chart.js with in-place updates, locked axis scales, 2/3-page width (centered, height = width), and popups with left-justified labels / right-justified values (see §5.1).

1. **Social Security break-even** — cumulative household SS vs. age, one line per candidate claim age.
2. **Annual household income stacking** — thick stacked-by-source lines, IRMAA tier dashed overlays, income-tax bracket dashed overlays (rate labeled above/below each line), rescale button, light/dark dashed-line color toggle.
3. **Taxable Social Security (TSST)** — TSS line with effective tax % shown, filing-status-aware.
4. **Total tax (TT)** — stacked segments (ordinary/QDIV/LTCG tiers) with dashed current-year bracket overlays.
5. **Asset value** — all non-IDGT brokerage portfolio and pre-tax IRA balances over time; popup shows each holder's age, value, real annual growth %, tax drag and fee drag. A second **IDGT** chart appears only when at least one portfolio is flagged IDGT.

### 5.1 Popup (tooltip) layout

All five chart popups share one layout helper so labels are left-justified and values right-justified per spec §5:

- `mrow(label, value)` tags a line as label + value; it no longer pads anything itself.
- `justifyTip(callbacks)` wraps each chart's tooltip callbacks, measures every line of the popup (title, body, footer), and pads them all to one common width, so every value ends on the same right edge.
- `TIP_STYLE` gives the title, body and footer the same monospace font at the same size (12px), with title and footer right-aligned to line up with body lines that Chart.js indents past the color swatch.
- Any new chart popup should build its lines with `mrow()` and wrap its callbacks in `justifyTip()`.

Every chart stops drawing a series once the relevant person(s) have passed, and every chart's popup includes the underlying components (e.g., taxable income, standard deduction, provisional income, IRA balance) so the user can see the "why," not just the line.

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

These constants are isolated at the top of the script specifically so they can be re-sourced and swapped each year without touching calculation logic.

---

## 8. Known Simplifications (documented in-app)

- All ordinary-rate assumptions; no itemized deductions, credits, state/local tax, NIIT, or AMT.
- Single, simplified nationwide IRMAA/tax-bracket set (no MFS schedule, no HOH).
- Spousal Benefit Rule and survivor-benefit logic follow the general SSA rules but are not a substitute for an SSA benefit estimate.

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
8. X-axis per updated spec §6.2: every age-axis chart now runs from P0's current age to P0's age when the younger person reaches 100 (`chartMaxAge()`); single-person households still end at 100. The scale depends only on current ages, so it stays locked as sliders move.

9. Today's-$ review: the un-indexed SS-tax provisional-income thresholds are now deflated each year (they were held constant, i.e. implicitly indexed); "inflation ± x" growth now converts exactly to real terms (x/(1+inflation)) instead of using x directly.
10. X-axis title on all five age-axis charts is now the older person's name, e.g. "Alice's age" (`ageAxisLabel()`), and updates live when a name is edited.

---

## 11. Roadmap

Not yet built:

- Entering an amount in a future year's dollars (spec §2) — all inputs are currently today's $.
- Provisional income for SS taxation should include QDIV and LTCG (currently only ordinary income + ½ SS); flagged in review, not yet changed.
- Detailed Tax Calculation Age PDF output (spec: optional stretch).
- Taxable interest income (in the spec's stack order, but no input exists).
- AUM fee.
- STCG/LTCG are placeholders and may be dropped or reworked.
- Annuities, real estate, tax-exempt income.
- State-tax overlay, NIIT (3.8%), senior additional standard deduction (OBBBA toggle).
