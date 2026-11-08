"""Offline cache-first regression tests with synthetic source data."""
import json,os,sys,tempfile,unittest
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
import geofabrik,phase2,worker
SPEC={"category":"hotel","city":"Karachi","limit":2}
RECORDS=[{"category":"hotel","kind":"node","id":n,"lat":24.86,"lon":67.02,"tags":{"name":"Fixture Hotel "+str(n)}} for n in (42,43)]
class FastResearchTests(unittest.TestCase):
 def save(self,path,records):
  path.write_text(json.dumps({"version":geofabrik.CACHE_VERSION,"source":geofabrik.SOURCE_URL,
   "retrieved_at":datetime.now(timezone.utc).isoformat(),"records":records}),encoding="utf-8")
 def test_warm_cache_skips_networks(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/"snapshot.json";self.save(path,RECORDS)
   with patch.dict(os.environ,{"AEVONE_ENABLE_OSM_SNAPSHOT":"true","AEVONE_SNAPSHOT_CACHE_PATH":str(path),"AEVONE_ENABLE_APIFY_DATASET":"","AEVONE_ALLOW_BILLABLE_APOLLO":""}):
    rows,notes=phase2.discover(SPEC,lambda _:self.fail("Warm cache must skip Overpass"))
  self.assertEqual(len(rows),2);self.assertIn("osm_cached_snapshot",notes)
  self.assertTrue(all(x["source_url"].startswith("https://www.openstreetmap.org/node/") for x in rows))
  self.assertTrue(all(x["confidence"]=="Source-listed, not independently verified" for x in rows))
 def test_missing_cache_fast_path_makes_no_download(self):
  with tempfile.TemporaryDirectory() as temp:
   with patch.object(geofabrik,"build_cache",side_effect=AssertionError("Should never download")):
    self.assertEqual(geofabrik.cached_snapshot(SPEC,path=Path(temp)/"missing.json"),[])
 def test_partial_cache_uses_overpass_too(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/"cache.json";self.save(path,RECORDS[:1]);calls=[]
   def osm(spec):
    calls.append(True)
    return [{"name":"Additional Hotel","city":"Karachi","source_url":"https://www.openstreetmap.org/node/50","source_name":"OpenStreetMap"}]
   with patch.dict(os.environ,{"AEVONE_ENABLE_OSM_SNAPSHOT":"true","AEVONE_SNAPSHOT_CACHE_PATH":str(path),"AEVONE_ENABLE_APIFY_DATASET":""}):
    rows,_=phase2.discover(SPEC,osm)
   self.assertEqual(len(rows),2);self.assertEqual(len(calls),1)
 def test_bounded_karachi_timeout(self):
  from urllib.error import URLError
  values=[]
  def fail(req,timeout):values.append(timeout);raise URLError("offline")
  with patch.object(worker,"ENDPOINTS",["https://example.test/interpreter"]),patch.dict(os.environ,{"AEVONE_ENABLE_OSM_SNAPSHOT":"true"}):
   with self.assertRaises(RuntimeError):worker.fetch_osm(SPEC,opener=fail)
  self.assertEqual(values,[8])
if __name__=="__main__":unittest.main()
