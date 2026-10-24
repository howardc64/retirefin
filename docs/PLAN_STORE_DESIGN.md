# Master plan list (design and status)

One record per plan, whatever defined it. See the header of `js/plans/planStore.js` for the record shape.

| Piece | File | Status |
|---|---|---|
| Spec helpers (fingerprint, resolve, full run, slim summary); inputs `{state}`, `{baseKey, baseFingerprint, overlay}` (stress / market / levers) and `{…, draw}` (seeded trials) | `js/plans/planSpec.js` | done |
| Store (upsert by key, remove, find, reconcile, tombstones, delete routed to the source, summaries seeded or lazy) | `js/plans/planStore.js` | done |
| Producers: 🆎 scenarios, Stress card + tool stress run, Monte Carlo + stress + Monte Carlo + tool jobs, market paths, what-if levers | `js/plans/*Producer.js` | done |
| `rrEntries()` reads the store (plan, scenarios, what-ifs, markets, stress); Monte Carlo groups stay with their cards | `js/compute/runRegistry.js` | done, output identical |
| Tools `list_plans`, `get_plan`, `compare_plans`, `show_plan`, `delete_plan` and the reference lookup | `js/plans/planTools.js` | done |
| `plShow(ref)` opens any plan in the charts via the existing viewers; effects `showPlan` for chat and the live bridge | `js/display/planView.js`, `chatTools.js`, `llmBridge.js`, `server/mcp.js` | done |
| A–F buttons and their stepping | `js/display/mcPanel.js` | unchanged: they step through lists, not ids; they and `plShow` open the same views |
| Delete control in the UI, listing of the whole plan list | | not built (API: `plDelete(ref)`; tool `delete_plan`) |
| Persistence | | nothing new: user-defined plans (scenarios, saved market paths) are saved by their own stores, everything else is rebuilt from its source |

Rules: producers upsert on a semantic key, so a re-run updates in place and ids survive; `plReconcile(owner, specs)` removes the owner's plans that are no longer listed;
summaries are computed lazily by `plEnsureSummary` and cached while the input fingerprint is unchanged. Readers call `plSyncAll()` first (pull model, no edit hooks).

Test: `PLANNER_ROOT=. node tests/plans/plan_store_test.js`

Stress producer rules: fresh results are upserted (a re-run keeps ids); no results removes the plans; results made stale by an edit are kept and report `stale`
(their base plan's fingerprint changed). A stale plan keeps the summary of the run it came from but will not compute a new one.
Producers run in registration order (scenario set first, because stress plans name it as their base). A saved market path that is also a stress row currently appears as
`st:<pathId>`; the market-path producer will add `mkt:<pathId>` for the same overlay applied outside the card.

Monte Carlo producer rules: a run is a group, not thousands of plans. Per run, four exemplar trials (earliest failure, median failure, largest shortfall, typical
success) are plans automatically; any other trial becomes a plan when `plPromoteTrial(trial, src)` is called (src omitted = Monte Carlo alone, or a stress row id for
stress + Monte Carlo; at most 40 promoted). A trial plan stores only the settings and trial number (`{baseKey, baseFingerprint, draw}`, about 0.6 KB) and is replayed
by `mcRunTrial`, which reproduces the run's own trial exactly (tested). A re-run keeps promoted trials and re-evaluates the same trial numbers under the new settings.
`mcResetCard` and `stResetCard` call `plMcClearPromoted()`, so promoted trials do not survive loading another plan. If the card is cleared and re-run between two syncs,
plan ids change but keys do not; use keys across a re-run.

Staleness: a derived plan (stress, trial, what-if) is stale when the plan on screen is no longer the one it was run on (its base fingerprint differs from the live fingerprint). Market plans are
re-based on the plan on screen at every sync, like the registry's market runs. Deleting routes to the plan's source: a scenario not on screen is removed from the set, a what-if run from `apiRuns`,
a market path from the plan; a stress row or trial is hidden (tombstone) until its run is replaced, and the card keeps its results.
