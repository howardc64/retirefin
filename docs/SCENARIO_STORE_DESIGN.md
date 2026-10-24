# Master scenario list (design and status)

One record per scenario, whatever defined it. See the header of `js/scenarios/scenarioStore.js` for the record shape.

| Piece | File | Status |
|---|---|---|
| Spec helpers (fingerprint, resolve, full run, slim summary); inputs `{state}`, `{baseKey, baseFingerprint, overlay}` (stress / market / levers) and `{…, draw}` (seeded trials) | `js/scenarios/scenarioRecord.js` | done |
| Store (upsert by key, remove, find, reconcile, tombstones, delete routed to the source, summaries seeded or lazy) | `js/scenarios/scenarioStore.js` | done |
| Producers: 🆎 scenarios, Stress card + tool stress run, Monte Carlo + stress + Monte Carlo + tool jobs, market paths, what-if levers | `js/scenarios/*Producer.js` | done |
| `rrEntries()` reads the store (plan, scenarios, what-ifs, markets, stress); Monte Carlo groups stay with their cards | `js/compute/runRegistry.js` | done, output identical |
| Tools `list_scenarios`, `get_scenario`, `compare_scenarios`, `show_scenario`, `delete_scenario` and the reference lookup | `js/scenarios/scenarioTools.js` | done |
| `scShow(ref)` opens any scenario in the charts via the existing viewers; effects `showScenario` for chat and the live bridge | `js/display/scenarioView.js`, `chatTools.js`, `llmBridge.js`, `server/mcp.js` | done |
| A–F buttons and their stepping | `js/display/mcPanel.js` | unchanged: they step through lists, not ids; they and `scShow` open the same views |
| Delete control in the UI, listing of the whole plan list | | not built (API: `scDelete(ref)`; tool `delete_scenario`) |
| Persistence | | nothing new: user-defined plans (scenarios, saved market paths) are saved by their own stores, everything else is rebuilt from its source |

Rules: producers upsert on a semantic key, so a re-run updates in place and ids survive; `scReconcile(owner, specs)` removes the owner's scenarios that are no longer listed;
summaries are computed lazily by `scEnsureSummary` and cached while the input fingerprint is unchanged. Readers call `scSyncAll()` first (pull model, no edit hooks).

Test: `PLANNER_ROOT=. node tests/scenarios/scenario_store_test.js`

Stress producer rules: fresh results are upserted (a re-run keeps ids); no results removes the scenarios; results made stale by an edit are kept and report `stale`
(their base scenario's fingerprint changed). A stale scenario keeps the summary of the run it came from but will not compute a new one.
Producers run in registration order (scenario set first, because stress scenarios name it as their base). A saved market path that is also a stress row currently appears as
`st:<pathId>`; the market-path producer will add `mkt:<pathId>` for the same overlay applied outside the card.

Monte Carlo producer rules: a run is a group, not thousands of scenarios. Per run, four exemplar trials (earliest failure, median failure, largest shortfall, typical
success) are scenarios automatically; any other trial becomes a scenario when `scPromoteTrial(trial, src)` is called (src omitted = Monte Carlo alone, or a stress row id for
stress + Monte Carlo; at most 40 promoted). A trial scenario stores only the settings and trial number (`{baseKey, baseFingerprint, draw}`, about 0.6 KB) and is replayed
by `mcRunTrial`, which reproduces the run's own trial exactly (tested). A re-run keeps promoted trials and re-evaluates the same trial numbers under the new settings.
`mcResetCard` and `stResetCard` call `scMcClearPromoted()`, so promoted trials do not survive loading another plan. If the card is cleared and re-run between two syncs,
scenario ids change but keys do not; use keys across a re-run.

Staleness: a derived scenario (stress, trial, what-if) is stale when the scenario on screen is no longer the one it was run on (its base fingerprint differs from the live fingerprint). Market scenarios are
re-based on the scenario on screen at every sync, like the registry's market runs. Deleting routes to the scenario's source: a scenario not on screen is removed from the set, a what-if run from `apiRuns`,
a market path from the scenario; a stress row or trial is hidden (tombstone) until its run is replaced, and the card keeps its results.
