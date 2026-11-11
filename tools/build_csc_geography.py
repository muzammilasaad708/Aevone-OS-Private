"""Build an offline, cacheable CSC country/state/city index for AEVONE OS.

Source: dr5hn/countries-states-cities-database, immutable 2026-11-03 export.
Data and derivative indexes are ODbL-1.0, attribution required.
This indexes PLACES, not businesses or verified company contacts.
No third-party API key and no untrusted code execution.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "csc"
SOURCE = ("https://github.com/dr5hn/countries-states-cities-database/"
          "releases/download/v5.2.0-export.1/json-countries%2Bstates%2Bcities.json.gz")
EXPECTED_SHA256 = "d748ee4faf6c8bda6c9f7f30e9126b14cb9e5fb0b6c187162a083e715479475d"
VERSION = "v5.2.0-export.1"
MAX_ARCHIVE = 12_000_000
MAX_UNCOMPRESSED = 100_000_000


def normalize(raw):
    """Convert the upstream nested export to compact country-indexed locations."""
    countries = raw.get("countries") if isinstance(raw, dict) else raw
    if not isinstance(countries, list):
        raise ValueError("csc_invalid_top_level")
    result = {}
    for country in countries:
        if not isinstance(country, dict):
            continue
        code = str(country.get("iso2") or country.get("country_code") or "").upper()
        if len(code) != 2 or not code.isalpha():
            continue
        states = []
        for state in country.get("states") or []:
            if not isinstance(state, dict) or not state.get("name"):
                continue
            cities = sorted({str(city["name"]).strip()
                             for city in (state.get("cities") or [])
                             if isinstance(city, dict) and str(city.get("name") or "").strip()},
                            key=str.casefold)
            states.append({"name": str(state["name"]).strip(), "cities": cities})
        unassigned = sorted({str(city["name"]).strip()
                             for city in (country.get("cities") or [])
                             if isinstance(city, dict) and str(city.get("name") or "").strip()},
                            key=str.casefold)
        states.sort(key=lambda item: item["name"].casefold())
        result[code] = {"code": code, "country": str(country.get("name") or code),
                        "states": states, "unassigned": unassigned}
    return result


def download():
    req = urllib.request.Request(
        SOURCE, headers={"User-Agent": "AEVONE-OS-Geo-Snapshot/1.0", "Accept": "application/octet-stream"})
    with urllib.request.urlopen(req, timeout=25) as response:
        length = response.headers.get("Content-Length")
        if length and int(length) > MAX_ARCHIVE:
            raise ValueError("csc_archive_too_large")
        data = response.read(MAX_ARCHIVE + 1)
    if len(data) > MAX_ARCHIVE:
        raise ValueError("csc_archive_too_large")
    if hashlib.sha256(data).hexdigest() != EXPECTED_SHA256:
        raise ValueError("csc_download_checksum_mismatch")
    with gzip.GzipFile(fileobj=__import__("io").BytesIO(data)) as stream:
        text = stream.read(MAX_UNCOMPRESSED + 1)
    if len(text) > MAX_UNCOMPRESSED:
        raise ValueError("csc_uncompressed_data_too_large")
    return json.loads(text)


def write_snapshot(index, directory=OUT):
    if len(index) < 195:
        raise ValueError("csc_catalogue_incomplete")
    directory.mkdir(parents=True, exist_ok=True)
    for code, payload in index.items():
        if not (len(code) == 2 and code.isalpha() and code.isupper()):
            raise ValueError("csc_invalid_code")
        target = directory / (code + ".json")
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory,
                                         suffix=".tmp", delete=False) as f:
            temp_path = Path(f.name)
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        temp_path.replace(target)
    manifest = {"version": VERSION, "countries": len(index),
                "states": sum(len(x["states"]) for x in index.values()),
                "cities": sum(sum(len(s["cities"]) for s in x["states"]) + len(x["unassigned"])
                              for x in index.values()),
                "source": "https://github.com/dr5hn/countries-states-cities-database",
                "license": "ODbL-1.0", "source_export_sha256": EXPECTED_SHA256}
    (directory / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    return manifest


def ready(directory=OUT):
    try:
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        return (manifest.get("version") == VERSION and
                manifest.get("source_export_sha256") == EXPECTED_SHA256 and
                len(list(directory.glob("??.json"))) >= 195)
    except (OSError, ValueError):
        return False


def main():
    if ready():
        print("CSC geographic index already cached. Country/state/city dropdowns ready.")
        return 0
    print("Preparing CSC geographic index (one-time, 3.62 MB signed-checksum export).")
    try:
        index = normalize(download())
        manifest = write_snapshot(index)
        print("CSC geography cached:", manifest["countries"], "countries,", manifest["cities"], "cities")
        return 0
    except Exception as error:
        # Never hide an incomplete download as a successful geographic import.
        print("CSC geography unavailable; existing manual-location fallback remains:", type(error).__name__)
        return 1


if __name__ == "__main__":
    sys.exit(main())
