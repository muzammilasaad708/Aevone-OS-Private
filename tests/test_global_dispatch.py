"""Global discovery and per-request dispatch regression tests. No live paid calls."""
import pathlib
import os
import sys
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"backend"))
from planner import plan, COUNTRIES
import worker

class GlobalGeographyTests(unittest.TestCase):
 def test_catalogue_includes_all_recognized_states(self):
  codes={item[0] for item in COUNTRIES.values()}
  self.assertGreaterEqual(len(codes),195)
  for code in ('PK','TR','AE','US','SA','IT','CA','JP','BR','ZA','NZ'):
   self.assertIn(code,codes)

 def test_cities_are_not_restricted_to_pakistan(self):
  cases=[
   ('Find 30 bakeries in Istanbul, Turkey','bakery','Istanbul','TR'),
   ('Find 30 bakery shops in Istanbul, Türkiye','bakery','Istanbul','TR'),
   ('Find 30 perfume brands in Dubai, UAE','perfumery','Dubai','AE'),
   ('Find 20 hotels in New York, USA','hotel','New York','US'),
   ('Find 10 hotels in Washington DC, United States','hotel','Washington DC','US'),
   ('Find 10 hotels in Makkah, Saudi Arabia','hotel','Makkah','SA'),
   ('Find 10 hotels in Madina, Saudi Arabia','hotel','Madinah','SA'),
   ('Find 15 bakeries in Toronto, Canada','bakery','Toronto','CA'),
   ('Find 5 restaurants in Kyoto, Japan','restaurant','Kyoto','JP'),
   ('Find 10 restaurants in Rome, Italy','restaurant','Rome','IT'),
   ('Find 10 restaurants in Quetta, Pakistan','restaurant','Quetta','PK'),
   ('Find 8 shops in KPK, Pakistan','shop','Khyber Pakhtunkhwa','PK'),
  ]
  for q,category,city,code in cases:
   with self.subTest(query=q):
    spec=plan(q)
    self.assertEqual((spec['category'],spec['city'],spec['country_code']),(category,city,code))
    self.assertEqual(spec['limit'],int(q.split()[1]))

 def test_dynamic_country_and_city(self):
  p=plan('Find 7 bakeries in Helsinki, Finland')
  self.assertEqual((p['city'],p['country_code']),('Helsinki','FI'))
  q=plan('Find 7 restaurants in Nairobi, Kenya')
  self.assertEqual((q['city'],q['country_code']),('Nairobi','KE'))

 def test_city_name_ambiguity_is_country_scoped(self):
  query=worker.overpass_query(plan('Find 10 bakeries in Paris, France'))
  self.assertIn('ISO3166-1',query)
  self.assertIn('="FR"',query)
  self.assertIn('name:en',query)
  self.assertIn('area.target',query)
  self.assertNotIn('Pakistan',query)

 def test_dubai_perfume_category_uses_shop_tag(self):
  q=worker.overpass_query(plan('Find 30 perfume brands in Dubai, UAE'))
  self.assertIn('nwr["shop"="perfumery"]["name"]',q)
  self.assertIn('="AE"',q)

 def test_istanbul_has_localized_osm_alias(self):
  query=worker.overpass_query(plan('Find 30 bakeries in Istanbul, Turkey'))
  self.assertIn('İstanbul',query)
  self.assertIn('"shop"="bakery"',query)

 def test_reject_injected_location(self):
  with self.assertRaises(ValueError):
   plan('Find 10 hotels in Paris";out, France')

 def test_international_osm_records_have_correct_country(self):
  spec=plan('Find 4 bakeries in Istanbul, Turkey')
  data=[{'id':123,'type':'node','tags':{'name':'Fixture Bakery'}}]
  rows=worker.normalize(data,spec)
  self.assertEqual(rows[0]['country'],'Turkey')
  self.assertNotEqual(rows[0]['country'],'Pakistan')
  self.assertEqual(rows[0]['source_url'],'https://www.openstreetmap.org/node/123')

class TargetedDispatchTests(unittest.TestCase):
 def test_worker_fetches_exact_job_when_dispatch_supplies_uuid(self):
  jobid='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  with patch.dict(os.environ,{'AEVONE_JOB_ID':jobid}),\
       patch.object(worker,'BASE','https://example.org'),\
       patch.object(worker,'KEY','x'*40),\
       patch.object(worker,'api',return_value=[{'id':jobid,'query':'Find 10 shops in Karachi'}]) as api,\
       patch.object(worker,'process',return_value=True) as process:
   self.assertEqual(worker.run(),1)
  self.assertIn('id=eq.'+jobid,api.call_args.args[0])
  process.assert_called_once()

 def test_targeted_worker_rejects_invalid_uuid_before_db_request(self):
  with patch.dict(os.environ,{'AEVONE_JOB_ID':'not-a-uuid'}),\
       patch.object(worker,'BASE','https://example.org'),\
       patch.object(worker,'KEY','x'*40),\
       patch.object(worker,'api') as api:
   with self.assertRaisesRegex(RuntimeError,'Invalid targeted job ID'):
    worker.run()
   api.assert_not_called()

 def test_github_workflow_accepts_target_id(self):
  workflow=(ROOT/'.github/workflows/research.yml').read_text()
  edge=(ROOT/'supabase/functions/aevone-dispatch/index.ts').read_text()
  self.assertIn('AEVONE_JOB_ID:',workflow)
  self.assertIn('job_id:id',edge)
  self.assertIn('response.status===200||response.status===204',edge)
  self.assertIn('github_http_',edge)

if __name__=='__main__':
 unittest.main()
