# Retirement Income Planner — Usage

This page explains how to work with the planner. Everything is entered in **today's dollars**; the charts are drawn in today's dollars too, so you can read them without mentally adjusting for inflation.

## Features

* **Todays’s $s:** All numbers in today’s $s for easy understanding
* **Projection for Income, Portfolio/IRA, Expense, Tax**
* **Income:** Wage, Pension, Social Security
* **Expense:** Simple living cost, LTC, IRMAA surcharge, Tax, AUM fees
* **Tax Projection:** Rudimentary but include basics : (ordinary, o
* rdinary/qualified div), LTCG, itemized deduction (for long term care costs), and foreign tax credit )
* **Portfolio Features:** Div yield, Qualified Div %, Tax Exempt yield, Foreign % and Tax Credits. Destination to invest income in excess of expenses. Delayed Start (conversion of assets to equity investment portfolios in the future - ie work stock options, real estate etc.), IDGTs
* **IRA Features:** Pre-Tax, Roth, Roth Conversion (with delayed start), Stretched IRA
* **On Passing Actions:** Forward asset to survivor, basis step-up, and residual unrealized gains
* **AUM fees:** Fixed and AUM %
* **Social Security:** Start age and torpedo analysis
* **Suspended Long Term Capital Gains Tracking**
* **Long Term Care:** Start age, costs, and living cost (not LTC cost) adjustments
* **Married and Single/Widower Status**
* **Chatbot:** AI to analyze and converse about the plan. Require inserting API key into app when running. No security to keep API key private (will remain on your device) Plan data is sent to the AI model in the cloud of course.

## Lacking and Incomplete Features

* **Simplistic Tax Calculation:** Tax Calculations are general of course. Projection does not calculate complete taxes
* **No Annuities:** Not Implemented
* **Excel Export Rudimentary:** Currently just table of #s output by the app. Plan to include cell calculation based on formulas. Waiting until app matures as formula based spreadsheet require AI/LLM to work much longer to build the application 2x (once each for HTML and EXCEL followed by correlation check and testing)

---

## Getting started

1. In **Household Setup**, choose **Single / widowed** or **Married**, then set the assumptions: inflation rate (also used as the Social Security COLA), household living expenses, the suspended capital-gain loss (SCGL) carryforward, and the advisory (AUM) fee.
   The SCGL, AUM fee, Long Term Care and speculative-model items in the Assumptions panel each have an **Enable** box on the left (untick it and the plan ignores that item, but keeps what you typed) and a **Hide** box on the right (collapses the item to save screen space without changing the plan).
2. Under **Income Sources**, fill in each person: birth date, Social Security, wages, pension, **rental properties**, the **pre-tax IRA / 401(k)**, the **Roth IRA**, and any **brokerage portfolios**. Switch an item on with its checkbox, then fill in its details.
3. Read the charts below the inputs. They update as you type.

Most items have an **age range** (when the amount starts and stops) and an **annual change** (how the amount grows or shrinks in real, today's-dollar terms). In a married plan, an item can be set to **continue to the spouse** after its owner passes.

## The top buttons

- **Usage** — this page. **Notes** and **Formulas** open the notes and the calculation reference.
- **Save to file** — saves the whole plan as a file. **Load file** brings a saved plan back (or loads a sample plan if any are available).
- **Reset to defaults** — clears the plan back to its starting values.
- **Export to Excel** — downloads the full year-by-year projection.
- **Show Details in Popup** — adds the line-by-line breakdown to the hover popups on the charts.

The Usage, Notes and Formulas pages open in a new tab. Usage and Notes read their text from the `misc` folder when you click, so they show whatever those files currently say. This works when the app is served over `http(s)`; if you opened it as a local `file://` page the browser may block it, and the new tab will say so.

## Reading the charts

- **Social Security — Start Age Analysis**: cumulative household Social Security for different claiming ages.
- **Annual Household Income**: income by source. The dashed lines mark IRMAA tiers.
- **Social Security Tax** and **Total Income Tax**: tax by source and by income type.
- **Household Expenses**: living, long-term care, IRMAA, AUM fee and income tax.
- **Asset Value**: brokerage, pre-tax IRA and Roth IRA balances by holder, with a second chart for IDGT portfolios when you set a portfolio's type to IDGT.

Each chart has a **Rescale** button to refit its vertical axis, and a **Hide** box to collapse the whole section. Hover a chart for a popup of that year's numbers.

## Paying expenses and reinvesting income

Each year's expenses are paid in this order: household income first (wages, Social Security, pension, rental income including depreciation, tax-exempt income and IRA required distributions), then the dividends of brokerage portfolios that have **Pay expenses** checked, then sales of those portfolios.

If household income is more than the expenses, the leftover is *excess income*. It is added to the brokerage portfolios that have **Reinvest excess income** checked. If none is checked, the excess leaves the model. Both boxes are off by default.

## Annuities

The **Annuity** card (under Brokerage portfolio income; **Add** / **Remove**, one set per person) holds any number of annuity contracts. Each has an account value, an optional premium (cost basis; blank = account value), credited growth, an annual contract fee, a payout Start–End age, an annual payout (with its annual change), and an optional *Continues to spouse* box.

- **Payout tax treatment:** *Non-qualified, withdrawals* (gain is taxed first, then premium comes out tax-free); *Non-qualified, annuitized* (exclusion ratio: premium ÷ expected total payout to the owner's passing age is tax-free until the premium is recovered); *Qualified / IRA annuity* (fully taxable); or *Tax-exempt payout* (a % of every payout is untaxed). Taxable payouts are ordinary income (non-qualified ones also count as net investment income for NIIT). Tax-exempt payouts are never in AGI but count toward Social Security taxation and MAGI (IRMAA), and all payouts are household cash income that pays expenses.
- **Living Benefit Rider:** replaces the payout amount with a guaranteed one = payout rate × benefit base in the first payout year (level in nominal $, so it shrinks in today's $). The base rolls up at the roll-up % until payouts start (optional annual step-up to the account value). Payouts come from the account value first; when it is gone the insurer keeps paying through the End age. The rider fee (% of base) is taken from the account value.
- **Asset Value chart:** each annuity's account value is a band on the main chart. The *Ordinary income withdraw cost* slider applies to the taxable part of an annuity's value (whole value if qualified, gain only if non-qualified). Annuities end with their owner unless continued to the spouse; there is no stretch.

## Rental income and tax-exempt income

- **Rental income** can hold any number of properties (**Add** and **Remove** on the card). Enter the *taxable* annual amount (already net of depreciation) and the annual depreciation separately. Depreciation counts as cash for the household but is not taxed.
- A brokerage portfolio's **Tax-exempt yield %** (for example municipal-bond interest) is paid out of the portfolio each year. It is not taxed and not part of AGI, but it counts as household income, and it is included in provisional income for Social Security taxation and in the MAGI used for IRMAA.

## Roth conversions

On the pre-tax IRA card, **Annual Roth conversion** moves money into the Roth IRA each year, taxed as ordinary income. The slider runs from $0 up to the IRA balance and starts at $0. **Conversion start** is **RMD start** by default (the IRA's own start age), or **Now**, or a **Custom age**. The Roth IRA card must be switched on for conversions to happen.

## Asset Value chart: the withdraw cost sliders

The two rows of sliders above the Asset Value chart show roughly what the balances are worth *after tax*. They only change how the chart is drawn; they never change the projection.

- **LTCG withdraw cost** removes that percentage of each brokerage portfolio's unrealized gain.
- **Ordinary income withdraw cost** removes that percentage of the pre-tax IRA balance.
- The Roth IRA is never reduced.
- The **Before the last passing** pair applies to the years up to the last passing. The **After the last passing** pair applies to the years after it, using the heirs' anticipated tax brackets. Defaults are 10% / 10% before and 24% / 40% after.
- The dashed **cost-basis line** is drawn only in years where the LTCG withdraw cost is 0%. Any LTCG withdraw cost moves the brokerage band toward 100% basis, so the line would no longer mark the top of the gain.

## Tax features worth knowing

- Taxable Social Security is based on provisional income, which includes qualified dividends, realized long-term gains and tax-exempt income.
- From 2025 through 2028 the **enhanced deduction for seniors** (Schedule 1-A) is applied for each person who is 65 by year-end, phased out above $75,000 (single) or $150,000 (joint) of MAGI.
- IRMAA surcharges use the MAGI (AGI plus tax-exempt income) from two years earlier.

## Ask about this plan

The chat box can answer questions about your plan using a text snapshot of your inputs and results. It needs your own API key, which is kept only in your browser and is never saved in a plan file.


**Portfolio type:** each brokerage portfolio is either *Living expense & income* (default; its dividends and sales pay household expenses and excess income is reinvested into it) or *IDGT* (outside the taxable estate; charted separately; does not pay expenses or receive excess income).
