Yes. The current `ARCHITECTURE.md` is intentionally very implementation-oriented—file-by-file contracts, state fields, functions, DOM behavior, and script load order. The higher-level specification should preserve the **business and mathematical architecture** while treating those implementation choices as replaceable. The source architecture explicitly separates input, computation, and presentation, with the projection engine as the authoritative source of derived financial results. ARCHITECTURE

Below is the design specification I would use as the technology-independent successor to that document.


# Retirement Income Planner
## High-Level Technical Design Specification

**Document purpose:** Define the functional, financial, tax, and architectural requirements for a retirement-income planning and federal-tax projection system without prescribing implementation technology, programming language, UI framework, or specific internal algorithms.

**Primary design principle:** The system shall model a household's retirement finances as an integrated, year-by-year projection in which income, taxation, government benefits, portfolio behavior, withdrawals, cost basis, and estate/survivor events interact rather than being calculated as independent modules.

---

# 1. System Purpose

The Retirement Income Planner is a household financial projection system intended to answer questions such as:

- How long will household assets support projected spending?
- How will income sources evolve over the household's lifetime?
- How much federal income tax will the household incur?
- How do Social Security claiming decisions affect lifetime income and taxation?
- How do required minimum distributions affect taxes and portfolio depletion?
- What Roth-conversion strategy best fits specified tax and Medicare constraints?
- How do capital-gain realization, cost basis, and portfolio withdrawals affect taxes?
- How do survivor events change filing status, income, benefits, assets, and taxation?
- How does the tax treatment of assets affect their economic value to heirs?
- How do IDGT assets differ from personally owned assets with respect to basis and death?
- How do long-term-care expenses affect cash flow, deductions, taxation, and asset longevity?
- How do alternative assumptions or strategies change projected outcomes?

The system is therefore a **financial simulation and decision-support system**, not merely an income calculator.

The source architecture establishes a single household input state and a single projection as the authoritative sources for inputs and derived values respectively. :chatgpt-content-reference{index="1"}

---

# 2. Scope

## 2.1 In scope

The system shall support modeling of:

### Household
- One-person and two-person households
- Filing status
- Birth dates/ages
- Projected death/passing ages
- Inflation assumptions
- Household living expenses
- Survivor transitions

### Income
- Wages
- Social Security
- Pensions
- Rental income
- Investment dividends
- Tax-exempt investment income
- Traditional/pre-tax IRA distributions
- Roth conversions
- Roth IRA distributions
- Nonqualified annuity income
- Other modeled retirement-income sources

### Investment assets
- Taxable brokerage portfolios
- Multiple portfolios per person
- Cost basis
- Unrealized gains
- Qualified and ordinary dividends
- Foreign investments and foreign tax credits
- IDGT assets
- AUM fees
- Portfolio growth
- Portfolio expense-funding eligibility
- Reinvestment of excess income

### Retirement accounts
- Traditional IRA / 401(k)-type pre-tax assets
- Roth IRA assets
- Required minimum distributions
- Voluntary withdrawals
- Roth conversions
- Spousal inheritance
- Stretch/inherited-account modeling where applicable

### Taxes and tax-related costs
- Federal ordinary income tax
- Qualified dividend and long-term capital-gain tax
- Taxable Social Security
- Social Security tax "torpedo" effect
- Net Investment Income Tax
- Foreign tax credits
- Capital-loss carryforwards / suspended capital-gain losses
- Standard versus modeled itemized deductions
- Senior deduction where applicable
- Medicare IRMAA
- Tax effects of Roth conversions
- Tax effects of asset sales

### Estate/survivor effects
- Death of either spouse
- Filing-status transition
- Survivor Social Security
- Survivor pension/rental benefits
- Inherited accounts
- Basis adjustment at death
- Carryover basis for assets that do not receive a step-up
- Post-death/legacy projection
- Heir-oriented after-tax asset-value presentation

### Decision analysis
- Social Security claiming comparisons
- Roth-conversion strategies
- Alternative assumptions
- What-if projections
- Asset/basis allocation strategies
- Estate-oriented comparisons

---

# 3. Out of Scope / Explicit Limitations

The system shall distinguish between:

1. **Federal tax law modeled explicitly**
2. **Financial assumptions supplied by the user**
3. **Simplifying assumptions**
4. **Tax rules not modeled**

The application shall not imply that an omitted rule is zero or legally irrelevant.

Examples of potential exclusions from the current architecture include:

- State income tax
- State estate/inheritance tax
- AMT
- Detailed tax-form preparation
- Complex rental-activity limitations
- Passive-activity loss rules
- Detailed foreign-income/MAGI adjustments
- Every possible deduction or tax credit
- Detailed Medicare coverage costs beyond modeled IRMAA
- Detailed beneficiary RMD rules for every beneficiary category
- All possible trust tax consequences
- Estate tax calculations
- Legal validity of particular trust structures
- Individualized legal or tax advice

The current architecture explicitly identifies several such simplifications, including the limited deduction model, certain senior-deduction assumptions, and the scope of foreign-income treatment. These limitations should remain visible in the product rather than being hidden. :chatgpt-content-reference{index="2"}

---

# 4. Architectural Principles

## 4.1 Separation of concerns

The system shall have four conceptual layers:

### A. Input / Scenario Layer
Represents the household's assumptions and strategy choices.

### B. Domain / Rules Layer
Represents federal tax, Social Security, Medicare, retirement-account, and investment-tax rules.

### C. Projection / Simulation Layer
Produces the year-by-year financial projection.

### D. Presentation / Analysis Layer
Displays results, charts, comparisons, exports, explanations, and what-if analyses.

The presentation layer shall never independently calculate financial results that are authoritative in the projection layer.

The source architecture establishes this same conceptual separation: input modifies household state, computation produces the projection, and display consumes projection results. :chatgpt-content-reference{index="3"}

---

# 5. Authoritative Data Model

The system shall maintain a canonical **Household Scenario**.

The scenario shall contain:

### Household attributes
- Filing status
- Inflation assumption
- Person definitions
- Birth dates
- Expected passing ages
- Household spending assumptions

### Person attributes
- Employment income
- Social Security
- Pension
- Rental properties
- Traditional retirement accounts
- Roth accounts
- Annuities
- Beneficiary/survivor relationships

### Portfolio attributes
- Current balance
- Expected growth
- Dividend characteristics
- Tax-exempt income
- Foreign exposure
- Cost basis
- Ownership
- IDGT status
- AUM-fee inclusion
- Expense-funding eligibility
- Reinvestment policy
- Survivor/beneficiary treatment

### Strategy attributes
- Roth conversion policy
- Social Security claiming ages
- Withdrawal priorities
- Asset/basis management assumptions
- Long-term-care assumptions
- Future-tax assumptions

All derived quantities shall be generated by the projection rather than stored independently as competing sources of truth.

The source architecture similarly defines a single state object containing household setup, income sources, portfolios, retirement accounts, assumptions, and strategy controls. :chatgpt-content-reference{index="4"}

---

# 6. Projection Model

## 6.1 Projection horizon

The system shall project finances one year at a time.

Each projection year shall identify:

- Calendar/projection year
- Person ages
- Living/deceased status
- Filing status
- Income
- Taxable income
- Tax
- Government benefit effects
- Expenses
- Asset balances
- Cost basis
- Unrealized gains
- Withdrawals
- Roth conversions
- Estate/survivor effects

The projection shall continue until the modeled household and applicable legacy projection have ended.

---

# 7. Annual Projection Sequence

The annual projection shall conceptually follow this dependency chain:

1. Determine household/person status.
2. Determine ages and survivor status.
3. Determine earned and recurring income.
4. Determine Social Security benefits.
5. Determine pension and rental income.
6. Determine portfolio investment income.
7. Determine retirement-account distributions.
8. Determine potential Roth conversions.
9. Determine household expenses.
10. Determine Medicare-related costs.
11. Determine portfolio withdrawals required to fund expenses.
12. Determine realized capital gains caused by those withdrawals.
13. Calculate taxable income and federal tax.
14. Reconcile tax with the withdrawals required to pay that tax.
15. Update cost basis and asset balances.
16. Apply death/survivor/estate transitions.
17. Produce the completed projection-year record.

The key architectural requirement is that these relationships are **interdependent** rather than independent calculations.

For example:

> Portfolio sales → realized capital gains → AGI/MAGI → federal tax → cash requirement → additional portfolio sales.

The source architecture explicitly models this tax/asset-sale circularity through a convergence process. :chatgpt-content-reference{index="5"}

---

# 8. Financial Dependency Model

The system shall recognize the following important feedback relationships.

## 8.1 Tax ↔ asset-sale feedback

Taxes are a household cash expense.

If ordinary income, capital gains, or Roth conversions increase tax:

- household cash requirements increase;
- additional portfolio assets may need to be sold;
- additional sales may realize capital gains;
- capital gains may further increase tax.

The model must therefore solve this relationship consistently rather than treating tax as an externally imposed expense.

---

## 8.2 Roth conversion ↔ tax feedback

A Roth conversion:

- reduces pre-tax retirement assets;
- increases taxable ordinary income;
- can increase taxable Social Security;
- can increase AGI/MAGI;
- can increase ordinary federal tax;
- can increase NIIT;
- can increase IRMAA in subsequent Medicare years;
- can change the amount of taxable capital gains generated by the expense waterfall.

Therefore a conversion strategy shall be evaluated as a **household-level tax optimization problem**, not simply as a withdrawal from an IRA.

---

## 8.3 Social Security tax feedback

The model shall distinguish:

- gross Social Security benefits;
- taxable Social Security;
- incremental tax caused by Social Security;
- true marginal tax impact of additional ordinary income.

The latter is important because additional ordinary income can cause additional Social Security benefits to become taxable.

The source architecture explicitly treats the "Social Security tax torpedo" as an incremental marginal-tax phenomenon rather than merely the percentage of Social Security that becomes taxable. :chatgpt-content-reference{index="6"}

---

# 9. Federal Tax Rules Engine

Federal tax rules shall be represented as a **versioned tax-rule set**, separate from the projection engine.

This is a critical architectural requirement.

The projection should ask questions such as:

> "What is the ordinary-income tax for this filing status and tax year?"

rather than embedding a specific tax year's brackets inside financial logic.

This permits the application to support multiple tax years and future law changes without redesigning the financial model.

---

# 10. Federal Tax Components

The rules engine shall support, as applicable:

## 10.1 Filing status

At minimum:

- Married filing jointly
- Single

The architecture currently changes the household to single beginning with the year in which either spouse has died. :chatgpt-content-reference{index="7"}

If additional filing statuses are added later, they should be represented as tax-rule dimensions rather than hard-coded exceptions.

---

## 10.2 Ordinary income tax

The tax engine shall support:

- taxable ordinary income;
- marginal brackets;
- filing-status-specific thresholds;
- standard deduction;
- modeled itemized deductions;
- applicable age/senior deductions;
- annual tax-year indexing.

The ordinary tax calculation should remain independent of the financial projection.

---

## 10.3 Qualified dividends and long-term capital gains

The system shall distinguish:

- ordinary dividends;
- qualified dividends;
- realized long-term capital gains.

Qualified dividends and LTCG shall be taxed according to the applicable preferential-rate structure and shall interact with ordinary taxable income through stacking.

---

## 10.4 Social Security taxation

The tax engine shall calculate taxable Social Security using the federal provisional-income framework.

Tax-exempt interest shall be included where required for this determination.

The principal IRS reference is **Publication 915, Social Security and Equivalent Railroad Retirement Benefits**. The IRS explains that taxable benefits depend on one-half of Social Security benefits plus other income, including tax-exempt interest, with up to 85% potentially taxable. :chatgpt-content-reference{index="8"}

Relevant statutory framework includes **IRC §86**.

---

## 10.5 Net Investment Income Tax

The system shall support the 3.8% Net Investment Income Tax.

The rules engine shall determine:

- net investment income;
- applicable MAGI;
- filing-status threshold;
- amount subject to NIIT;
- resulting NIIT.

The IRS describes NIIT as 3.8% of the lesser of net investment income or MAGI above the applicable statutory threshold. :chatgpt-content-reference{index="9"}

Primary statutory reference:

- **IRC §1411**

---

## 10.6 Foreign tax credit

The system shall support modeled foreign tax credits associated with foreign investment income.

The tax architecture shall keep the foreign tax credit conceptually separate from ordinary tax calculation because it is a credit against tax rather than an ordinary-income calculation.

Primary references:

- **IRC §§901–909**
- **IRC §904**
- **IRS Publication 514**
- **Form 1116**

IRS Publication 514 describes eligibility, limitations, Form 1116, and carryover considerations. :chatgpt-content-reference{index="10"}

---

# 11. Medicare IRMAA Model

Medicare IRMAA shall be modeled as a **financial expense driven by prior-year tax information**, not as ordinary federal income tax.

The system shall support:

- filing-status-specific IRMAA thresholds;
- MAGI-based tiers;
- Part B income-related adjustments;
- Part D income-related adjustments where modeled;
- applicable lookback period;
- number of Medicare-eligible household members.

The source architecture currently models IRMAA using MAGI from two years earlier and charges the resulting surcharge as a household expense. :chatgpt-content-reference{index="11"}

CMS confirms that Medicare Part B and Part D income-related amounts are based on beneficiary income and publishes the annual thresholds and premiums. For 2026, for example, CMS publishes separate individual and joint MAGI thresholds. :chatgpt-content-reference{index="12"}

Primary references:

- **Social Security Act, Medicare premium provisions**
- **CMS annual Medicare Part B and Part D premium/IRMAA tables**
- Annual CMS rule/fact sheet for the applicable projection year

### Architectural requirement

IRMAA rules must be **tax-year/version controlled independently of federal income-tax brackets**.

---

# 12. Retirement Account Rules

The retirement-account rules engine shall model:

- Traditional IRA/pre-tax balances
- Required minimum distributions
- Voluntary distributions
- Roth conversions
- Roth IRA balances
- Survivor inheritance
- Applicable inherited-account treatment
- Stretch assumptions where explicitly enabled

Primary federal references:

- **IRC §408**
- **IRC §401**
- **IRC §72**
- **IRC §4974**
- **SECURE Act / SECURE 2.0 provisions**
- **IRS Publication 590-A**
- **IRS Publication 590-B**

IRS Publication 590-B describes RMD calculation using applicable life-expectancy tables and provides the current distribution framework. :chatgpt-content-reference{index="13"}

The rules engine shall not assume that one RMD rule applies to every beneficiary category.

---

# 13. Roth Conversion Model

A Roth conversion shall be treated as:

> A taxable distribution from a pre-tax retirement account followed by a contribution/addition to a Roth account.

The system shall therefore model conversion effects on:

- pre-tax account balance;
- Roth balance;
- ordinary taxable income;
- taxable Social Security;
- AGI;
- MAGI;
- federal income tax;
- NIIT;
- IRMAA;
- portfolio withdrawals;
- future RMDs;
- future inherited assets.

The system should support at least two conceptual strategies:

### Fixed conversion
Convert a specified amount per year.

### Constraint-based conversion
Convert the largest amount consistent with selected tax constraints, such as:

- specified ordinary-income bracket;
- specified IRMAA tier;
- both simultaneously.

The architecture currently treats the conversion as part of the tax/asset circularity rather than calculating it independently. :chatgpt-content-reference{index="14"}

---

# 14. Cost Basis and Capital Gains

Every taxable investment portfolio may have:

- market value;
- tax basis;
- unrealized gain;
- realized gain.

The model shall determine realized capital gains when assets are sold to fund household expenses.

The system shall preserve the distinction between:

- cash proceeds from a sale;
- taxable gain from a sale;
- basis removed by the sale.

This distinction is essential because selling $100,000 of assets does not necessarily produce $100,000 of taxable income.

The source architecture uses proportional basis allocation to determine the gain fraction of a sale and carries basis forward over time. :chatgpt-content-reference{index="15"}

Primary federal references:

- **IRC §§1001 and 1011–1016**
- **IRC §1222**
- **IRS Publication 550**
- **IRS Publication 551**

---

# 15. Basis Adjustment at Death

The system shall explicitly model the difference between:

### Personally owned assets

Assets passing from a decedent may receive a basis adjustment under the federal inherited-property rules.

### Assets retaining carryover basis

Certain trust-owned assets or other property may not receive the same adjustment depending on ownership and estate-inclusion rules.

The current architecture specifically distinguishes ordinary non-IDGT portfolio assets from IDGT assets, with non-IDGT assets receiving a modeled basis reset while IDGT assets retain carryover basis. :chatgpt-content-reference{index="16"}

The governing federal reference is principally:

- **IRC §1014**
- **Treas. Reg. §§1.1014-1 through 1.1014-10**

IRC §1014 generally establishes fair-market-value-at-death basis for qualifying inherited property, subject to numerous statutory exceptions. :chatgpt-content-reference{index="17"}

The IRS also describes inherited-property basis and the relationship to estate-tax values in Publication 551. :chatgpt-content-reference{index="18"}

### Architectural caution

The system shall not generalize "step-up at death" to every asset.

In particular, retirement accounts and annuities have different federal tax treatment.

---

# 16. IDGT / Estate-Oriented Asset Model

The system shall support an asset classification representing assets held outside the household's ordinary taxable investment portfolio, including IDGT assets.

The purpose of this abstraction is to allow analysis of:

- current ownership;
- cash-flow contribution;
- investment growth;
- cost basis;
- realized capital gains;
- estate inclusion assumptions;
- death-related basis treatment;
- beneficiary value.

The model shall make the legal/tax assumption explicit rather than treating "IDGT" as automatically synonymous with either step-up or no step-up.

---

# 17. Asset / Basis Swap Analysis

The system may support a strategic asset/basis reallocation analysis between:

- personally owned taxable assets; and
- IDGT assets.

The conceptual objective is to determine whether moving assets with different embedded-gain percentages changes future household tax exposure.

The operation should conserve:

- total asset value;
- total tax basis;

while changing the allocation of basis among ownership structures.

The system shall report the resulting change in:

- household unrealized gain;
- taxable gain exposure;
- projected future tax;
- after-tax estate value.

This feature is a **planning heuristic**, not a statement that a particular transfer is legally or economically advisable.

---

# 18. Expense Funding Model

Household expenses shall be modeled at the household level.

The conceptual funding hierarchy shall support:

1. Ordinary household cash income
2. Investment dividends
3. Taxable portfolio asset sales
4. Pre-tax retirement-account withdrawals
5. Roth withdrawals

The system shall be capable of reporting the amount funded by each source.

This is important because funding source affects future:

- taxable income;
- capital gains;
- retirement balances;
- Roth balances;
- cost basis;
- tax;
- IRMAA.

The source architecture explicitly defines expenses as a household pool and applies the funding waterfall across income, dividends, sales, pre-tax accounts, and Roth accounts. :chatgpt-content-reference{index="19"}

---

# 19. Long-Term-Care Model

The system shall support optional long-term-care scenarios.

Inputs shall include:

- person's projected LTC start age;
- annual LTC cost;
- changed household living expenses after LTC begins;
- second-person LTC assumptions where applicable.

LTC shall affect:

- household expenses;
- portfolio depletion;
- taxable income where withdrawals are required;
- itemized deductions where applicable;
- future asset values.

The current architecture models qualifying LTC costs above the applicable AGI floor as the modeled itemized deduction. :chatgpt-content-reference{index="20"}

The principal federal reference is:

- **IRC §213**
- IRS guidance concerning medical-expense deductions

The model should clearly identify this as a simplified LTC deduction model rather than a complete medical-expense tax engine.

---

# 20. Rental Income Model

Rental income shall distinguish:

- cash rental income;
- taxable rental income;
- depreciation;
- tax basis effects.

Depreciation is a non-cash deduction and therefore should not be treated as equivalent to cash expense.

The IRS describes rental depreciation as recovery of the cost of income-producing property and notes that depreciation reduces basis for purposes of later gain calculations. :chatgpt-content-reference{index="21"}

Primary references:

- **IRC §§167 and 168**
- **IRC §469**, where applicable
- **IRS Publication 527**
- **IRS Publication 946**

---

# 21. Annuity Model

Annuities shall be modeled as a distinct asset/income category because their tax treatment differs from ordinary brokerage assets and retirement accounts.

The model shall conceptually distinguish:

- contract value;
- premium/investment in contract;
- payout;
- taxable portion;
- tax-free recovery of investment;
- contract growth;
- death/passing benefit.

The governing federal framework is principally:

- **IRC §72**
- **Treas. Reg. §§1.72-1 et seq.**

IRC §72 provides the general annuity income-inclusion framework and the exclusion-ratio mechanism for recovering investment in a nonqualified annuity. :chatgpt-content-reference{index="22"}

---

# 22. Social Security Model

The system shall model:

- full retirement age;
- own retirement benefit;
- early claiming;
- delayed claiming;
- spousal benefits;
- survivor benefits;
- benefit continuation after death;
- annual benefit growth/adjustment assumptions.

SSA guidance establishes the statutory delayed-retirement-credit framework, including increases up to age 70. :chatgpt-content-reference{index="23"}

Primary references:

- **Social Security Act**
- SSA Retirement Planner
- SSA benefit calculation guidance

The Social Security calculation rules shall be versioned independently from the federal income-tax rules.

---

# 23. Inflation and Real-Dollar Framework

The system shall use a clearly defined monetary convention.

The current design expresses projection outputs in **today's dollars**, with future values transformed according to the inflation assumption. :chatgpt-content-reference{index="24"}

The high-level specification therefore requires:

- explicit inflation assumption;
- explicit nominal-versus-real treatment;
- consistent treatment of income;
- consistent treatment of expenses;
- consistent treatment of asset growth;
- consistent treatment of tax thresholds;
- explicit treatment of statutory amounts that are indexed versus unindexed.

The system must never silently mix nominal and real values.

---

# 24. Tax-Year Reference Data Architecture

Tax and government-program data shall be represented as **versioned reference data**.

At minimum the reference-data layer shall contain:

| Reference category | Examples |
|---|---|
| Ordinary tax brackets | IRC §1 |
| Standard deduction | IRC §63 |
| Capital-gain/QDIV thresholds | IRC §1 |
| Social Security thresholds | IRC §86 |
| NIIT thresholds | IRC §1411 |
| NIIT rate | IRC §1411 |
| IRMAA thresholds | CMS/SSA |
| IRMAA premiums | CMS |
| RMD tables | IRC/IRS/Publication 590-B |
| RMD starting-age rules | SECURE/SECURE 2.0 and IRS guidance |
| Senior deductions | Applicable IRC provisions / IRS guidance |
| Foreign tax credit rules | IRC §§901–909 |
| Rental depreciation rules | IRC §§167/168 |
| Annuity taxation | IRC §72 |
| Inherited basis | IRC §1014 |
| Capital-gain rules | IRC §§1001, 1222 |
| Social Security benefit rules | Social Security Act / SSA |

Reference data must carry at least:

- tax/program year;
- effective date;
- source authority;
- applicability conditions;
- version/status;
- citation/reference.

---

# 25. Current 2026 Federal Tax Baseline

The application currently uses 2026 federal tax assumptions. These should be treated as **reference data**, not architecture.

For example, the IRS states that the 2026 individual rate structure remains 10%, 12%, 22%, 24%, 32%, 35%, and 37%, with inflation-adjusted thresholds, and provides 2026 standard deductions of $32,200 for MFJ and $16,100 for single filers. :chatgpt-content-reference{index="25"}

The One Big Beautiful Bill Act made the seven individual rate structure permanent and changed numerous individual provisions; the IRS's 2026 Revenue Procedure documents the resulting 2026 inflation-adjusted amounts. :chatgpt-content-reference{index="26"}

**Design requirement:** these numbers must never be treated as permanent architectural constants. A new tax year shall be introduced by adding/updating the appropriate versioned rule set.

---

# 26. Projection Output Contract

The projection shall expose a structured annual record containing, at minimum:

### Household
- Year
- Ages
- Alive/deceased status
- Filing status

### Income
- Wages
- Social Security
- Pension
- Rental income
- Depreciation
- Dividends
- Tax-exempt income
- IRA distributions
- Roth conversions
- Annuity income
- Capital gains

### Tax
- Taxable Social Security
- Ordinary income
- Deductions
- Ordinary taxable income
- Ordinary tax
- Qualified income
- Capital-gain/QDIV tax
- NIIT
- Foreign tax credit
- Total federal tax
- Marginal tax rate
- Incremental Social Security tax

### Medicare
- MAGI
- IRMAA tier
- IRMAA surcharge

### Expenses
- Living expenses
- LTC expenses
- Income tax
- IRMAA
- AUM fees
- Total expenses

### Funding
- Cash income
- Dividends
- Asset sales
- Pre-tax IRA withdrawals
- Roth withdrawals
- Unfunded expenses

### Assets
- Brokerage balances
- IDGT balances
- Pre-tax IRA balances
- Roth balances
- Annuity balances
- Cost basis
- Unrealized gain
- Realized gain

### Strategy
- Roth conversion amount
- Conversion constraint(s)
- Social Security strategy
- Basis/asset allocation actions

The source architecture's row schema already follows this general concept: each projection year contains income, tax, IRMAA, expense, funding, account, portfolio, and basis information. :chatgpt-content-reference{index="27"}

---

# 27. Scenario / What-If Architecture

The system shall support scenario isolation.

A scenario calculation shall:

1. Clone or otherwise isolate the household assumptions.
2. Modify selected assumptions.
3. Run the complete projection.
4. Compare results with the base scenario.
5. Leave the base scenario unchanged.

Examples:

- Social Security age 62 vs. 67 vs. 70
- $50k versus $100k annual Roth conversion
- bracket-limited versus fixed conversions
- different passing ages
- different inflation assumptions
- different portfolio growth
- different asset/basis allocations
- LTC beginning at different ages

The existing architecture uses this principle for Social Security what-if analysis: hypothetical scenarios run through the full projection without modifying the real household state. :chatgpt-content-reference{index="28"}

---

# 28. Optimization Architecture

The system shall distinguish between:

### Simulation
"What happens if I choose X?"

and

### Optimization
"What value of X produces the best result under specified constraints?"

Optimization objectives may include:

- minimizing lifetime federal tax;
- minimizing IRMAA;
- minimizing combined tax + IRMAA;
- maximizing household lifetime after-tax consumption;
- maximizing projected after-tax estate value;
- balancing lifetime spending against estate value;
- minimizing pre-tax retirement balances at death;
- optimizing Roth conversion timing.

The objective function must be explicit.

The system shall never describe a result as "optimal" without identifying the objective and constraints used to define optimality.

---

# 29. After-Tax Asset Value

Asset charts and estate analysis shall distinguish between:

### Face value
The account or portfolio's nominal projected balance.

### Embedded tax liability
Estimated future tax attributable to unrealized gains or ordinary-income assets.

### After-tax / devalued value
A planning estimate of economic value after applying an assumed future tax haircut.

These estimates are **decision-support valuations**, not tax liabilities or formal estate valuations.

The source architecture explicitly distinguishes portfolio face value, embedded gain, and configurable after-tax devaluation assumptions. :chatgpt-content-reference{index="29"}

---

# 30. Presentation Architecture

The presentation layer shall provide views for:

1. Social Security
2. Household income
3. Social Security tax
4. Federal income tax
5. Household expenses
6. Asset balances
7. IDGT assets
8. Roth conversions
9. Cost basis / unrealized gain
10. Survivor/legacy periods

Charts shall consume projection results rather than recreate financial calculations.

The current architecture follows this principle: display components consume projection rows and are prohibited from recomputing authoritative financial values. :chatgpt-content-reference{index="30"}

---

# 31. Explainability Requirements

Because the system is tax-sensitive, every material result should be explainable.

For important outputs the system should be able to answer:

> Why is this number what it is?

For example:

### Total tax
Should be decomposable into:
- ordinary tax;
- qualified-dividend/LTCG tax;
- NIIT;
- foreign tax credit.

### Household expenses
Should be decomposable into:
- living;
- LTC;
- income tax;
- IRMAA;
- AUM fees.

### Asset reduction
Should be decomposable into:
- growth;
- dividends used;
- dividends reinvested;
- asset sales;
- IRA withdrawals;
- Roth withdrawals.

### Roth conversion
Should identify:
- conversion amount;
- ordinary-income constraint;
- IRMAA constraint;
- RMD interaction;
- resulting tax;
- resulting account balances.

This is particularly important because tax planning decisions are difficult to validate from a single final balance.

---

# 32. Auditability

The system shall maintain enough intermediate information to reproduce and explain a projection result.

A projection year should be auditable from:

**Inputs → rules → intermediate tax quantities → cash-flow decisions → asset changes → outputs.**

For example:

`IRA balance → RMD → ordinary income → taxable SS → AGI/MAGI → tax → expense requirement → asset sale → LTCG → revised tax`

must be traceable.

---

# 33. Convergence and Numerical Stability

Where financial dependencies are circular, the system shall:

- identify the circular dependency;
- use a deterministic convergence process;
- specify a convergence tolerance;
- specify a maximum iteration count;
- report non-convergence;
- avoid silently returning an apparently valid result when convergence fails.

The current architecture explicitly reports tax-iteration count and convergence status. :chatgpt-content-reference{index="31"}

---

# 34. Tax-Law Change Management

Tax-law changes shall be treated as a first-class architectural concern.

A new tax year may change:

- brackets;
- deductions;
- capital-gain thresholds;
- Social Security rules;
- RMD rules;
- IRMAA thresholds;
- Medicare premiums;
- senior deductions;
- NIIT thresholds;
- foreign-tax-credit limitations;
- estate/basis rules.

The system shall therefore maintain a **Tax Rules Version** associated with each projection.

A saved plan should identify the tax-rule version used to produce its results.

When tax law changes, the system should be able to distinguish:

> "Same financial assumptions, different tax law"

from:

> "Different financial assumptions."

---

# 35. Federal Tax Reference Hierarchy

The tax engine should use the following authority hierarchy.

## Tier 1 — Statute

Primary authority:

- Internal Revenue Code
- Social Security Act
- Medicare statutory provisions

Examples:

- IRC §1 — individual income-tax rates
- IRC §63 — taxable income and standard deduction
- IRC §72 — annuities and retirement distributions
- IRC §86 — Social Security taxation
- IRC §1014 — inherited-property basis
- IRC §§1001/1011–1016 — gains and basis
- IRC §1222 — capital-gain classification
- IRC §1411 — NIIT
- IRC §§401/408 — retirement plans and IRAs
- IRC §4974 — RMD excise tax
- IRC §§901–909 — foreign tax credit
- IRC §§167/168 — depreciation
- IRC §213 — medical expenses

## Tier 2 — Treasury Regulations

Use regulations to clarify statutory mechanics where the statute alone is insufficient.

Examples:

- Treas. Reg. §1.72 series
- Treas. Reg. §1.1014 series

## Tier 3 — IRS administrative guidance

Examples:

- Revenue Procedures
- Revenue Rulings
- IRS Notices
- IRS Instructions
- IRS Publications

IRS Publication 17 itself notes that IRS publications reflect the IRS interpretation of enacted tax laws, regulations, and court decisions and are not themselves substitutes for the law. :chatgpt-content-reference{index="32"}

## Tier 4 — Government program guidance

Examples:

- SSA benefit guidance
- CMS Medicare/IRMAA guidance

---

# 36. Tax Reference Examples

The system's reference documentation should explicitly link tax concepts to their authoritative sources.

| Model concept | Principal reference |
|---|---|
| Ordinary income tax | IRC §1 |
| Standard deduction | IRC §63 |
| Social Security taxation | IRC §86; IRS Pub. 915 |
| Capital gains | IRC §§1001, 1222 |
| Basis | IRC §§1011–1016; IRS Pub. 551 |
| Inherited basis | IRC §1014; Treas. Reg. §1.1014 |
| NIIT | IRC §1411; IRS Topic 559 |
| IRA distributions | IRC §§72, 408; IRS Pub. 590-B |
| RMDs | IRC §401/§408; §4974; IRS Pub. 590-B |
| Roth conversions | IRC §408A / related IRA distribution rules; IRS Pub. 590-A |
| Annuities | IRC §72; Treas. Reg. §1.72 |
| Rental depreciation | IRC §§167/168; IRS Pub. 527 |
| Foreign tax credit | IRC §§901–909; IRS Pub. 514 |
| LTC deduction | IRC §213 |
| Social Security benefit calculation | Social Security Act; SSA |
| IRMAA | Social Security Act; CMS annual IRMAA tables |

---

# 37. Tax Rules Must Not Be Hard-Coded Into Financial Logic

This is one of the most important architectural requirements.

The financial model should express concepts such as:

> taxable Social Security

> ordinary taxable income

> qualified income

> MAGI

> IRMAA tier

> RMD

rather than embedding specific statutory numbers throughout the projection.

For example, the projection should ask a tax-rule provider:

> Determine taxable Social Security for this household under the applicable tax year and filing status.

It should not know that a particular threshold happens to be `$X`.

Likewise:

> Determine RMD using the applicable table for the taxpayer's age and beneficiary status.

rather than embedding a particular divisor in financial logic.

---

# 38. Validation Strategy

Testing shall occur at four levels.

## 38.1 Rule-level tests

Validate individual federal rules against authoritative IRS/SSA/CMS examples.

Examples:

- ordinary tax brackets;
- Social Security taxation;
- RMD;
- NIIT;
- IRMAA;
- capital-gain taxation;
- foreign tax credit;
- inherited basis.

## 38.2 Projection-level tests

Validate complete household scenarios.

Examples:

- single retiree;
- married couple;
- first spouse death;
- second spouse death;
- IRA depletion;
- Roth conversion;
- capital-gain-funded expenses;
- LTC onset.

## 38.3 Conservation tests

Verify financial invariants such as:

- asset balance roll-forward;
- cost-basis conservation;
- expense funding reconciliation;
- income/tax reconciliation;
- conversion transfer from pre-tax to Roth;
- asset/basis swap conservation.

## 38.4 Regression tests

Known scenarios shall be preserved as regression cases whenever tax or financial logic changes.

---

# 39. Financial Reconciliation Requirements

Every projection year should satisfy explicit reconciliation identities.

Examples:

### Expense reconciliation

**Total expenses = income-funded + dividend-funded + sale-funded + pre-tax-funded + Roth-funded + unfunded**

### Asset reconciliation

**Ending balance = beginning balance + growth − distributions − sales + reinvestments**

### Tax reconciliation

**Total federal tax = ordinary tax + preferential-income tax − applicable credits + NIIT**

subject to the applicable tax rules.

### Conversion reconciliation

**Pre-tax reduction attributable to conversion = Roth contribution attributable to conversion**

before considering any separately modeled tax-payment source.

The existing architecture explicitly exposes these funding and balance components for reconciliation. :chatgpt-content-reference{index="33"}

---

# 40. Data Export

The system shall provide machine-readable and human-readable exports.

At minimum:

- annual projection;
- account-level balances;
- income;
- tax;
- IRMAA;
- expenses;
- withdrawals;
- Roth conversions;
- cost basis;
- realized gains;
- unrealized gains.

The existing design exports the projection and account-level information to Excel. :chatgpt-content-reference{index="34"}

Exports must be generated from the same authoritative projection used by the UI.

---

# 41. User-Visible Formula Documentation

Because this application is tax-sensitive, the system shall provide a human-readable explanation of:

- federal tax calculations;
- Social Security taxation;
- RMDs;
- Roth conversions;
- capital gains;
- cost basis;
- IRMAA;
- NIIT;
- expense waterfall;
- LTC deductions;
- annuity taxation;
- survivor transitions.

The formula/reference documentation should be generated from the same tax-rule/reference data used by the model where practical, reducing the risk that the documentation and calculation engine diverge.

The current architecture already follows this principle by having the formula page use the same reference-data tables used by computation. :chatgpt-content-reference{index="35"}

---

# 42. Privacy and External AI

If an external AI assistant is integrated, the architecture shall treat the AI component as an **analysis consumer**, not a financial calculation engine.

The AI should receive:

- explicitly selected household data;
- projection results;
- documented assumptions;
- documented limitations.

The AI shall not silently modify the authoritative scenario.

Users shall be told when financial data is transmitted to an external provider.

The current architecture follows this model: the chat feature receives a snapshot of the plan and projection and is read-only with respect to the financial state. :chatgpt-content-reference{index="36"}

---

# 43. Security and Data Integrity

The system shall:

- preserve scenario integrity;
- prevent accidental mutation during what-if calculations;
- distinguish saved scenario data from transient UI state;
- prevent credentials/API keys from entering financial-plan files;
- validate imported scenarios;
- gracefully handle obsolete scenario versions;
- preserve backwards compatibility through explicit migration rules.

---

# 44. Required Non-Functional Characteristics

The system should be:

### Deterministic
The same inputs and rule version produce the same projection.

### Explainable
Material results can be decomposed into understandable components.

### Auditable
Tax and financial calculations can be traced to their source assumptions and rules.

### Versioned
Tax law and government-program assumptions are associated with a tax/program year.

### Extensible
New tax rules, account types, income sources, or planning strategies can be added without redesigning the entire projection engine.

### Reproducible
A saved scenario plus its rule version is sufficient to reproduce the projection.

### Numerically stable
Circular financial relationships converge predictably or explicitly report failure.

### Technology-independent
The conceptual model must not depend on a particular browser framework, chart library, programming language, or storage mechanism.

---

# 45. Core Design Invariants

The following are architectural invariants.

1. **Inputs have one authoritative representation.**
2. **Derived financial values have one authoritative projection.**
3. **Tax rules are separate from financial mechanics.**
4. **Tax-year reference data is versioned.**
5. **Display components do not independently calculate authoritative financial results.**
6. **What-if analysis does not modify the base scenario.**
7. **Tax/asset circular dependencies are explicitly solved.**
8. **Every major cash flow reconciles.**
9. **Cost basis is distinct from market value.**
10. **Taxable income is distinct from cash income.**
11. **IRMAA is modeled as a Medicare expense, not ordinary income tax.**
12. **Social Security taxation is modeled separately from Social Security benefit calculation.**
13. **Roth conversion is treated as a taxable retirement-account transaction, not merely an asset transfer.**
14. **Death/survivor events are first-class projection events.**
15. **Inherited-basis treatment is asset/ownership dependent.**
16. **IDGT treatment is an explicit ownership/tax assumption, not an implicit universal rule.**
17. **Nominal and real dollars are never mixed without an explicit conversion.**
18. **Every material simplification is documented.**
19. **Tax-law updates affect rule/reference data rather than financial-model architecture.**
20. **Every result labeled "optimal" has an explicit objective function and constraints.**

---

# 46. Summary Architecture

At the highest level:

```text
                    ┌───────────────────────────┐
                    │     Household Scenario    │
                    │                           │
                    │ People / Income / Assets  │
                    │ Spending / Strategy       │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │     Federal Rule Set      │
                    │                           │
                    │ Income Tax                │
                    │ Social Security Tax       │
                    │ Capital Gains             │
                    │ NIIT                      │
                    │ IRMAA                     │
                    │ RMD / IRA / Roth          │
                    │ Basis / Estate            │
                    │ Foreign Tax Credit        │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │     Projection Engine     │
                    │                           │
                    │ Year-by-Year Simulation   │
                    │ Cash Flow                 │
                    │ Tax                       │
                    │ Asset Balances            │
                    │ Basis                     │
                    │ Survivor Events           │
                    │ Estate / Legacy            │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │      Analysis Layer       │
                    │                           │
                    │ Charts                    │
                    │ What-If Scenarios         │
                    │ Optimization              │
                    │ After-Tax Values          │
                    │ Estate Analysis            │
                    │ Exports                   │
                    │ Explanations              │
                    └───────────────────────────┘
```

The key architectural distinction is:

> **The household model describes what the household owns and plans to do. The tax-rule layer describes what the government rules mean. The projection engine determines what happens when those two interact. The analysis layer explains and compares the resulting projections.**

This separation should allow the implementation technology to change without changing the underlying financial model, and should allow federal tax law to change without requiring the financial projection architecture to be redesigned.

---

# 47. Reference Set

The following references should form the initial authoritative reference library for the federal-tax portion of the system:

- **Internal Revenue Code**
  - §1 — individual income tax
  - §63 — taxable income / deductions
  - §72 — annuities and certain retirement distributions
  - §86 — Social Security taxation
  - §§1001, 1011–1016 — gain and basis
  - §1014 — inherited property basis
  - §1222 — capital-gain classification
  - §1411 — Net Investment Income Tax
  - §§167–168 — depreciation
  - §§213 — medical expenses
  - §§401, 408, 408A — retirement accounts
  - §4974 — RMD-related excise tax
  - §§901–909 — foreign tax credit

- **Treasury Regulations**
  - §1.72 series — annuity taxation
  - §1.1014 series — inherited-property basis

- **IRS**
  - Publication 17 — Federal income tax overview
  - Publication 501 — filing status and deductions
  - Publication 514 — foreign tax credit
  - Publication 527 — rental property
  - Publication 550 — investment income and expenses
  - Publication 551 — basis of assets
  - Publication 590-A — IRA contributions/conversions
  - Publication 590-B — IRA distributions/RMDs
  - Publication 915 — Social Security taxation
  - Topic 559 — NIIT
  - Annual Revenue Procedures for inflation-adjusted tax amounts

- **SSA**
  - Retirement benefit calculation
  - Full Retirement Age
  - Early/delayed claiming
  - Spousal and survivor benefits

- **CMS**
  - Annual Medicare Part B premiums
  - Annual Medicare Part D IRMAA
  - Annual IRMAA thresholds

The IRS currently publishes annual inflation-adjustment guidance for the 2026 tax year, while CMS separately publishes 2026 Medicare/IRMAA amounts; this illustrates why tax and Medicare reference data should be versioned independently. :chatgpt-content-reference{index="37"}

---

# 48. Design Philosophy

The application should ultimately be understood as a **tax-aware household financial simulation engine**, rather than a collection of retirement calculators.

Its most important technical property is therefore not the UI or charting technology. It is the integrity of the dependency chain:

**Household assumptions → government benefits → taxable income → tax → cash requirements → asset sales → realized gains → revised tax → asset balances → survivor/estate consequences.**

Any implementation that preserves that dependency structure, maintains authoritative tax-rule references, exposes the intermediate results, and preserves reconciliation/auditability is consistent with this high-level architecture.

A few things I deliberately **did not carry upward from `ARCHITECTURE.md`** are JavaScript filenames, DOM contracts, Chart.js behavior, script load order, debounce timing, HTML structure, and specific UI widget mechanics. Those are implementation decisions rather than architectural requirements.

I also treated the tax references as **authoritative-source categories rather than hard-coded current numbers**. That's particularly important here: the IRS has already published separate 2026 inflation adjustments under the post-OBBBA law, while CMS separately publishes the 2026 IRMAA tables. [IRS](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill?utm_source=chatgpt.com) This architecture should make those annual changes a **versioned rules-data update**, not a redesign of the retirement projection engine.