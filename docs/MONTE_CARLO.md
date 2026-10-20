# Monte Carlo add-on — what changed and how to use it

Built on `Archive_updated_v33` (the folder inside your v40 zip). No plan data of any kind is in the app or the tests: tests read plan files you point them at.

## Changes to existing files
| File | Change |
|---|---|
| `js/compute/projection.js` | `MC_HOOK` + `gk()` at 9 growth sites; `MC_INFL` + `cpiAt()/infAt()/growIdx()` replacing every constant-rate inflation formula. Both null in normal use: output identical to the original engine (compared row by row). |
| `js/input/inheritance.js` | `inhExtractFromProj` also returns `donor` (see below); `inhApplySource` stores it on the source. |
| `js/input/liveLink.js` | The live snapshot carries `donor`; the subscriber validates it with `sanitizeDonorBlock` before storing it. The body is cached per projection (the donor table costs one extra projection). |
| `index.html`, `js/app.js`, `css/styles.css` | Card markup, two script tags, one `mcMarkStale()` call, `.mc-*` rules. |

## New files
- `js/compute/monteCarlo.js` — seeded RNG, samplers, trial runner, summaries, failure reasons. No DOM.
- `js/compute/donorTraj.js` — builds / validates the donor table (inheritance).
- `js/display/mcPanel.js` — the card (Hide checkbox, settings groups, results, two charts).
- `tests/mc_*.js` — Node harness running the real engine in a `vm`.

## What is random
| Part | Model |
|---|---|
| Returns | Lognormal factor with mean 1 on every growth rate; equity-like assets share a market shock (correlation `rho`); real estate has its own. |
| Lifespans | Gompertz (modal age 87, spread 10; unisex placeholder for an SSA table). Replaces the "passes at age" sliders. |
| Long Term Care | Probability, duration and cost draws; not before 65. Replaces every LTC card, an inheritance source's too. |
| Inflation | AR(1) around the plan's rate; moves fixed-dollar items and fixed/custom nominal growth. |
| Inheritance | Each source plan gets its own lifespan and care draw and the household's market shocks. The asset arrives in that plan's last-passing year, worth that year's value from the table captured at import. Optional haircut. |

A part that is switched off uses the plan's own figure (for the donor too), so with every part off a trial equals the deterministic projection exactly.

## Inheritance: how the data gets there
At import (file or live link) `buildDonorBlock` runs the source plan once more on a private copy with its LTC off and its last person (by calendar year) alive to 110, and stores, per asset, the value at the end of every year, plus each person's birth date, planned passing age and LTC settings (no names). About 1–2 KB per source. It is refreshed with every import and every live update, so it cannot go stale against the asset values. Sources imported before this version have no table: they stay exactly as planned, and the card says "re-import it to simulate".

Inherited assets are scaled, not replaced: balance x (sampled value / the plan's own value), start year shifted by the difference in the donor's last-passing year, so your % choices and edited fields are kept.

## NOT random yet
Social Security / pension amounts, tax law, LTC cost inflation above CPI, who receives the asset if the heir has passed (the engine's existing rules apply).

## Tests (run from the app folder)
```
PLAN=your-plan.json node tests/mc_test.js
HEIR=heir-plan.json DONOR=donor-plan.json node tests/mc_inherit_test.js
```
`mc_test`: randomness off == deterministic; return factor mean 1; inflation; reproducibility. `mc_inherit_test` (16 checks): table equals the importer's value to the dollar at the planned last-passing row; save/load round trip; validator rejects malformed blocks; all-off == deterministic; old sources unchanged; early/late donor passing moves the arrival; haircut exact; more care means less; returns mean-preserving; same seed same result. Also passes with a married two-person donor.
The card itself was exercised with a stub page and Chart.js, not a real browser.

## Studying a trial (added)
`mcReplayTrial(cfg, i)` reruns trial *i* with the same seed and returns its full projection, its private copy of the plan (drawn lifespans, care, inheritance) and its inflation path; `mcFailureReasons(...).list` lists every failed trial (earliest first). The card's "Study one trial" row loads one into the chart grid (`mcLoadTrial` in `display/mcPanel.js`): `lastProjection` is set to the replay and `recompute()` keeps feeding it to the charts until the plan changes, a new run starts or "Back to plan" is clicked. Test: `PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/mc_replay_test.js` (replay equals the run exactly) and `tests/mc/mc_ui_test.js` (view, banner, inflation chart, arrival markers, with a stub DOM).

## A/B comparison (added)
Loading a trial computes both projections: A = the plan as entered, B = the trial. `lastProjection` follows the A / B switch (`mcTrialShown()`), `mcFitBoth()` fits every chart's Y scale to the larger of the two, and `mcCaptureGhosts()` keeps A's lines so they can be drawn dashed behind B. Rescale on a chart refits it to what is showing (the flip then moves that chart's axis too). The two projections' age axes start at the same age but can end at different ages (the IRA stretch years follow each one's passing ages), so the asset chart may have a few more or fewer points on one side.

## C: successful runs (added)
"Any trial #" can name a trial that stayed funded: `mcLoadTrial` sends it to C (Success), never to B (Failure), and starts the A/B/C/D view with B empty (its button stays disabled until a failed trial is loaded).

The banner's switch has a third button, **C · Success**. `mcOkTrials()` lists the trials that stayed funded (`failK<0`, in trial order); `mcCPress()` / key **C** shows the next one (`mcLoadSuccess` replays it like any trial), **Shift+C** the previous, wrapping around. The view keeps two records, `mcTrialView.b` (the loaded trial) and `mcTrialView.c`; the fields of whichever is shown (`proj`, `state`, `cap`, `trial`, `pos`, `cause`) are also copied onto the view (`mcUseTrial`), so every chart and overlay that reads `mcTrialView.state` / `.cap` keeps working. `mcFitBoth` fits the scales to A, B and C together.

## Market return chart (added)
`computeProjection()` records, for every growing asset, the growth rate the engine actually used each year (`proj.rates[k][assetKey]`, real terms) and that year's inflation (`proj.inflRate[k]`). `display/marketChart.js` shows the nominal return, `(1+real)(1+inflation)-1`, per asset. Batch trials switch recording off (`REC_RATES`), so a 10,000-trial run pays nothing; `mcReplayTrial` turns it on.

## Spending guardrails (added)
With `state.guardrail.enabled` every trial (and every stress scenario) runs with the household cutting discretionary spending when its withdrawal rate drifts too high (rule and settings: Expenses card; code: `projection.js`, `G` / `gMult`). Nothing about the random draws changes, so a paired run (guardrails off, then on, same seed) isolates what the rule does. `mcMeasure` adds `guard` (first cut row, deepest cut, years cut, total given up, living-expense path); `mcSummarize` adds `guard` (share of trials that cut, depth, the P10 / P50 / P90 living-expense fan). A trial counts as failed only if even the essential spending cannot be paid, so always read the success rate next to the cut statistics. Test: `PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/guardrail_test.js`.

## Systemic panic (added)
`returns.panic` = `{enabled, rhoPanic, trigger, holdYears, includeRE, rhoRE, compare}`. `mcPath` marks panic years (`path.panic[k]`: the market shock is below `trigger` in year k or in one of the previous `holdYears-1` years). In `mcFactor` a panic year uses `rho_k = max(rho, rhoPanic)` for portfolios (`z = sqrt(rho_k) zMkt + sqrt(1-rho_k) idio`) and, with `includeRE`, `rhoRE` for property (otherwise 0). Because rho_k depends on the shock, z is no longer standard normal; the factor is `exp(sig z) / E[exp(sig z)]` with the exact mean from `mcPanicNorm` (so a plan with the same average return as before still averages exactly that). `mcMeasure` / `mcSummarize` add `panicOn`, `panic10` and `S.panic`; the card's optional paired pass re-runs the same trial numbers with `panic.enabled=false`. Test: `PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/panic_test.js`.

## Late-life medical shock (added)
`state.medShock` adds an itemized medical cost inside the Long Term Care cost line; see `projection.js` (`expMed`) and `stressTest.js` (`stMedRun`, `stMedKeys`). Test: `tests/mc/medshock_test.js`.

