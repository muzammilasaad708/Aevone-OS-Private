"""Offline contract tests. No real API keys, spending, or network requests."""
import io
import os
import sys
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, "backend")
import provider_adapters as p

class FakeResponse:
    def __init__(self, value):
        self.value = value
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def read(self, limit): return self.value

class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
    def tearDown(self): self.env.stop()

    def test_safe_default_does_not_call_network(self):
        def blocked(*args, **kwargs): raise AssertionError("network used")
        x = p.run(opener=blocked)
        self.assertEqual(len(x), 3)
        self.assertTrue(all(a["status"] == "live_test_disabled" for a in x))

    def test_unconfigured_never_calls_network(self):
        x = p.run(live=True, opener=lambda *a, **kw: self.fail("network used"))
        self.assertTrue(all(a["status"] == "not_configured" for a in x))

    def test_apollo_header_and_fixed_path(self):
        os.environ["APOLLO_API_KEY"] = "mock-apollo-secret"
        def mock(req, timeout):
            self.assertEqual(req.full_url, "https://api.apollo.io/api/v1/auth/health")
            self.assertEqual(req.get_header("X-api-key"), "mock-apollo-secret")
            self.assertEqual(timeout, p.TIMEOUT)
            return FakeResponse(b'{"is_logged_in":true}')
        x = p.apollo_check(opener=mock)
        self.assertEqual(x["status"], "authenticated")
        self.assertNotIn("mock", str(x))

    def test_apify_bearer_and_shape(self):
        os.environ["APIFY_TOKEN"] = "mock-apify-secret"
        def mock(req, timeout):
            self.assertEqual(req.full_url, "https://api.apify.com/v2/users/me")
            self.assertEqual(req.get_header("Authorization"), "Bearer mock-apify-secret")
            return FakeResponse(b'{"data":{"id":"x"}}')
        self.assertEqual(p.apify_check(opener=mock)["status"], "authenticated")

    def test_zoominfo_oauth_no_token_logging(self):
        os.environ.update(ZOOMINFO_CLIENT_ID="mock_id", ZOOMINFO_CLIENT_SECRET="mock_secret")
        def mock(req, timeout):
            self.assertEqual(req.full_url, "https://api.zoominfo.com/gtm/oauth/v1/token")
            self.assertEqual(req.get_method(), "POST")
            self.assertEqual(req.data, b"grant_type=client_credentials")
            self.assertTrue(req.get_header("Authorization").startswith("Basic "))
            return FakeResponse(b'{"access_token":"private-token","scope":"api:data:company"}')
        result=p.zoominfo_check(opener=mock)
        self.assertEqual(result["status"], "authenticated")
        self.assertNotIn("private-token", str(result))
        self.assertNotIn("mock_secret", str(result))

    def test_zoominfo_missing_token_fails(self):
        os.environ.update(ZOOMINFO_CLIENT_ID="a", ZOOMINFO_CLIENT_SECRET="b")
        x=p.run(["zoominfo"], live=True, opener=lambda *a, **k: FakeResponse(b'{"error":"bad"}'))
        self.assertEqual(x[0]["reason"], "missing_access_token")

    def test_errors_are_sanitized(self):
        os.environ["APIFY_TOKEN"]="do-not-leak"
        def bad(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 403, "do-not-leak", {}, io.BytesIO(b"do-not-leak"))
        result=p.run(["apify"], live=True, opener=bad)
        self.assertEqual(result[0]["reason"], "unauthorized_or_entitlement_missing")
        self.assertNotIn("do-not-leak", str(result))

    def test_invalid_json(self):
        os.environ["APIFY_TOKEN"]="secret"
        result=p.run(["apify"], live=True, opener=lambda *a, **k: FakeResponse(b'<html>oops</html>'))
        self.assertEqual(result[0]["reason"], "invalid_json")

    def test_response_too_large(self):
        os.environ["APIFY_TOKEN"]="secret"
        result=p.run(["apify"], live=True, opener=lambda *a, **k: FakeResponse(b"x"*(p.MAX_RESPONSE+1)))
        self.assertEqual(result[0]["reason"], "response_too_large")

    def test_invalid_url(self):
        with self.assertRaises(p.ProviderError):
            p.request_json("http://example.com")

    def test_rate_limit(self):
        os.environ["APOLLO_API_KEY"]="secret"
        def limited(req, timeout):
            raise urllib.error.HTTPError(req.full_url,429,"",{},None)
        x=p.run(["apollo"],live=True,opener=limited)
        self.assertEqual(x[0]["reason"],"rate_limited")

if __name__ == "__main__": unittest.main()
