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
- **Suspended Capital-Gain Loss (SCGL)** — a single household-level $ amount (default 0), not a slider. A capital-loss carryforward that shields realized LTCG from tax; see §4.3.2 below. A live status note under the input (`updateScglStatusNote()`, recomputed on every `recompute()`) surfaces how the pool actually depletes across the projection — e.g. "fully used by around age 74" or, if it's never fully consumed, how much is left over at the end of the projection — since otherwise the running per-year balance is only visible by hovering the Annual Household Income chart.
- **Speculative future tax-threshold change** — a checkbox (off by default); when on, reveals a start year plus a single-filer and married-filer NIIT exemption threshold (today's $). A placeholder for a Social Security taxation threshold is shown but explicitly not implemented (spec says so). See §4.3.3 below.

### 3.3 Income sources (per person, married mode shows both side-by-side, columns row-aligned)

Every card in this section (and each individual brokerage portfolio) has two independent checkboxes in its header (spec §4.4): **enable** (left, part of the title label) determines whether that income source actually feeds the calculation, and **Hide** (right, small/muted) is purely cosmetic — it collapses the card's detail fields to reduce screen space without touching whether it's enabled. A card auto-opens when enabled (unless Hide is also checked) and auto-collapses when disabled; toggling Hide alone never changes the enabled state or triggers a recompute. Individual brokerage portfolios only get the Hide checkbox (no separate enable — a portfolio's existence in the list *is* its enabled state; removing it uses the "Remove" button instead).

| Source | Fields |
| --- | --- |
| **Wage** | amount, age range (default ends at 65), annual change mode |
| **Social Security** | already-started flag, claim age (defaults to FRA), benefit amount |
| **Pension** | amount, age range, annual change, survivor-benefit (bene) checkbox |
| **Rental income** | amount, age range, annual change, bene |
| **Pre-tax IRA** | balance, withdrawal age range (default start = RMD age), annual growth (default inflation +3%), bene, and an optional annual Roth conversion (flat today's-$ amount, added to ordinary income each year the pre-tax balance is still positive, independent of the withdrawal age range) |
| **Roth IRA** | balance, annual growth (default inflation +3%), bene. Grows tax-free from its own balance plus any Roth conversion configured on the matching Pre-tax IRA above; requires this Roth IRA to be enabled for conversions to apply. No withdrawals or RMDs are modeled. |
| **Brokerage portfolio(s)** | user can add multiple; each has balance, age range, annual growth (default inflation +4%), bene, an ODIV yield % (default 1.5%), a Qualified Dividend % of ODIV (default 70%), an **IDGT** checkbox, and an **Expenses** checkbox that, when checked, adds tax drag (% of annual total tax), fee drag (% of balance or fixed $/yr), a withdrawal (flat in today's $, i.e. inflation-adjusted) and realized LTCG (either $/yr in today's $ — inflation-adjusted — a % of that year's total tax (TT), or that % scaled by the younger household member's age/100 clamped to 1 — a rough stand-in for unrealized gains; solved by fixed-point iteration since TT depends on the LTCG; taxed at the QDIV/LTCG rates and counted in AGI/NIIT, net of any SCGL offset). Annual balance change = growth − tax drag − fee drag − withdrawal. |

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

### 4.3.1 Roth conversion & Roth IRA

- Each person's Pre-tax IRA card can specify an annual Roth conversion — a flat today's-$ amount — that, each year the pre-tax balance is still positive, moves out of the pre-tax IRA (after that year's RMD, before growth is applied) and into that person's own Roth IRA, capped at whatever pre-tax balance remains. Conversion is independent of the withdrawal age range, so it can run before RMDs start.
- The converted amount is added to that year's ordinary income (`nonSSOrdinary`), consistent with how an actual Roth conversion is taxed.
- A Roth IRA only receives conversions if it's enabled; if it isn't, any configured conversion amount is simply ignored (no money moves, nothing is taxed).
- The Roth IRA balance itself just compounds at its own configured growth rate, funded by its starting balance plus each year's conversion inflow — no withdrawals or RMDs are modeled against it, since Roth accounts aren't subject to RMDs and this app doesn't model spending from any account beyond a brokerage portfolio's own "withdrawal" field.
- On the owner's death, an inherited Roth IRA (if "Continues to spouse" is checked) keeps compounding under the surviving spouse until they pass, mirroring the pre-tax IRA's inheritance behavior — but with no further RMDs, since none apply to a Roth.

### 4.3.2 Suspended Capital-Gain Loss (SCGL)

- A single household-level pool (today's $, spec §4.5), separate from any individual portfolio, tracked as a running balance across the whole projection.
- Each year, available SCGL eliminates that year's realized LTCG dollar-for-dollar, before tax, until either the LTCG is fully offset or the pool is exhausted (spec §8.3); whichever is smaller is subtracted from the running SCGL balance for next year.
- Realized LTCG's %-of-TT / %-of-TT-×-age modes (see §3.3) are circular — LTCG affects Total Tax, which affects LTCG — so they're solved by fixed-point iteration (`ltcgOf(tt)`, ~8 passes, converges because a dollar of LTCG adds at most 20¢ of tax); the SCGL offset is applied *inside* that iteration (against the net-of-SCGL amount at each pass), not just at the end, so the converged Total Tax already reflects the shielded LTCG.
- The SCGL offset is prorated proportionally across whichever people/portfolios realized LTCG that year, so the per-person breakdown shown in the Annual Household Income chart's tooltip still sums to the net (displayed) total.
- Net-of-SCGL LTCG is what appears everywhere downstream: the Annual Household Income chart's LTCG band, AGI, provisional income / taxable Social Security, Total Tax's LTCG bracket segments, and NIIT's net-investment-income base. The gross (pre-SCGL) realized amount is only used internally to compute each brokerage portfolio's own balance rolldown, which is unaffected by SCGL (the cash still leaves the portfolio; SCGL only changes how much of it is taxed).

### 4.3.3 Speculative future tax-threshold change

- Off by default (spec §4.5). When enabled, reveals a start year and a today's-$ NIIT exemption threshold for each filing status (defaults: current-law $200k single / $250k married, start year ten years out).
- From the configured start year onward, the NIIT calculation (see below) uses these configured thresholds *in place of* the standard $200k single / $250k married thresholds, and — unlike current law's frozen nominal thresholds — holds them flat in today's-dollar terms, since the scenario being modeled is a hypothetical future law that indexes the threshold to inflation. Before the start year (or if the checkbox is off), the standard un-indexed thresholds apply as always.
- A Social Security Taxation Threshold section is shown alongside it but is an intentional placeholder — the spec marks it "Not implemented yet," so no fields or calculation exist for it.

### 4.4 Household income stacking

For every projection year (P0's current age → P0's age when the younger person reaches 100), income is aggregated by source: pension, wage, IRA RMD (today's $), rental, QDIV, ODIV minus QDIV, LTCG (realized from portfolios, net of any available SCGL offset — see §4.3.2), SS for P0, SS for the other person (taxable interest is not modeled — the spec has no input for it) — each stopping when that person passes, and each respecting the Spousal Benefit Rule where relevant. Roth conversion amounts are *not* added as their own stacked band here (they're not new cash income, just a taxable internal transfer) — they only flow into the tax calculation below. The tooltip footer always shows total income and, whenever SCGL has been used or still has a balance, the SCGL remaining after that year's offset.

### 4.5 Taxable Social Security (TSS)

- Provisional income (PI) computed per year.
- TSS computed from PI thresholds, which are explicitly **not** inflation-adjusted (unchanged since the 1980s/90s) — the model does not COLA these limits, so TSS rises as a share of income over time, consistent with actual law.
- Filing-status change on first death is respected mid-projection.
- Chart calls out the "torpedo effect": additional ordinary income that pushes more SS into taxability is itself taxed, compounding the marginal rate.

### 4.6 Total income tax (TT)

- AGI = all non-SS income + TSS. Non-SS income now includes any Roth conversion amount, so a conversion can push more Social Security into taxability (the torpedo effect above) and raise the marginal rate shown on both tax charts. LTCG within AGI is net of any SCGL offset (§4.3.2).
- Taxable income = AGI − standard deduction (status-dependent).
- Tax computed as ordinary tax on ordinary income (`calcOrdTax`) plus a qualified-dividend/LTCG stacked-bracket calculation (`calcQualTax`) that layers preferential-rate income (QDIV + net-of-SCGL LTCG) on top of ordinary income.
- Chart shows stacked segments (ordinary → QDIV tiers → LTCG tiers, all net-of-SCGL) against current-year bracket lines.

### 4.7 IRMAA

- Tiers are set by MAGI (AGI + tax-exempt income + foreign tax credits, etc.). Only AGI is modeled and the income graph is treated as ~AGI ~ MAGI, so each tier is a plain horizontal dashed line (labeled "IRMAA T1 >$109k") following the year's filing status. A note above the chart says so; the popup shows AGI and the surcharge in effect.

### 4.8 Asset value

- Separate chart tracking every brokerage portfolio balance, every pre-tax IRA balance, and every Roth IRA balance over time, in today's $.

---

## 5. Charts

All charts use Chart.js with in-place updates, locked axis scales, 2/3-page width (centered, height = width), and popups with left-justified labels / right-justified values (see §5.1).

1. **Social Security break-even** — cumulative household SS vs. age, one line per candidate claim age.
2. **Annual household income stacking** — thick stacked-by-source lines, IRMAA tier dashed overlays, income-tax bracket dashed overlays (rate labeled above/below each line), rescale button, light/dark dashed-line color toggle.
3. **Taxable Social Security (TSST)** — TSS line with effective tax % shown, filing-status-aware.
4. **Total tax (TT)** — stacked segments (ordinary/QDIV/LTCG tiers, plus NIIT) with distinct colors per segment, overlaid with a thick bright-red dashed effective-tax-rate line (TT ÷ AGI) and a thick bright-green dashed marginal-tax-rate line, both drawn above the stack (explicit Chart.js draw `order`) and read off their own right-hand % axis.
5. **Asset value** — all non-IDGT brokerage portfolio, pre-tax IRA, and Roth IRA balances over time; popup always shows each holder's age and each series' value, and, for brokerage/pre-tax IRA series, the portfolio's configured (gross) annual growth %, plus — only when that portfolio's **Expenses** checkbox is on — a net-of-expenses annual growth % (the actual balance-over-balance change once drags are subtracted), with the underlying tax drag, fee drag, living-cost withdrawal and realized LTCG shown only when **Show Details in Popup** is on. Roth IRA series show only their value (no drag/growth breakdown — a Roth balance is simply its prior balance plus that year's conversion, compounded). A second **IDGT** chart appears only when at least one portfolio is flagged IDGT; its popup shows age, value and gross annual growth % always, with tax drag and fee drag shown only when Show Details in Popup is on (no living-cost line, per spec §10).

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
| Annual Household Income | Total income, SCGL remaining (spelled out — when SCGL has been set or used) | Filing status, AGI |
| Taxable Social Security | TSS, SST, SST%, top marginal rate | Provisional income (PI) |
| Total Tax | Effective tax rate, marginal tax rate | TT, filing status, taxable income, standard deduction, all income components (wages, pension, rental, IRA RMD, ordinary/qualified dividends, LTCG, taxable SS, AGI), provisional income, NII/NIIT |
| Asset value (non-IDGT) | Value (brokerage/pre-tax IRA/Roth IRA), and for brokerage/pre-tax IRA, gross annual growth %, and (if Expenses is on) net-of-expenses growth % | Tax drag, fee drag, living-cost withdrawal, realized LTCG |
| Asset value (IDGT) | Value, gross annual growth % | Tax drag, fee drag |

(The Social Security break-even popup and the IRMAA/income warning line are unaffected — spec doesn't gate them.)

### 5.3 Formulas & Acronyms page (spec §3)

A **"📐 Formulas & Acronyms"** button in the top bar (`openFormulasPage()`) opens a separate browser tab with a static, self-contained page documenting every calculation formula and acronym used in the app — an audit aid, since compounded formula errors across a ~35-year projection can be hard to catch from chart output alone. It's built as an HTML string (`buildFormulasHtml()`) and opened via a `Blob` URL (`URL.createObjectURL`), so it needs no server and isn't blocked by the app's own content — it's a genuinely separate document/tab, matching the spec's "preferably tab" note.

The page pulls its numeric content directly from the same constants and live session state the calculation engine actually uses (ordinary/QDIV/LTCG brackets, standard deduction, NIIT threshold, IRMAA tiers, the session's inflation rate and SCGL balance, and whether the speculative future-threshold assumption is active) rather than hard-coding a second copy — so it can't silently drift out of sync with the app as those constants are updated year to year. It covers: the today's-$ convention; Social Security (benefit-at-claim-age adjustment, the Spousal Benefit Rule, TSS); Pre-tax IRA (RMD formula, Roth conversion mechanics); Roth IRA balance growth; brokerage portfolios (dividends, the three realized-LTCG modes, the SCGL offset, and the balance-rolldown formula); the full tax pipeline (provisional income → SST, including the torpedo effect → AGI/TI → ordinary tax → qualified tax → NIIT → TT → effective/marginal rates); and IRMAA. A glossary table spells out every acronym used elsewhere in the app (spec §4.1's list plus the rest: FRA, PIA, COLA, SSSBR, RMD, PI, MAGI, TI, TB, ODIV, QDIV, NII, IRMAA, SCGL, IDGT, MFJ).

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
| NIIT rate / threshold | 3.8% on net investment income above $200k Single / $250k MFJ (not inflation-indexed) — overridable from a configured year onward by the speculative future-threshold assumption, §4.3.3 | IRC §1411 |

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
29. Spec §4.4/§10: added Roth IRA support. Each Pre-tax IRA card gained an "Annual Roth conversion" field (flat today's-$ amount, converted after that year's RMD and before growth, capped at the remaining pre-tax balance, independent of the withdrawal age window); each person also gets a new Roth IRA card (balance, annual growth, survivor-benefit checkbox) that must be enabled for conversions to actually move money. The converted amount is added to ordinary income (and therefore AGI, taxable Social Security, and Total Tax) the year it converts, but — since it's an internal transfer, not new cash — is not added as its own stacked band on the Annual Household Income chart. The Roth balance itself just compounds tax-free from its starting balance plus each year's conversion, with inheritance-on-death handled the same way as the pre-tax IRA (but with no RMDs, since none apply to Roth accounts). The non-IDGT Asset Value chart now includes a distinctly-colored Roth IRA band per person alongside brokerage and pre-tax IRA; its tooltip shows only value (no drag/growth breakdown, since a Roth balance has none to show).
30. Spec §4.5/§8.3: added a Suspended Capital-Gain Loss (SCGL) carryforward — a single household-level $ input in the Assumptions panel (default 0). Each year, available SCGL eliminates that year's realized LTCG dollar-for-dollar, before tax, until the LTCG is fully offset or the pool runs out; the running SCGL balance carries forward year to year. The %-of-TT / %-of-TT-×-age realization iteration now solves against net-of-SCGL LTCG (since that's what's actually taxed), and the offset is prorated across whichever people/portfolios realized gains that year so the income chart's per-person LTCG breakdown still sums correctly. Net-of-SCGL LTCG is what flows into AGI, taxable Social Security, Total Tax, and NIIT; the gross realized amount is used only for each portfolio's own balance rolldown, which SCGL doesn't affect. The Annual Household Income chart's tooltip footer now always shows the SCGL balance remaining after that year's offset (when SCGL has been set or used).
31. Spec update, three changes:
    - §8.3: the Annual Household Income chart's tooltip now spells out "Suspended Capital-Gain Loss (SCGL) remaining" instead of the bare acronym, matching the app's acronym-spelling convention.
    - §4.4: each brokerage portfolio's "living cost withdrawal" field is renamed "Withdrawal" throughout the UI, tooltips and code comments (same field, same behavior — flat in today's $). More significantly, realized-LTCG's percentage modes are re-based: "% of annual total tax (TT)" and "% of TT × younger person's age/100" become "% of withdrawal" and "% of withdrawal × younger person's age/100" — i.e. the LTCG realized is now a percentage of that *portfolio's own configured withdrawal amount* (a plausible cost-basis-vs-gain split on money actually being taken out) rather than a percentage of the household's total tax bill. This breaks the previous circular dependency between LTCG and Total Tax entirely: LTCG is now a deterministic per-portfolio number computed before tax, so the multi-pass fixed-point iteration that used to solve LTCG against a Total Tax guess has been removed (SCGL's net-of-carryforward calculation, §4.3.2, is applied directly to this deterministic gross total instead of inside an iteration loop).
    - §4.3/§4.5: added an off-by-default "speculative future tax-threshold change" scenario. When enabled, it reveals a start year and a today's-$ NIIT exemption threshold per filing status; from that year onward, the NIIT calculation uses the configured thresholds instead of the standard $200k/$250k figures, and — modeling a hypothetical inflation-indexed law, unlike current law's frozen nominal threshold — holds them flat in today's dollars rather than deflating them the way the standard (un-indexed) thresholds are. A Social Security Taxation Threshold section is shown alongside it as an explicit placeholder, per the spec's "Not Implemented Yet" note — no fields or calculation exist for it yet.
32. Verified the SCGL running balance actually decrements year over year as it's consumed (it does — confirmed with a scripted projection test: a $50k pool against $30k/yr gross LTCG went $50k → $20k remaining (year 0, fully absorbed) → $0 remaining (year 1, partially absorbed, $10k left taxable) → stays $0 thereafter). Since the math was already correct, what was actually missing was *visibility*: added the live status note described in §3.2 above, so the depletion is obvious next to the input itself rather than only discoverable by hovering the income chart year by year.
33. Spec §3/§4.4, three additions:
    - §3: added a **"📐 Formulas & Acronyms"** button that opens a separate tab with every calculation formula and acronym used in the app, built live from the same constants the engine uses — see §5.3 above.
    - §4.4: every income-type card (and each brokerage portfolio) now has a second, independent **Hide** checkbox (upper right) alongside the existing **enable** checkbox (upper left) — enable drives the calculation, Hide is purely cosmetic screen-space management. This replaced the old behavior where clicking anywhere on a card's header toggled it open/closed; that implicit whole-header click target is gone in favor of the explicit checkbox the spec asks for. See §3.3 above.
    - `hidden:false` added to the default shape of every income-type object (wage, SS, pension, rental, IRA, Roth) and every brokerage portfolio; old saved files without it pick up the default via `hydrateState`'s merge, same as every other field added after initial release.
34. Correction to entry 32, plus a spec reversion:
    - **Real bug found and fixed.** Entry 32's diagnosis was wrong: it concluded the SCGL math was already correct because the automated tests behind it never actually exercised the chart/tooltip code at all — Chart.js loads from a CDN the sandbox blocks, so every prior `buildIncomeChart()` call in testing silently no-op'd at its `if(typeof Chart==='undefined') return;` guard, and only the underlying `computeProjection()` rows were ever checked. Re-testing with Chart.js genuinely loaded (via a local npm install plus a `canvas` polyfill for jsdom, so the tooltip callbacks actually run) surfaced a real, previously-invisible bug: `ageLabelRange()` started the shared X-axis label list at `Math.floor(fromAge)`, while every row/series lookup elsewhere (`rowByAge`, `alignToAges`, `ssByAge`) keys by `Math.round(age)`. Whenever the starting age has a fractional part — which birth-month-driven ages almost always do — those two roundings disagree by one, so the chart's very first label had no matching row (a blank tooltip, and a `null` gap in every series' first plotted point) and every other label ended up pointing at the *previous* year's row: SCGL and every other tooltip field were quietly off by one full year on the Annual Household Income, Total Tax, and Asset Value charts. Fixed by changing `ageLabelRange` to start at `Math.round(fromAge)`, matching every lookup site — one line, fixes all three charts at once since they share the helper. Verified with Chart.js genuinely instantiated: the first data point's tooltip now resolves a real row on all three charts, and the SCGL sequence lines up correctly year over year (confirmed showing regardless of the Show Details setting, which was never actually gated in the first place — the "only shows with Show Details on" symptom was this alignment bug intermittently blanking the tooltip depending on hover position, not an actual visibility gate).
    - **Spec §4.4 reverted**: realized-LTCG's percentage modes go back to "% of annual total tax (TT)" / "% of TT × younger person's age/100" (undoing entry 31's "% of withdrawal" change). `brokerageValues()` again returns a `pct`/`frac`/`cap` structure per portfolio instead of a deterministic dollar figure, and the fixed-point iteration (`ltcgOf(tt)`, removed in entry 31) is restored, with the SCGL net-of-carryforward offset applied inside each iteration pass as it was before entry 31. The "Withdrawal" field rename (from "living cost withdrawal") and its own balance-rolldown role are unaffected — only what realized LTCG's % modes are a percentage *of* changed back.
35. Spec §4.4 revision, two changes:
    - **Roth conversion no longer counts as ordinary income.** Entry 29 had the converted amount flow into `nonSSOrdinary` (and therefore AGI, taxable Social Security, and Total Tax) the year it converted. Per a spec correction, since convamount is an internal transfer between a person's own accounts and — as the spec already said — doesn't get its own band on the Annual Household Income chart, it's now excluded from `nonSSOrdinary` entirely. `rothConvByPerson`/`rothConvTotal` are still tracked on each projection row (the Roth balance rolldown still needs them), but the "Roth conversion" line that used to appear under the Total Tax popup's Show-Details income-component breakdown is removed, since it no longer rolls up to AGI. All UI copy, code comments, and the Formulas page (§4 Roth conversion, §6 provisional-income formula) updated to match.
    - **Foreign tax credit added.** Spec §4.4 always specified a per-portfolio "foreign asset % portfolio, foreign tax credit % (default 0.25%)" pair with `foreign tax credit += portfolio value × foreign asset % × foreign tax credit %`, and §9.4 said to subtract it from Total Tax — neither had actually been built. Added both fields to the brokerage-portfolio card (grouped under the existing Expenses checkbox, alongside tax drag/fee drag/LTCG, matching how the spec lists them), computed each year off that portfolio's current balance, summed across every enabled portfolio, and subtracted from `TT = ordinary tax + qualified tax + NIIT` (floored at $0). Per spec, the credit is a pure reduction to household tax — unlike tax drag/fee drag/withdrawal, it does *not* reduce the portfolio's own balance in the rolldown. Surfaced in the Total Tax chart's Show-Details tooltip (new "Foreign tax credit" line) and both Asset Value chart tooltips (Show-Details only), plus a new FTC glossary entry and formula on the Formulas & Acronyms page. `foreignPct`/`ftcPct` were added to `defaultBrokeragePortfolio()`, so older save files hydrate them to 0% / 0.25% automatically via the existing per-field merge.
36. Correction to entry 35, plus one addition:
    - **Roth conversion reverted back to counting as ordinary income** — entry 35's change was itself the bug, not the fix. A Roth conversion genuinely is taxed as ordinary income the year it converts; `rothConvTotal` is back in `nonSSOrdinary` (and therefore AGI, taxable Social Security, and Total Tax) as it was before entry 29. The real problem entry 35 should have fixed: the Annual Household Income chart's stacked bands (and its "Total income" tooltip figure, which is just the sum of those bands) never included Roth conversion, so the visible chart understated what the household actually owed tax on the moment a conversion was configured — the conversion amount was taxed but invisible. Fixed properly this time by adding **Roth conversion as its own stacked band** on the income chart (`INC_KEYS`/`INC_LABELS`/`INC_COLORS`/`INC_BYPERSON_FIELD`, a new `rc` color, and a per-row `rothConvByPerson` push into `buildIncomeChart`'s series), positioned right after IRA RMD in the stack — so "Total income" now always equals what's actually taxed. The Total Tax popup's Show-Details "Roth conversion" line is also back. `retire.md` §4.4 and §8.3 updated to match, with a note on the earlier (wrong) revision correcting the record rather than silently overwriting it.
    - **IDGT portfolios: foreign tax credit inputs decoupled from the Expenses checkbox.** The two foreign-tax-credit fields added in entry 35 were nested inside the general "Expenses & realized gains" toggle, so an IDGT-flagged portfolio couldn't use them without also turning on tax drag/fee drag/withdrawal/LTCG — fields that don't really apply to a trust. Foreign asset %/foreign tax credit % now render (and take effect in the FTC calculation) whenever *either* Expenses is on *or* the portfolio is flagged IDGT; every other expense field still requires Expenses regardless of IDGT. The IDGT checkbox's handler is now `onIdgtToggle` (was reusing `onBeneToggle`, which doesn't re-render the form) so toggling it immediately shows/hides the foreign-tax-credit fields. `retire.md` §4.4 updated with a bracketed clarification.
37. Spec §4.4/§8.3/§9.4 refinement, reframing entry 36's Roth-conversion fix rather than reversing it: instead of a standalone "Roth conversion" concept, the spec (and now the app) treats a configured conversion for what it actually is on a tax return — a withdrawal from the pre-tax IRA (`Pre-tax IRA withdraw += convamount`), taxed exactly like the RMD, since the IRS doesn't have a separate "conversion income" line; it's reported and taxed like any other IRA distribution. Renamed the income-chart band and its underlying row fields from Roth-conversion terminology to this framing: `rothConvByPerson`/`rothConvTotal` → `iraWithdrawByPerson`/`iraWithdrawTotal`, and the `INC_KEYS` chart key from `rothConv` → `iraWithdraw`, labeled "Pre-tax IRA withdraw" and repositioned immediately *before* "IRA RMD" in the stacking order (matching retire.md's updated §8.3), rather than after it. `nonSSOrdinary` itself is unchanged in substance — same dollars flow into AGI/taxable SS/Total Tax as under entry 36, just carried through the renamed variables. Also added §9.4's explicit `ordinary income = pension + wage + RMD withdraw + pre-tax IRA withdraw + rent` formula to the Formulas & Acronyms page (with a bracketed note that ODIV−QDIV belongs in that sum too, since the spec line doesn't spell it out), and updated every UI note, code comment, and Total Tax Show-Details line that referenced "Roth conversion" as its own thing to the withdrawal framing instead.

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
- Social Security Taxation Threshold, under the speculative future tax-threshold assumption (spec explicitly marks this "Not Implemented Yet"; a placeholder is shown in the UI).
