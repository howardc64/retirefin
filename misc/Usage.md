# Retirement Income Planner — Usage

This page explains how to work with the planner. Everything is entered in **today's dollars**; the charts are drawn in today's dollars too, so you can read them without mentally adjusting for inflation.

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
- **Asset Value**: brokerage, pre-tax IRA and Roth IRA balances by holder, with a second chart for IDGT portfolios when you flag one.

Each chart has a **Rescale** button to refit its vertical axis, and a **Hide** box to collapse the whole section. Hover a chart for a popup of that year's numbers.

## Paying expenses and reinvesting income

Each year's expenses are paid in this order: household income first (wages, Social Security, pension, rental income including depreciation, tax-exempt income and IRA required distributions), then the dividends of brokerage portfolios that have **Pay expenses** checked, then sales of those portfolios.

If household income is more than the expenses, the leftover is *excess income*. It is added to the brokerage portfolios that have **Reinvest excess income** checked. If none is checked, the excess leaves the model. Both boxes are off by default.

## Rental income and tax-exempt income

- **Rental income** can hold any number of properties (**Add** and **Remove** on the card). Enter the *taxable* annual amount (already net of depreciation) and the annual depreciation separately. Depreciation counts as cash for the household but is not taxed.
- A brokerage portfolio's **Tax-exempt yield %** (for example municipal-bond interest) is paid out of the portfolio each year. It is not taxed and not part of AGI, but it counts as household income, and it is included in provisional income for Social Security taxation and in the MAGI used for IRMAA.

## Roth conversions

On the pre-tax IRA card, **Annual Roth conversion** moves money into the Roth IRA each year, taxed as ordinary income. The slider runs from $0 up to the IRA balance and starts at $0. **Conversion start** is **RMD start** by default (the IRA's own start age), or **Now**, or a **Custom age**. The Roth IRA card must be switched on for conversions to happen.

## Asset Value chart: the devalue sliders

The two rows of sliders above the Asset Value chart show roughly what the balances are worth *after tax*. They only change how the chart is drawn; they never change the projection.

- **LTCG devalue** removes that percentage of each brokerage portfolio's unrealized gain.
- **Ordinary income devalue** removes that percentage of the pre-tax IRA balance.
- The Roth IRA is never reduced.
- The **Before the last passing** pair applies to the years up to the last passing. The **After the last passing** pair applies to the years after it, using the heirs' anticipated tax brackets. Defaults are 10% / 10% before and 24% / 40% after.
- The dashed **cost-basis line** is drawn only in years where the LTCG devalue is 0%. Any LTCG devalue moves the brokerage band toward 100% basis, so the line would no longer mark the top of the gain.

## Tax features worth knowing

- Taxable Social Security is based on provisional income, which includes qualified dividends, realized long-term gains and tax-exempt income.
- From 2025 through 2028 the **enhanced deduction for seniors** (Schedule 1-A) is applied for each person who is 65 by year-end, phased out above $75,000 (single) or $150,000 (joint) of MAGI.
- IRMAA surcharges use the MAGI (AGI plus tax-exempt income) from two years earlier.

## Ask about this plan

The chat box can answer questions about your plan using a text snapshot of your inputs and results. It needs your own API key, which is kept only in your browser and is never saved in a plan file.
