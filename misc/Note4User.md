# NOTES

## Lacking and Incomplete Features

* **Simplistic Tax Calculation:** Tax Calculations are general of course. Projection does not calculate complete taxes
* **No Tax Exempts:** Not Implemented
* **No Annuities:** Not Implemented
* **Excel Export Rudimentary:** Currently just table of #s output by the app. Plan to include cell calculation based on formulas. Waiting until app matures as formula based spreadsheet require AI/LLM to work much longer to build the application 2x (once each for HTML and EXCEL followed by correlation check and testing)

---

## Expenses Planning

* **NO Expenses Planning:** This tool doesn’t provide expense planning. Users need to assess if income is sufficient for all the expense needs. If none portfolio incomes ( wage, social security, rental etc. Excluding dividends, LTCG which are from portfolios ) is insufficient for expenses, portfolio include expense entry to support expenses shortfalls
* **Portfolio Expense Assumption:** A single portfolio (even married) if assumed to support expense shortfalls
  * % of total income tax
  * fees (such as financial advisor)
  * withdraw
* **Portfolio Income paying Expenses:** Following portfolio income sequence pays the expense needs
  * dividend yields are first used to pay these expenses
  * Any remaining dividends is reinvested
  * If dividend is insufficient, assets are sold and LTCG automatically calculated for income tax.
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