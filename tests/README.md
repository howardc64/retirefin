# Regression tests

A snapshot test for the display layer. It needs only **Node 18+** (no npm install, no browser, no build step).

## What it does

`snapshot.js` loads the app's real scripts — in the same order as `index.html` — into a Node `vm` with a
stub DOM and a recording stand-in for Chart.js. It then drives a fixed scenario and writes everything the
charts would have received to JSON:

- **Scenario:** two people; wages, Social Security (one already collecting-age claim, one delayed), pension,
  rental, pre-tax IRA (stretch + Roth conversion), Roth (stretch), a brokerage portfolio paying expenses, an
  IDGT portfolio, living expenses, an AUM fee, SCGL, and a future NIIT-threshold change.
- **Passes:** first render; then edit inputs and re-render (exercises the update-in-place path); Rescale;
  `resizeAllCharts()`; `destroyCharts()`; rebuild.
- **Captured:** every chart's full config and datasets, Y-axis locks, legend HTML, the unrealized-gain lines,
  the Social Security metrics, the future-tax panel and income-card HTML, the first 40 projection rows, and
  the **tooltip output** (title / each label / afterBody / footer) at five ages on every chart.

Random IDs are seeded, so two runs on the same code are byte-identical.

## Usage

```
node tests/check.js            # snapshot the current code and compare with tests/baseline.json
node tests/check.js --update   # accept the current output as the new baseline
```

Exit code `0` = identical, `1` = differences (listed), `2` = could not run.

Lower-level pieces, if you want them:

```
node tests/snapshot.js [out.json] [appRoot]
node tests/compare.js [expected.json] [actual.json] [--ignore=/path/one,/path/two]
```

## Workflow

- **Pure refactor** (no intended output change): run `node tests/check.js`. Anything but "Identical" is a
  regression to investigate.
- **Intentional change** (new chart text, a tax-rule update, a new input): run `check.js`, read the diff to
  confirm it shows *only* what you meant to change, then `node tests/check.js --update` and commit the new
  `baseline.json`.
- **New chart or field:** add it to the scenario in `snapshot.js` if the current scenario doesn't reach it.

## Limits

This checks *data*: what each chart is given and what its tooltips say. It does **not** render anything, so it
cannot catch CSS/layout problems, Chart.js drawing issues, the overlay plugin's canvas painting, or browser-only
behavior (file pickers, `localStorage` across reloads, the Hide checkboxes' visual effect). Those still need a
quick look in a browser.

`baseline.json` was captured from the refactored code (ChangeLog entry 57) after a before/after comparison
against the pre-refactor code showed identical output, so it also represents the pre-refactor behavior.against the pre-refactor code showed identical output, so it also represents the pre-refactor behavior.

`baseline.json` was re-captured after entry 276, when the scenario in `snapshot.js` was updated to the current state shape (rentals are now a list) and the baseline caught up with the 270-odd entries since it was first written (17 charts instead of 7).

## Monte Carlo tests

`tests/mc/` holds the Monte Carlo tests; see docs/ARCHITECTURE.md §10.5 and `docs/MONTE_CARLO.md`. They take plan files from the caller (`PLAN=… node tests/mc/mc_test.js`) except `mc_ui_test.js`, which needs nothing.

`tests/mc/xlsx_trial_test.js` checks the Excel export of a Monte Carlo trial (the MC trial sheet, the deflator and account-sheet growth formulas, the trial's own Inputs) and that a plan still exports with constant-rate formulas. It needs only Node.
For an end-to-end check, write the workbook with the real SheetJS (`npm i xlsx`), open it once in LibreOffice (or Excel) so it recalculates, and compare each formula cell with the value the app cached: there should be no differences.

`tests/charts/stack_zero_test.js` checks the Chart Element stack total (a pointer slightly above the top of a stack gives the total of the filled bands; at or below the top edge gives the band) and the `zeroLine` plugin (`PLANNER_ROOT=. node tests/charts/stack_zero_test.js`, no browser).

`tests/chart_big_test.js` checks the Enlarge-a-chart layout model in 3×N (`node tests/chart_big_test.js`, no browser): 2×2 footprint, displaced charts, refusing overlapping blocks, drag clamping, row compaction, 2×N round trip, and that save → load keeps the flag. CSS sizing is not covered (check it in a browser).

`tests/unit/rmd_niit_test.js` (RMD start age, NIIT on rentals and property sales) and `tests/unit/ca_credit_phaseout_test.js` (California exemption-credit phase-out) need only Node: `node tests/unit/<file>`.

`tests/mc/niit_withdraw_test.js` checks Portfolio withdraw's Accept NIIT checkbox (`PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/niit_withdraw_test.js`).

`tests/mc/aum_ira_test.js` checks the AUM box on the pre-tax IRA, Roth IRA and inherited IRA cards (fee = rate × start-of-year balance, additive with portfolios, fixed-$ mode, fee off, save/load, older saves): `PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/aum_ira_test.js`.

`tests/mc/stress_test.js` checks the stress-test engine (`compute/stressTest.js`, docs/ARCHITECTURE.md §11): `PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/stress_test.js`.

`tests/inplace_update_test.js` checks `updateChartInPlace` (chartHelpers.js): when the dataset list changes length, surviving datasets keep their object identity (so Chart.js tweens them) and only the new line is fresh: `node tests/inplace_update_test.js`.

`tests/mc/guardrail_test.js`, `guardrail_ui_test.js`, `panic_test.js`, `medshock_test.js`, `medshock_ui_test.js` and `xlsx_guardrail_test.js` cover the spending guardrails (docs/ARCHITECTURE.md §4.6a), systemic panic (§10.6), the late-life medical shock (§4.6b, §11.7) and their Excel export (§6.11); run each as `PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/<name>.js` (the `_ui_` ones need no plan arguments beyond `PLAN`). `tests/xlsx_e2e/` recalculates the exported workbook in LibreOffice and compares every formula cell (read its README first: LibreOffice must be set to always recalculate, or the check proves nothing).

`tests/chat/` tests the chat's scenario tools (docs/ARCHITECTURE.md §12): `node tests/chat/spec_test.js` and `node tests/chat/tools_test.js` need only Node; `node tests/chat/e2e_browser.js` drives the real app in Chromium against a scripted Gemini / Anthropic API (install `playwright-core` and `chart.js@4.4.1` in `tests/chat/`, set `CHROMIUM` if Chromium is not at the default path).

## Market scenarios / tool API

```
node tests/market/market_test.js      # path model, dense resolution, tool API, MCP shapes (both sample plans)
node tests/market/market_ui_test.js   # chat tool -> effect -> D view -> Stress card (stub DOM, real scripts)
node tests/llm/runs_test.js           # run registry, analysis bundle, import, LLM read tools (Node only)
node tests/llm/llm_ui_test.js         # the 🤖 LLM popup: export, import, proposals (stub DOM, real scripts)
node tests/llm/jobs_test.js           # stress / Monte Carlo definition tools, background jobs, limits, host gating
node tests/llm/mcp_test.js            # the MCP stdio server over a real pipe (needs Node only)
node tests/llm/bridge_test.js         # live bridge server: pairing code, rotation, Host guard, frames, effect round trip
node tests/llm/bridge_mcp_test.js     # MCP server --bridge over a real pipe and a real WebSocket (page plan, stale runs, effects, noPage)
node tests/llm/bridge_ui_test.js      # page side: connect, plan sync, per-kind effect approval, nothing without a click
node tests/llm/sync_test.js          # staying in step: planVersion, planChanged once after an edit, sync before each tool call, silent page, plan file edits
node tests/llm/mcpb_test.js          # the Claude Desktop extension: build, unpack into an empty folder, run; manifest agrees with the server
node tests/llm/openai_test.js         # OpenAI-compatible chat provider: endpoint rules, request / stream mapping, a full tool round
```

## Master plan list
```
PLANNER_ROOT=. node tests/scenarios/scenario_store_test.js   # store, producers (scenarios, stress, Monte Carlo, stress + MC), staleness, tombstones
PLANNER_ROOT=. node tests/scenarios/scenario_tools_test.js   # list_scenarios / get_scenario / compare_scenarios / show_scenario / delete_scenario, reference lookup, scShow dispatch
node tests/scenarios/e2e_browser.js                       # the real app in Chromium (needs playwright + a Chromium; Chart.js / xlsx replaced by stand-ins)
```
`rrEntries()` is built from the store; to check a change to it, dump `rrListRuns()` plus every `get_run` / the bundle before and after and diff (the refactor that introduced it produced zero differences).
