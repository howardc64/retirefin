# Retirement Income Planner — Usage

This page explains how to work with the planner. Everything is entered in **today's dollars**; the charts are drawn in today's dollars too, so you can read them without mentally adjusting for inflation.

## Features at a glance

- **Household setup** for a single person or a married couple, with inflation, living expenses and optional assumptions (SCGL, AUM fee, long-term care).
- **Income sources** for each person: Social Security, wages, pension, rental properties, **annuities**, pre-tax IRA / 401(k), Roth IRA and brokerage portfolios.
- **Brokerage portfolios** as either *Living expense & income* or *IDGT*, with growth, dividends, cost basis and optional AUM fee.
- **Annuities** with fixed or %-of-value payouts, taxable / tax-exempt payouts and a passing benefit.
- **Roth conversions**, RMDs and IRA stretch after the last passing.
- **Tax modeling**: federal brackets, taxable Social Security, long-term gains, NIIT, IRMAA and the senior deduction.
- **Charts** for Social Security claiming age, annual income, taxes, expenses and asset value (with adjustable withdraw cost).
- **Drag to reorder** the income cards (spouses move together); the order is saved with the plan.
- **Save / load** plans, **Export to Excel**, a **Formulas** reference and an optional **chat** to ask about your plan.

## Getting started

1. In **Household Setup**, choose **Single / widowed** or **Married**, then set the assumptions: inflation rate (also used as the Social Security COLA), household living expenses, the suspended capital-gain loss (SCGL) carryforward, and the advisory (AUM) fee.
   **Asset / basis swap** (unchecked by default, above Long Term Care): when checked, *Living expense & income* portfolio assets are swapped, value for value, with *IDGT* assets, and the basis moves in proportion to the assets traded, so the IDGT ends up with the high-basis assets and the living portfolio with the low-basis ones, which step up at the last passing. Enter how many **years before the last passing** to swap (single or married). If married, the swap is also done the year after the first person passes, when that person's portfolio steps up (no value needed). A swap only happens where the IDGT's assets have a lower basis % than the living portfolio's (both portfolios must track cost basis); the amount is the smaller of the two values, and a swap is only between portfolios held by the same person: a portfolio marked **Joint owned with spouse** is held by the spouse once its owner has passed (one without it is gone, so it cannot be swapped). Because the living portfolio then holds low-basis assets, it realizes more gain if it sells to pay expenses.
   Long Term Care living expenses start at $7,500 for a single household; for a married household the 1st LTC living expenses follow your household living expenses until you change them and the 2nd default to $15,000 (all in today's $).
   The SCGL, AUM fee, Long Term Care and speculative-model items in the Assumptions panel each have an **Enable** box on the left (untick it and the plan ignores that item, but keeps what you typed) and a **Hide** box on the right (collapses the item to save screen space without changing the plan).
2. Under **Income Sources**, fill in each person: birth date, Social Security, wages, pension, **rental properties**, the **pre-tax IRA / 401(k)**, the **Roth IRA**, and any **brokerage portfolios**. Switch an item on with its checkbox, then fill in its details.
3. Read the charts below the inputs. They update as you type.

**Reordering cards:** drag the ⋮⋮ handle at the left of any income card (Social Security, wages, pension, rentals, annuities, brokerage, IRA, Roth) and drop it above or below another card. In a married plan both spouses' cards of that type move together. The order is saved with the plan and restored when you load it. (Drag and drop works with a mouse or pen; it is not available on touch screens.)

Most items have an **age range** (when the amount starts and stops) and an **annual change** (how the amount grows or shrinks in real, today's-dollar terms). In a married plan, an owned item (rental, brokerage portfolio, annuity) can be marked **Joint owned with spouse** and an IRA (pre-tax or Roth) or a pension **Inherited by spouse**, so in both cases the spouse owns it (or receives it) after the first person passes.

## The top buttons

- **Usage** — this page. **Notes** and **Formulas** open the notes and the calculation reference.
- **Save to file** — saves the whole plan as a file. **Load file** brings a saved plan back (or loads a sample plan if any are available).
- **Reset to defaults** — clears the plan back to its starting values.
- **Export to Excel** — downloads the full year-by-year projection (the "Projection by year" sheet) plus one sheet per account. It includes the Annual Household Income popup's *Total income*, the ordinary income before deduction, the deduction, ordinary / qualified / total taxable income, and the no-conversion figures and "trigger met" flag used by the Roth conversion start triggers.
- **Show Details in Popup** — adds the line-by-line breakdown to the hover popups on the main charts. The small charts beside Annual Household Income, Total Income Tax and Asset Value show the plan owner(s) and age, then only their own values.
- **Popup background** — the slider to the right of *Show Details in Popup* sets how light or dark every chart popup is, from a see-through white (left) to a see-through black (right), so the chart underneath stays visible; the text switches to dark on a light background. It is remembered in your browser.

The Usage, Notes and Formulas pages open in a new tab. Usage and Notes read their text from the `misc` folder when you click, so they show whatever those files currently say. This works when the app is served over `http(s)`; if you opened it as a local `file://` page the browser may block it, and the new tab will say so.

## Reading the charts

- **Social Security — Start Age Analysis**: cumulative household Social Security for different claiming ages.
- **Annual Household Income**: income by source. The small chart on the right shows your MAGI, stacked in the same colors (Social Security counts only its taxable part), with dashed lines at the IRMAA brackets. Each line is labeled with the bracket's income and how much more you pay for Medicare Part B than the standard premium (for example `$218k +40%`). Its popup shows your MAGI and the IRMAA tier that MAGI reaches (per person; it is billed two years later, which is when the Household Expenses chart charges it). Below it, a second small chart shows your taxable ordinary income: the income taxed at ordinary rates (pension, taxable annuity, wages, IRA withdrawals and conversions, rental, non-qualified dividends and taxable Social Security) minus your deduction, in the same colors. Qualified dividends and long-term gains are not on it because they are taxed at their own rates. The deduction is taken off the bottom of the stack, so each ordinary band is that source's taxable part. Black dashed lines mark the ordinary tax brackets, each labeled with the rate above it, so you can read straight off the chart which bracket your ordinary income reaches (the Roth conversion "below ordinary bracket" limit stops at one of these lines). A red dashed line sits above the stack by the amount of the deduction (taxable ordinary income + deduction, which is your ordinary income before the deduction); it is listed in the main income chart's legend and is left out in years with no deduction absorbed. Its popup is kept simple: the owner(s) and age, the ordinary income before the deduction (the red line), the deduction and the taxable ordinary income. Qualified income and the total taxable income are in the main Annual Household Income popup when Show Details is on.
- **Social Security Tax** and **Total Income Tax**: tax by source and by income type. Total Income Tax has two small charts on the right: ordinary income tax (with dashed lines at the ordinary tax brackets, each labeled with the rate above it) and qualified dividend, long-term gain and NIIT tax. Check **view IRMAA as tax** to add the IRMAA surcharge above the tax stack as a dashed line.
- **Household Expenses**: living, long-term care, IRMAA, AUM fee and income tax.
- **Asset Value**: brokerage, pre-tax IRA and Roth IRA balances by holder, with a second chart for IDGT portfolios when you set a portfolio's type to IDGT. The small chart on the right shows the annual Roth conversion (today's $), stacked by pre-tax IRA in the same colors as the main chart. Its scale starts at the combined value of your pre-tax IRAs, and its popup shows each IRA's conversion and the total. It appears when a pre-tax IRA converts to a Roth IRA.

Each chart has a **Rescale** button to refit its vertical axis, and a **Hide** box to collapse the whole section. Hover a chart for a popup of that year's numbers.

## Paying expenses and reinvesting income

Each year's expenses are paid in this order: household income first (wages, Social Security, pension, rental income including depreciation, tax-exempt income and IRA required distributions), then the dividends of brokerage portfolios that have **Pay expenses** checked, then sales of those portfolios. If the portfolios run out and expenses are still unpaid, the shortfall is paid by withdrawing from **pre-tax IRA** first (shared across the accounts in proportion to their balances; it counts as taxable income, so the tax on it is added to the expenses), and then by withdrawing from the **Roth IRA** (tax-free). Anything still unpaid after that is shown as an unfunded shortfall. The IRA and Roth balances in the charts drop by these amounts, and the pre-tax IRA withdraw appears as its own band in the Annual Household Income, MAGI and Taxable income charts (*Pre-tax IRA withdraw (for expenses)*). The Roth IRA withdraw appears in the Annual Household Income chart as a tax-exempt band (*Roth IRA withdraw (tax-exempt, untaxed)*); it is not in the MAGI or Taxable income charts because it is untaxed. When some year's expenses cannot be paid at all, a big red **UNFUNDED EXPENSES** alert with the age (or age range) appears above the Household Expenses chart. No early-withdrawal penalty or age limit is modeled.

If household income is more than the expenses, the leftover is *excess income*. It is added to the brokerage portfolios that have **Reinvest excess income** checked. If none is checked, the excess leaves the model. Both boxes are off by default.

## Annuities

The **Annuity** card (under Brokerage portfolio income; **Add** / **Remove**, one set per person) holds any number of annuity contracts. Each has an account value, an optional premium (cost basis; blank = account value), credited growth (**net of all fees**), a payout Start–End age, an annual payout, a passing benefit, and an optional *Joint owned with spouse* box.

- **Annual payout:** *Fixed $* (a nominal amount, not adjusted for inflation or COLA) or *% of annual account value*. Payouts stop when the account is empty.
- **Payout tax treatment:** *Non-qualified, withdrawals* (gain is taxed first, then premium comes out tax-free); *Non-qualified, annuitized* (exclusion ratio: premium ÷ expected total payout to the owner's passing age is tax-free until the premium is recovered); *Qualified / IRA annuity* (fully taxable); or *Tax-exempt payout* (a % of every payout and of the passing benefit is untaxed). Taxable payouts are ordinary income (non-qualified ones also count as net investment income for NIIT). Tax-exempt payouts are never in AGI but count toward Social Security taxation and MAGI (IRMAA), and all payouts are household cash income that pays expenses.
- **Passing benefit (paid to heirs):** *Fixed $*, *Initial account value* (both not adjusted for inflation), or *Account value at passing*. It is paid when the contract ends (the owner's passing, or the spouse's if the contract continues) and is shown in the Asset Value tooltip and the Excel export with its taxable and tax-exempt parts: all taxable if qualified; the amount above the remaining premium if non-qualified; the non-exempt % if tax-exempt. It is not household cash flow.
- **Asset Value chart:** each annuity's account value is a band on the main chart. The *Ordinary income withdraw cost* slider applies to the taxable part of an annuity's value (whole value if qualified, gain only if non-qualified). Annuities end with their owner unless marked joint owned with the spouse; there is no stretch.

## Rental income and tax-exempt income

- **Rental income** can hold any number of properties (**Add** and **Remove** on the card). Enter the *taxable* annual amount (already net of depreciation) and the annual depreciation separately. Depreciation counts as cash for the household but is not taxed.
- A brokerage portfolio's **Tax-exempt yield %** (for example municipal-bond interest) is paid out of the portfolio each year. It is not taxed and not part of AGI, but it counts as household income, and it is included in provisional income for Social Security taxation and in the MAGI used for IRMAA.

## Roth conversions

On the pre-tax IRA card, **Annual Roth conversion** moves money into the Roth IRA each year, taxed as ordinary income. It has two options:

- **$/yr, today's $** — a flat amount each year. The slider runs from $0 up to the IRA balance and starts at $0.
- **Below IRMAA & ordinary income tax brackets** — the projection converts as much as it can while staying **below both** brackets you choose with two sliders. The two sliders sit side by side and step through the bracket values (the dollar amounts shown follow the Single / Married setting). Staying *below* a bracket means under the point where it starts, so choosing the 24% ordinary bracket fills the 22% bracket and stops. Slide to 0 to block conversions, or to the far end for no limit. The first ordinary stop (10%) converts only what fits in the standard deduction. The **IRMAA bracket** slider uses the Part B % over standard that labels the lines on the MAGI chart (+40%, +100%, +160%, +220%, +240%); +40% means MAGI stays under the first IRMAA line, so no surcharge. Because IRMAA looks back two years, a conversion now sets the premium two years later, so the IRMAA limit applies whenever someone alive is 63 or older, right up to the last years. If your other income already exceeds a limit, nothing is converted that year. When both spouses use this option, the first person converts first and the second converts what is still left under the limits. **Conversion start** is **RMD start** by default (the IRA's own start age), or **Now**, or a **Custom age**. The Roth IRA card must be switched on for conversions to happen.
- **Conversion start** — *RMD start* (default), *Now* or *Custom age* begin converting at an age. Three triggers begin converting the first year a condition is met, and conversions then continue every later year: **When tax bracket is below x%** (a slider over the discrete brackets; the household's taxable ordinary income before any conversion must be at or below where that bracket starts, with dollar amounts following Single / Married), **When itemized deductions > a value** (type the value in today's $; itemized deductions here are the Long Term Care cost above 7.5% of AGI), and **When LTC starts** (the first LTC start age; turn on Long Term Care in Assumptions or conversions never start).

## Asset Value chart: the withdraw cost sliders

The two rows of sliders above the Asset Value chart show roughly what the balances are worth *after tax*. They only change how the chart is drawn; they never change the projection.

- **LTCG withdraw cost** removes that percentage of each brokerage portfolio's unrealized gain.
- **Ordinary income withdraw cost** removes that percentage of the pre-tax IRA balance.
- The Roth IRA is never reduced.
- The **Before the last passing** pair applies to the years up to the last passing. The **After the last passing** pair applies to the years after it, using the heirs' anticipated tax brackets. All four default to 0%.
- The dashed **cost-basis line** is drawn only in years where the LTCG withdraw cost is 0%. Any LTCG withdraw cost moves the brokerage band toward 100% basis, so the line would no longer mark the top of the gain. In the hover popups of both asset charts, each brokerage portfolio that tracks cost basis shows its **cost basis as a % of its value** (100% means no unrealized gain), and the dashed line's row shows the basis as a % of the total brokerage value.

## Tax features worth knowing

- Taxable Social Security is based on provisional income, which includes qualified dividends, realized long-term gains and tax-exempt income.
- From 2025 through 2028 the **enhanced deduction for seniors** (Schedule 1-A) is applied for each person who is 65 by year-end, phased out above $75,000 (single) or $150,000 (joint) of MAGI.
- IRMAA surcharges use the MAGI (AGI plus tax-exempt income) from two years earlier.

## Ask about this plan

The chat box can answer questions about your plan using a text snapshot of your inputs and results. It needs your own API key, which is kept only in your browser and is never saved in a plan file.


**Portfolio type:** each brokerage portfolio is either *Living expense & income* (default; its dividends and sales pay household expenses and excess income is reinvested into it) or *IDGT* (outside the taxable estate; charted separately; does not pay expenses or receive excess income).
