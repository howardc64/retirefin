# Retirement Income Planner — Usage

> **Use Chrome.** All testing was done in Chrome. Browsers such as Safari and Firefox cannot write a file automatically: every **Save** asks for a file name and puts the file in the Downloads folder (on macOS), which makes the common habit of saving your work quickly as you go confusing. In Chrome, **Save** overwrites the same file without asking.

Everything is entered in **today's dollars**, and the charts are drawn in today's dollars too, so you can read them without adjusting for inflation.

## Contents

1. [Quick start](#quick-start)
2. [Features at a glance](#features-at-a-glance)
3. [Household and planning panels](#household-and-planning-panels)
4. [Income and assets](#income-and-assets)
5. [The top buttons](#the-top-buttons)
6. [Reading the charts](#reading-the-charts)
7. [Paying expenses and reinvesting income](#paying-expenses-and-reinvesting-income)
8. [Annuities](#annuities)
9. [Real estate](#real-estate)
10. [Rental income and tax-exempt income](#rental-income-and-tax-exempt-income)
11. [Inheritance](#inheritance)
12. [Two plans linked live](#two-plans-linked-live-parent-heir)
13. [Annual withdraw and Roth conversions](#annual-withdraw-and-roth-conversions)
14. [Asset Value chart: the withdraw cost sliders](#asset-value-chart-the-withdraw-cost-sliders)
15. [Tax features worth knowing](#tax-features-worth-knowing)
16. [Monte Carlo simulation](#monte-carlo-simulation)
    - [Stress tests](#stress-tests)
17. [Ask about this plan](#ask-about-this-plan)

## Quick start

1. Open the three panels at the top: **General**, **Expenses** and **Tax & Optimizations** (see *Household and planning panels*).
2. Under **Income & Assets**, fill in each person: birth date, Social Security, wages, pension, rentals, pre-tax IRA / 401(k), Roth IRA, brokerage portfolios, real estate. Switch an item on with its checkbox, then fill in its details.
3. Read the charts below the inputs. They update as you type.
4. Click **Save** often (Chrome overwrites the same file each time).

## Features at a glance

- **Household setup** for a single person or a married couple, with inflation, living expenses and optional assumptions (SCGL, AUM fee, long-term care).
- **Income & assets** for each person: Social Security, wages, pension, rental properties, **annuities**, pre-tax IRA / 401(k), Roth IRA, brokerage portfolios and **real estate**.
- **Brokerage portfolios** as either *Living expense & income* or *IDGT*, with growth, dividends, cost basis and optional AUM fee.
- **Roth conversions**, RMDs and IRA stretch after the last passing.
- **Tax modeling**: federal brackets, taxable Social Security, long-term gains, NIIT, IRMAA and the senior deduction.
- **Charts** for Social Security claiming age, annual income, taxes, expenses, asset value, IRA, LTCG and inheritance income.
- **Monte Carlo simulation**: re-runs the plan with random returns, lifespans, care, inflation and inheritance, then lets you load any single trial into the charts.
- **Inheritance** from another plan file, and **two plans linked live** (parent in one tab, heir in another).
- **Drag to reorder** the income cards (spouses move together); the order is saved with the plan.
- **Save / load** plans, **Export Excel**, a **Formulas** reference and an optional **chat** to ask about your plan and run what-ifs that are charted for you.

## Household and planning panels

### General panel

- **Filing status:** *Single / widowed* or *Married*.
- **Each person's setup:** birth date and passing age.
- **Inflation rate:** also used as the Social Security COLA.
- This panel has one **Hide** box for the whole panel.

### Expenses panel

| Card | What it does |
|---|---|
| Household living expenses | Yearly spending in today's $. |
| Long Term Care | Single household: starts at $7,500. Married: the 1st LTC expenses follow your living expenses until you change them; the 2nd defaults to $15,000. |
| Expense shortfall withdrawal order | Lets you choose where money comes from when income and dividends do not cover the year's expenses (below). |
| Advisory (AUM) fee | Fee on every account whose *AUM* box is checked: *Living expense & income* portfolios, pre-tax IRAs, Roth IRAs and inherited IRAs (IRAs count at their start-of-year balance before the RMD); IDGTs are never charged. |
| Spending guardrails | Off by default. Cuts next year's discretionary spending when the withdrawal rate drifts too high (below). |
| Late-life medical shock | Off by default. An extra, itemized medical cost for a few years late in life (below). |

**Expense shortfall withdrawal order** (switch it on, then build the list):
- Add, reorder (▲ ▼) and delete steps; each step names one asset: a portfolio, a pre-tax IRA, a Roth IRA or a property to sell.
- Steps are tried top to bottom, each taking what is still needed. Assets you do not list are never drawn on.
- Taxes follow the asset: portfolio sales realize capital gain on their gain share, pre-tax IRA draws are ordinary income, Roth draws are tax-free.
- Selling a property sells the whole property at the start of that year. Its gain is taxed as long-term capital gain and any proceeds not needed move to the property's designated portfolio.
- With the card off, the built-in order is used: Living expense & income portfolios, then pre-tax IRAs, then Roth IRAs.

**Spending guardrails** (switch the card on). Without them the plan spends the same amount every year until the money runs out. With them the household cuts back when the markets do, and the stress tests and Monte Carlo then show *where* the cut-back starts instead of just whether the plan fails.
- **The rule.** At the end of each year the planner computes the **withdrawal rate**: what the portfolios must pay for the year (living expenses, Long Term Care, IRMAA, fees and tax, less Social Security, pensions, wages, rent and annuity income) divided by the invested balance (portfolios, IRAs, Roth, inherited IRAs) at the *start* of that year. If it is more than the **band** (default 20%) above the starting rate, **next year's discretionary spending is cut** by the **cut %** (default 10%).
- **Starting rate.** *First year without wages* (the default) or a *Target rate* you enter. The first year after wages is also the baseline for later years, so a year with a Roth conversion or a lump sum there makes it unrepresentative: use a target rate in that case.
- **Discretionary share.** The part of living expenses that can be cut (default 30%). The rest is essential and is never cut; a cut applies to the discretionary part only, and compounds (two cuts leave 90% × 90% = 81% of it). Cuts stay unless **Prosperity rule** is on, which raises spending again (never above the plan's amount) when the rate falls by the same margin.
- **No changes in the last N years** (default 15) follows the Guyton–Klinger rule of not cutting late in life. **Leave the Long Term Care cost out of the rate** makes the rule react to the markets only, not to a care event.
- **What you see.** In the Stress tests card, a table with and without guardrails, the age of the first cut and the **invested balance that tripped it** (the tripwire), the deepest cut and the spending given up. In the Monte Carlo card, the share of trials that had to cut, when, how deep, and the years below plan. Read the success rate **together with** how often and how deeply the household cut: a plan can "succeed" only because it cut a lot. The Excel export has the rate, cut line and tripwire as formulas.

**Late-life medical shock** (switch the card on). A large medical cost for a few years late in life (default $100,000 a year for 3 years from age 80, in today's $), on top of any Long Term Care card.
- It is counted as a Long Term Care cost: it is an **itemized medical deduction** (the part above 7.5% of AGI, and California's medical deduction if state tax is on), it is paid from your accounts in the **withdrawal order**, and it appears in the Household Expenses chart under *Long Term Care / medical shock*. Living expenses do **not** switch to the care amount. Nothing is charged for a person who has died.
- Selling taxable holdings to pay it realizes capital gains, and the gains raise AGI, which shrinks the medical deduction; the planner solves that circularity as it does for any other sale.
- The **Stress tests** card has a *Late-life medical shock* group that shows what the shock forces without changing your plan (below).

### Tax & Optimizations panel

| Card | What it does |
|---|---|
| Suspended capital-gain loss (SCGL) | Carryforward used against realized gains. |
| Asset / basis swap | Swaps *Living expense & income* assets with *IDGT* assets (below). Unchecked by default, above Long Term Care. |
| Speculative future exemptions and brackets | Assumptions for the years after the last passing. |
| Portfolio withdraw | One slider for every non-IDGT portfolio. See *Paying expenses and reinvesting income*. Unchecked by default. |
| State income tax | California or Washington (below). Unchecked by default. |

**Asset / basis swap:**
- When checked, living-portfolio assets are swapped, value for value, with IDGT assets. The basis moves in proportion to the assets traded, so the IDGT ends up with the high-basis assets and the living portfolio with the low-basis ones, which step up at the last passing.
- Enter how many **years before the last passing** to swap. If married, the swap is also done the year after the first person passes, when that person's portfolio steps up (no value needed).
- A swap only happens where the IDGT's assets have a lower basis % than the living portfolio's, and both portfolios must track cost basis. The amount is the smaller of the two values.
- A swap is only between portfolios held by the same person. A portfolio marked **Joint owned with spouse** is held by the spouse once its owner has passed; one without it is gone, so it cannot be swapped.
- Because the living portfolio then holds low-basis assets, it realizes more gain if it sells to pay expenses.

**State income tax:**
- **California** taxes income with its own brackets (Social Security is exempt).
- **Washington** taxes only long-term gains from portfolio sales above about $278,000 a year (7%, 9.9% above $1M).
- The tax is paid as a household expense and shows on the Total Income Tax chart as a cyan dotted line stacked above the tax bands. It is not counted in Total Tax or the effective rate.

### How the cards behave

- Each feature in the Expenses and Tax & Optimizations panels is its own card with an **Enable** box on the left and a **Hide** box on the right.
- **Enable** unticked: the plan ignores that feature but keeps what you typed.
- **Hide** ticked: collapses just that card to save space, without changing the plan.
- These cards start hidden; untick a card's **Hide** box to open it.
- An unchecked card shows **not used** after its title, so a blank partner card is easy to understand; matching cards of both partners always stay in the same row.
- Long grey help texts show two lines with a **More** link; click it to read the rest (**Less** folds it again).

## Income and assets

### Items and common fields

- Most items have an **age range** (when the amount starts and stops) and an **annual change** (how the amount grows or shrinks in real, today's-dollar terms).
- In a married plan, an owned item (rental, brokerage portfolio, real estate, annuity) can be marked **Joint owned with spouse**. A jointly owned portfolio or property also gets a full basis step-up at either spouse's passing.
- In a married plan, an IRA (pre-tax or Roth) or a pension can be marked **Inherited by spouse**.
- In both cases the spouse owns (or receives) the item after the first person passes.

### Brokerage portfolio types

| Type | Behavior |
|---|---|
| *Living expense & income* (default) | Its dividends and sales pay household expenses; excess income is reinvested into it (if Reinvest excess income is checked). |
| *IDGT* | Outside the taxable estate; charted separately; does not pay expenses or receive excess income; never charged the AUM fee. |

### Distributed LTCG

Each brokerage portfolio has a **Distributed LTCG** setting for capital gains the portfolio pays out each year, like a fund's capital-gain distribution. Choose **% of total / yr** (the default, at 0%) or **Amount / yr (inflation-adjusted)**, a fixed amount in today's dollars.

- It is long-term capital gain income and is taxed every year, whether or not any shares are sold. It counts with LTCG everywhere (qualified income, taxable Social Security, NIIT, state tax, the LTCG chart).
- Like a dividend it is cash the portfolio pays out: it can pay household expenses, and whatever is not spent is reinvested and adds to the cost basis.

### Hiding one person's column

- In a married plan every person's Income & Assets column has a **Hide** button at the top right. Hiding John collapses his column to a thin tab (his name, reading *John ▸ show*) and gives Jane's column the whole width of the input area; click the tab to bring him back. Hide Jane instead and John gets the width.
- Only one column can be hidden at a time.
- This is display only: the hidden person's income and assets are still used in every calculation and chart, and their cards keep their settings.
- The choice is saved with the plan. Switching to *Single* or Reset to defaults shows everything again. On a narrow window the columns stack and the hidden one becomes a one-line bar. Printing shows both columns.

### Reordering cards

- Drag the ⋮⋮ handle at the left of any income card (Social Security, wages, pension, rentals, brokerage, real estate, annuities, IRA, Roth) and drop it above or below another card.
- In a married plan both spouses' cards of that type move together.
- The order is saved with the plan and restored when you load it.
- Drag and drop works with a mouse or pen; it is not available on touch screens.

## The top buttons

### Main buttons

| Button | What it does |
|---|---|
| **Usage** | This page. **Tips** and **Formulas** open the tips and the calculation reference. |
| **Save** | Saves the whole plan (all scenarios and notes) as a file. See *Save and Load* below. |
| **Load file** | Brings a saved plan back (or loads a sample plan if any are available). |
| **Scenario** | Popup card for working with several versions of a plan. See *Scenarios* below. |
| **Reset to defaults** | Clears the plan back to its starting values: every income and asset card collapsed, the chart grid on 3 columns, and the Monte Carlo card cleared and back to its defaults. Also forgets the remembered save file. |
| **Notes** | Text box for your own notes about the whole plan; the same notes show in every scenario. Saved in the plan file. |
| **Scenario Notes** | Text box for notes about the scenario on screen only. Each scenario has its own, saved in the plan file. |
| **Export Excel** | Downloads the year-by-year projection as a workbook. See *Export Excel* below. |

### Save and Load

- If the plan came from **Load file** (or was already saved once this session), **Save** overwrites that same file without asking.
- Sample plans can't be overwritten: Save asks where to save a copy, and that copy is then the file Save overwrites.
- A successful save turns the button green ("✓ Saved") and shows a message at the bottom of the window.
- Chrome only (see the note at the top); other browsers ask for a file name each time and download the plan under that name.

### Scenarios

- The first scenario is **A**. **New scenario** copies the one on screen and shows the copy, so your next edits go to the copy.
- Click any scenario's chip to switch to it: every input changes and the charts animate to its values, on the same chart scale.
- **Delete scenario** removes the one on screen, one at a time; the last one can't be deleted.
- The card also names each scenario and lists the inputs that differ between them.
- **Save** writes every scenario into the file and **Load file** brings them all back.
- Close the card by clicking the button again, pressing Esc, or clicking ✕.

### Export Excel

- **Projection by year** sheet: the full year-by-year projection, including the Annual Household Income popup's *Total income*, ordinary income before deduction, the deduction, ordinary / qualified / total taxable income, and the no-conversion figures and "trigger met" flag used by the Roth conversion start triggers. It also totals real estate value and unrealized gain, and has *Inheritance asset income* columns.
- **One sheet per account:** portfolios, IRAs, **inherited IRAs** (withdraw and balance under the 10-year rule), annuities, and each **real estate** property (value, cost basis, and any sale's gain, exemption, tax and amount sent to the portfolio).
- **A Monte Carlo trial exports as that trial.** With a trial loaded (B or a successful run C) the file is named `retirement-plan-mc-trial-N.xlsx`, **Inputs** shows the trial's drawn passing ages, Long Term Care and inheritance, and an extra **MC trial** sheet lists the trial's inflation for each year and every asset's market shock. The portfolio, property and IRA sheets compound with those yearly rates, and the tax thresholds follow the trial's price level, so the workbook stays live: edit an inflation rate or a shock factor (1 = the plan's own return) on the MC trial sheet, or a growth % on Inputs, and the formulas recalculate. As in a plan, the amounts the app solves (income, expense funding, Roth conversions) stay as values. With A (the plan) showing, the export is the plan.
- **Guardrails and the medical shock.** **Inputs** lists their settings. With guardrails on, the **Projection by year** sheet gains *Guardrail* columns: the multiplier on discretionary spending, the spending the portfolios must fund and the start-of-year balance (values from the app), and the **withdrawal rate, cut line, tripwire and "above the cut line?"** as live formulas (change the band on Inputs and they follow; the cuts themselves are app values, as the rest of the solver's output). The medical shock has its own column and is inside *Long Term Care expense* and the itemized deduction.
- **State income tax** is exported for the selected state only (California's brackets, deduction and credits, or Washington's capital-gains tax). With state tax off, no state tables or columns are written.

### Hover helpers

| Control | What it does |
|---|---|
| **Input Element** (checked by default) | Hovering an input (a box, slider, checkbox, radio button, button or its label) shows a short description. Drop-down menus show each choice's description as you move the cursor over it. |
| **Chart Element** (checked by default) | Hovering a chart shows a description of the element under the cursor (a band, bracket, IRMAA, deduction or cost-basis line, a Social Security claiming-age line, the LTC bar, the 10 year IRA stretch bar) instead of that year's numbers. Uncheck it for the usual value popups. |
| **Popup Details** | Adds the line-by-line breakdown to the value popups on the main charts. |
| **Popup background** | Slider next to Popup Details: from see-through white (left) to see-through black (right). Text switches to dark on a light background. Remembered in your browser. |

The small charts beside Annual Household Income, Total Income Tax and Asset Value show the plan owner(s) and age, then only their own values.

### About the Usage, Tips and Formulas pages

- They open in a new tab and read their text from the `misc` folder when you click, so they show whatever those files currently say.
- This works when the app is served over `http(s)`. If you opened it as a local `file://` page the browser may block it, and the new tab will say so.

## Reading the charts

### The charts

| Chart | What it shows | Appears when |
|---|---|---|
| **Social Security — Start Age Analysis** | Cumulative household Social Security for different claiming ages. | Social Security is on |
| **Annual Household Income** (with MAGI, Taxable ordinary and Taxable qualified charts) | Income by source (details below). | Always |
| **Social Security Tax** and **Total Income Tax** | Tax by source and by income type. Total Income Tax has two small charts on the right: Ordinary income tax, and qualified dividend / long-term gain / NIIT tax. Check **view IRMAA as tax** to add the IRMAA surcharge above the tax stack as a dashed line. | Always |
| **Household Expenses** | Living, long-term care, IRMAA, AUM fee and income tax. | Always |
| **Asset Value** | Balances by holder (details below). | Always |
| **IDGT value** | The second chart for IDGT portfolios. | A portfolio's type is IDGT |
| **IRA** | Everything that leaves the pre-tax IRAs each year (details below). | A pre-tax IRA is on, or an inherited IRA pays out |
| **LTCG** | Long-term capital gain realized each year (details below). | A portfolio or property can be sold |
| **Inheritance asset income** | Income paid each year by assets created with the Inheritance card (details below). | An inherited asset pays something |
| **Inflation rate** | The plan's inflation rate each year (flat). While a Monte Carlo trial is loaded it also shows that trial's drawn rate. | Always (starts hidden) |
| **Market return %** | The nominal yearly return of every portfolio, IDGT, pre-tax / Roth / inherited IRA and property in the years it is in the plan: (1 + growth) × (1 + that year's inflation) − 1. Flat in the plan; it moves with the market shocks while a Monte Carlo trial is loaded. The ◀ ▶ buttons in the panel's tools row step through the lines one asset at a time (All lines → asset 1 → … → All lines); the Y scale stays fitted to every line. Display only, not saved. | Always (starts hidden) |

Charts that have nothing to show have no panel.

### Annual Household Income and its companion charts

The four charts are the same size, in a 2 × 2 grid.

- **Annual Household Income:** income by source. The pre-tax IRA's annual withdraw is drawn as two bands: **Roth conversion (taxed as ordinary income)** and the plain **Pre-tax IRA withdraw**. Inherited IRA withdrawals have their own bands (the Roth one is untaxed and not in MAGI).
- **MAGI chart** (top right):
  - Your MAGI, stacked in the same colors (Social Security counts only its taxable part).
  - Thin solid lines at the IRMAA brackets, each labeled with the bracket's income and the extra Medicare Part B cost over the standard premium (for example `$218k +40%`).
  - Its popup shows your MAGI and the IRMAA tier it reaches, per person. IRMAA is billed two years later, which is when the Household Expenses chart charges it.
- **Taxable ordinary income chart** (bottom left):
  - Income taxed at ordinary rates (pension, taxable annuity, wages, IRA withdrawals and conversions, rental, non-qualified dividends, taxable Social Security) minus your deduction, in the same colors. It also stacks the Roth conversion and Inherited IRA withdraw bands.
  - Qualified dividends and long-term gains are not on it; they are taxed at their own rates.
  - The deduction is taken off the bottom of the stack, so each ordinary band is that source's taxable part.
  - Black dashed lines mark the ordinary tax brackets, each labeled with its rate. The Roth conversion "below ordinary bracket" limit stops at one of these lines.
  - A red dashed line sits above the stack by the amount of the deduction (so it marks your ordinary income before the deduction). It is in the main income chart's legend and left out in years with no deduction absorbed.
  - Its popup shows the owner(s) and age, the ordinary income before the deduction, the deduction and the taxable ordinary income. Qualified income and total taxable income are in the main popup when Popup Details is on.
- **Taxable qualified income chart** (bottom right):
  - Taxable qualified dividends and long-term gains, stacked in the same colors (ordinary income is not drawn). A deduction larger than your ordinary income shelters qualified income (the Qualified Dividends and Capital Gain Tax Worksheet), and the popup shows the sheltered amount. A red dashed line sits above the stack by that excess deduction (so it marks your qualified income before the deduction), as on the ordinary chart; it is left out in years where nothing is sheltered.
  - Two lines show where the **15%** and the **20%** rates start. They are not flat: qualified income sits on top of your taxable ordinary income, so each line is the bracket limit for your filing status minus that year's taxable ordinary income (never below 0), the room left before the rate steps up. They move as your ordinary income changes (IRA withdrawals, Roth conversions, Social Security). A line that is far above the data is left off the scale.
  - The popup's Qualified tax line and the Excel export show the amount actually taxed at each rate.
- **Reference lines:** every bracket, deduction, IRMAA and effective-rate line is thin and solid with a thin white line under it. Only lines that matter to the data are drawn (the qualified chart always shows both of its lines; on the others, those crossing the stack, the first one above it and the last one below it, at most 3 per filing status). The lines on the Social Security charts are thin as well.

### Asset Value, IRA, LTCG and Inheritance asset income

**Asset Value**
- Brokerage, real estate, pre-tax IRA and Roth IRA balances by holder, stacked in that order, bottom to top.
- A red note above the chart warns when a pre-tax or Roth IRA has **IRA stretch** unchecked: it is not forwarded to heirs, so its balance ends at the last passing.
- Roth conversions are shown in the **IRA** chart.
- When the 10-year IRA stretch runs past the age range the other charts show, use the ◀ ▶ buttons under the chart to scroll the age axis.

**IRA** (today's $)
- Everything that leaves the pre-tax IRAs each year, stacked by kind and, when married, by person: the Roth conversion, the required minimum distribution (RMD) and any withdrawal to pay expenses, in the same colors as the Annual income chart.
- IRAs inherited through the Inheritance card have their own bands on top: RMD / final withdraw, annual withdraw, and tax-free Roth withdraw. The person's own bands never include them.
- The popup lists each band and the totals.

**LTCG** (today's $)
- One band per brokerage portfolio (IDGT portfolios included) plus one for property sold, in the Asset value chart's colors.
- When an SCGL carryforward is used, a red dashed line shows the net gain actually taxed.

**Inheritance asset income** (today's $)
- Stacked by component: inherited IRA RMD / final withdraw, inherited IRA annual withdraw, inherited Roth withdraw (tax-free), ordinary dividends, qualified dividends, tax-exempt income, realized LTCG and real estate sale gain.
- No bracket lines. By default it sits right of MAGI in the 2×N grid and right of IDGT in the 3×N grid.

### Chart panels: layout and controls

| Control | What it does |
|---|---|
| **Grid** button (right of the Same scale buttons) | Switches between a **2×N** and a **3×N** grid; each size remembers its own arrangement. |
| **Hide** box on a panel | Hides the chart; a hidden panel keeps its place as a title bar. Annual expenses, Annual income, Total tax, Asset value, IDGT value, IRA, LTCG, Inflation rate and Market return % start hidden; the others, including Inheritance asset income, start shown. |
| **↕ Rescale** | Refits only that chart's vertical scale. |
| **Title bar drag** | Moves the chart (see below). |

Moving a chart:
- Drop it on an empty spot to leave its old spot blank, or on another chart to swap them.
- To add a new row, hold the pointer on the gap between two rows for a moment until a blank row opens, then drop into it (move away without dropping and it closes).
- The chart column scrolls by itself when the pointer nears its top or bottom edge, so a chart can be moved above or below what is on screen.
- Which charts are hidden, which grid size is on and where each chart sits is saved with the plan.
- In the default layout (2 and 3 columns) **Inflation rate** and **Market return %** sit in the row directly above **Cumulative household SS** and **Social Security tax**. A saved layout that still has the old default takes the new order; one where you moved any of those four charts is kept.

### Marks that appear on every age chart

- **Purple triangle** just below the age axis: the year an inherited asset arrives in your plan. While a Monte Carlo trial is loaded it follows that trial's arrival year.
- **Faint red band** behind the data: a year whose expenses could not be paid.
- **IRA stretch alert**: the red note about an IRA whose stretch is not set sits in the row of scale buttons, so every chart card keeps the same height.

### Same scale buttons

The row of buttons above the charts sets a group of charts to one vertical scale. It is a one-time action; nothing stays switched on.

| Button | Charts in the group |
|---|---|
| *income & expense* | Annual income, Annual expenses, MAGI, Taxable ordinary and qualified income, IRA, realized LTCG, Inheritance asset income |
| *tax* | Total tax, Ordinary income tax, QDIV / LTCG / NIIT tax only |
| *income, expense & tax* | All of the above together |
| *asset & IDGT* | Asset value and IDGT value |

- Annual expenses is treated as income & expense even though it has an income-tax component.
- The IRA, LTCG and Inheritance asset income charts follow every button that includes income. Cumulative household SS and Social Security tax always keep their own scales.
- Every chart's scale is saved with the plan and restored when it is loaded. A plan with no saved scales starts with the income, expense and tax charts on one common scale.
- Hover a chart for a popup of that year's numbers.

## Paying expenses and reinvesting income

### Order of payment

Each year's expenses are paid in this order:

1. **Household income:** wages, Social Security, pension, rental income including depreciation, tax-exempt income and IRA required distributions.
2. **Dividends** (and any Distributed LTCG) of *Living expense & income* brokerage portfolios.
3. **Sales** of those portfolios.
4. **Pre-tax IRA** withdrawal for any shortfall, shared across the accounts in proportion to their balances. It counts as taxable income, so the tax on it is added to the expenses.
5. **Roth IRA** withdrawal (tax-free).
6. Anything still unpaid is shown as an unfunded shortfall.

- This is the built-in order. The **Expense shortfall withdrawal order** feature lets you choose your own order, including selling a property.
- The IRA and Roth balances in the charts drop by these amounts.
- The pre-tax IRA withdraw appears as its own band in the Annual Household Income, MAGI and Taxable income charts (*Pre-tax IRA withdraw (for expenses)*).
- The Roth IRA withdraw appears in the Annual Household Income chart as a tax-exempt band (*Roth IRA withdraw (tax-exempt, untaxed)*). It is not in MAGI or Taxable income because it is untaxed.
- When some year's expenses cannot be paid at all, a red **UNFUNDED** tag appears in the Household Expenses panel, right of its Rescale button. Hover the chart with Chart Element on for the first and last age and who is living. A faint red band behind the data also marks every such year on every chart that runs by age.
- No early-withdrawal penalty or age limit is modeled.

### Portfolio withdraw

Tax & Optimizations panel; unchecked by default.

- The slider steps through the 0%, 15% and 20% LTCG brackets (20% means no limit).
- Each year every Living expense & income portfolio (never an IDGT) sells as much as fits with taxable income (ordinary + qualified dividends + LTCG) staying within that bracket.
- There are no start or end ages: a portfolio is used while it is inside its own age range.
- Portfolios are taken in order, so a later one only gets the room an earlier one left. Withdraws are sized after any Roth conversion.
- The proceeds count as household cash income, so they pay expenses first. Anything left over is reinvested like other excess income (into this portfolio too, if it has Reinvest excess income, which resets its cost basis).
- The sale realizes LTCG on the portfolio's gain share.
- **Accept NIIT** (unchecked by default): unchecked, a sale is also limited so that MAGI stays at or under the 3.8% Net Investment Income Tax threshold, even with the slider at 20% (no limit); a portfolio with no unrealized gain is not limited. Checked, the portfolio sells up to the bracket and pays the NIIT. Plans saved before this option load with it unchecked.
- **Accept Social Security Tax Torpedo** (unchecked by default): unchecked, a sale is also limited so it does not raise that year's taxable Social Security. A household already inside the torpedo zone (part of Social Security taxed, not yet 85%) sells nothing under this rule; once 85% is taxed, extra income no longer adds taxable Social Security and sales are allowed again. Checked, sales may pull more Social Security into taxable income. Plans saved before this option load with it unchecked. Both checkboxes animate the charts smoothly, like any other toggle.

### Excess income

- If household income is more than the expenses, the leftover is *excess income*.
- It is added to the brokerage portfolios that have **Reinvest excess income** checked. If none is checked, the excess leaves the model.
- Both boxes are off by default.

## Annuities

The **Annuity** card (under Brokerage portfolio income; **Add** / **Remove**, one set per person) holds any number of contracts.

Each contract has:
- an account value and an optional premium (cost basis; blank = account value)
- credited growth (**net of all fees**)
- a payout Start–End age and an annual payout
- a passing benefit
- an optional *Joint owned with spouse* box

**Annual payout**
- *Fixed $* (a nominal amount, not adjusted for inflation or COLA), or *% of annual account value*.
- Payouts stop when the account is empty.

**Payout tax treatment**

| Choice | Tax treatment |
|---|---|
| *Non-qualified, withdrawals* | Gain is taxed first, then premium comes out tax-free. |
| *Non-qualified, annuitized* | Exclusion ratio: premium ÷ expected total payout to the owner's passing age is tax-free until the premium is recovered. |
| *Qualified / IRA annuity* | Fully taxable. |
| *Tax-exempt payout* | A % of every payout and of the passing benefit is untaxed. |

- Taxable payouts are ordinary income; non-qualified ones also count as net investment income for NIIT.
- Tax-exempt payouts are never in AGI but count toward Social Security taxation and MAGI (IRMAA).
- All payouts are household cash income that pays expenses.

**Passing benefit (paid to heirs)**
- Choices: *Fixed $* or *Initial account value* (both not adjusted for inflation), or *Account value at passing*.
- It is paid when the contract ends (the owner's passing, or the spouse's if the contract continues).
- It is shown in the Asset Value tooltip and the Excel export with its taxable and tax-exempt parts: all taxable if qualified; the amount above the remaining premium if non-qualified; the non-exempt % if tax-exempt.
- It is not household cash flow.

**Asset Value chart**
- Each annuity's account value is a band on the main chart.
- The *Ordinary income withdraw cost* slider applies to the taxable part of an annuity's value (whole value if qualified, gain only if non-qualified).
- Annuities end with their owner unless marked joint owned with the spouse; there is no stretch.

## Real estate

The **Real estate** card (after the brokerage card; **Add** / **Remove**, one set per person) holds any number of properties. Each has a **property name**, a **value**, an optional **cost basis** in today's $, an **annual change** and, in a married plan, a *Joint owned with spouse* box.

### Fields

| Field | Meaning |
|---|---|
| **Value** | The property's market value. Nothing is taxed while you hold it. |
| **Exemption per owner** (optional) | The gain excluded from tax at a sale for each owner alive then, for example the $250,000 home-sale exclusion. A jointly owned property counts both owners while both are alive, one after the first passing. Taxable gain = value − exemption × owners alive − cost basis. It is a fixed dollar amount, so it erodes with inflation in today's $ (not indexed). |
| **Cost basis** | Blank means no unrealized gain today; a basis above the value is capped at the value. It is a fixed nominal amount, so in today's $ it shrinks with inflation (the gain grows), and it steps up to the value when the owner passes and the spouse keeps the property. |
| **Annual change** | Defaults to *Tracks inflation*, so the value stays flat in today's $. |

### Selling (optional)

Choose when the property is sold: **Never** (default), **When the last person starts LTC**, **At the last person's passing** (the final year of the plan), or **At an age** (the owner's age).

A sale works in three steps:
1. The cost basis is stepped up to value if the owner has passed.
2. Any taxable gain is taxed as **long-term capital gain** that year (the same tax calculation as portfolio gains), and that tax is paid out of the sale.
3. The value left after the tax moves into the brokerage portfolio you choose (by default the owner's first non-IDGT portfolio, then the spouse's) with a **100% cost basis**.

- Age and LTC sales are made at the end of the year, so the portfolio has the money the next year.
- If there is no portfolio to receive it, the property is kept.

### Other behavior

- A property is passive: no dividends, tax-exempt yield, foreign credit, AUM fee, portfolio type or age range.
- It is sold only on the date you choose, or, if you switch on the **Expense shortfall withdrawal order** and list it there, when expenses need it.
- It leaves the plan when its owner passes unless it is jointly owned.
- **Asset Value chart:** each property is a band above the brokerage portfolios and below the IRAs, with a **dotted cost-basis line** inside the band at the basis % height; the band above the line is the unrealized gain. The popup shows the value and, on its own row, the cost basis in $ and as a % of the value. The withdraw cost sliders do not change real estate bands.

## Rental income and tax-exempt income

**Rental income**
- Holds any number of properties (**Add** and **Remove** on the card).
- Enter the *taxable* annual amount (already net of depreciation) and the annual depreciation separately.
- Depreciation counts as cash for the household but is not taxed.

**Tax-exempt yield %** (brokerage portfolio, for example municipal-bond interest)
- Paid out of the portfolio each year.
- Not taxed and not part of AGI, but it counts as household income.
- It is included in provisional income for Social Security taxation and in the MAGI used for IRMAA. (The tax-free part of an annuity payout is household income but is not included in either.)

## Inheritance

The **Inheritance** card (one per person) imports another plan file, for example a parent's, and lets you inherit what is left after that plan's **last passing**. The card has its own **Hide** box and starts hidden.

### Importing a plan

- **Import plan file** reads the other file's active scenario (the file itself is not changed). You can import several files.
- A file is identified by its **name** only, not its folder.
- Each asset in the file (brokerage portfolio, real estate, pre-tax IRA, Roth IRA) starts at **0%** (not inherited). Type a % to create a new asset card for it. Annuities are not imported.
- **Import the same file name again** to update every asset created from it. **Remove** deletes the file and all assets created from it.

### When an inherited asset enters your plan

- The card field **Inherited at <name>'s age** is the age of the person holding it (the beneficiary) in the year of the last passing in the source plan.
- You can edit that age; a note under the field shows the calendar year it corresponds to.
- Inherited values (balances, property values, the stepped-up basis) are whole dollars.
- An inherited **portfolio's Start age** (Custom age) is set automatically to that inheritance age and follows it when you change it. Type your own Start to override (it then turns light grey and is kept).

### Inherited IRAs

An inherited IRA (pre-tax or Roth) must be emptied by the end of the 10th year after it is inherited. The schedule is automatic; there is no withdraw option.

| Case | What happens |
|---|---|
| Original owner had already started RMDs | The holder takes an RMD every year from the year after it is inherited, using the IRS Single Life Expectancy table (the factor for the holder's age in that first year, then 1 less each year). A spouse who takes it over after the holder passes continues the same schedule. Year 10 takes what is left. |
| Original owner had not started RMDs (always the case for a Roth IRA) | Nothing is required until year 10. |
| Pre-tax withdrawals | Taxed as ordinary income. |
| Roth withdrawals | Tax-free. |

The Inherited IRA card offers only the settings that make sense for one:
- **Annual withdraw** and its **Withdraw start** (from the year it is inherited), and *Inherited by spouse*.
- An inherited pre-tax IRA is never converted to a Roth IRA: its annual withdraw is always an ordinary taxable withdrawal that becomes household cash.
- There is no start / end age. It starts when inherited; a pre-tax one also takes an RMD, if larger than the 10-year schedule, in years 1–9.
- There is no IRA stretch: the 10 years never extend, even when a spouse inherits it or it passes into another plan.

### Editing inherited assets

- If you change a field on an inherited asset, it turns **light grey**.
- Re-importing, or changing the %, updates every other field but keeps your change.
- Type the inherited value back to clear the grey.

## Two plans linked live (parent → heir)

Run the parent plan in one browser tab and the heir plan in another. Changes in the parent flow to the heir at once.

### Setup

1. Open the app in two tabs of the same browser. The second tab automatically gets its own autosave (the tab title shows "2nd app") and starts with the default plan, so the two never overwrite each other.
2. In the first tab, load the **parent plan** (A).
3. In the second tab, import A's plan file on the Inheritance card as usual and set the **%** of each asset.
4. While A is open, B's source row shows **● Live from A**.

### What you see

- Every change you make in A (spending, growth, ages, balances …) is sent to B. B's inherited assets and all of B's charts update at once.
- B's own **%**, inherited-at ages and any field you edited on an inherited card are never overwritten, and they redraw B immediately.
- A **Live link** bar appears in its own row under the top buttons: green when connected, amber when waiting for the other plan. It pulses for a few seconds when the link starts and flashes on every update. The browser tab title gets a 🔗.

### Controls and rules

| Item | Behavior |
|---|---|
| **Live** checkbox | Untick to freeze a source. |
| **Link…** button | Picks the open plan when A has no file name yet or was renamed. |
| Closing A | B keeps its last snapshot ("Waiting for …"). |
| Loops | A plan that inherits from itself through the chain is refused. |
| Second tab with a stored session | Asks **Restore previous 2nd app session?** (**Start fresh** is the default answer). Reloading the tab keeps its session without asking. |
| `?plan=NAME` in the address | Still picks a named slot. |
| Requirements | The page must be served (for example from `localhost`). It works only between tabs of the same browser. |

## Annual withdraw and Roth conversions

On the pre-tax IRA card, **Annual withdraw** takes money out of the pre-tax IRA each year (on top of the RMD), taxed as ordinary income.

- Tick **Withdraw is Roth conversion** (the default): the money moves into the Roth IRA. The Roth IRA card must be enabled.
- Leave it unticked: it is an ordinary withdrawal that becomes spendable household cash (no Roth IRA needed).

### Amount options

**$/yr, today's $**
- A flat amount each year. The slider runs from $0 up to the IRA balance and starts at $0.

**Below IRMAA & tax brackets**
- The projection converts as much as it can while staying **below both** brackets you choose with two sliders side by side. They step through the bracket values (the dollar amounts follow the Single / Married setting).
- Staying *below* a bracket means under the point where it starts, so choosing the 24% ordinary bracket fills the 22% bracket and stops.
- Slide to 0 to block conversions, or to the far end for no limit. The first ordinary stop (10%) converts only what fits in the standard deduction.
- The **IRMAA bracket** slider uses the Part B % over standard that labels the lines on the MAGI chart (+40%, +100%, +160%, +220%, +240%). +40% means MAGI stays under the first IRMAA line, so no surcharge.
- IRMAA looks back two years, so a conversion now sets the premium two years later. The IRMAA limit therefore applies whenever someone alive is 63 or older, right up to the last years.
- If your other income already exceeds a limit, nothing is converted that year.
- When both spouses use this option, the first person converts first and the second converts what is still left under the limits.

### Withdraw start

- **RMD start** (default; the IRA's own start age), **Now**, or a **Custom age**.
- Three triggers begin converting the first year a condition is met, and conversions then continue every later year:

| Trigger | Condition |
|---|---|
| **When tax bracket is below x%** | A slider over the discrete brackets. The household's taxable ordinary income before any conversion must be at or below where that bracket starts (dollar amounts follow Single / Married). |
| **When itemized deductions > a value** | Type the value in today's $. Itemized deductions here are the Long Term Care cost above 7.5% of AGI. |
| **When LTC starts** | The first LTC start age. Turn on Long Term Care in Settings or conversions never start. |

## Asset Value chart: the withdraw cost sliders

The two rows of sliders above the Asset Value chart show roughly what the balances are worth *after tax*. They only change how the chart is drawn; they never change the projection. All four default to 0%.

| Slider | Effect |
|---|---|
| **LTCG withdraw cost** | Removes that percentage of each brokerage portfolio's unrealized gain. |
| **Ordinary income withdraw cost** | Removes that percentage of the pre-tax IRA balance. |
| Roth IRA | Never reduced. |
| Real estate bands | Not reduced by either slider; their dotted cost-basis line is always drawn. |

- The **Before the last passing** pair applies to the years up to the last passing.
- The **After the last passing** pair applies to the years after it, using the heirs' anticipated tax brackets.

**Cost-basis lines**
- Each tracked portfolio has its own dashed **cost-basis line** inside its band, so each portfolio's step-up shows at its own time: its owner's passing, or the spouse's passing if it is *Joint owned with spouse*.
- It is drawn only in years where the LTCG withdraw cost is 0%. Any LTCG withdraw cost moves the brokerage band toward 100% basis, so the line would no longer mark the top of the gain.
- In the hover popups of both asset charts, each brokerage portfolio that tracks cost basis shows its **cost basis as a % of its value** (100% means no unrealized gain), and each portfolio's dashed line row shows its own basis as a % of its value.

## Tax features worth knowing

- **Taxable Social Security** is based on provisional income, which includes qualified dividends, realized long-term gains and tax-exempt interest (the tax-free part of an annuity payout is not added). The upper tier uses the smaller of 50% of benefits and $6,000 (joint) / $4,500 (single) as its base, so small benefits are not overtaxed.
- **Standard deduction** includes the additional amount for each living person 65 or older ($1,650 joint / $2,050 single for 2026), on top of which the enhanced senior deduction applies.
- **IRMAA surcharge** looks back two years, uses the MAGI (AGI plus tax-exempt income) from two years earlier, and uses the joint or single table of the filing status of that earlier year's return. A surviving spouse keeps the joint table until the lookback year is a single return (the SSA life-changing-event reduction is not modeled).
- **Enhanced deduction for seniors** (Schedule 1-A): applied from 2025 through 2028 for each person who is 65 by year-end, phased out above $75,000 (single) or $150,000 (joint) of MAGI.

## Monte Carlo simulation

The **Monte Carlo simulation** card sits under the charts and starts collapsed (clear its **Hide** box to open it). It re-runs the whole plan many times with random draws. It is a scenario analysis, not a forecast: the result depends on the assumptions in the card. Your plan is never changed.

### Settings

Each group has a checkbox. A group that is switched off uses the plan's own figures, so with every group off each trial equals the plan exactly.

| Group | What is random |
|---|---|
| **Random returns** | A yearly market shock on every growth rate (average unchanged). Equity volatility, real estate volatility and the correlation between portfolios are set here. |
| **Random lifespans** | Each person's age at passing, replacing the "passes at age" sliders. Modal age and spread are set here. |
| **Random Long Term Care** | Whether care is needed, for how long and at what cost; it replaces every LTC card, an inheritance source's too. |
| **Random inflation** | Inflation drifts around the plan's rate; fixed-dollar items and fixed or custom growth follow it. |
| **Systemic panic** | Needs random returns. In a year the market falls by more than the **crash** size you set (default 1.5 standard deviations, about 1 year in 15), and for the years it **lasts**, every portfolio's correlation with the others rises to the **panic correlation** (default 0.9) and optionally property falls with the market too: diversification stops working just when it is needed. The average return is unchanged. **Also run the same trials without panic** runs a second pass on the same random draws so the card can say what the panic itself cost (it doubles the run time). |
| **Random inheritance** | Each inheritance source plan gets its own lifespan, care and the same market shocks, and the asset arrives in that plan's last-passing year. An optional **haircut %** discounts what you count on. Sources imported before this feature say "re-import (or live-link) it to simulate" and stay as planned until you do. |

Below the groups set the number of **Trials** (50 to 10,000) and the **Seed**. The same seed and trial number always give the same draws. **Run simulation** works in small steps so the page stays usable; **Cancel** keeps the partial result. A red note says when the plan changed since the run.

Not random: Social Security and pension amounts, and tax law.

With **Spending guardrails** on (Expenses panel) every trial cuts discretionary spending by the rule, and the Results gain rows for how many trials had to cut, when, how deeply and for how long. A late-life **medical shock** on the Expenses panel applies in every trial (at the person's own age, and only while that person is alive).

### Results

- The share of trials that stayed fully funded, plus the 10th, median and 90th percentile of assets in the last projected year and of lifetime income tax.
- **Why trials ran short**: the main cause of each failure and a table of risk factors (how often each appears, and the failure rate with versus without it).
- **Assets by age**: a fan chart (10th, 25th, median, 75th, 90th percentile) with the plan as entered dashed on top, and **Share of trials**, by age.

### Study one trial

Load any trial into the chart grid: **Earliest failure**, **Median failure**, **Largest shortfall**, a pick from the list of failed trials, or any trial number. Every chart then shows that trial. The trial is replayed from its seed, nothing is stored, and the plan is not changed.

The **Stress test card** stays at the top of the chart column, above the scale buttons, so you can scroll through the charts and keep stepping:

- **A · Plan / B · Monte Carlo Failure / C · Monte Carlo Success / D · Stress Test**: flip the charts between the plan as entered (A), the Monte Carlo failure you loaded (B), a Monte Carlo success (C, a trial that stayed funded to the end) and a stress test (D). While B, C or D is on, the plan's lines stay behind as thin dashed grey lines, and every chart's scale is fitted to the largest of the loaded views so only the data moves. The message under the buttons names the failure / success number or the stress test.
- **D** cycles through the scenarios of the Stress tests card (Lost Decade, Stagflation, 1966 retiree, whichever are ticked), one per click, wrapping around. If the stress tests have not been run for this plan yet, D runs them with the card's current settings first. The **Show in charts** button next to a scenario in the Stress tests table loads that one directly. B and C stay greyed out until you have loaded a Monte Carlo trial.
- Keys: **B** flips the plan and whichever of B / C / D was shown last; **C** shows the next Monte Carlo success, **Shift+C** the previous one; **D** shows the next stress test, **Shift+D** the previous one (the lists wrap).
- **◀ ▶** step through Monte Carlo failures while B is on, Monte Carlo successes while C is on and stress tests while D is on.
- **Back to plan** returns the charts to the plan. Starting a new run or editing the plan also ends the trial view.
- The message under the buttons has room for two lines and says what failed and how many other failed trials share the main cause.
- The Inflation rate and Market return % charts show the trial's drawn inflation and returns.

Trial views are display only; nothing is saved with the plan.

**Loading and resetting.** Loading another plan (a file or a sample) clears the card's results, any loaded trial and a run in progress, because they belonged to the old plan. The card's own settings (volatility, trials, seed and so on) are kept, since they are not part of a plan file. **Reset to defaults** clears the results too and also puts those settings back to their defaults (card collapsed).

## Stress tests

The **Stress tests** and **Monte Carlo** cards sit under the charts, Stress tests first. Drag a card by its title bar (the ⠿ grip) and drop it anywhere above or below the other one: above its middle puts the dragged card first, below puts it last. The order is remembered in the browser (not in the plan file) and **Reset to defaults** puts it back.

The **Stress tests** card (under the Monte Carlo card, collapsed until you untick Hide) forces a fixed bad stretch onto your plan and shows whether the money lasts. Unlike Monte Carlo these are single, repeatable scenarios; your passing ages, Social Security, Long Term Care and taxes stay as entered.

- **When the shock starts**: *Day 1 of retirement* (the first year without wages; the default), *Today*, or a number of years from now. *Share of assets hit %* is how much of each portfolio and IRA takes the scenario's stock return (the rest keeps the plan's own return; property is never changed).
- **Lost Decade**: the actual 2000–2009 S&P 500 returns. Tick *Also use that decade's actual inflation* to add that decade's CPI.
- **Stagflation**: flat stock returns (default 0% a year) for 10 years while inflation ramps from 6% to 11%. All four numbers are editable.
- **1966 retiree**: actual 1966–1981 stock returns and inflation, the classic worst starting date for a retiree.
- **Late-life medical shock** (liquidity and tax test, separate from the market scenarios and can be run alone): pick whose age, the starting age, the number of years and the yearly cost. It shows the plan with and without the shock: which accounts paid (dividends, asset sales, IRA, Roth, property), the **capital gains it realizes** against the unrealized gain you started with, the itemized deduction it creates, the highest AGI, the extra income tax in the shock years and two years after, the IRMAA effect and the estate. *Also compare four withdrawal orders* repeats it with your own order (or the built-in one), IRA first, Roth first and taxable → Roth → IRA, and stars the best final estate. The shock in this card does not change your plan; the Expenses card does.
- **With Spending guardrails on**, every scenario above runs with them, and a second table shows each scenario with and without the guardrails, the age and invested balance of the first cut (the tripwire), the deepest cut and the spending given up.
- **Show in charts / D button**: load a scenario into every chart (see the Stress test card under Study one trial); the Inflation rate and Market return % charts then show the scenario's inflation and returns.
- **Results**: for the plan and each scenario, whether the money lasts (or the age it runs out), the unpaid expenses, invested assets at the end of the shock and as a % of the plan, the lowest invested assets after the start, and the assets in the last projected year; the card has no chart of its own, because the D button / *Show in charts* loads each scenario into the real charts. Everything is in today's $. Press **Run stress tests** again after changing the plan or the settings (a red note tells you when a result is out of date).

## Ask about this plan

The chat box answers questions about your plan and can **run what-ifs and chart them**. Open it with the **💬 Ask about this plan** button at the bottom right.

**Setup**
- It needs your own API key. **Google Gemini** is the default and has a free tier: get a key at aistudio.google.com/apikey, paste it in ⚙ Settings and ask. Anthropic Claude (paid key) also works.
- The key is kept only in your browser and is never saved in a plan file.
- Each message sends a text snapshot of your inputs and results to the provider, and so do the results of any scenarios it runs. Names are withheld unless you tick *Send names*. *Preview exactly what is sent* in ⚙ Settings shows the text and the tool list.
- The **⇔** button widens the panel for charts; ⚙ Settings closes itself once you send a question.

**What to ask**
- Questions about your results: why tax jumps in a year, when expenses stop being fully funded.
- What-ifs: "What if Person 1 claims Social Security at 70?", "Compare converting $40k and $80k a year to Roth", "What if returns are 2 points lower and living costs rise 15%?", "Show claim ages 62 to 70", "What if a Lost-Decade crash starts the year I retire?".
- Ask for the comparison in one message: up to 6 scenarios run together, each against your plan as entered.

**What you get back**
- A **results card**: headline numbers for your plan and each scenario (assets at the end, lifetime federal tax, highest IRMAA surcharge, amounts moved by IRA withdraws and conversions, unfunded expenses and more), with the difference from your plan in green (better) or red (worse). Only rows that differ are shown.
- **Changes vs your plan**: every change the model made, each marked ✓ applied, ⚠ *Ignored* (with the reason, for example "Person 1 already claims at 70") or ⚠ *No effect* (applied, but your results did not change). **Check this list first**: it is how you see whether the model understood your question the way you meant it.
- **Charts** under the reply (total assets and yearly tax by default; the model can also draw cumulative tax, unfunded expenses, MAGI, IRMAA, cumulative Social Security, income by source and outcome bars). Your plan is the dashed grey line. **⤢** enlarges a chart; **PNG** downloads it.
- Every number comes from the app's own projection engine, run on a copy of your plan, so it equals what the main charts show if you typed the same changes into the inputs. The model does not calculate or draw anything itself.

**Your plan is never changed by the chat.** The results card has buttons, and only a click changes anything:
- **Open in main charts**: adds the scenario to the 🆎 Scenario set and switches to it, so all the charts show it.
- **Save as Scenario**: adds it to the set without switching.
- **Copy spec**: copies the list of changes as JSON.
- A card is a snapshot. If you edit the plan afterwards, it shows **plan edited since**; Open and Save then ask before rebuilding the scenario from your plan as it is now.

**What the model can change in a scenario**: Social Security claim age, living expenses, inflation, investment returns, passing age, the age someone stops working, a pension, the annual IRA withdraw / Roth conversion (fixed or bracket mode, start age), long-term care, the late-life medical shock, spending guardrails, portfolio sales, state tax, and a market stress path (Lost Decade, stagflation, 1966, or your own yearly returns). It can also *sweep* one value, for example every claim age from 62 to 70, on one chart.

**Limits to know**
- A **market stress** run is a simulation overlay, not a saved input, so it cannot be saved as a Scenario.
- Conversions have no end age in the planner (they run until the IRA is empty), so a request such as "until 75" is reported as not possible.
- A question runs at most 4 rounds of tools; the free Gemini tier allows roughly 10 to 15 requests a minute, and a short limit is waited out automatically.
- It is not financial, tax or legal advice. Dollar amounts are in today's dollars. See *Formulas → Chat what-if scenarios* for how each number is defined.
