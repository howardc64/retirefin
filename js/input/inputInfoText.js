'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / INPUT ELEMENT INFO — TEXT. The descriptions shown by inputInfo.js; no logic here. To describe a new input or drop-down choice, add a line:
//   II_FIELDS  [label regex, kind, text]          kind: 's' drop-down, 'c' checkbox / radio, 'n' any other input or button, '' = any. First match wins.
//                                                 "label" = the input's own label (or the card title when it has none); card Enable boxes are 'ENABLE:<card>'.
//   II_OPTIONS [select label regex, choice regex, text]
//   II_IDS     element id -> text (for inputs with no usable label)
// ═══════════════════════════════════════════════════════════════
const II_FIELDS = [
  // ── Household setup
  [
    /^Single \/ widowed$/,
    'c',
    "File as a single taxpayer (or a surviving spouse). Uses the single tax brackets, deduction and Medicare IRMAA tiers, and one person's inputs."
  ],
  [
    /^Married$/,
    'c',
    'File jointly as a married couple. Uses the married-filing-jointly brackets, deduction and IRMAA tiers, and shows inputs for both spouses. After the first passing the survivor files as single.'
  ],
  [/^Name$/, 'n', 'Display name for this person, used in card titles, chart legends and popups.'],
  [/^Birth year$/, 'n', 'Used to work out current age, the Social Security full retirement age and the RMD start age.'],
  [/^Birth month$/, 'n', 'Used with the birth year for current age (to a fraction of a year) and for age-based start and end dates.'],
  [/^Current age$/, 'n', "Calculated from birth year and month and today's date. Read-only."],
  // ── General / Expenses / Tax & Optimizations panels
  [
    /^Inflation rate/,
    'n',
    'Yearly inflation. Amounts entered as "tracks inflation" grow at this rate, and it is also the Social Security cost-of-living adjustment (COLA). Charts are shown in today\'s dollars.'
  ],
  [
    /passes at age$/,
    'n',
    'Age at which this person is assumed to pass away. Their income stops (unless inherited by the spouse), and a surviving spouse files as single from the following year.'
  ],
  [
    /^Living expenses \(household/,
    'n',
    "Yearly household living expenses in today's dollars, paid from income first, then dividends, then asset sales or IRA withdrawals."
  ],
  [
    /^SCGL$/,
    'n',
    "Suspended Capital-Gain Loss carryforward: a past capital loss that offsets realized capital gains until it is used up. Enter it in today's dollars."
  ],
  [
    /^Suspended Capital-Gain Loss/,
    'n',
    'Past capital loss carried forward. It offsets realized long-term gains (and then up to $3,000 of other income) until it is used up.'
  ],
  [
    /^AUM fee$/,
    's',
    'How the advisory / management fee is charged: as a percentage of the AUM balance, or as a fixed dollar amount per year.'
  ],
  [/^AUM fee$/, 'n', "Fee amount: a percentage of the AUM balance, or dollars per year in today's dollars, depending on the mode chosen."],
  [
    /^Swap this many years/,
    'n',
    'How many years before the last passing the Living-expense and IDGT portfolios exchange assets, so the IDGT holds the high-basis assets.'
  ],
  [
    /^State$/,
    's',
    "Which state's income tax to model. The state tax is paid as a household expense and is shown as a dashed line on the Total Income Tax chart."
  ],
  [/^LTC start age$/, 'n', 'Age at which this person starts needing Long Term Care. Care costs begin that year.'],
  [
    /^LTC cost/,
    'n',
    "Yearly cost of this person's Long Term Care, in today's dollars. It can be itemized as a medical deduction above 7.5% of AGI."
  ],
  [
    /living expenses \(\$\/yr/,
    'n',
    "Household living expenses once Long Term Care has started, in today's dollars. Replaces the Living expenses amount from then on."
  ],
  [/^NIIT threshold change: start year/, 'n', 'First year the speculative new Net Investment Income Tax thresholds below apply.'],
  [/^Single filing threshold/, 'n', "Speculative NIIT threshold for single filers from the start year on, in today's dollars."],
  [/^Married filing threshold/, 'n', "Speculative NIIT threshold for married couples from the start year on, in today's dollars."],
  // ── Card Enable / Hide / buttons
  [/^ENABLE:SCGL$/, 'c', 'Include the SCGL carryforward in the projection. Your amount is kept when unchecked.'],
  [/^ENABLE:AUM fee$/, 'c', 'Charge the AUM fee on the balances of portfolios marked AUM.'],
  [
    /^ENABLE:Expense shortfall withdrawal order$/,
    'c',
    'Use the order below, instead of the built-in one, to decide which assets pay expenses that income and dividends do not cover.'
  ],
  [/^ENABLE:Asset \/ basis swap$/, 'c', 'Model swapping assets between the Living-expense and IDGT portfolios.'],
  [/^ENABLE:State income tax$/, 'c', 'Include state income tax in the projection.'],
  [/^ENABLE:Long Term Care/, 'c', 'Model Long Term Care costs and the change in living expenses once care starts.'],
  [/^ENABLE:Speculative future exemptions/, 'c', 'Test a speculative change to the NIIT thresholds. Not current law; off by default.'],
  [
    /^ENABLE:Portfolio withdraw$/,
    'c',
    'Sell from every non-IDGT portfolio each year as much as fits within the chosen LTCG bracket. Off by default.'
  ],
  [
    /^LTCG bracket to fill$/,
    'n',
    'How much of each non-IDGT portfolio is sold each year: as much as fits with taxable income staying within this bracket (20% = no limit).'
  ],
  [/^ENABLE:Wage/, 'c', "Include this person's wage / earned income in the projection."],
  [/^ENABLE:Social Security/, 'c', "Include this person's Social Security benefit in the projection."],
  [/^ENABLE:Pension/, 'c', "Include this person's pension in the projection."],
  [/^ENABLE:Pre-tax IRA/, 'c', "Include this person's pre-tax IRA / 401(k) in the projection."],
  [/^ENABLE:Roth IRA/, 'c', "Include this person's Roth IRA in the projection."],
  [/^ENABLE:Portfolio$/, 'c', 'Include this brokerage portfolio in the projection.'],
  [/^ENABLE:Rental$/, 'c', 'Include this rental property in the projection.'],
  [/^ENABLE:Annuity$/, 'c', 'Include this annuity in the projection.'],
  [/^ENABLE:Real estate$/, 'c', 'Include this property in the projection.'],
  [/^Hide$/, 'c', 'Collapses this card or chart to save space. Hidden data is still used in the projection and charts if it is enabled.'],
  [
    /^view IRMAA as tax$/,
    'c',
    'Counts the Medicare IRMAA surcharge as part of tax on the Total Income Tax chart, so the bars show tax plus IRMAA.'
  ],
  [/^Input Tooltip$/, 'c', 'When checked, hovering an input describes it, and each choice in a drop-down menu shows its own description.'],
  [
    /^Success$/,
    '',
    'Loads a Monte Carlo trial of this scenario that stayed funded to the end into the chart grid (the D button of the Stress test card). Click D there for the next one. Your scenario is not changed.'
  ],
  [
    /^Failure$/,
    '',
    'Loads a Monte Carlo trial of this scenario that ran short of money into the chart grid (the C button of the Stress test card). Click C there for the next one. Your scenario is not changed.'
  ],
  [
    /^Show in charts$/,
    '',
    'Loads this stress test into the chart grid (the same as the B button of the Stress test card) so you can see its year-by-year detail. Your scenario is not changed.'
  ],
  [/^＋ Add/, '', 'Add another one of these to this person.'],
  [/^Remove/, '', 'Remove this one from the scenario.'],
  [
    /Rescale$/,
    '',
    "Refit this chart's vertical scale to the current data. Every chart that shares its scale (see the Same scale buttons above the charts) is refitted together."
  ],
  [
    /^Same scale: income & expense$/,
    '',
    'On: the Annual income, Annual expenses, MAGI, Taxable ordinary income, Taxable qualified income charts (and the IRA, LTCG and Inheritance asset income charts) all use the same vertical scale (the largest of them).'
  ],
  [
    /^Same scale: tax$/,
    '',
    'On: the Total tax, Ordinary income tax and QDIV / LTCG / NIIT tax charts all use the same vertical scale (the largest of them).'
  ],
  [
    /^Same scale: income, expense & tax$/,
    '',
    'On: every income, expense and tax chart (not Cumulative household SS or Social Security tax) uses one vertical scale, so their heights can be compared directly.'
  ],
  [
    /^Same scale: asset & IDGT$/,
    '',
    'On: the Asset value and IDGT value charts use the same vertical scale. Cumulative household SS, Social Security tax, the IRA chart, the LTCG chart and the Inheritance asset income chart always keep their own scale unless an income Same scale button is used.'
  ],
  [
    /^Grid: [23]\u00d7N$/,
    '',
    'Switch the chart grid between 2 columns (2\u00d7N, the default) and 3 columns (3\u00d7N). Each size remembers its own arrangement of the charts, and the choice is saved with the scenario.'
  ],
  // ── Wage / pension / generic amounts
  [/^Annual amount/, 'n', "Yearly amount in today's dollars."],
  [/^Start$/, 'n', 'Age at which this starts, used when "Custom age" is chosen.'],
  [/^End$/, 'n', 'Age at which this ends, used when "Custom age" is chosen.'],
  [/^Start$/, 's', 'When this starts: now, at a specific age, or (for an IRA) at the RMD age.'],
  [/^End$/, 's', "When this ends: at a specific age, or at the person's passing."],
  [
    /^(Annual change|Credited growth)/,
    's',
    "How the amount changes each year in real (today's-dollar) terms: no growth, in step with inflation, inflation plus or minus a percentage, or a custom yearly percentage."
  ],
  [
    /^(Annual change|Credited growth)/,
    'n',
    'Percentage used by the selected annual-change option (a spread over inflation, or the custom yearly rate).'
  ],
  [
    /^Inherited by spouse$/,
    'c',
    'If this person passes first, the surviving spouse receives this and it continues to count as household income or assets.'
  ],
  [
    /^Joint owned with spouse/,
    'c',
    'Held jointly: if the owner passes first the spouse keeps it. If unchecked, it is gone when its owner passes. Its cost basis steps up to value at the first passing of either spouse.'
  ],
  // ── Social Security
  [
    /^Already started collecting/,
    'c',
    'Check if benefits have already begun. You then enter the current monthly amount instead of the PIA and claiming age.'
  ],
  [/^Current monthly benefit/, 'n', "The monthly Social Security benefit you receive now, in today's dollars."],
  [
    /^PIA at FRA/,
    'n',
    'Primary Insurance Amount: your monthly benefit if you claim at full retirement age, from your Social Security statement.'
  ],
  [
    /^Full retirement age/,
    'n',
    'Age at which you get 100% of your PIA. It is set from the birth year; claiming earlier reduces the benefit and later increases it.'
  ],
  [
    /^Starts Social Security at age/,
    'n',
    'Age at which benefits are claimed (62–70). Earlier means smaller monthly checks; later means larger ones.'
  ],
  // ── Brokerage
  [
    /^Portfolio type$/,
    's',
    'Living expense & income portfolios pay expenses and reinvest as needed. An IDGT is a separate trust portfolio held outside the estate.'
  ],
  [/^Portfolio name$/, 'n', 'Name used for this portfolio in the cards and charts.'],
  [/^Start balance/, 'n', "Current value of the portfolio, in today's dollars."],
  [
    /^Cost basis \(% of start balance\)/,
    'n',
    'What you paid, as a percent of the balance. Used to work out realized capital gains when assets are sold. Blank means no unrealized gain.'
  ],
  [/^Annual ODIV yield/, 'n', 'Ordinary dividend yield: yearly dividends as a percent of the balance. The qualified share is set below.'],
  [
    /^QDIV as % of ODIV/,
    'n',
    'Part of the dividends that are qualified, taxed at the lower long-term capital-gain rates. The rest are taxed as ordinary income.'
  ],
  [
    /^Tax-exempt yield/,
    'n',
    'Yearly tax-exempt income (e.g. municipal-bond interest) as a percent of the balance. Not taxed, but counted for Social Security taxation and Medicare IRMAA.'
  ],
  [
    /^Distributed LTCG$/,
    's',
    "Capital gains the portfolio pays out each year (like a fund's capital-gain distribution): a percent of the balance, or a fixed amount in today's dollars (so it keeps pace with inflation). It is long-term capital gain income and is taxed, whether or not anything is sold. Like dividends it can pay household expenses; the rest is reinvested."
  ],
  [
    /^Distributed LTCG (%|amount)/,
    'n',
    "Yearly distributed long-term capital gains: a percent of the balance, or dollars in today's money. Default 0%."
  ],
  [/^Foreign asset %/, 'n', 'Percent of the portfolio held in foreign assets, which pay foreign tax that can earn a credit.'],
  [/^Foreign tax credit/, 'n', 'Foreign tax withheld as a percent of the foreign assets, taken as a credit against federal income tax.'],
  [
    /^AUM \(/,
    'c',
    "This account's balance (portfolio, pre-tax IRA, Roth IRA or inherited IRA) counts toward the AUM balance on which the household AUM fee (Expenses panel) is charged."
  ],
  [/^Pay expenses/, 'c', 'This portfolio may be sold to pay household expenses.'],
  // ── Real estate
  [/^Property name$/, 'n', 'Name used for this property in the cards and charts.'],
  [/^Value \(today/, 'n', "Current market value, in today's dollars."],
  [/^Cost basis \(today/, 'n', 'What you paid plus improvements, used to compute the gain when sold. Blank means no unrealized gain.'],
  [
    /^Exemption per owner/,
    'n',
    "Gain excluded from tax per owner when the property is sold (e.g. the home-sale exclusion), in today's dollars."
  ],
  [
    /^Sell$/,
    's',
    'When the property is sold: never, when long term care starts, at the last passing, or at a chosen age. Proceeds move to a portfolio.'
  ],
  [/^Sell when the owner reaches age/, 'n', 'Age of the owner at which the property is sold.'],
  [/^Move value and cost basis to/, 's', 'The portfolio that receives the sale value and its cost basis.'],
  // ── Rental
  [/^Rental name$/, 'n', 'Name used for this rental in the cards and charts.'],
  [/^Taxable annual amount/, 'n', "Yearly rental income in today's dollars, net of depreciation (Schedule E). Taxed as ordinary income."],
  [
    /^Annual depreciation/,
    'n',
    "Non-cash depreciation. It is cash to the household but not taxed. Fixed in dollars, so it shrinks in today's dollars."
  ],
  // ── Annuity
  [/^Annuity name$/, 'n', 'Name used for this annuity in the cards and charts.'],
  [/^Account value/, 'n', "Current account value of the annuity, in today's dollars."],
  [/^Premium paid/, 'n', 'What was paid into the annuity, which comes back tax-free. Blank means the account value.'],
  [/^Annual payout$/, 's', 'Whether the annuity pays a fixed dollar amount each year or a percentage of the account value.'],
  [/^Payout % of account value/, 'n', "Each year's payout as a percent of that year's account value."],
  [/^Fixed annual payout/, 'n', 'Fixed yearly payout in dollars. Not adjusted for inflation.'],
  [/^Payout tax treatment$/, 's', 'How payouts are taxed: gain first, an exclusion ratio, fully taxable, or tax-exempt.'],
  [
    /^Tax-exempt % of each payout/,
    'n',
    'Percent of each payout and of the passing benefit that is not taxed. Payouts still count toward MAGI and Social Security taxation.'
  ],
  [
    /^Passing benefit/,
    's',
    "What the annuity pays heirs at the contract's end (passing): a fixed amount, the initial value, or the account value then."
  ],
  [/^Fixed passing benefit/, 'n', 'Fixed dollar amount paid to heirs at passing. Not adjusted for inflation.'],
  // ── IRA / Roth
  [/^Current balance/, 'n', "Current account balance, in today's dollars."],
  [
    /^Annual withdraw$/,
    's',
    'How much to withdraw from the pre-tax IRA each year (on top of the RMD): a fixed dollar amount, or as much as fits below chosen tax and IRMAA brackets. Tick "Withdraw is Roth conversion" to move it into the Roth IRA.'
  ],
  [
    /^Annual withdraw$/,
    'n',
    'Dollars withdrawn from the pre-tax IRA each year, in today\'s dollars. The withdrawn amount is taxed as ordinary income; it goes to the Roth IRA when "Withdraw is Roth conversion" is ticked, otherwise it is spendable cash.'
  ],
  [/^Ordinary income tax bracket$/, 'n', 'Withdrawals stop before taxable ordinary income would go into a bracket above this rate.'],
  [/^IRMAA bracket/, 'n', 'Withdrawals stop before MAGI would reach the chosen Medicare IRMAA surcharge tier.'],
  [/^Withdraw start$/, 's', 'When the annual pre-tax IRA withdraw begins.'],
  [/^Withdraw start$/, 'n', 'Age at which the annual pre-tax IRA withdraw begins.'],
  [
    /^Itemized deductions exceed/,
    'n',
    'The withdraw begins the first year itemized deductions (Long Term Care above 7.5% of AGI) exceed this amount.'
  ],
  [
    /^Withdraw is Roth conversion$/,
    'c',
    'Ticked: the annual withdraw moves into the Roth IRA (a Roth conversion; the Roth IRA must be enabled) and is not spendable. Unticked: it is an ordinary withdrawal, taxed the same way, that becomes household cash income.'
  ],
  [/^IRA stretch/, 'c', 'Heirs keep the account growing and take it all within 10 years after the passing, instead of all at once.']
];

// ── Descriptions of the choices in a drop-down: [select label regex, option text regex, text]. First match wins.
const II_OPTIONS = [
  [/^Chart Tooltip$/, /^None/, 'Hovering a chart shows no popup.'],
  [/^Chart Tooltip$/, /^Components/, 'Hovering a chart describes the chart element under the cursor (a band, a line, a bar), with its value.'],
  [/^Chart Tooltip$/, /^Complete/, "Hovering a chart shows that year's values, with the line-by-line breakdown behind them."],
  [
    /^(Annual change|Credited growth)/,
    /^Fixed \$/,
    "The amount stays the same in dollars, so it shrinks in today's dollars as inflation rises."
  ],
  [/^(Annual change|Credited growth)/, /^Tracks inflation/, "The amount grows with inflation, so it stays constant in today's dollars."],
  [
    /^(Annual change|Credited growth)/,
    /^Inflation/,
    'Grows at inflation plus or minus the percentage you enter. Positive grows faster than inflation, negative slower.'
  ],
  [/^(Annual change|Credited growth)/, /^Custom/, 'Grows at a yearly percentage you enter, ignoring inflation.'],
  [/^Start$/, /^Now/, 'Starts today.'],
  [/^Start$/, /^RMD age/, 'Starts at the required minimum distribution age set by the birth year.'],
  [/^Start$/, /^Custom age/, 'Starts at the age you enter.'],
  [/^End$/, /^Passing/, 'Ends when this person passes.'],
  [/^End$/, /^Custom age/, 'Ends at the age you enter.'],
  [
    /^Portfolio type$/,
    /^Living/,
    'Pays living expenses and income, reinvests dividends, and can be sold as needed. May carry the AUM fee.'
  ],
  [
    /^Portfolio type$/,
    /^IDGT/,
    'Intentionally Defective Grantor Trust: held outside the estate. It does not pay expenses or reinvest, and is charted separately.'
  ],
  [/^Sell$/, /^Never/, 'The property is kept for the whole projection.'],
  [/^Sell$/, /^When the last person starts LTC/, 'Sold the year the last remaining person starts Long Term Care.'],
  [/^Sell$/, /^At the last person/, 'Sold the year the last person passes.'],
  [/^Sell$/, /^At an age/, 'Sold when the owner reaches the age you enter.'],
  [/^Move value and cost basis to/, /^Automatic/, "The sale value and cost basis go to the owner's first portfolio."],
  [/^Move value and cost basis to/, /./, 'The sale value and cost basis are added to this portfolio.'],
  [/^Annual payout$/, /^Fixed/, 'A fixed dollar amount each year, not adjusted for inflation or COLA.'],
  [/^Annual payout$/, /^%/, "A percentage of that year's account value."],
  [
    /^Payout tax treatment$/,
    /^Non-qualified, withdrawals/,
    'Withdrawals come out gain first (taxed as ordinary income), then the premium, which is tax-free.'
  ],
  [
    /^Payout tax treatment$/,
    /^Non-qualified, annuitized/,
    'Each payout is part tax-free return of premium and part taxable, in a constant ratio (exclusion ratio).'
  ],
  [/^Payout tax treatment$/, /^Qualified/, 'Annuity held in an IRA or other qualified scenario: every payout is fully taxable.'],
  [/^Payout tax treatment$/, /^Tax-exempt/, 'A percentage of each payout is not taxed.'],
  [/^Passing benefit/, /^Fixed/, 'Heirs receive a fixed dollar amount, not adjusted for inflation.'],
  [/^Passing benefit/, /^Initial/, 'Heirs receive the original account value, not adjusted for inflation.'],
  [/^Passing benefit/, /^Account value/, 'Heirs receive whatever the account value is at the passing.'],
  [/^Annual withdraw$/, /^\$\/yr/, "Withdraw a fixed dollar amount each year, in today's dollars."],
  [
    /^Annual withdraw$/,
    /^Below IRMAA/,
    'Each year withdraw as much as fits below both the chosen ordinary income tax bracket and the chosen IRMAA tier.'
  ],
  [/^Withdraw start$/, /^RMD start/, 'The withdraw begins when required minimum distributions begin.'],
  [/^Withdraw start$/, /^Now/, 'The withdraw begins this year.'],
  [/^Withdraw start$/, /^Custom age/, 'The withdraw begins at the age you choose.'],
  [
    /^Withdraw start$/,
    /^When tax bracket/,
    'The withdraw begins the first year taxable ordinary income falls below the bracket you choose.'
  ],
  [/^Withdraw start$/, /^When itemized/, 'The withdraw begins the first year itemized deductions exceed the amount you enter.'],
  [/^Withdraw start$/, /^When LTC starts/, 'The withdraw begins the year Long Term Care starts.'],
  [/^AUM fee$/, /^%/, 'Fee is a percentage of the AUM balance each year.'],
  [/^AUM fee$/, /^Fixed/, "Fee is a fixed dollar amount per year, in today's dollars."],
  [
    /^Starts$/,
    /^Day 1 of retirement/,
    'The shock hits in the first year without wages (today, if the scenario has no wages). The usual choice: it is the worst time for a bad sequence of returns.'
  ],
  [/^Starts$/, /^Today/, 'The shock hits this year, whatever your age or work status.'],
  [/^Starts$/, /^Years from now/, 'The shock hits the number of years from now that you enter below.'],
  [
    /^State$/,
    /^California/,
    'California brackets (1%–12.3%, plus 1% over $1M); capital gains taxed as ordinary income; Social Security not taxed.'
  ],
  [/^State$/, /^Washington/, 'No income tax, but a capital-gains excise tax: 7% above $278,000 of gains and 9.9% on gains above $1M.']
];

// ── Descriptions of inputs that have no usable label (looked up by element id first).
const II_IDS = {
  chartTipSelect:
    'What hovering a chart shows: None (nothing), Components (a description of the chart element under the cursor) or Complete (the usual values for the year, with the line-by-line breakdown).',
  // ── Stress tests card (display/stressPanel.js)
  stStartMode:
    'When the forced bad stretch begins: on day 1 of retirement (the first year without wages), today, or a number of years from now.',
  stYears: 'How many years from now the shock begins (0 = this year). Used when "Years from now…" is chosen.',
  stShare:
    "Share of each portfolio and IRA that earns the scenario's stock return (100 = all of it). The rest keeps the scenario's own return. Property is not affected.",
  stLost: 'Run the 2000–2009 "Lost Decade": the actual S&P 500 total returns of those ten years, starting on the shock date.',
  stLostInf:
    "Also use that decade's actual inflation instead of the scenario's inflation rate. Left unchecked, only the stock returns are replaced.",
  stStag: 'Run a made-up stagflation: stocks go nowhere while inflation climbs year by year.',
  stStagY:
    'How many years the stagflation lasts. Inflation ramps in a straight line from the first-year to the last-year rate over this period.',
  stStagEq:
    'Nominal stock return each year of the stagflation. 0 means stocks are flat in dollars, so they lose ground in real terms as inflation rises.',
  stStagI0: 'Inflation in the first year of the stagflation, in percent.',
  stStagI1: 'Inflation in the last year of the stagflation, in percent. Years in between rise in a straight line.',
  stY66:
    'Run the 1966 retiree: the actual S&P 500 returns and CPI of 1966–1981 (16 years), the worst starting date on record for a retiree.',
  stMed:
    'Add an extra late-life medical cost and see what it forces you to sell and what tax it triggers. Independent of the market scenarios: tick only this one to run it alone.',
  stMedWho: 'Whose age the medical shock is counted from.',
  stMedAge: 'The age (of the person chosen) at which the extra medical cost begins.',
  stMedYears: 'How many years the extra medical cost lasts.',
  stMedCost:
    "Extra medical cost per year, in today's dollars, on top of any Long Term Care card. It is itemized as a medical deduction above 7.5% of AGI.",
  stMedOrd: 'Also rerun the shock under four different withdrawal orders and compare what is sold, the tax and the final estate.',
  stRunBtn: 'Run every ticked scenario once, as a single repeatable case. Instant; the results table appears below.',
  stRunMcBtn:
    "Run the stress tests, then repeat every market scenario with the Monte Carlo card's trials and settings. During a scenario's years its stock returns (and its inflation, where it has one) replace the random ones; lifespans, care and the rest stay random. Takes as long as a Monte Carlo run for each scenario.",
  stCancelBtn: 'Stop the Monte Carlo part now. The stress test table stays; the Monte Carlo table is dropped.',
  // ── Monte Carlo card (display/mcPanel.js)
  mcRet:
    "Draw random yearly returns for every growing asset instead of the scenario's steady rate. The average return is unchanged; only the ups and downs are added.",
  mcVol: 'Standard deviation of a yearly stock-market return, in percent. Higher means wilder swings; about 16 is typical for US stocks.',
  mcVolRe: 'Standard deviation of a yearly real-estate return, in percent. Property has its own random draw, separate from the market.',
  mcRho: 'How closely portfolios move together (0 = independent, 1 = identical). Higher means a bad year hits everything at once.',
  mcPanic: 'In a market crash, correlations jump toward 1 so every portfolio falls together. Needs random returns.',
  mcPanRho: 'The correlation used among portfolios during a panic year (it never goes below the normal correlation).',
  mcPanTrig: 'A year counts as a crash when the market shock is worse than this many standard deviations below average.',
  mcPanHold: 'How many years the panic correlation stays in force after a crash begins.',
  mcPanRe: 'Property is hit by the market shock too during a panic, instead of moving on its own.',
  mcPanCmp:
    'Run every trial a second time with the panic switched off (same random draws) to show what the panic itself costs. Doubles the run time.',
  mcMort: 'Draw a random age at death for each person, replacing the "passes at age" sliders. Each trial then has its own lifespan.',
  mcMode: 'The most likely age at death. Individual trials spread around it according to the Spread below.',
  mcScale: 'How widely lifespans vary, in years. A bigger number means more very early and very late deaths.',
  mcLtc:
    'Draw random Long Term Care: whether care is needed, when it starts and how long it lasts. Replaces every Long Term Care card, including those of an inheritance source.',
  mcLtcP: 'Chance (0 to 1) that a person needs Long Term Care at some point. 0.5 means half of the trials include care.',
  mcLtcY: 'Median years of care among those who need it. Half the care spells are shorter and half longer.',
  mcInh:
    "Randomize inherited assets using the source plan's own lifespans, care and markets. Only sources imported with a donor table are simulated.",
  mcInhCut: 'Percent of every inherited asset you do not count on receiving (0 = all of it).',
  mcInf: "Draw random yearly inflation around the scenario's rate, instead of one fixed rate.",
  mcInfSd: 'How much inflation varies from year to year, in percentage points.',
  mcInfPhi: "How much one year's inflation carries into the next (0 = none, 0.95 = very sticky). Higher gives longer inflation runs.",
  mcTrials: 'How many random runs of the scenario to make. More trials give steadier percentages but take longer.',
  mcSeed:
    'Starting number of the random generator. The same seed and settings always give the same results; change it to draw a fresh set.',
  mcRunBtn: 'Run the simulation with the settings above. Results and charts appear below.',
  mcCancelBtn: 'Stop the run now. The trials finished so far are shown as partial results.',
  mcTrialSel: 'Pick one of the trials that ran short of money to load into the charts.',
  mcTrialSelGo: 'Load the chosen failed trial into the charts (a copy; your scenario is not changed).',
  mcTrialNum: 'The number of any trial, failed or not. A trial that stayed funded is loaded as F · Monte Carlo Success.',
  mcTrialNumGo: 'Load this trial into the charts (a copy; your scenario is not changed).'
};
