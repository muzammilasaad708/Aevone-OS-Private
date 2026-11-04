"""Offline integrity and mutation tests for the AEVONE connector catalogue.

No API keys, live scrapers, external requests or production database access.
"""
import copy
import json
import pathlib
import unittest
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "web" / "registry.json"
JS_PATH = ROOT / "web" / "registry.mjs"
EXPECTED_NEW = {
    "apify/apify-mcp-server", "apify/crawlee",
    "apify/crawlee-python", "apify/apify-client-js",
    "apify/apify-client-python", "apify/apify-sdk-js",
    "apify/actor-scraper", "apify/actor-rag-web-browser",
    "apify/n8n-nodes-apify", "apify/actor-beautifulsoup-scraper",
    "apolloio/apollo-io-cli", "apolloio/apollo-mcp-plugin",
    "zoominfo/zoominfo-mcp-plugin", "zoominfo/gtm-ai-cli",
    "zoominfo/n8n-nodes-zoominfo",
}
VALID_KINDS = {"provider", "platform", "repository"}


def parse_js_registry():
    text = JS_PATH.read_text(encoding="utf-8").strip()
    prefix = "export default "
    if not text.startswith(prefix) or not text.endswith(";"):
        raise ValueError("Expected a static exported JSON array")
    return json.loads(text[len(prefix):-1])


def validate_entry(item):
    if not isinstance(item, dict):
        return False
    for key in ("id", "name", "group", "kind", "status"):
        if not isinstance(item.get(key), str) or not item[key].strip():
            return False
    if item["kind"] not in VALID_KINDS:
        return False
    if item["id"] != item["id"].lower():
        return False
    if item["kind"] == "repository":
        if item["status"] != "not-integrated":
            return False
        parsed = urlparse(item.get("url") or "")
        if parsed.scheme != "https" or parsed.netloc != "github.com":
            return False
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            return False
        if parsed.path.strip("/").lower() != item["id"]:
            return False
        if item["name"].lower() != item["id"]:
            return False
    return True


class ConnectorRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        cls.js_entries = parse_js_registry()

    def test_synchronized_sources(self):
        self.assertEqual(self.entries, self.js_entries)

    def test_unique_and_nonempty(self):
        self.assertEqual(len(self.entries), 61)
        ids = [item["id"] for item in self.entries]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(validate_entry(item) for item in self.entries))

    def test_new_developer_tools_are_only_catalogue_entries(self):
        found = {item["id"]: item for item in self.entries}
        self.assertTrue(EXPECTED_NEW.issubset(found))
        for name in EXPECTED_NEW:
            with self.subTest(name=name):
                self.assertEqual(found[name]["status"], "not-integrated")
                self.assertEqual(found[name]["kind"], "repository")

    def test_existing_platforms_preserved(self):
        found = {item["id"]: item for item in self.entries}
        for name in ("apollo", "apify", "zoominfo", "rapidapi"):
            self.assertEqual(found[name]["kind"], "platform")

    def test_twenty_thousand_valid_and_mutated_scenarios(self):
        """20k distinct case numbers; varied entries and tampered field types."""
        mutations = (
            ("id", None),
            ("name", ""),
            ("group", None),
            ("kind", "executing"),
            ("status", ""),
        )
        for case in range(20_000):
            entry = self.entries[(case * 37 + case // 61) % len(self.entries)]
            self.assertTrue(validate_entry(entry), f"valid case {case}")
            damaged = copy.deepcopy(entry)
            key, value = mutations[case % len(mutations)]
            damaged[key] = value
            self.assertFalse(validate_entry(damaged), f"mutant case {case}")
            if entry["kind"] == "repository":
                bad_link = copy.deepcopy(entry)
                bad_link["url"] = "http://example.invalid/" + entry["id"]
                self.assertFalse(validate_entry(bad_link), f"unsafe URL case {case}")


if __name__ == "__main__":
    unittest.main()
