# Excel export: end-to-end check with LibreOffice

The Node tests (`tests/mc/xlsx_trial_test.js`, `tests/mc/xlsx_guardrail_test.js`) check the workbook's structure and cached values. This folder checks the **formulas**: LibreOffice recalculates the exported file and every formula cell is compared with the value the app cached.

```
npm i xlsx                                   # once, anywhere; below it is in /tmp/xl
NODE_PATH=/tmp/xl/node_modules node tests/xlsx_e2e/write_workbook.js Samples/Couple_Heir.json /tmp/x.xlsx \
  '{"guardrail":{"enabled":true,"iwrMode":"target","targetWR":1.5,"band":20,"prosperity":true},"medShock":{"enabled":true,"age":75,"years":3,"cost":120000,"person":0}}'
soffice --headless --convert-to xlsx --outdir /tmp/rc /tmp/x.xlsx
python3 tests/xlsx_e2e/compare_recalc.py /tmp/x.xlsx /tmp/rc/x.xlsx          # needs openpyxl
```

To check the export of a Monte Carlo trial, put `MC_TRIAL=fail` (the first failed trial of a stressed 120-trial run, shown as B) or `MC_TRIAL=ok` (the first successful one, shown as C) in front of the `node` command.

**Make LibreOffice really recalculate.** By default `--convert-to` keeps the cached values of an .xlsx and recalculates nothing, so the comparison passes whatever the formulas say (a planted wrong value went unnoticed). Set *Recalculation on file load* to *Always* once: add to `~/.config/libreoffice/4/user/registrymodifications.xcu`

```
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
```

and check the setup by editing one cached value of a formula cell (e.g. with SheetJS) and confirming the comparison reports it.

**Expected result.** Three older columns differ by rounding only, with the features off as well as on: *Effective tax rate* (up to 0.0005), *Funding check* and *Income tax paid as expense* (under half a cent). Nothing else: in particular no guardrail column.
