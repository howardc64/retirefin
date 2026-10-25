## Change Log

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
