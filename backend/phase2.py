"""Phase 2 source-backed discovery and optional Apollo organization enrichment.

No provider calls occur without explicit opt-ins. Apify task runs and Apollo
organization enrichment can incur charges: both default OFF. Secrets stay in CI.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from provider_adapters import ProviderError

MAX_BYTES = 2_000_000
TIMEOUT = 22
ID_PATTERN = re.compile(r"^[a-zA-Z0-9_~-]{3,100}$")
DOMAIN_PATTERN = re.compile(r"^(?:[a-z0-9-]+\.)+[a-z]{2,}$")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def _json(url, headers, method="GET", body=None, opener=None):
    if not url.startswith(("https://api.apify.com/v2/", "https://api.apollo.io/api/v1/")):
        raise ProviderError("endpoint_not_allowed")
    opener = opener or urllib.request.build_opener(NoRedirect()).open
    request = urllib.request.Request(url, method=method, headers=headers,
        data=json.dumps(body).encode("utf-8") if body is not None else None)
    try:
        with opener(request, timeout=TIMEOUT) as response:
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES: raise ProviderError("response_too_large")
        return json.loads(raw)
    except urllib.error.HTTPError as exc:
        if exc.code in (401,403): raise ProviderError("unauthorized_or_entitlement_missing") from None
        if exc.code == 429: raise ProviderError("rate_limited") from None
        raise ProviderError("http_"+str(exc.code)) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ProviderError("network_unavailable") from None
    except (ValueError,UnicodeError):
        raise ProviderError("invalid_json") from None

def _url(value):
    if not isinstance(value,str): return ""
    value=value.strip()
    p=urllib.parse.urlsplit(value)
    if p.scheme not in ("https","http") or not p.hostname or p.username or p.password:
        return ""
    if p.hostname in ("localhost","127.0.0.1","0.0.0.0") or p.hostname.endswith(".local"):
        return ""
    return value[:2048]

def _domain(value):
    p=urllib.parse.urlsplit(value)
    host=(p.hostname or "").lower().removeprefix("www.")
    return host if DOMAIN_PATTERN.fullmatch(host) else ""

def _record(raw, provider, spec, source_url):
    if not isinstance(raw,dict): return None
    name=next((v.strip() for v in (raw.get("title"),raw.get("name"),
        raw.get("companyName"),raw.get("businessName")) if isinstance(v,str) and v.strip()),"")
    if not name: return None
    web=_url(next((v for v in (raw.get("website"),raw.get("websiteUrl"))
            if isinstance(v,str) and v), ""))
    src=_url(raw.get("sourceUrl") or raw.get("placeUrl") or raw.get("source_url") or "") or source_url
    if not src: return None
    phone=str(raw.get("phone") or raw.get("phoneNumber") or "")[:80]
    email=str(raw.get("email") or "")[:180]
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+",email): email=""
    return {"name":name[:250],"city":str(raw.get("city") or "")[:120],
       "country":str(raw.get("country") or "")[:120],"website":web,"phone":phone,"email":email,
       "source_name":provider,"source_url":src,
       "confidence":"Source-listed, not independently verified",
       "evidence":[{"field":"company","source_url":src,"provider":provider,
          "verified":False,"observed_at":datetime.now(timezone.utc).isoformat()}]}

def merge_records(*groups,limit=50):
    result=[];seen=set()
    for group in groups:
        for record in group:
            if not isinstance(record,dict) or not record.get("source_url"): continue
            domain=_domain(record.get("website") or "")
            key=("domain",domain) if domain else ("name",record.get("name","").casefold().strip(),
                record.get("city","").casefold().strip())
            if key in seen: continue
            seen.add(key);result.append(record)
            if len(result)>=limit:return result
    return result

def _dataset_id():
    identifier=os.getenv("APIFY_DATASET_ID","").strip()
    if not ID_PATTERN.fullmatch(identifier): raise ProviderError("apify_dataset_not_configured")
    return identifier

def apify_dataset(spec, opener=None):
    """Read an existing, preapproved dataset. Reading does not start an Actor."""
    token=os.getenv("APIFY_TOKEN","").strip()
    if not token: raise ProviderError("apify_not_configured")
    dataset=_dataset_id()
    count=min(50,max(1,int(spec["limit"])))
    url=("https://api.apify.com/v2/datasets/"+urllib.parse.quote(dataset,safe="")
         +"/items?format=json&clean=true&limit="+str(count))
    rows=_json(url,{"Authorization":"Bearer "+token,"Accept":"application/json"},
               opener=opener)
    if not isinstance(rows,list): raise ProviderError("invalid_apify_dataset")
    source="https://console.apify.com/storage/datasets/"+urllib.parse.quote(dataset,safe="")
    output=[_record(r,"Apify dataset",spec,source) for r in rows[:count]]
    # A reusable dataset may contain unrelated businesses. It is not a search endpoint.
    return [r for r in output if r]

def apify_task(spec,opener=None):
    """Run a manually reviewed task only after explicit billable opt-in."""
    if os.getenv("AEVONE_ALLOW_BILLABLE_APIFY")!="true":
        raise ProviderError("apify_paid_operations_disabled")
    token=os.getenv("APIFY_TOKEN","").strip()
    task=os.getenv("APIFY_TASK_ID","").strip()
    if not token or not ID_PATTERN.fullmatch(task): raise ProviderError("apify_task_not_configured")
    # Task must be preconfigured in Apify and reviewed for input schema and cost.
    # This sends a bounded search input compatible only with tasks configured for it.
    input_data={"searchStringsArray":[spec["category"]+" in "+spec["city"]+", "+spec.get("country","Pakistan")],
        "maxCrawledPlacesPerSearch":min(20,int(spec["limit"])),"language":"en"}
    url="https://api.apify.com/v2/actor-tasks/"+urllib.parse.quote(task,safe="")+"/runs"
    response=_json(url,{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        method="POST",body=input_data,opener=opener)
    run=response.get("data") if isinstance(response,dict) else None
    if not isinstance(run,dict) or not run.get("id"):
        raise ProviderError("apify_run_not_confirmed")
    # Async run. Its data is not available yet; never report success with invented leads.
    return {"run_id":str(run["id"])[:100], "dataset_id":str(run.get("defaultDatasetId") or ""),
            "status":"provider_processing"}

def apollo_enrich(records,opener=None):
    """Optional, credit-consuming organization enrichment, domain-locked and bounded."""
    if os.getenv("AEVONE_ALLOW_BILLABLE_APOLLO")!="true":
        return records
    key=os.getenv("APOLLO_API_KEY","").strip()
    if not key: raise ProviderError("apollo_not_configured")
    limit=min(3,len(records))
    for row in records[:limit]:
        domain=_domain(row.get("website",""))
        if not domain: continue
        url="https://api.apollo.io/api/v1/organizations/enrich?"+urllib.parse.urlencode({"domain":domain})
        response=_json(url,{"x-api-key":key,"Accept":"application/json"},opener=opener)
        org=response.get("organization") if isinstance(response,dict) else None
        if not isinstance(org,dict):continue
        observed=_domain(_url(org.get("website_url") or ""))
        if observed!=domain: continue
        # No personal names/emails from ambiguous organization matches.
        row["apollo_match"]={"name":str(org.get("name") or "")[:250],
            "website":_url(org.get("website_url") or ""),
            "linkedin_url":_url(org.get("linkedin_url") or ""),
            "confidence":"Provider-listed, requires independent verification"}
        row.setdefault("evidence",[]).append({"field":"company","provider":"Apollo",
            "source_url":"https://www.apollo.io/","verified":False})
    return records

def discover(spec,osm_fetch,opener=None,snapshot_fetch=None):
    """Free OSM/Geofabrik discovery; optional read-only Apify source."""
    notes=[];groups=[]
    # Use an already cached, source-attributed OSM snapshot before slower APIs.
    # Never cause a network download just to test this warm-cache path.
    if os.getenv("AEVONE_ENABLE_OSM_SNAPSHOT")=="true" and snapshot_fetch is None:
        try:
            from geofabrik import cached_snapshot
            cached=cached_snapshot(spec)
            if cached:
                groups.append(cached)
                rows=merge_records(*groups,limit=int(spec["limit"]))
                if len(rows)>=int(spec["limit"]):
                    try:rows=apollo_enrich(rows,opener=opener)
                    except ProviderError as err:notes.append("apollo_"+str(err))
                    return rows,["osm_cached_snapshot",*notes]
        except Exception:
            notes.append("osm_cache_unavailable")
    try:groups.append(osm_fetch(spec))
    except Exception as exc:
        # Keep diagnostics bounded and free of request URLs, payloads and secrets.
        # The worker emits this fixed prefix with endpoint index/status only.
        message = str(exc) if isinstance(exc, RuntimeError) else ""
        if message.startswith("Overpass attempts failed: "):
            details = message.removeprefix("Overpass attempts failed: ")
            if re.fullmatch(r"(?:instance[1-9][0-9]*:(?:HTTP[0-9]{3}|URLError|TimeoutError|OSError|ValueError|KeyError|TypeError|NoListings)(?:, )?)+", details):
                notes.append("osm_" + details.replace(", ", ";"))
            else:
                notes.append("osm_unavailable")
        else:
            notes.append("osm_unavailable")
    if os.getenv("AEVONE_ENABLE_APIFY_DATASET")=="true":
        try:groups.append(apify_dataset(spec,opener=opener))
        except ProviderError as err:notes.append("apify_"+str(err))
    # Independent, free OSM data download if public Overpass fails or returns
    # fewer than requested. The OSM extract is weekly-cached by GitHub Actions.
    # It does not run Apify Actors or spend Apollo enrichment credits.
    if os.getenv("AEVONE_ENABLE_OSM_SNAPSHOT")=="true" and not any(
            group for group in groups if group and group[0].get("source_name")=="OpenStreetMap (Geofabrik extract)") and len(merge_records(
            *groups,limit=int(spec["limit"]))) < int(spec["limit"]):
        from geofabrik import discover_snapshot, SnapshotError
        try:
            groups.append((snapshot_fetch or discover_snapshot)(spec))
        except SnapshotError as err:
            allowed={"snapshot_city_not_supported","osmium_dependency_missing",
                "extract_download_unavailable","extract_download_timeout",
                "extract_exceeds_size_limit","extract_empty","extract_missing",
                "osm_extract_invalid","extract_no_karachi_businesses",
                "cache_exceeds_size_limit"}
            notes.append("snapshot_"+(str(err) if str(err) in allowed else "unavailable"))
    rows=merge_records(*groups,limit=int(spec["limit"]))
    if rows:
        try:rows=apollo_enrich(rows,opener=opener)
        except ProviderError as err:notes.append("apollo_"+str(err))
    if not rows:
        # Only whitelisted diagnostic codes can reach logs. No raw exception text.
        raise ProviderError("no_source_backed_listings:" + ";".join(notes))
    return rows,notes
