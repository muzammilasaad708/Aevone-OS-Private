"""Free, source-backed Karachi business listings from a bounded Geofabrik OSM extract.

This is an offline fallback, NOT a verified-contact provider. OpenStreetMap
contributors retain attribution under ODbL. No paid API calls or user secrets.
Only invoked if AEVONE_ENABLE_OSM_SNAPSHOT=true and insufficient live results.
"""
import json
import os
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCE_URL = "https://download.geofabrik.de/asia/pakistan-latest.osm.pbf"
CACHE_VERSION = 1
MAX_DOWNLOAD_BYTES = 230_000_000
MAX_CACHE_BYTES = 20_000_000
MAX_RECORDS = 100_000
KARACHI_BBOX = (24.75, 66.80, 25.30, 67.45)
TAGS = {
    ("shop", "bakery"): "bakery",
    ("shop", "clothes"): "clothes",
    ("shop", "supermarket"): "supermarket",
    ("shop", "hairdresser"): "hairdresser",
    ("shop", "shop"): "shop",
    ("amenity", "restaurant"): "restaurant",
    ("amenity", "clinic"): "clinic",
    ("amenity", "cafe"): "cafe",
    ("amenity", "pharmacy"): "pharmacy",
    ("amenity", "school"): "school",
    ("tourism", "hotel"): "hotel",
    ("leisure", "fitness_centre"): "fitness_centre",
}
KEEP_TAGS = {"name", "website", "contact:website", "phone", "contact:phone",
             "email", "contact:email"}
DEFAULT_CACHE = ".aevone-cache/pakistan-businesses.json"

class SnapshotError(RuntimeError):
    """Sanitized, fixed-format operational failure."""

def _in_karachi(lat, lon):
    south, west, north, east = KARACHI_BBOX
    return south <= lat <= north and west <= lon <= east

def extract_file(path):
    """Extract business nodes/ways from a local OSM PBF or test OSM XML file."""
    try:
        import osmium
    except ImportError:
        raise SnapshotError("osmium_dependency_missing") from None

    class Collector(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.records = []

        def _collect(self, entity, kind, position):
            if len(self.records) >= MAX_RECORDS:
                return
            tags = entity.tags
            if not tags.get("name"):
                return
            category = next((value for (key, tag), value in TAGS.items()
                             if tags.get(key) == tag), None)
            if not category or position is None:
                return
            lat, lon = position
            if not _in_karachi(lat, lon):
                return
            kept = {key: str(tags[key])[:2048] for key in KEEP_TAGS if key in tags}
            self.records.append({
                "category": category, "kind": kind, "id": int(entity.id),
                "lat": lat, "lon": lon, "tags": kept
            })

        def node(self, node):
            if node.location.valid():
                self._collect(node, "node", (node.location.lat, node.location.lon))

        def way(self, way):
            # A way may reference nodes with missing coordinates in a regional
            # extract. Use only actual valid positions, never invent a centroid.
            if not way.tags.get("name"):
                return
            locs = [(node.location.lat, node.location.lon)
                    for node in way.nodes if node.location.valid()]
            if locs:
                count = len(locs)
                self._collect(way, "way",
                              (sum(p[0] for p in locs) / count,
                               sum(p[1] for p in locs) / count))

    collector = Collector()
    try:
        collector.apply_file(str(path), locations=True, idx="flex_mem")
    except (RuntimeError, OSError, ValueError):
        raise SnapshotError("osm_extract_invalid") from None
    return collector.records

def _download_to(path, opener=None):
    """Single size/time-bounded free download, with no authorization headers."""
    opener = opener or urllib.request.urlopen
    req = urllib.request.Request(SOURCE_URL,
             headers={"User-Agent": "AEVONE-Research/4.0 (low-volume OSM extract)",
                      "Accept": "application/octet-stream"})
    deadline = time.monotonic() + 120
    try:
        with opener(req, timeout=45) as response, open(path, "wb") as output:
            length = response.headers.get("Content-Length")
            if length and int(length) > MAX_DOWNLOAD_BYTES:
                raise SnapshotError("extract_exceeds_size_limit")
            total = 0
            while True:
                if time.monotonic() > deadline:
                    raise SnapshotError("extract_download_timeout")
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_DOWNLOAD_BYTES:
                    raise SnapshotError("extract_exceeds_size_limit")
                output.write(chunk)
        if total < 1000:
            raise SnapshotError("extract_empty")
    except SnapshotError:
        raise
    except (OSError, TimeoutError, ValueError):
        raise SnapshotError("extract_download_unavailable") from None
    if not Path(path).exists():
        raise SnapshotError("extract_missing")

def _read_cache(path):
    if not path.is_file() or path.stat().st_size > MAX_CACHE_BYTES:
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") != CACHE_VERSION or not isinstance(data.get("records"), list):
            return None
        retrieved = datetime.fromisoformat(data["retrieved_at"].replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - retrieved).total_seconds()
        if age < -3600 or age > 14 * 86400:
            return None
        if len(data["records"]) > MAX_RECORDS:
            return None
        return data
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return None

def build_cache(path, download=None):
    """Replace the cache atomically only after a complete validated parse."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="aevone-osm-") as dirname:
        source = Path(dirname) / "pakistan.osm.pbf"
        if download is None:
            _download_to(source)
        else:
            download(source)
        records = extract_file(source)
    if not records:
        raise SnapshotError("extract_no_karachi_businesses")
    snapshot = {"version": CACHE_VERSION,
                "source": SOURCE_URL,
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "records": records}
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8",
        dir=path.parent, prefix=".partial-", suffix=".json", delete=False) as handle:
        temp = Path(handle.name)
        try:
            json.dump(snapshot, handle, separators=(",", ":"), ensure_ascii=False)
        except Exception:
            temp.unlink(missing_ok=True)
            raise
    if temp.stat().st_size > MAX_CACHE_BYTES:
        temp.unlink(missing_ok=True)
        raise SnapshotError("cache_exceeds_size_limit")
    temp.replace(path)
    return snapshot

def _public_url(value):
    if not isinstance(value, str):
        return ""
    value = value.strip()
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return ""
    if parsed.username or parsed.password or len(value) > 2048:
        return ""
    if parsed.hostname.lower() in ("localhost", "127.0.0.1", "0.0.0.0"):
        return ""
    return value

def discover_snapshot(spec, path=None, download=None):
    """Return only actual source-listed Karachi records, never inferred details."""
    if spec.get("city") != "Karachi":
        raise SnapshotError("snapshot_city_not_supported")
    path = Path(path or os.getenv("AEVONE_SNAPSHOT_CACHE_PATH", DEFAULT_CACHE))
    data = _read_cache(path)
    if data is None:
        data = build_cache(path, download=download)
    found = []
    seen = set()
    for obj in data["records"]:
        if not isinstance(obj, dict) or obj.get("category") != spec["category"]:
            continue
        kind, object_id = obj.get("kind"), obj.get("id")
        if kind not in ("node", "way") or type(object_id) is not int or object_id <= 0:
            continue
        tags = obj.get("tags")
        if not isinstance(tags, dict):
            continue
        name = str(tags.get("name") or "").strip()[:250]
        if not name:
            continue
        website = _public_url(tags.get("website") or tags.get("contact:website"))
        key = (name.casefold(), website.lower())
        if key in seen:
            continue
        seen.add(key)
        source_url = "https://www.openstreetmap.org/" + kind + "/" + str(object_id)
        found.append({
            "name": name, "city": "Karachi", "country": "Pakistan",
            "website": website,
            "phone": str(tags.get("contact:phone") or tags.get("phone") or "")[:80],
            "email": str(tags.get("contact:email") or tags.get("email") or "")[:180],
            "lat": obj.get("lat"), "lon": obj.get("lon"),
            "source_name": "OpenStreetMap (Geofabrik extract)",
            "source_url": source_url,
            "confidence": "Source-listed, not independently verified",
            "evidence": [{"field": "company", "source_url": source_url,
                          "provider": "OpenStreetMap / Geofabrik",
                          "observed_at": data["retrieved_at"], "verified": False}]
        })
        if len(found) >= min(50, max(1, int(spec["limit"]))):
            break
    return found

def cached_snapshot(spec, path=None):
    """Read a fresh local snapshot without ever downloading data."""
    if spec.get("city") != "Karachi":
        return []
    path = Path(path or os.getenv("AEVONE_SNAPSHOT_CACHE_PATH", DEFAULT_CACHE))
    if _read_cache(path) is None:
        return []
    def no_download(_):
        raise SnapshotError("cache_unavailable")
    return discover_snapshot(spec, path=path, download=no_download)
