"""Offline checks for pinned CSC geography importer; no network or secrets."""
import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import build_csc_geography as csc


class CSCGeographyTests(unittest.TestCase):
    def test_nested_countries_states_and_cities(self):
        fixture = [
            {"iso2":"IT","name":"Italy","states":[
                {"name":"Abruzzo","cities":[{"name":"L'Aquila"},{"name":"Pescara"},{"name":"L'Aquila"}]}]},
            {"iso2":"TR","name":"Turkey","states":[
                {"name":"İstanbul","cities":[{"name":"Istanbul"},{"name":"Kadıköy"}]}]},
            {"iso2":"VA","name":"Vatican City","states":[],"cities":[{"name":"Vatican City"}]}
        ]
        index = csc.normalize(fixture)
        self.assertEqual(index["IT"]["states"][0]["cities"], ["L'Aquila","Pescara"])
        self.assertEqual(index["TR"]["states"][0]["name"], "İstanbul")
        self.assertEqual(index["VA"]["unassigned"], ["Vatican City"])
        self.assertEqual(index["VA"]["states"], [])

    def test_reject_incomplete_database(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "csc_catalogue_incomplete"):
                csc.write_snapshot({"TR":{"states":[],"unassigned":[]}},pathlib.Path(folder))

    def test_verified_cache_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder)
            codes = [chr(a) + chr(b) for a in range(65, 91) for b in range(65, 91)][:195]
            data = {code: {"code":code,"country":code,"states":[{"name":"Region","cities":["Town"]}],
                           "unassigned":[]} for code in codes}
            manifest = csc.write_snapshot(data, path)
            self.assertEqual(manifest["countries"], 195)
            self.assertEqual(manifest["cities"], 195)
            self.assertTrue(csc.ready(path))
            payload = json.loads((path/(codes[0]+".json")).read_text())
            self.assertEqual(payload["states"][0]["cities"], ["Town"])
            (path / "manifest.json").unlink()
            self.assertFalse(csc.ready(path))


if __name__ == "__main__":
    unittest.main()
