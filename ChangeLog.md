## Change Log

## Wage contributions, payroll tax, NY / NYC tax, Stock options
- **Wage card**: the amount is now the *gross* wage; new fields *Pre-tax IRA/401(k) contribution* (comes out of the wage, added to the Pre-tax IRA/401(k) card's account) and *Roth IRA/401(k) contribution* (today's $; an expense paid from after-tax money, added to the Roth account, shown as its own band on the Household Expenses chart). Entering one turns the matching card on; it is ignored while that card is off. The Roth IRA card is now **Roth IRA / 401(k)**.
- **Payroll tax** (compute/tax.js `computePayrollTax`): on the wage after the pre-tax contribution (plus stock-option gains counted as wage): Social Security 6.2% to the $184,500 base, Medicare 1.45%, Additional Medicare 0.9% over $250k / $200k (deflated, un-indexed), FUTA 0.6% of the first $7,000 (deflated). The wage is reduced by it and the remainder is the ordinary-income wage; FICA, Additional Medicare and FUTA are stacked bands on the Total Income Tax chart (row fields `payrollTax`, `payrollFica`, `payrollAddlMedicare`, `payrollFuta`, `grossWageTotal`, `pretaxContribTotal`, `rothContribTotal`, `expRoth`).
- **State income tax**: New York State and New York State + NYC resident (2026 brackets, standard deduction, $20,000 pension/annuity exclusion, no tax on Social Security, high-income recapture `nyTax`, NYC 3.078%–3.876%; un-indexed amounts deflated). Excel carries the NY tax as a value.
- **Stock options card** (js/input/stock.js, compute/stockOptions.js): any number of grants per person, button to open the editor in its own window; releases dated before today are skipped; gains count as wage (default) or LTCG.
- New test `tests/unit/payroll_ny_stock_test.js`; `tests/baseline.json` and `tests/projection_golden.json` regenerated (wage plans now pay payroll tax; every row has new fields).

## Payroll tax is an expense; hidden chart cards drag again; mc tests checked
- **Payroll tax is now a household expense** (row field `expPayroll`, part of `expTotal`, funded by the waterfall: income, then dividends, asset sales). The wage in income is the whole taxable wage (`wageTotal` = `wageTaxableTotal`). The Household Expenses chart has a new **Payroll tax** band, the income chart's tooltip lists it under expenses, and the Excel export has an `expPayroll` column in Total household expenses.
- **Chart cards: grab handle on a collapsed card** sometimes did nothing until some card was unhidden. Cause (not reproducible without a browser here; found by reading): `dragstart` added `body.chart-dragging`, which reveals the spare bottom row; with short content that made `.chart-col` scroll, the new scrollbar narrowed the grid and the card moved from under the pointer, so the browser cancelled the drag. The class is now added after the drag has started, and `.chart-col` has `scrollbar-gutter: stable`.
- Tests: `mc_test.js` / `mc_inherit_test.js` need plan files (`PLAN=Samples/Couple_Heir.json`; `HEIR=Samples/Couple_Heir.json DONOR=Samples/Widow.json`); both pass with them. `mc_test.js` on `Widow.json` (one person) throws because the test assumes two people: a test limitation.

## Payroll tax not deductible, CA / WA payroll tax, Stock options card
- **Payroll tax no longer reduces the income-tax wage.** Income tax (AGI, brackets, NIIT, state tax) is computed on the gross wage less the pre-tax contribution (plus stock-option wage gains). The payroll tax is still paid out of the wage, so the cash wage on the Income chart is unchanged (`wageTotal`); the taxed amount is the new row field `wageTaxableTotal` (Excel row "Wage taxed as ordinary income" feeds the ordinary-income formula).
- **California and Washington payroll tax** (when State income tax is on for that state): CA SDI 1.3% of all wages; WA Paid Family & Medical Leave 1.13% × 71.43% employee share up to the Social Security wage base, plus WA Cares 0.58% of all wages. The State income tax panel shows an **exempt from WA Cares** checkbox for Washington (`stateTax.waLtcExempt`). Both are part of `payrollTax` and stacked into the row fields `payrollState`, `payrollCaSdi`, `payrollWaPfml`, `payrollWaCares`.
- **Stock options card**: the *Open in new window* button and its editor window are removed. A new checkbox beside the market price chooses *today's $* (default, price held flat in real terms) or *future $* (a fixed nominal price, `marketFuture`).
- **`tests/mc/mc_ui_test.js`** failed on the original zip too and was a **test** problem, not an app bug: chart updates now glide over several animation frames (`chartTweenStart`), and the test's `requestAnimationFrame` was a no-op, so it read the chart mid-transition (the old trial line). The test now queues frames and flushes them before the two inflation-chart assertions.
- Tests: `payroll_ny_stock_test.js` (+11); `tests/baseline.json` and `tests/projection_golden.json` regenerated.

Entries 1–323 are in [`docs/ChangeLog_archive.md`](docs/ChangeLog_archive.md). Newest last.

## 324 — Plans tab
The 🤖 LLM card has a **Plans** tab: the master scenario list with how each plan was made, a stale flag, headline final total, and Show / Delete buttons (delete goes to the plan's source; a scenario asks first, the one on screen cannot be deleted).

## 325 — Trial numbers match the app; every failed trial is listed
The app shows Monte Carlo trials as **#N** (`trial + 1`), while the LLM tools used the raw 0-based index, so "trial 250" in a chat was "#251" on screen. The tools keep their 0-based numbers (nothing existing changes) and now carry both: `get_mc_summary` exemplars, `get_trial` and plan labels / `how` text show `appTrial` / "(#N)". `get_trial` accepts `"#251"` or `"app #251"` (the app's number); `get_scenario` accepts `"mc app #251"` and `"stress+mc Lost Decade app #251"`. `get_mc_summary` (detail) also lists **every failed trial** (`distribution.failures`: trial, appTrial, failAge, shortfall, cause; earliest first, capped at 200) instead of only the four exemplars, so none has to be found by probing. Tests: runs_test (+9), scenario_tools_test (+2).

## 326 — The LLM can read runs done in the page
Monte Carlo and stress runs done with the page's own Run buttons were invisible to the LLM tools: the bridge syncs only the plan, and the tools read only runs the server itself had made ("no Monte Carlo result is available"). Now, while the live bridge is connected, a run that finishes in the page (Monte Carlo card, stress tests, or stress tests + Monte Carlo) sends the plan it ran on and then the **settings it used** (`pageRun` message, `llmBridgeRunDone`); the results themselves are not sent. The server reproduces the run with the same plan, settings and seed, which gives the same trials, as a job flagged `reproducedFromPage` (runs `mcj:<job>` / `mcj:<job>:<scenario>`), and skips a run it already has. Unusable settings (for example more trials than a tool may run) are refused and said on stderr. The cards' settings are page-only (they are not in the plan file), which is why the page sends them. A run done before the bridge was connected is not picked up: press Run again. Not reproduced: saved market-scenario paths in the stress card, the late-life medical shock, and the Monte Carlo panic comparison pass. `rjFromPage` in runJobs.js; tests: bridge_mcp_test (+9, a stand-in page over a real WebSocket), bridge_ui_test (+4).

## 327 — Loading a different plan clears the LLM's runs
The tool server kept every run it had made (jobs, stress run, what-ifs, trial plans, proposals) when the page loaded a different file, flagging them stale instead of dropping them, because it cannot tell an edit from a new plan. The page already dropped its own results on a load or reset (`mcResetCard` / `stResetCard`); now those also call `llmBridgeReplaced()`, so the **next plan sent carries `replaced:true`** (even if its JSON is unchanged, and also when answering a syncRequest). The server then runs `rjClearAll()`: running jobs are stopped and jobs, the stress run, tool drafts, what-ifs in the plan list, proposals and promoted trials are dropped. Editing the same plan is unchanged: its runs stay and are reported stale. Job ids keep counting (a new "j3" is never an old one) and saved market scenarios are kept. Tests: bridge_mcp_test (+6), bridge_ui_test (+3).


## 328 — Docs: the live LLM bridge is marked as still in development
Documentation only; no code or calculation changed. README, Usage (*Send results to an LLM*, *Claude Desktop extension*, *Live bridge*), ARCHITECTURE §13.5 / §13.7, `LLM_INTEGRATION_DESIGN.md` (status, §6.3), the Formulas page (`f-llm`, live-bridge paragraph) and the extension manifest (description and the Live bridge setting title) now say that the live bridge is a preview whose protocol, prompts and settings may change, and that the file export, pasted proposals and the saved-plan MCP server do not depend on it.


## 329 — Saved market scenarios, age axis, passing lines, LTC colours, 5-year averages
- **Saved market scenarios restore and delete.** Loading a plan file (or switching scenario) left the Stress card's *Saved market scenarios* list showing the previous plan's entries (the card was only rebuilt when its settings differed, and the list was not refreshed otherwise), so a saved scenario seemed lost and Remove acted on the wrong list. `stRestore` now always re-renders the list from `state.ui.marketPaths`. Save, restore and Remove were checked end to end (add → Save file → load another plan → reload the file → Remove).
- **X axis** of every time-based chart (not the Social Security start-age chart): the older person's age in black while alive, then the younger person's age in dark blue, then the last two digits of the year in red; the title is "older name (black), younger name (dark blue) age". New `ageAxisInfo` / `ageAxisTick` / `ageAxisNames`, plugin `ageAxisTitle`. Excel's age column header and the text title use the plain "Older, Younger age".
- **Passing lines**: a thin vertical line in the year each person passes on every such chart (plugin `passLines`; older black, younger dark blue), also in Monte Carlo trial and stress views.
- **LTC bar**: younger person's LTC light blue, both people dark blue (was black), older person / single person grey as before; Chart Element text updated.
- **Stretch IRA bar** (Asset Value) covers only the 10 stretch years; it used to run to the axis end whenever the axis was longer than the stretch (trial / scenario views, early passing ages).
- **Market return chart**: 5-year centred average, thick, same colour as the asset; all lines show only the averages, one asset shows its yearly line and the average. **Inflation chart**: the trial's yearly line gets the same thick average (a third dataset, empty on A).
- Tests: `tests/check.js` baseline updated (axis, plugins, market / inflation datasets); `tests/mc/mc_ui_test.js` expects the extra datasets. Docs: Usage (*The age axis, passing lines and the care bar*, Inflation / Market rows), ARCHITECTURE (§3 helpers, §6.2 plugins), Formulas (*Market return and inflation charts*).


## 330 — Younger person's axis pills, percent Rescale
- X axis: the younger person's tick labels (age) are white on a dark-blue pill, and the younger name in the axis title is a white-on-dark-blue pill (plugin `ageAxisTitle`).
- **Rescale** on the Market return % and Inflation rate charts cycles the Y maximum through 10%, 20% … 100% (`pctScale`, `rescaleChart`); the button shows "↕ Max N%". Display only, not saved. `tests/check.js` baseline refreshed.


## 331 — Pill alignment, passing line always shown, Social Security chart axis
- The younger person's tick pills now use Chart.js's own label offset and baseline, so they sit on the same line as the other tick labels.
- The passing lines are always drawn: a passing age beyond the right end of the axis (a late passing age for the younger person) is drawn at the right edge instead of being dropped.
- The Social Security start-age chart gets the same axis (colours, pill) and passing lines as the others.

## 332 — Stack total on hover, 0% line, naming
- Chart Element popups: pointing slightly above (within about 12 px) the top edge of a stacked chart shows the total of the whole stack (for example "Total income", "Total asset value") for that age.
- The Inflation and Market return charts draw a thin solid line at 0% (`zeroLine` plugin).
- Naming: "plan" now means only the saved file. "Scenario" covers your inputs, stress tests, stress + Monte Carlo runs, saved market paths and Monte Carlo trials. User-visible text, the chat prompt, the docs and the LLM tools follow this; the tools are now `list_scenarios`, `get_scenario`, `compare_scenarios`, `show_scenario` and `delete_scenario`.

## 333 — Internal names follow the scenario / plan naming
- "Plan" is kept only for the saved file (loading and saving, plan slots, the live bridge, `PLANNER_PLAN`, storage keys, inherited and linked plan files). Everything else is "scenario".
- Files: `js/plans/` is now `js/scenarios/` (`scenarioStore.js`, `scenarioRecord.js`, `scenarioTools.js`; the producers keep their names), `display/planView.js` is `scenarioView.js`, `tests/plans/` is `tests/scenarios/`, `docs/PLAN_STORE_DESIGN.md` is `docs/SCENARIO_STORE_DESIGN.md`.
- Code: the `pl…` functions are `sc…` (`scGet`, `scList`, `scShow`, …) and `PL_…` constants are `SC_…`; `…PlanKey`, `planProj`, `showPlan` and similar are `…ScenarioKey`, `scenarioProj`, `showScenario`.
- Tool and resource names: the run and ref id for the scenario as entered is now `entered` (the old `plan` is still accepted as a ref and a baseline); `planner://scenario/summary` replaces `planner://plan/summary` (the old URI still reads); response fields `plan` / `plans` are `scenario` / `scenarios`; the stress-panel row class is `st-scenario`.
- Cleanup: removed the unused change-event plumbing (`scEmit`, `scSubscribe`) and `SC_SCHEMA` from `scenarioStore.js`; nothing subscribed to them.

## 334 — Fix: Chart Element popup on the stress-test and Monte Carlo inflation lines
The Chart Element popup showed nothing on the Inflation rate chart's stress-test and stress + Monte Carlo lines (and their 5-year averages), because `chartInfo.js` only described the scenario and `Monte Carlo trial` labels. `inflationChart.js` now builds the trial line's name once (`trialName`).

## 335 — Refactor: one script list
The `<script>` tags of `index.html` are the only list of script files and their load order. A tag the headless engine also needs carries `data-engine="base"` (calculation engine) or `data-engine="scenario"` (scenario / run-registry layer). New `server/scripts.js` (`browserScripts`, `engineScripts`) reads them; `server/engine.js`, `tests/mc/mc_harness.js`, `tests/chat/harness.js` and the five DOM-stub tests no longer carry their own copies, and `build-mcpb.js` writes `js/engine-files.json` (plus `scripts.js`) into the bundle, which has no `index.html`. Load order is unchanged.

## 336 — Refactor: Chart Element text lives with the line
A dataset can carry `info` (string) and `ciDescribe` returns it first. The Inflation rate (scenario, Monte Carlo, stress and stress + Monte Carlo lines), Market return % and Cumulative household SS charts moved to it, so their regex / `case` entries in `chartInfo.js` are gone (and the label-matching bug class with them); the stacked charts followed in 327. ARCHITECTURE §6.7c, §7.2 and the Chart Element and MCPB paragraphs updated. No calculation, Formulas page or Excel change.

## 337 — Refactor: Chart Element text for the stacked charts
`upsertLineChart` takes an `info(dataset)` resolver and stamps `ds.info`; the tables and rules for Annual Household Income / MAGI / taxable ordinary / taxable qualified income, Household Expenses, the three tax charts, Social Security vs tax, Asset Value and IDGT, inherited-asset income, IRA withdrawals and realized LTCG now sit in their own chart files (`infoIncome`, `infoMagi`, `infoOrd`, `infoQual`, `infoExpense`, `infoTax`, `infoTss`, `infoAsset`, `infoInhIncome`, `infoIra`, `infoLtcg`); `ciDescribe` only returns `ds.info`. Checked word for word against the old lookup on 688 datasets (both sample plans, details on, a Monte Carlo trial, a stress test): identical. `tests/mc/mc_ui_test.js` now fails if any line of any chart has no description; `tests/baseline.json` updated (only the added `info` strings).

## 338 — Refactor: computeProjection() split into setup and year phases
The setup (Social Security, IRA and Roth sims, inherited IRAs, annuities, portfolio state, event rows, withdrawal order, stretch) moved into `projX` factories and the year loop into 13 `projYear*` phase functions that share `c` / `carry` / `m`. Output is unchanged.

## 339 — Test: golden hashes for 77 projections
77 projections hashed, to prove a refactor of the engine changes no number.

## 340 — Refactor: one withState() for swapping the global state
Refactor, one `withState(st, fn, adopt)` in `whatIf.js` swaps the global `state` and always restores it; `withTempState`, the run registry, donor trajectory, inheritance import and the scenario record use it instead of their own copies. The global `state` itself remains.

## 341 — Refactor: one place says what the charts are showing
`js/display/trialView.js` (new) declares `mcTrialView` and `viewContext()` → `{loaded, showing, view, trial, state, ltc, label, fileName}`. The charts, overlays, scenario view, app.js and the Excel export ask it instead of reading `mcTrialView` and testing view letters; the `typeof mcTrialView` guards are gone. The trial record is read and written by `mcPanel.js` only; the Excel title and file name for a trial come from `trialLabel` / `trialFileName`.

## 342 — Refactor: large files split by job
`state.js` → `planSlots.js`, `defaults.js`, `state.js`, `persistence.js`; `excelExport.js` → `excelWorkbook.js`, `excelTaxSheet.js`, `excelInputsSheet.js`, `excelAccountSheets.js`, `excelMainSheet.js`, `excelExport.js`; `formulasPage.js` → `formulasPage.js` (assembly), `formulasCss.js`, `formulasSections.js` (the page HTML is byte-identical); `chat.js` → `chatSnapshot.js`, `chatProviders.js`, `chat.js`. Code is moved, not changed; the files load in `index.html` in the old order.

## 343 — Refactor: the run state is in three store objects
`RR` (run registry: `step`, `cache`, `keepNames`, `toolNames`, `proposals`, `pseq`), `RJ` (jobs: `seq`, `jobs`, `stress`, `draft`) and `API_STORE` (`runs`, `seq`) replace the loose globals `RR_*`, `RJ_*`, `apiRuns`, `apiRunSeq`. Behavior is unchanged.

## 344 — Change log archive
Entries 1–323 moved to `docs/ChangeLog_archive.md` (numbers kept); this file holds 324 onward. Entries 324–330 written earlier in this series were numbered over the existing 324–333 and are renumbered 334–340.

## 345 — Code formatted with Prettier
`js/` and `server/` are formatted with Prettier 3.3.3 (`.prettierrc.json`: width 140, single quotes, no bracket spacing, no trailing commas; `.prettierignore` leaves tests, docs, samples and HTML alone). Layout only: the 77 golden projections, the chart baseline, the formulas page HTML and all 38 tests are unchanged. To format after an edit: `npx prettier@3.3.3 --write "js/**/*.js" "server/**/*.js"`.

## 327 — Market return and inflation charts glide when switching scenarios
Switching scenarios (or a Monte Carlo A / B flip) updated these two charts in place, but Chart.js tweens only each point's pixel position: their Y axis refits to the data, so the gridlines and tick labels snapped to the new range at once while the lines were still sliding, and a line that appeared or vanished popped in. `upsertLineChart` takes a new `tween: true` option (used by `marketChart.js` and `inflationChart.js`): the data values and the Y-axis min / max are interpolated together in value space (`chartTweenSnapshot` / `chartTweenStart`, `chartHelpers.js`), same 450 ms easeOutQuart as `CHART_BASE`, one `update('none')` per frame. A switch made mid-animation continues from where the lines are; a line with no old counterpart appears at its final value; a point with a gap on one side takes its end value halfway through; slider drags (`liveDrag`) and `prefers-reduced-motion` skip the animation. Other charts are unchanged. Test: `tests/charts/tween_test.js`.

## 328 — Fix: Rescale on the market return and inflation charts did nothing
The tween added in 327 kept a reference to `chart.options.scales.y` across animation frames, but Chart.js rebuilds `chart.options` on every `update()`, so the later writes to the Y-axis min / max were lost and the axis stayed at its old range (a Rescale click changed only the button label). `chartTweenStart` now reads the axis options afresh on every frame. Checked against the real Chart.js 4.4.1: Rescale glides to the new maximum, and a scenario switch ends on the exact new values and range.

## 346 — Fix: market return and inflation charts jumped instead of gliding on a scenario switch
The glide added in 327 timed itself with the timestamp `requestAnimationFrame` hands to its callback, which is when that frame *began*. A scenario switch keeps the main thread busy for about 300 ms (`recompute`: projection and the other charts) after these two tweens are queued, so by the time the first callback ran the timestamp was already ~300 ms old and most of the 450 ms glide was used up before anything was painted: the lines jumped to ~97 % of the way and then settled. `chartTweenStart` now reads `performance.now()` when each frame runs and starts the glide at the first frame, so the whole 450 ms is shown. Measured in Chromium with the real Chart.js 4.4.1 (switching A → B): before, 3.00 → 4.94 in one frame; after, 3.00 → 3.77 → 4.27 → 4.53 … → 5.00 over ~14 frames. Test: `tests/charts/tween_test.js` (+2: a late first frame with a stale timestamp still starts from the old picture; part-way after 100 ms).


## 330 — Chart Element popups: LTC / passing / unfunded details, Popup Verbose, fixed popup colours
- **LTC bar** popup lists who is on care that year with their age, and the age and year each person's care starts. **Passing line** popup (pointer within a few pixels) names who passes, their age and the year. **Faded red unfunded band** popup (over an empty part of the plot) shows the year's shortfall, when the money first ran out and who is living. New `ciLtcStartText`, `ciPassingAt`, `ciUnfundedAt` in `chartInfo.js`.
- **Popup Verbose** checkbox (header, right of Chart Element, default off). Off: the explanatory paragraph shrinks to an element-supplied `brief` or its first sentence; name, who / when and numbers stay. Inflation and Market return lines (and their 5-year averages) use a one-line `ds.infoBrief`.
- **Popup background slider removed**: one fixed see-through dark theme (`TIP_THEME`); `tipBg`, `setTipBg` and the `tipBgSlider` description are gone.
- No calculation changed. `tests/check.js` baseline needs `--update` (new `infoBrief` dataset field). Docs: Usage (Chart Element, Popup Verbose), ARCHITECTURE (§ popup helpers, Chart Element). Formulas page and Excel export unchanged: they describe calculations, which did not change.

## 347 — Tax chart total with state, split income-tax expense, IDGT AUM box, prorated swap, draggable Inheritance card
- **Total Income Tax chart** (Chart Element popup): the zone just above the stack now reports *Total income tax (federal + state)*, reaching up to the state-tax line, instead of the federal stack only.
- **Household Expenses chart**: the income-tax band is split into **Federal income tax** and **State income tax** bands (row fields `expTaxFed`, `expTaxState`; `expTax` is their sum, a property sale's tax is shared pro rata).
- **IDGT portfolios** now have the **AUM** checkbox (default off; switching a portfolio to IDGT clears it). A checked IDGT counts toward the AUM balance.
- **Asset / basis swap**: each living portfolio's swap is prorated across all eligible IDGTs (by the value each has left) instead of filling the lowest-basis IDGT first.
- **Inheritance card** has the ⋮⋮ drag handle like the other income cards (its header class `item-head wrap` was not matched).
- `tests/baseline.json` regenerated.

## 348 — Chart Tooltip menu, Input Tooltip, Age range box, payroll colour
- **Header**: *Input Element* is now **Input Tooltip**. *Chart Element* is now the **Chart Tooltip** menu: **None** (no chart popup), **Components** (default; describes the element under the cursor, in its short form) or **Complete** (the usual value popups with the line-by-line details). The *Popup Verbose* and *Popup Details* checkboxes are removed (`setChartTip`, `chartTipOff`; `popupVerbose` is gone, `showDetails` is true in Complete).
- **Age range box** left of the Grid button: the last age shown on every chart (`state.ui.maxAge`, saved with the plan, display only; Excel is unaffected). Default and maximum: the age of the last passing plus the IRA stretch years (`chartDefaultMaxAge`, `chartMaxAge`); blank or larger values fall back to that. The asset chart's stretch scrolling is no longer needed (the axis ends where the box says).
- **Annual expenses**: the Payroll tax band is bright gold instead of olive, so it no longer blends with the other bands.
- `tests/baseline.json` regenerated; Usage and Architecture docs updated.

## 349 — Stretch IRA bar with a short Age range; Same scale ignores hidden charts and a stale scale
- The red **stretch IRA** bar no longer appears (as a stub at the left edge) when the Age range box ends before the stretch years; if the stretch runs past the last age shown, the bar is cut there.
- **Same scale** buttons leave out charts the user has hidden (their larger maxima only added empty space). Changing the **Age range** box refits every chart's Y scale (income, expense and tax on one common scale, hidden charts ignored) instead of keeping the scales fitted to the old range.

## 350 — Stock-option wages get their own band on the Annual Household Income chart
- The Annual Household Income chart (and the MAGI and taxable ordinary income charts beside it) draw the stock-option gains that count as wages as a separate **Wage from stock options** band (red), taken out of the **Wage** band, which now shows the salary only. The band sits right above Wage in the stack; totals, MAGI and taxable ordinary income are unchanged.
- Tooltips: the Wage line lists the salary per person, the new line lists the stock-option wage per person, and *Popup Details* adds the stock-option wage with the number of shares released. Chart Element text added for the new band.
- `tests/baseline.json` refreshed (one more dataset on three charts). No calculation changed.

## 351 — Docs and cleanup for the stock-option wage band, test fixes
- Docs: Usage (*Annual Household Income* bullet), ARCHITECTURE §6.4 (stack order, per-person tooltip lines, Show Details line) and the Formulas page (MAGI and taxable ordinary income equations) now describe the **Wage from stock options** band; Wage is the salary only.
- Refactor of `js/display/incomeChart.js`, no behaviour change (the snapshot test is identical): one `incBand` helper builds the filled bands of the primary, MAGI, ordinary and qualified charts; `incSalary` / `incPersonAmounts` hold the wage / stock-option split for the series and the tooltip; `taxableLabel` replaces two copies of the "— taxable part" label; the unused `pick` / `label` locals and an unreachable `return null` in the Chart Element text functions are gone.
- Tests: `tests/mc/mc_harness.js` defaulted its app root to `tests/` (one level too high), so without `PLANNER_ROOT=.` it looked for a bundle's `js/engine-files.json` under `tests/js/` and failed. It now defaults to the app root. (`engine-files.json` is generated only for the MCPB bundle by `server/build-mcpb.js`; nothing needs it in the source tree.)
- `tests/projection_golden_test.js` failed on all 77 projections: a **test** problem, not an app bug. (1) The engine ages people in whole months from today's date, so every projection hash changed from month to month; the test now freezes \"today\" (15 June 2026). (2) The golden file was older than the last engine edits (`projection.js`, `defaults.js`, `state.js`; `baseline.json` had been refreshed since, the golden file had not). Checked before regenerating: the unit tests (payroll / NY / stock options, RMD / NIIT, CA credit) pass, and 24,424 invariant checks over the sample plans, with and without a wage and a stock grant, found nothing (all numbers finite, expenses fully funded, stock wage within wage and summing per person). `tests/projection_golden.json` regenerated.

## 352 — Day / night theme follows the system
- The page and every chart follow the system's light / dark setting (`prefers-color-scheme`), and switch live when it changes. No setting in the app.
- **Page:** a dark block in `css/styles.css` (screen only, so print stays light) overrides the colour variables and the few hard-coded light chips; `color-scheme: light dark` gives dark form controls and scrollbars. The Usage / Tips page (`mdPage.js`), the Formulas page (`formulasCss.js`) and the plan-slot dialog follow too.
- **Charts:** `CHART_THEMES` (light = the old colours, dark) in `chartHelpers.js`; `applyChartTheme` swaps the axis, grid, tick, reference-line, halo, pill, label and age-axis colours, and the canvas plugins (`overlayPlugin.js`, the Asset Value dashed outline, the tax chart's effective-rate line) read `CHART_THEME` instead of fixed `#fff` / `#000` / `#444`. Band colours are unchanged. `chartThemeChanged` (app.js) rebuilds the charts without the draw animation; `initChartTheme` runs first on load. Printing redraws the charts light and returns to dark afterwards (`print.js`).
- Tests: new `tests/charts/theme_test.js` (16 checks); `tests/check.js` snapshot unchanged (light is the old output). Not looked at in a browser here: please check the dark page once, in particular the input cards and the Scenarios / Monte Carlo cards.
