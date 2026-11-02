import sys, pathlib, unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'backend'))
import planner, worker

class ResearchTests(unittest.TestCase):
 def test_parse(self):
  p=planner.plan('Find 20 bakeries in Karachi')
  self.assertEqual((p['category'],p['city'],p['limit']),('bakery','Karachi',20))
 def test_limit(self):
  self.assertEqual(planner.plan('Find 999 restaurants in Lahore')['limit'],50)
 def test_unsupported(self):
  with self.assertRaises(ValueError):planner.plan('hi')
 def test_query_safe(self):
  q=worker.overpass_query(planner.plan('Find 10 salons in Karachi'))
  self.assertIn('hairdresser',q)
  self.assertNotIn('localhost',q)
 def test_normalize(self):
  raw=[{'id':123,'type':'node','tags':{'name':'Example Bakery','phone':'021-123','website':'https://example.org'}},
       {'id':123,'type':'node','tags':{'name':'Example Bakery','phone':'021-123','website':'https://example.org'}}]
  r=worker.normalize(raw,planner.plan('10 bakeries in Karachi'))
  self.assertEqual(len(r),1)
  self.assertEqual(r[0]['source_url'],'https://www.openstreetmap.org/node/123')
 def test_missing_contact(self):
  r=worker.normalize([{'id':2,'type':'node','tags':{'name':'Test'}}],planner.plan('bakeries in Karachi'))
  self.assertEqual((r[0]['phone'],r[0]['email']),('',''))
 def test_atomic_claim(self):
  with patch.object(worker,'api',return_value=[]) as call:
   self.assertFalse(worker.claim('123'))
   self.assertIn('status=eq.queued',call.call_args.args[0])
 def test_processed(self):
  with patch.object(worker,'claim',return_value=True),patch.object(worker,'fetch_osm',return_value=[]),patch.object(worker,'finish') as f:
   self.assertTrue(worker.process({'id':'abc','query':'10 bakeries in Karachi'}))
   self.assertEqual(f.call_args.args[1]['status'],'complete')
if __name__=='__main__':unittest.main()
