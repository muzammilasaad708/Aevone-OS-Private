"""Offline Phase 2 contract tests: no live API calls, no paid operations."""
import importlib
import io
import json
import os
import sys
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","backend"))
from phase2 import _record,merge_records,apify_dataset,apify_task,apollo_enrich,discover,ProviderError

SPEC={"category":"bakery","city":"Karachi","limit":10}
SOURCE="https://www.openstreetmap.org/node/42"
class Response:
 def __init__(self,data):self.data=json.dumps(data).encode()
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def read(self,_):return self.data

class Phase2Tests(unittest.TestCase):
 def setUp(self):
  self.env=patch.dict(os.environ,{},clear=True)
  self.env.start()
 def tearDown(self):self.env.stop()
 def test_evidence_and_missing_people(self):
  x=_record({"name":"Example Bakery","website":"https://example.com"},"Apify",SPEC,SOURCE)
  self.assertEqual(x["confidence"],"Source-listed, not independently verified")
  self.assertFalse(x["evidence"][0]["verified"])
  self.assertNotIn("owner",x)
 def test_bad_source(self):
  self.assertIsNone(_record({"name":"Shop"},"Apify",SPEC,""))
 def test_malicious_website(self):
  x=_record({"name":"Shop","website":"javascript:alert(1)"},"Apify",SPEC,SOURCE)
  self.assertEqual(x["website"],"")
 def test_no_fabricated_email(self):
  x=_record({"name":"Shop","email":"not an email"},"Apify",SPEC,SOURCE)
  self.assertEqual(x["email"],"")
 def test_dedupe(self):
  a=_record({"name":"Shop","website":"https://example.com"},"Apify",SPEC,SOURCE)
  b=_record({"name":"Shop Other","website":"https://www.example.com"},"OSM",SPEC,SOURCE)
  self.assertEqual(len(merge_records([a],[b])),1)
 def test_apify_no_key(self):
  with self.assertRaisesRegex(ProviderError,"apify_not_configured"):apify_dataset(SPEC)
 def test_apify_read_existing_dataset_only(self):
  os.environ.update(APIFY_TOKEN="fake",APIFY_DATASET_ID="dataset123")
  calls=[]
  def opener(req,timeout):
   calls.append((req.full_url,req.get_method(),timeout))
   return Response([{"name":"Bakery ABC","website":"https://bakery.example"}])
  rows=apify_dataset(SPEC,opener)
  self.assertEqual(len(rows),1)
  self.assertEqual(calls[0][1],"GET")
  self.assertIn("limit=10",calls[0][0])
 def test_apify_task_denied(self):
  with self.assertRaisesRegex(ProviderError,"paid_operations_disabled"):apify_task(SPEC)
 def test_apollo_defaults_no_credit(self):
  self.assertEqual(apollo_enrich([{"name":"Shop"}]),[{"name":"Shop"}])
 def test_fallback_without_apify(self):
  rows,notes=discover(SPEC,lambda _: [{"name":"OSM Bakery","source_url":SOURCE}])
  self.assertEqual(len(rows),1)
  self.assertEqual(notes,[])
 def test_osm_down_no_apify_fails(self):
  with self.assertRaisesRegex(ProviderError,"no_source_backed_listings"):
   discover(SPEC,lambda _: (_ for _ in ()).throw(RuntimeError("provider down")))
 def test_apify_error_preserves_osm(self):
  os.environ["AEVONE_ENABLE_APIFY_DATASET"]="true"
  rows,notes=discover(SPEC,lambda _: [{"name":"OSM Bakery","source_url":SOURCE}])
  self.assertEqual(len(rows),1)
  self.assertIn("apify_apify_not_configured",notes)
 def test_network_error_redacted(self):
  os.environ.update(APIFY_TOKEN="private",APIFY_DATASET_ID="dataset123")
  def failing(req,timeout):raise urllib.error.HTTPError(req.full_url,429,"private",{},None)
  with self.assertRaisesRegex(ProviderError,"rate_limited"):apify_dataset(SPEC,failing)
 def test_paid_task_requires_both_config_and_approval(self):
  os.environ["AEVONE_ALLOW_BILLABLE_APIFY"]="true"
  with self.assertRaisesRegex(ProviderError,"apify_task_not_configured"):apify_task(SPEC)

if __name__=="__main__":unittest.main()
