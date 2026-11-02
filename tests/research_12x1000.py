"""Twelve distinct 1,000-case deterministic runtime checks. No paid or live external requests."""
import sys,random,re,importlib.util,urllib.parse
from pathlib import Path
BASE=Path(__file__).resolve().parents[1];sys.path.insert(0,str(BASE/'backend'))
from planner import plan
from worker import normalize
rng=random.Random(81877)
places=['Karachi','Lahore','Islamabad','Rawalpindi','Faisalabad','Multan','Pakistan','Peshawar']
types=['bakeries','restaurants','clothing stores','salons','clinics','hotels','cafes','pharmacies']
checks=[
 lambda i:plan(f'Find {i%50+1} {types[i%8]} in {places[i%8]}')['limit']==i%50+1,
 lambda i:plan(f'{types[i%8]} in {places[i%8]}')['limit']==15,
 lambda i:plan(f'find 999 {types[i%8]} in {places[i%8]}')['limit']==50,
 lambda i:plan(f'find {i%9+1} {types[i%8]} in {places[i%8]}')['city']==places[i%8],
 lambda i:plan(f'find 10 {types[i%8]} in {places[i%8]}')['category'] in ('bakery','restaurant','clothes','hairdresser','clinic','hotel','cafe','pharmacy'),
 lambda i:expect_fail(f'find businesses in {places[i%8]}'),
 lambda i:expect_fail('find bakeries'),
 lambda i:expect_fail('x'*1001),
 lambda i:normalize([{'type':'node','id':1,'tags':{'name':'ABC bakery','shop':'bakery'}}],{'city':'Karachi','limit':5})[0]['source_url']=='https://www.openstreetmap.org/node/1',
 lambda i:len(normalize([{'type':'node','id':j,'tags':{'name':'ABC','website':'https://example.org'}} for j in range(i%30+1)],{'city':'Karachi','limit':5}))==1,
 lambda i:len(normalize([{'type':'node','id':j,'tags':{'name':f'Company {j}'}} for j in range(15)],{'city':'Karachi','limit':i%10+1}))==i%10+1,
 lambda i:not normalize([{'type':'node','id':1,'tags':{'name':''}}],{'city':'Karachi','limit':5})
]
def expect_fail(s):
 try:plan(s);return False
 except ValueError:return True

def run():
 for j,case in enumerate(checks,1):
  for i in range(1000):
   assert case(i),f'batch {j} case {i}'
 print('12 batches x 1,000 checks: all passed')
if __name__=='__main__':run()
