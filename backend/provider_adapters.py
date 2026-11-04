"""AEVONE Phase 1 provider adapters. Only safe, bounded credential checks by default.

No automatic lead scraping, email enrichment, credits, or paid Actor runs.
Invoke via server/CI only; never ship secrets to a browser.
"""
import argparse
import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request

MAX_RESPONSE = 128_000
TIMEOUT = 12

class ProviderError(Exception):
    """Sanitized provider error, safe to print without secret data."""

def request_json(url, method="GET", headers=None, data=None, opener=None):
    """HTTPS-only transport with fixed hosts at call sites, no redirects to untrusted hosts."""
    if not url.startswith("https://"):
        raise ProviderError("insecure_endpoint")
    opener = opener or urllib.request.urlopen
    req = urllib.request.Request(url, method=method, headers=headers or {}, data=data)
    try:
        with opener(req, timeout=TIMEOUT) as response:
            raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise ProviderError("response_too_large")
            obj = json.loads(raw)
            if not isinstance(obj, dict):
                raise ProviderError("invalid_response")
            return obj
    except urllib.error.HTTPError as exc:
        code = exc.code
        if code in (401, 403):
            raise ProviderError("unauthorized_or_entitlement_missing") from None
        if code == 429:
            raise ProviderError("rate_limited") from None
        raise ProviderError("http_" + str(code)) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ProviderError("network_unavailable") from None
    except (ValueError, UnicodeDecodeError):
        raise ProviderError("invalid_json") from None

def _configured(*names):
    return all(bool(os.getenv(name, "").strip()) for name in names)

def apollo_check(opener=None):
    if not _configured("APOLLO_API_KEY"):
        return {"provider": "apollo", "status": "not_configured"}
    payload = request_json(
        "https://api.apollo.io/api/v1/auth/health",
        headers={"x-api-key": os.environ["APOLLO_API_KEY"], "Accept": "application/json"},
        opener=opener,
    )
    return {"provider": "apollo", "status": "authenticated", "response_received": bool(payload)}

def apify_check(opener=None):
    if not _configured("APIFY_TOKEN"):
        return {"provider": "apify", "status": "not_configured"}
    payload = request_json(
        "https://api.apify.com/v2/users/me",
        headers={"Authorization": "Bearer " + os.environ["APIFY_TOKEN"], "Accept": "application/json"},
        opener=opener,
    )
    if not isinstance(payload.get("data"), dict):
        raise ProviderError("invalid_response")
    return {"provider": "apify", "status": "authenticated"}

def zoominfo_check(opener=None):
    if not _configured("ZOOMINFO_CLIENT_ID", "ZOOMINFO_CLIENT_SECRET"):
        return {"provider": "zoominfo", "status": "not_configured",
                "requirement": "OAuth client credentials and licensed API access"}
    credentials = (os.environ["ZOOMINFO_CLIENT_ID"] + ":" +
                   os.environ["ZOOMINFO_CLIENT_SECRET"]).encode("utf-8")
    token_response = request_json(
        "https://api.zoominfo.com/gtm/oauth/v1/token", method="POST",
        headers={"Authorization": "Basic " + base64.b64encode(credentials).decode("ascii"),
                 "Content-Type": "application/x-www-form-urlencoded",
                 "Accept": "application/json"},
        data=b"grant_type=client_credentials", opener=opener,
    )
    if not token_response.get("access_token"):
        raise ProviderError("missing_access_token")
    # Never return or log tokens, user identity, or credentials.
    return {"provider": "zoominfo", "status": "authenticated",
            "scope_present": bool(token_response.get("scope"))}

CHECKS = {"apollo": apollo_check, "apify": apify_check, "zoominfo": zoominfo_check}

def run(selected=None, live=False, opener=None):
    selected = selected or list(CHECKS)
    result = []
    for provider in selected:
        if provider not in CHECKS:
            raise ValueError("Unknown provider")
        if not live:
            result.append({"provider": provider, "status": "live_test_disabled",
                           "configured": {"apollo": _configured("APOLLO_API_KEY"),
                                          "apify": _configured("APIFY_TOKEN"),
                                          "zoominfo": _configured("ZOOMINFO_CLIENT_ID",
                                                                 "ZOOMINFO_CLIENT_SECRET")}[provider]})
            continue
        try:
            result.append(CHECKS[provider](opener=opener))
        except ProviderError as exc:
            result.append({"provider": provider, "status": "failed", "reason": str(exc)})
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Safe provider authentication checks")
    parser.add_argument("--live", action="store_true", help="Explicitly allow one auth request per provider")
    parser.add_argument("--provider", choices=sorted(CHECKS), action="append")
    args = parser.parse_args()
    result = run(args.provider, live=args.live)
    print(json.dumps(result, indent=2))
    # A missing/unauthorized provider must never be reported as operational.
    raise SystemExit(1 if any(x["status"] == "failed" for x in result) else 0)
