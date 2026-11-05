"""Deterministic reliability regression tests, no network or paid operations."""
import os
import pathlib
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"backend"))
import phase2
import worker

SPEC={"category":"restaurant","city":"Karachi","limit":10}

class ReliabilityTests(unittest.TestCase):
 def test_osm_http_diagnostics(self):
  def offline(_):
   raise RuntimeError("Overpass attempts failed: instance1:HTTP429, instance2:TimeoutError")
  with self.assertRaises(phase2.ProviderError) as error:
   phase2.discover(SPEC,offline)
  self.assertIn("instance1:HTTP429",str(error.exception))
  self.assertIn("instance2:TimeoutError",str(error.exception))

 def test_untrusted_errors_redacted(self):
  def offline(_):
   raise RuntimeError("token=private-secret https://sensitive.example/")
  with self.assertRaises(phase2.ProviderError) as error:
   phase2.discover(SPEC,offline)
  self.assertNotIn("private-secret",str(error.exception))
  self.assertIn("osm_unavailable",str(error.exception))

 def test_apify_inactive_by_default(self):
  with patch.dict(os.environ,{"AEVONE_ENABLE_APIFY_DATASET":""}):
   with self.assertRaisesRegex(phase2.ProviderError,"no_source_backed_listings"):
    phase2.discover(SPEC,lambda _: [])

 def test_job_failure_yields_nonzero_workflow(self):
  job={"id":"safe-id","query":"10 restaurants in Karachi"}
  with patch.object(worker,"api",return_value=[job]),patch.object(worker,"claim",return_value=True),\
       patch.object(worker,"discover",side_effect=phase2.ProviderError("no_source_backed_listings:osm_unavailable")),\
       patch.object(worker,"finish") as finish,patch.object(worker,"BASE","https://example.supabase.co"),\
       patch.object(worker,"KEY","x"*30):
   with self.assertRaisesRegex(RuntimeError,"1 research job"):
    worker.run()
   self.assertEqual(finish.call_args.args[1]["status"],"failed")

 def test_job_success_keeps_successful_workflow(self):
  job={"id":"safe-id","query":"10 restaurants in Karachi"}
  with patch.object(worker,"api",return_value=[job]),patch.object(worker,"claim",return_value=True),\
       patch.object(worker,"discover",return_value=([{"name":"Test","source_url":"https://www.openstreetmap.org/node/1"}],[])),\
       patch.object(worker,"finish"),patch.object(worker,"BASE","https://example.supabase.co"),\
       patch.object(worker,"KEY","x"*30):
   self.assertEqual(worker.run(),1)

if __name__=="__main__":unittest.main()
