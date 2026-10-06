# NOTES

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

---

## Roth Conversion

* **Convert < future tax bracket strategy** A common strategy. App can maximize pre-tax IRA withdraw below target tax bracket.
* **Higher Aage Conversion Considerations:**
  * If withdraw has very little taxation, then no need for conversion. Scenarios are
    * If LTC cost starts, itemized deduction will eliminate pre-tax IRA withdraw taxation. Resulting lower tax bracket also offers higher Roth conversion pace opportunity.
    * If heir has lower income bracket, their withdraw cost maybe low. However, the withdraw pace with <= 10 years after passing. IRA beneficiary is changeable anytime so ideal tax efficiency is name the lower income bracket heirs for the pre-tax IRA
  * If heir withdraw has high taxation, ideally complete roth convert before passing. Require guesstimate on timing of course.
  * More aggressive Roth Conversion pacing may not be beneficial even for long term. Study overall asset value projection and 10 year after passing stretch to evaluate. Asset Chart include Asset withdraw costs to help evaluation.

---

## Basis Tracking

* **Just Average** A portfolio only tracks average basis %. In reality, asset lots are likely considered during withdrawal to maximize overall tax efficiency.
* **Reinvestments** These are 100% basis added to basis tracking
* **Step-up** Portfolio (non IDGT) basis changed to 100% on passing.
* **Asset/Basis Swaps** Between owner’s portfolio and IDGTs. Very crude. Since using only average basis % without lot tracking. Easiest asset/basis swap benefit in this crude simulation is after 1st person of married couple passes. The fully stepped-up basis can be swapped with IDGT at this time. Besides this scenario, crude simulation illustrates all the portfolios with similar asset classes will have similar basis % decrease over time which doesn’t provide much asset/basis swap opportunity. Lot level optimization may improve the yield but is likely a minor benefit compared to 1st passing step-up.

---

## How to use AI

* **Built-in chatbot** The “ask about this plan” chatbot is quite limited in value because
  * web application runs completely on your computer and do not have a build-in chatbot by default
  * this chatbot has to be granted an access API key to LLMs. Tested with google’s free gemini free tier (Gemini flash 3 on 10/4/26 from https://aistudio.google.com/) and it can only answer some simple requests and are often wrong.
* **Export data to use with frontier chatbots** Export PDF and excel data of your plan and given it to frontier chatbots like chatgpt, claude, grok to ask for review generate quite interesting results and offer more things to consider.
* **Provide the app and save file** Providing a link to the html app and your plan’s save file is perhaps most powerful. Chatgpt copied the entire app and can have the ability to run various scenarios.

