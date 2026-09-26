# Retirement Income Planner — Product Spec (cleaned up)

*This is a reorganized, typo-corrected version of the original requirements notes (`retire.txt`). Content is unchanged in intent; it's grouped by topic, terms are made consistent (e.g. "IRRMA" → "IRMAA", "sSS" → "SS"), and ambiguous phrasing is clarified in \[bracketed notes\] where the original was terse.*

*Cleanup pass: removed stray invisible characters and broken bold markers from headings, renumbered §4's subsections sequentially (4.1–4.5, closing the gap left by an earlier 4.0 insertion), fixed a leftover "IRRMA" typo in §8.3, and normalized heading capitalization and spacing. No content changed.*

*Revision history on §4.4's Pre-tax IRA row: an early pass removed "Add convamount to ordinary income" on the reasoning that a Roth conversion is just an internal transfer between accounts. That reasoning was wrong in practice — a Roth conversion is genuinely taxed as ordinary income the year it happens — so a second pass restored it, adding a "Roth conversion" band to the §8.3 income chart so it would actually be visible (the original problem wasn't that it was taxed, it was that it was invisible). This version refines that once more: rather than a separate "Roth conversion" concept, the spec now frames it as what it actually is on a tax return — a withdrawal from the pre-tax IRA (`Pre-tax IRA withdraw += convamount`), taxed exactly like the RMD, with its own "Pre-tax IRA withdraw" band on the income chart alongside (not instead of) the "IRA RMD" band. Net effect on the numbers is identical to the second pass; only the framing and the band's name/position changed.*

---

## 1. Overview

Build an HTML app that runs completely locally in the browser to:

- Take financial-data input for a single/widowed person or a married couple.
- Provide adjustment sliders for key future-financial-foundation variables (inflation, COLA).
- Chart projected future Social Security income.
- Chart income-stacking trends over time.
- Draw IRMAA tier bands on the income trend chart.
- Show total income tax.
- Show taxable Social Security.
- Express all calculated numbers in **today's dollars**, for easy understanding at today's cost of living.
- Save and restore user input and slider settings to/from a file, so the user can resume work across multiple sessions.

---

## 2. Today's Dollars vs. Future Dollars

- If a value is entered as a future year's dollars, extrapolate it to all other years using the inflation rate.
- **All chart output is shown in today's dollars** — this is the standard the user reasons in, regardless of how a given input was entered.

---

## 3. General Layout

- An **input column** on the left, with one pane per person.
- An **output column** on the right, containing the visualization/chart sections.
- Both columns scroll **independently**, via their own vertical scrollbar — so the user can adjust an input while keeping a specific chart in view further down the page.
- show_details checkbox (display label “Show Details in Popup”)
- button to generate a separate webpage (preferably tab) to show all calculation formulas and list of variables acronyms (with full spelling). This is to help the user verify calculations as compounded formula errors can accumulate quickly.

---

## 4. User Input

### 4.1. Visual Layout Guidelines

- Any number entry that can be $ value (including as an options), entry box width should accommodate at least 12 digits.
- Spell out following acronyms in displayed html and tooltip unless already done nearby. SS, TT, TSS, SST. Ignore standard acronyms like IRA AGI etc.

### 4.2. Household Setup

- Filing status: Single/widowed, or Married — plus age.
- Person 1 name, Person 2 name (if married).
- Naming convention: `$P1` = person 1, `$P2` = person 2, `$P0` = the older of the two people. \[Ignore any "if 2 people" feature below when the household is single/widowed.\]

### 4.3. Shared Field Types (Used Across Multiple Income Sources)

- **Age range**: choose a start age (or "now" — default) and an end age (or "passing" — default).
- **Annual change**: 0%, inflation rate, inflation ± a custom %, or a fully custom entered % (default: inflation rate).
- **Survivor benefit ("bene")**: for married households, a checkbox marking whether this income source continues to the spouse after the owner passes.

### 4.4. Income Sources Table

- One column per person (if married); each income type's card should top-align across the two person-columns for visual clarity. Each income type needs its own set of inputs.

- Each income type checkbox on upper left to enable, checkbox on upper right to hide (enable stop using input, hide just hide the income type card to reduce display area)

| Income source                       | Fields required                                                                                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wage**                            | Age range (default end age 65), annual change                                                                                                                                                                                                                          |
| **Social Security**                 | Already-started flag, or FRA (age 67 default) if not yet started<br>**SS start age**: slider for each person's claim age (default: FRA, or their already-started age).                                                                       |
| **Pension**                         | Age range, annual change, survivor benefit                                                                                                                                                                                                                             |
| **Rental income**                   | Age range, annual change, survivor benefit                                                                                                                                                                                                                                                                                |
| **Pre-tax IRA**                     | Age range (default start age = RMD age), annual change (default: inflation + 3%), survivor benefit, annual ROTH Conv (convamount : inflation adjusted, until pre-tax IRA value reach 0). Pre-tax IRA withdraw += convamount                                                                                                                                                                    |
| **ROTH IRA**                     |  annual change (default: inflation + 3%), survivor benefit. Add ROTH Conversion convamount to this account's balance.                                                                                                                                                                     |
| **Brokerage portfolio(s)**          | User can add multiple portfolios; each needs: name, checkbox to hide remainder input to reduce screen spacevalue, age range, annual growth (default: inflation + 4%), survivor benefit, and annual Ordinary Dividend (ODIV) yield % (default 1.5%), Qualified Div (QDIV) % (default 70% ODIV), IDGT checkbox, expense checkbox if checked needs: tax drag (% annual total tax (TT)), fee drag (% or fixed amt), withdraw (inflation adjusted), LTCG (% annual total tax (TT) or % annual total tax (TT) x younger person's age/100 (clamped to 1) (this is ~unrealized gains) or amount (inflation adjusted)), foreign asset % portfolio, foreign tax credit % (default 0.25%). \[Foreign asset %/foreign tax credit % are also shown, and take effect, whenever the IDGT checkbox is on — even if the expense checkbox is off — since a foreign-asset-holding trust is the more natural home for this pair; every other expense field (tax drag, fee drag, withdraw, LTCG) still requires the expense checkbox regardless of IDGT.\] Annual asset value change += annual growth - tax drag - fee drag - withdraw, foreign tax credit += portfolio value * foreign asset % * foreign tax credit %|

### 4.5. Global Assumption

- **Inflation rate slider**, initial value 3%. Assume the Social Security COLA rate equals the inflation rate.
- **Passing age**: P1's passing age (default 85) and P2's passing age (default 90) — both sliders use the same scale (30-100 years) and width.
- Suspended CG Loss amount (SCGL)
- checkbox for speculative future tax threshold change (default unchecked). If checked
  - NIIT exemption threshold : start year, single filing status threshold, married filing status threshold. Threshold entered in today’s $s
  - Social Security Taxation Threshold : Not Implemented Yet

---

## 5. Chart UI Conventions

- Popup windows: label left-justified, data right-justified.
- Chart width = 2/3 of page width, centered horizontally.
- Chart height = chart width.
- Smoothly animate chart changes when an input changes — don't redraw the whole chart from scratch.
- Add a light/dark color toggle for dashed reference lines and their labels (default: lighter).
- Once the user enters a person's name, it should update automatically everywhere in the UI.
- X axis = P0's age, from current age to younger person reaching 100. Locked scale, even as sliders move.

---

## 6. Section: Social Security (SS)

### 6.1. Spousal Benefit Rule (SSSBR)

- If either person qualifies for the Spousal Benefit Rule:
  - Adjust their SS accordingly.
  - Follow SSSBR rules for starting SS before/after FRA.
  - Follow SSSBR rules for how SS changes when the spouse passes.

### 6.2. Start Age Analysis

**Chart spec:**

- Y axis = cumulative combined household SS. Locked scale.
- All values converted to today's dollars.
- Graph one line for every other candidate age P0 could start SS.
- Graph dashed line for P0's start age
- Chart width = 2/3 of page width, centered horizontally; height = width.
- Stop each line once both people have passed.

**Popup Tooltip** — show:

- Display and calculate data only at cursor intersection. Hit radius 8
- Monthly SS for all persons
- If 2 lines are intersected, include only 1 in tooltip

---

## 7. IRA Notes

- Track dividend yield for IRA holdings as part of the income model.

---

## 8. Section: Annual Household Income

### 8.1. RMDs

- Calculate the IRA Required Minimum Distribution (RMD) for every IRA owner.
- Source the Uniform Lifetime Table from the IRS/Fidelity reference: `https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/UniformLifetimeTable.pdf`
- Annual RMD = prior-year IRA balance ÷ table divisor for the owner's age that year.
- After an IRA owner passes, the IRA is inherited by the surviving spouse.

### 8.2. Reference Data

- Use current-year federal tax income brackets.
- Use the latest published IRMAA brackets.

### 8.3. Chart Spec

- **Note:** IRMAA brackets determined by MAGI (AGI + tax exempts + foreign tax credits etc) Following graph is ~AGI which is ~MAGI
- **Y axis**: annual household income. Default locked max = $150k (auto-raise if the data requires more).
- Eliminate annual LTCG amount with available SCGL
  - Draw each income source as a thick line, in a distinct color, stacked in this order (bottom to top): pension, wage, pre-tax IRA withdraw, IRA RMD (today's $), rent, QDIV, ODIV minus QDIV, SS for P0, SS for the other person. Respect the SSSBR when stacking SS. \[Pre-tax IRA withdraw and IRA RMD are two separate bands: RMD is the mandatory required-minimum-distribution amount, while pre-tax IRA withdraw is the (also taxable) amount withdrawn on top of that specifically to fund a configured Roth conversion (§4.4) — it's a real withdrawal from the pre-tax account, taxed the same way the RMD is, so it needs its own band or the visible stack total wouldn't match what's actually taxed.\]
  - Draw income until the last person passes.
  - Overlay dashed IRMAA-tier bracket lines matching that year's filing status, in single colors, drawn on top and labeled "IRMAA Tier #". Include at least the lowest IRMAA tier on the chart.
  - Tooltip should include total income, SCGL. If show_details show filing status, AGI
- All values converted to today's dollars.
- Chart height = chart width.
- Stop including a person's income once they pass.

---

## 9. Taxation

> **Note:** All tax calculations in this app are simplified: they assume all income is ordinary income, with no lower-rate qualified income unless explicitly modeled (e.g. QDIV/LTCG below).

### 9.1. Filing Status (FS)

- When one person passes, filing status switches to Single for that year forward.

### 9.2. Social Security Tax (SST)

- Calculate provisional income (PI).
- Calculate actual social security tax (SST) from PI. Re-check filing status in case one person has passed.
- TSS = Total Social Security Income

### 9.3. Social Security Tax — Chart Spec

- Social Security Tax % (SST%) = SST / total social security %
- Y axis = TSS. Locked scale.
- Draw a thick line; line height = TSS.
- Overlay thick link; line height = SST
- Draw until the last person passes; note that filing status changes when the first person passes.
- **Note:** the model should call out the "torpedo effect" — every additional dollar of income that increases the taxable portion of SS is itself taxed, and pushes more SS into taxability, compounding the effect.

#### 9.3.1. Chart Tooltip
- Show TSS, SST, SST%, top marginal rate. If show_details show PI

### 9.4. Total Tax (TT)

- ordinary income = pension + wage + RMD withdraw + pre-tax IRA withdraw + rent \[+ ODIV minus QDIV, which is also ordinary-rate income though not spelled out in this line — see §4.4's Brokerage row and the AGI line just below\]
- AGI = all non-SS income + TSS.
- Taxable income (TI) = AGI − standard deduction (based on filing status).
- Use current-year tax brackets (TB).
- Calculate total tax on TI, including the dividend/capital-gains tax computation.
- Subtract all portfolio foreign tax credit
- Include NIIT if triggered in chart and tooltip.

**Chart spec:**

- Y axis = TT. Locked scale.
- Show % scale on right of chart
- Draw a thick line, with distinct colors per segment. Line height = TT amount, with segments stacked bottom-to-top as: ordinary income segment, then each qualified-dividend bracket segment, then each LTCG bracket segment.
- Draw until the last person passes; filing status changes when the first person passes.
- overlay thick bright red dashed line for effective tax rate.
- overlay thick bright green dashed line for marginal tax rate.
- Popup window should include: Effective Tax Rate, Marginal Tax Rate, Total Tax. If show_details, show TI, all income components, standard deduction, foreign tax credit

> **Note:** because Total Tax is simplified, this tax calculation also excludes most deductions and credits.

---

## 10. Asset Value — Chart Spec

Draw a chart showing, in today's dollars, in a style consistent with the other charts:

- All brokerage portfolio (excluding IDGTs) values. Each in distinct color
- All pre-tax IRA values. Each in distinct color
- All ROTH IRA values. Each in distinct color
- Tooltip: all person's age, portfolio value, pre-tax and ROTH IRA value, if expenses checked ( annual growth % with expenses subtracted, if show_details show expenses) annual growth %, All in today's $s

If have IDGT portfolios, draw another chart showing, in today's dollars, in a style consistent with the other charts:

- All IDGT brokerage portfolio values.
- Tooltip: all person's age, portfolio value, annual growth %. If show_details show tax drag, fee drag. All in today's $s

---

## 11. Save / Restore

- Provide an option to save/restore all input parameters and slider values to/from a file, so the user can resume progress later.
- On restore, reset the app state before loading the saved data.

---

## 12. Output

- Generate a standalone `index.html` file, suitable for hosting via GitHub Pages (or any static web host).

---

## 13. Diagnostics

- Run an HTML validity check before delivering.
- If a "Detailed Tax Calculation Age" input is defined, produce a PDF output for that age's detail. \[Original note was terse — treat as an optional stretch feature, not a core requirement, unless clarified further.\]

---

## References

- Use the previously generated HTML file as the reference for visual layout and style.

## TODO Later

- AUM fee not yet implemented
- LT/ST CGs are just place holders. Maybe not so useful for most retirees setting up brokerage accounts for growth, income, expenses, and fees
- No annuities
- No real estate
- No tax exempt income