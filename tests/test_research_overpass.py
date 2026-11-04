import json
import pathlib
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'backend'))
import worker

SPEC = {'category': 'bakery', 'city': 'Karachi', 'limit': 10}

class Response:
 def __init__(self, payload):
  self.payload = payload
 def __enter__(self):
  return self
 def __exit__(self, *args):
  return False
 def read(self, size):
  return self.payload

class OverpassFallbackTests(unittest.TestCase):
 def test_fallback_after_http_429(self):
  calls = []
  def opener(req, timeout):
   calls.append(req.full_url)
   if len(calls) == 1:
    raise HTTPError(req.full_url, 429, 'Too Many Requests', {}, None)
   return Response(json.dumps({'elements': [
    {'id': 42, 'type': 'node', 'tags': {'name': 'Verified source listing'}}
   ]}).encode())
  with patch.object(worker, 'ENDPOINTS', ['https://one.example/api', 'https://two.example/api']):
   rows = worker.fetch_osm(SPEC, opener=opener)
  self.assertEqual(len(calls), 2)
  self.assertEqual(len(rows), 1)
  self.assertIn('openstreetmap.org/node/42', rows[0]['source_url'])

 def test_all_failures_are_sanitized(self):
  def opener(req, timeout):
   raise HTTPError(req.full_url, 503, 'SECRET SHOULD NOT APPEAR', {}, None)
  with patch.object(worker, 'ENDPOINTS', ['https://one.example/api']):
   with self.assertRaises(RuntimeError) as raised:
    worker.fetch_osm(SPEC, opener=opener)
  self.assertIn('instance1:HTTP503', str(raised.exception))
  self.assertNotIn('SECRET', str(raised.exception))

 def test_invalid_payload_falls_back(self):
  calls = []
  def opener(req, timeout):
   calls.append(req.full_url)
   if len(calls) == 1:
    return Response(b'not-json')
   return Response(b'{"elements":[]}')
  with patch.object(worker, 'ENDPOINTS', ['https://one.example/api','https://two.example/api']):
   with self.assertRaisesRegex(RuntimeError, 'instance1:JSONDecodeError, instance2:NoListings'):
    worker.fetch_osm(SPEC, opener=opener)
  self.assertEqual(len(calls), 2)

if __name__ == '__main__':
 unittest.main()
