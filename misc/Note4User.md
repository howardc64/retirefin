# NOTES

## Features

* **Todays’s $s:** All numbers in today’s $s for easy understanding
* **Income, Expense and Portfolio/IRA Projection:** Income (Wage, Pension, Social Security) Portfolio (incl IDGTs), IRAs (Pre-tax, Roth)
* **Portfolio Features:** Yield, Qualified Div, Foreign % and Tax Credits. Delayed Start (conversion of assets to equity investment portfolios in the future - ie work stock options, real estate etc.)
* **IRA Features:** Roth Conversion, Stretched IRA
* **On Passing Actions:** Forward asset to survivor, basis step-up, and residual unrealized gains
* **AUM fees:** Fixed and AUM %
* **Social Security:** Start age and torpedo analysis
* **Suspended Long Term Capital Gains Tracking**
* **Married and Single/Widower Status**
* **Chatbot:** AI to analyze and converse about the plan. Require inserting API key into app when running. No security to keep API key private (will remain on your device) Plan data is sent to the AI model in the cloud of course.

## Lacking and Incomplete Features

* **Simplistic Tax Calculation:** Tax Calculations are general of course. Projection does not calculate complete taxes
* **No Tax Exempts:** Not Implemented
* **No Annuities:** Not Implemented
* **Excel Export Rudimentary:** Currently just table of #s output by the app. Plan to include cell calculation based on formulas. Waiting until app matures as formula based spreadsheet require AI/LLM to work much longer to build the application 2x (once each for HTML and EXCEL followed by correlation check and testing)

---

## Expenses Planning

* **Expenses Planning:** This program provide a single entry for living cost. Total expenses are living cost + income tax + IRMAA surcharge + AUM fees. Program will the following sequence of incomes to pay for expenses.
  * household income (wages, social security, pension, rent) first
  * portfolio (non IDGT) dividends. Left overs will be reinvested
  * portfolio assets are then used to cover shortfalls (triggering LTCG)
* **Portfolio Basis Tracking:** Automatic, Formula display ( click Formula button ) shows details
  
---

## General Observations

* **When to start Social Security:** Several key factors to consider
  * Projection if gov will reduce SS from insolvency is an individual comfort level. Impacts remaining considerations.
  * Gamble on life expectancy. If > 80 and don’t need the $, delay start to 70 is better.
  * Spouse age gaps. Widow will inherit spouse’s SS value if higher. If older spouse has higher SS and comfortable to gamble living > 80, then delay start to 70 potentially provides highest SS benefit to younger spouse for even longer.
* **Social Security Tax Torpedo:** SS taxation is designed to be highly taxable once overall income increase slightly. Widower usually gets torpedoed as they keep all income sources except deceased spouse’s SS while tax bracket is halved. 20-40% of SS are taxes if hit by torpedo
* **Widower Taxation:** Widower tax rate increase signification from while married. Generally only deceased spouse’s social security income is lost while everything else remains. But all the tax brackets, exemptions etc. are all generally halved
* **IRMAA:** Medicare cost has surcharges for higher income levels (5 income tiers) Top tiers + Medigap cost converge toward private health insurance costs (~60yo) but probably still cheaper in higher ages. Medicare + good Medigap generally better insurance than cheaper private health insurance.
* **AUM fee drag:** A 1% AUM fee is significant drag on portfolio value (See MFJ2 sample data). For smaller portfolios, < 1% is difficult. For larger portfolios in maintenance phase, re-negotiate fees with advisor is highly desirable to reduce drag. Probably many financial advisor have business model to lower fees to keep customer fees flowing (even if less) in maintenance phase.
* **Long Term Compounding Implications:** This can cause geometric change. Even smaller IRA account can compound significantly with only inflation drag. Foreign Tax Credit’s impact can also be high if have typical 20-30%+ international equities. Any error will also have significant geometric impact. So carefully review all inputs. Hopefully program itself will have no significant errors (NO GUARANTEE!)
---

## Key Planning Whiled Married

* **ROTH Conversions:** If targeting ROTH conversion at within example (24%+NIIT) bracket level, this is much better to do while married. Widower have much lower brackets amounts and lose conversion pace.
* **Confirm all assets pass onto surviving spouse:** Brokerage, bank accounts, IRAs, homes etc. First spouse passing is also opportunity for asset basis step-up. With kids to inherit asset after 2nd spouse pass, check into necessary estate planning.

---


## < $100k Annual Taxable Income 
* **Social Security Tax Torpedo:** Generally not an issue while married. Widower likely hit
* **IRRMA:** Generally avoid IRMAA. Again Widower gets closer to trigger early tiers
* **Tax Rates:** This level achieves the proverbial conclusion “lower taxes when you retire”

---

## Higher Annual Incomes
* **Social Security:** Very small portion of income. When to start doesn’t matter much (ideal timing is still the same). Likely torpedo taxed at 20-40% anyways.
* **IRRMA:** Will get close and likely hit higher surcharge tiers.
* **Foreign Tax Credit:** A typical portfolio with 1/3 global equity in international will yield significant credit. Ideally accounted for in long term compounded analysis.
* **IDGTs:** IDGTs usually have very little growth drag (just inflation) and compounds geometrically. For large IDGTs with grantor commonly paying IDGT taxes (“free” gifting that doesn’t count towards lifetime unified credit), the tax burn on grantor's assets can be significant in longer term future. Need to consider
  * grantor’s estate running out of $
  * step-up planning considerations (want to have enough unrealized gains in the estate to get step-up benefits) so flushing it all to pay IDGT taxes isn’t necessarily the most optimal.