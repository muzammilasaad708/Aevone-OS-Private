"""Offline, deterministic free OSM extract fallback tests. Never download live data."""
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import geofabrik
from phase2 import discover

SPEC = {"category": "hotel", "city": "Karachi", "limit": 10}
OSM_RECORD = {
    "category": "hotel", "kind": "node", "id": 42,
    "lat": 24.86, "lon": 67.02,
    "tags": {"name": "Sample Source-Listed Hotel", "website": "https://example.org"}
}

class GeofabrikTests(unittest.TestCase):
    def test_snapshot_is_unverified_and_source_backed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "snapshot.json"
            path.write_text(json.dumps({
                "version": 1, "source": geofabrik.SOURCE_URL,
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "records": [OSM_RECORD]
            }), encoding="utf-8")
            rows = geofabrik.discover_snapshot(SPEC, path=path,
                download=lambda _: self.fail("Cached data must avoid downloads"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Sample Source-Listed Hotel")
        self.assertEqual(rows[0]["source_url"], "https://www.openstreetmap.org/node/42")
        self.assertEqual(rows[0]["confidence"], "Source-listed, not independently verified")
        self.assertFalse(rows[0]["evidence"][0]["verified"])

    def test_cache_rejects_unsupported_or_unrelated_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "snapshot.json"
            path.write_text(json.dumps({
                "version": 1, "source": geofabrik.SOURCE_URL,
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "records": [{**OSM_RECORD, "category": "restaurant"}]
            }), encoding="utf-8")
            self.assertEqual(geofabrik.discover_snapshot(SPEC, path=path), [])

    def test_provider_failure_uses_snapshot_without_paid_provider(self):
        with patch.dict(os.environ, {"AEVONE_ENABLE_OSM_SNAPSHOT": "true"}, clear=True):
            rows, notes = discover(SPEC,
                lambda _: (_ for _ in ()).throw(RuntimeError("Overpass attempts failed: instance1:HTTP502")),
                snapshot_fetch=lambda _: [{
                    "name": "Sample Hotel",
                    "source_url": "https://www.openstreetmap.org/node/42",
                    "source_name": "OpenStreetMap (Geofabrik extract)"
                }])
        self.assertEqual(len(rows), 1)
        self.assertTrue(any(s.startswith("osm_") for s in notes))

    def test_disabled_fallback_does_not_call_snapshot(self):
        with patch.dict(os.environ, {"AEVONE_ENABLE_OSM_SNAPSHOT": "false"}, clear=True):
            with self.assertRaisesRegex(Exception, "no_source_backed_listings"):
                discover(SPEC, lambda _: [], snapshot_fetch=lambda _: self.fail("disabled"))

    def test_parser_reads_only_real_karachi_pois(self):
        try:
            import osmium
        except ImportError:
            self.skipTest("osmium not installed; enabled in GitHub Actions")
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="AEVONE-test">
<node id="101" lat="24.8607" lon="67.0011"><tag k="name" v="Hotel Example"/><tag k="tourism" v="hotel"/></node>
<node id="102" lat="24.863" lon="67.012"><tag k="name" v="Restaurant Example"/><tag k="amenity" v="restaurant"/></node>
<node id="103" lat="31.52" lon="74.35"><tag k="name" v="Hotel Outside"/><tag k="tourism" v="hotel"/></node>
<node id="104" lat="24.86" lon="67.0"><tag k="tourism" v="hotel"/></node>
<node id="105" lat="24.861" lon="67.003"/>
<node id="106" lat="24.862" lon="67.004"/>
<way id="201"><nd ref="105"/><nd ref="106"/><tag k="name" v="Hotel With Building"/><tag k="tourism" v="hotel"/></way>
</osm>"""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.osm"
            path.write_text(xml, encoding="utf-8")
            records = geofabrik.extract_file(path)
        self.assertEqual(len(records), 3)
        self.assertEqual({r["category"] for r in records}, {"hotel", "restaurant"})
        self.assertEqual({r["id"] for r in records}, {101, 102, 201})

if __name__ == "__main__":
    unittest.main()
