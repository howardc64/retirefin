Build html file showing retirement financial outlook

How to Run

Upload following 5 files to Claude, type run and enter

- retire.txt (AI agent prompts)
- html_check.txt (run checks on generated html)
- one of the user profile input file ( MFJ.txt or widowsingle.txt )
- john_jane_retirement.html ( sample html output from  MFJ )
- john_jane_tax_worksheet_age67.pdf ( detailed tax calculation for MFJ at age 67 )

Output

- Financial analysis in html file
- Detailed tax calculation if requested in the user input file

*** INCLUDING Sample html file is critical

- AI agent prompt have ample ambiguity and have been resolved previously to produce sample html
- sample html therefore can be thought of as a "detail spec" to eliminate ambiguities
- user input file can override various parts of sample html. For example, user windowsingle already started collecting social security (SS) directs html generation to skip SS breakeven analysis

Spot check generated html

Upload generated html and html_check.txt on a different LLM (eg. Gemini) to spot check
  computations match IRS rules
  various results
