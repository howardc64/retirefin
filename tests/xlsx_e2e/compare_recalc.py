# usage: python3 compare_recalc.py <written.xlsx> <recalculated-by-LibreOffice.xlsx>
# Compares every formula cell: the value the app cached (first file) against LibreOffice's recalculated value (second file); differences are grouped by column heading.
import sys, openpyxl, collections
a=openpyxl.load_workbook(sys.argv[1],data_only=True); f=openpyxl.load_workbook(sys.argv[1]); b=openpyxl.load_workbook(sys.argv[2],data_only=True)
n=0; by=collections.OrderedDict(); worst={}
for ws in f.worksheets:
    wa=a[ws.title]; wb=b[ws.title]
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value,str) and c.value.startswith('='):
                n+=1; x=wa[c.coordinate].value; y=wb[c.coordinate].value
                ok=(x==y) or (x in (None,'') and y in (None,'')) or (isinstance(x,(int,float)) and isinstance(y,(int,float)) and abs(x-y)<=1e-6*max(1,abs(x)))
                if not ok:
                    hdr=None
                    for r in range(1,5):
                        h=ws.cell(row=r,column=c.column).value
                        if isinstance(h,str) and not h.startswith('=') and h not in ('formula','app value'): hdr=h
                    k=(ws.title,(hdr or '?')[:80]); by[k]=by.get(k,0)+1; worst[k]=max(worst.get(k,0),abs((x or 0)-(y or 0)) if isinstance(x,(int,float)) and isinstance(y,(int,float)) else 1e9)
print('formula cells',n,'differences',sum(by.values()))
for k,v in by.items(): print(' ',v,'x',k[0],'|',k[1],'| max abs diff',round(worst[k],6))
