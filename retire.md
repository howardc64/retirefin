# Retirement Income Planner — Product Spec (cleaned up)

*This is a reorganized, typo-corrected version of the original requirements notes (`retire.txt`). Content is unchanged in intent; it's grouped by topic, terms are made consistent (e.g. "IRRMA" → "IRMAA", "sSS" → "SS"), and ambiguous phrasing is clarified in \[bracketed notes\] where the original was terse.*

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

---

## 4. User Input

### 4.1 Household setup

- Filing status: Single/widowed, or Married — plus age.
- Person 1 name, Person 2 name (if married).
- Naming convention: `$P1` = person 1, `$P2` = person 2, `$P0` = the older of the two people. \[Ignore any "if 2 people" feature below when the household is single/widowed.\]

### 4.2 Shared field types (used across multiple income sources)

- **Age range**: choose a start age (or "now" — default) and an end age (or "passing" — default).
- **Annual change**: 0%, inflation rate, inflation ± a custom %, or a fully custom entered % (default: inflation rate).
- **Survivor benefit ("bene")**: for married households, a checkbox marking whether this income source continues to the spouse after the owner passes.

### 4.3 Income sources table

One column per person (if married); each income type's card should top-align across the two person-columns for visual clarity. Each income type needs its own set of inputs:

| Income source | Fields required |
| --- | --- |
| **Wage** | Age range (default end age 65), annual change |
| **Social Security** | Already-started flag, or FRA (age 67 default) if not yet started |
| **Pension** | Age range, annual change, survivor benefit |
| **Rental income** | Age range, annual change, survivor benefit |
| **Short-term capital gains (STCG)** | Annual change, survivor benefit |
| **Long-term capital gains (LTCG)** | Annual change, survivor benefit |
| **Pre-tax IRA** | Age range (default start age = RMD age), annual change (default: inflation + 3%), survivor benefit |
| **Brokerage portfolio(s)** | Household-wide Qualified Dividend % (of Ordinary Dividends), applied to all portfolios. User can add multiple portfolios; each needs: age range, annual change (default: inflation + 3%), survivor benefit, and annual Ordinary Dividend (ODIV) yield % (default 1.1%) |

### 4.4 Global assumption

- **Inflation rate slider**, initial value 3%. Assume the Social Security COLA rate equals the inflation rate.

---

## 5. Chart UI Conventions

- Popup windows: label left-justified, data right-justified.
- Chart width = 2/3 of page width, centered horizontally.
- Chart height = chart width.
- Smoothly animate chart changes when an input changes — don't redraw the whole chart from scratch.
- Add a light/dark color toggle for dashed reference lines and their labels (default: lighter).
- Once the user enters a person's name, it should update automatically everywhere in the UI.

---

## 6. Section: Social Security (SS)

### 6.1 Claim-age control

- Slider for each person's SS start age (default: FRA, or greyed-out/unchangeable if that person has already started benefits).

### 6.2 Spousal Benefit Rule (SSSBR)

- If either person qualifies for the Spousal Benefit Rule:
  - Adjust their SS accordingly.
  - Follow SSSBR rules for starting SS before/after FRA.
  - Follow SSSBR rules for how SS changes when the spouse passes.

### 6.3 Break-even analysis

Build a chart driven by these slider inputs:

- **Passing age**: P1's passing age (default 85) and P2's passing age (default 90) — both sliders use the same scale/width.
- **SS start age**: each person's claim age (default: FRA, or their already-started age).

**Chart spec:**

- Y axis = cumulative combined household SS. Locked scale.
- X axis = P0's age, from current age to 100. Locked scale, even as sliders move.
- All values converted to today's dollars.
- Graph one line for every other candidate age P0 could start SS.
- Chart width = 2/3 of page width, centered horizontally; height = width.
- Stop each line once both people have passed.

**Accompanying table** — for every graphed line, show:

- Monthly SS
- Total household SS
- Real annual ROI % on SS

Include a brief explanation of the ROI calculation method.

---

## 7. IRA Notes

- Track dividend yield for IRA holdings as part of the income model.

---

## 8. Section: Annual Household Income

### 8.1 RMDs

- Calculate the IRA Required Minimum Distribution (RMD) for every IRA owner.
- Source the Uniform Lifetime Table from the IRS/Fidelity reference: `https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/UniformLifetimeTable.pdf`
- Annual RMD = prior-year IRA balance ÷ table divisor for the owner's age that year.
- After an IRA owner passes, the IRA is inherited by the surviving spouse.

### 8.2 Reference data

- Use current-year federal tax income brackets.
- Use the latest published IRMAA brackets.

### 8.3 Chart spec

- **Y axis**: annual household income. Default locked max = $150k (auto-raise if the data requires more).
  - Draw each income source as a thick line, in a distinct color, stacked in this order (bottom to top): pension, wage, taxable interest, IRA RMD (today's $), rent, QDIV, ODIV minus QDIV, SS for P0, SS for the other person. Respect the SSSBR when stacking SS.
  - Draw income until the last person passes.
  - Overlay dashed IRMAA-tier bracket lines matching that year's filing status, in distinctive colors, drawn on top and labeled "IRMAA Tier #". Include at least the lowest IRMAA tier on the chart.
  - Overlay dashed income-tax bracket lines matching that year's filing status, in distinctive colors, drawn on top. Label the rate above the line for the higher bracket and below the line for the lower bracket; include the words "income tax" in the label.
  - Popup window should include the current IRA value.
- **X axis**: P0's age, from current age to 100. Locked scale, even as sliders move.
- All values converted to today's dollars.
- Chart height = chart width.
- Stop including a person's income once they pass.

---

## 9. Taxation

> **Note:** All tax calculations in this app are simplified: they assume all income is ordinary income, with no lower-rate qualified income unless explicitly modeled (e.g. QDIV/LTCG below).

### 9.1 Filing status (FS)

- When one person passes, filing status switches to Single for that year forward.

### 9.2 Taxable Social Security (TSS)

- Calculate provisional income (PI).
- Calculate TSS from PI. Re-check filing status in case one person has passed.
- **Note:** TSS bracket limits have not changed since the 1980s/90s and are not COLA-adjusted in this model — so TSS as a share of income will rise over time.

### 9.3 Taxable Social Security Tax (TSST) — chart spec

- Y axis = TSS. Locked scale.
- Draw a thick line; line height = TSST.
- Draw until the last person passes; note that filing status changes when the first person passes.
- Show the effective tax %.
- **Note:** the model should call out the "torpedo effect" — every additional dollar of income that increases the taxable portion of SS is itself taxed, and pushes more SS into taxability, compounding the effect.

### 9.4 Total Tax (TT)

- AGI = all non-SS income + TSS.
- Taxable income (TI) = AGI − standard deduction (based on filing status).
- Use current-year tax brackets (TB).
- Calculate total tax on TI, including the dividend/capital-gains tax computation.

**Chart spec:**

- Y axis = TT. Locked scale.
- Draw a thick line, with distinct colors per segment. Line height = TT amount, with segments stacked bottom-to-top as: ordinary income segment, then each qualified-dividend bracket segment, then each LTCG bracket segment.
- Overlay thin dashed tax-bracket (TB) lines on top, where visible on scale, matching that year's filing status only.
  - Label the rate above the line for the higher bracket and below the line for the lower bracket.
- Draw until the last person passes; filing status changes when the first person passes.
- Popup window should include: TI, standard deduction, all income components, and PI.

> **Note:** because TT is simplified, this tax calculation also excludes most deductions and credits.

---

## 10. Asset Value — chart spec

Draw a chart showing, in today's dollars, in a style consistent with the other charts:

- All brokerage portfolio values.
- All pre-tax IRA values.

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

## 14. References

- Use the previously generated HTML file as the reference for visual layout and style.