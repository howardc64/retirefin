# Retirement Income Planner

A browser-based retirement income and tax planner for a single person or a married couple. Enter your household's finances in today's dollars and it projects income, taxes, expenses and asset balances year by year, with charts that update as you type. There is no build step, no server and no account: it is plain HTML, CSS and JavaScript.

> **Not financial, tax or legal advice.** It is a simplified model (2026 federal tax basis, no AMT or credits, itemized deductions limited to Long Term Care cost above 7.5% of AGI). Use it to explore scenarios, not as a forecast.

## Features

- **Household setup** for one person or a couple: inflation, living expenses, and optional assumptions (short-term capital loss carryforward, AUM fee, long-term care, spending guardrails, late-life medical shock).
- **Income and assets** per person: Social Security, wages, pension, rentals, annuities, pre-tax IRA / 401(k), Roth IRA, brokerage portfolios (living-expense or IDGT) and real estate, with cost basis, dividends and distributed capital gains.
- **Tax modeling**: federal brackets, taxable Social Security, long-term gains, NIIT, IRMAA, the enhanced senior deduction, and state income tax for California or Washington.
- **Planning levers**: Roth conversions (fixed, or to a bracket / IRMAA limit, with several start triggers), RMDs, IRA stretch, and a configurable order for paying expenses from the accounts.
- **Charts** in a draggable 2- or 3-column grid: annual expenses, income, MAGI, taxable ordinary and qualified income, total / ordinary / qualified tax, asset value, IRA, LTCG, inheritance income, Social Security, inflation and market returns. In the 3-column grid any chart can be **enlarged to 2×2 cells** with the other charts beside it. Hover popups show the detail behind each number.
- **Monte Carlo simulation**: re-runs the plan with random returns, a systemic-panic mode, lifespans, long-term care, inflation and inheritance, explains why trials fail, and loads any single trial into the charts.
- **Stress tests**: Lost Decade, stagflation, a 1966 retiree and a late-life medical shock, optionally combined with Monte Carlo.
- **Inheritance** from another plan file, and **two plans linked live** (parent in one tab, heir in another).
- **Scenarios** to create, switch, compare and delete variants of a plan; **Notes** for the whole plan and per scenario.
- **Save / Load** plan files (JSON), **Export to Excel** with live formulas for the main tax chain, and a **Formulas** page documenting every equation.
- **🤖 LLM button**: download every scenario and result (user scenarios, what-ifs, stress tests, Monte Carlo) as one file for any external LLM, and review the scenarios an LLM proposes before anything touches your plan. A live bridge (`node server/mcp.js --bridge`) lets an MCP host such as Claude Desktop work on the plan on your screen; the chat also accepts any OpenAI-compatible server.
- **Optional chat** that answers questions about your plan and runs what-ifs through the app's own projection engine (you supply your own Google Gemini or Anthropic API key).

## Getting started

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

- **Use Chrome.** All testing was done in Chrome. In Chrome, Save overwrites the same file; other browsers ask for a file name on every save.
- Serving over `http://localhost` is needed for the live parent/heir link and the chat; most of the app also works from `file://`.
- Chart.js, SheetJS and the Google fonts load from CDNs, so the first load needs internet access.
- Try the example plans in `Samples/` (`Couple_Heir.json`, `Widow.json`) from the **Load file** menu.

## Privacy

Everything runs in your browser. Plans are autosaved to the browser's local storage and saved to files you choose. Nothing is sent anywhere unless you use the chat, which sends a text snapshot of your inputs and results to the provider whose API key you supply. Names are withheld unless you opt in, and the key is never written to a plan file.

## Documentation

| File | What it covers |
|---|---|
| [`misc/Usage.md`](misc/Usage.md) | User guide: every panel, card, chart and button |
| [`misc/Note4User.md`](misc/Note4User.md) | Planning observations (Social Security timing, Roth conversions, IRMAA, widow taxation) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | File-by-file spec: state schema, projection row schema, tax rules, load order, with diagrams |
| [`docs/MONTE_CARLO.md`](docs/MONTE_CARLO.md) | Monte Carlo and stress-test design |
| [`ChangeLog.md`](ChangeLog.md) | Numbered history of changes |
| [`tests/README.md`](tests/README.md) | How the regression tests work |

The app also has built-in **Usage**, **Formulas** and **Tips** pages.

## Project layout

```
index.html          page shell; script load order matters (see docs/ARCHITECTURE.md §7.2)
css/styles.css
js/
  core/             constants, helpers, state (single source of truth for inputs)
  input/            input cards and controls; write into `state`
  compute/          projection engine, tax, RMD, Social Security, Monte Carlo, stress tests
  display/          Chart.js charts, chart grid, panels, Excel export, chat
  app.js            boots the app, wires input changes to recompute and redraw
Samples/            example plan files
tests/              Node regression tests
```

The design rule: **Input** writes `state`, **Compute** turns `state` into one projection row per year, and **Display** only reads those rows. Compute never touches the DOM, and Display never recomputes what the projection already holds.

## Tests

Node 18+ only; no install and no browser needed.

```
node tests/check.js              # snapshot of every chart's data and tooltips vs tests/baseline.json
node tests/chart_big_test.js     # enlarged-chart layout model
```

Engine tests live in `tests/mc/` and `tests/unit/` and take a plan file, for example `PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/niit_withdraw_test.js`. See [`tests/README.md`](tests/README.md). These tests cannot catch CSS or layout problems or Chart.js drawing; check those in a browser.

## License

[MIT](LICENSE) © 2026 howardc64
