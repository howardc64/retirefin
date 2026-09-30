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
against the pre-refactor code showed identical output, so it also represents the pre-refactor behavior.
