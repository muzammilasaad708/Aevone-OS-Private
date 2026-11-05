"""AEVONE research worker v3.2. Standard-library-only, no fabricated contacts.

Supported live discovery: OpenStreetMap Overpass. Other repos in the UI are
catalogue entries, not integrations. Never run unreviewed third-party code.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from planner import plan
from phase2 import discover, ProviderError

BASE = os.environ.get('SUPABASE_URL','').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
# Public Overpass instances can be temporarily overloaded or return 429/504.
# Keep a short fallback list; never retry indefinitely.
ENDPOINTS = [
 'https://overpass-api.de/api/interpreter',
 'https://overpass.kumi.systems/api/interpreter',
 'https://overpass.nchc.org.tw/api/interpreter',
]
MAX_JOBS = max(1,min(5,int(os.environ.get('AEVONE_MAX_JOBS','3'))))
FAILED_JOBS = []

def timestamp():
 return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')

def api(path,method='GET',body=None,timeout=25):
 if not BASE.startswith('https://') or not KEY: raise RuntimeError('Missing private worker configuration')
 data=None if body is None else json.dumps(body).encode('utf-8')
 req=urllib.request.Request(BASE+'/rest/v1/'+path,data=data,method=method,
  headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json',
           'Prefer':'return=representation'})
 with urllib.request.urlopen(req,timeout=timeout) as resp:
  return json.loads(resp.read() or b'[]')

# Approximate Karachi search envelope, used only for discovery. Results remain
# unverified OSM listings and should not be presented as verified city matches.
KARACHI_BBOX = (24.75, 66.80, 25.30, 67.45)

def overpass_query(spec):
 category = spec['category']
 city = spec['city']
 limit = spec['limit']
 tag = ('shop' if category in ('bakery','clothes','supermarket','hairdresser','shop')
        else 'leisure' if category == 'fitness_centre'
        else 'tourism' if category == 'hotel' else 'amenity')
 # Overpass area resolution and unrestricted nwr searches are expensive.
 # The Karachi bounding-box query avoids that area lookup entirely.
 if city == 'Karachi':
  bbox = ','.join(map(str, KARACHI_BBOX))
  return (f'[out:json][timeout:12];'
          f'nwr["{tag}"="{category}"]["name"]({bbox});'
          f'out center {min(100,limit*3)};')
 area = ('area["ISO3166-1"="PK"][admin_level=2]' if city == 'Pakistan'
         else 'area["name"="' + city + '"]["boundary"="administrative"]')
 return (f'[out:json][timeout:15];{area}->.a;'
         f'nwr["{tag}"="{category}"]["name"](area.a);'
         f'out center {min(100,limit*3)};')

def fetch_osm(spec,opener=None):
 """Query public OSM servers, with bounded fallback and safe diagnostics.

 Never claim that an OSM listing is independently verified.
 """
 opener = opener or urllib.request.urlopen
 payload = urllib.parse.urlencode({'data':overpass_query(spec)}).encode('ascii')
 failures = []
 for index, endpoint in enumerate(ENDPOINTS, start=1):
  try:
   req = urllib.request.Request(endpoint, data=payload, headers={
    'User-Agent': 'AEVONE-Research/3.4 (personal low-volume research)',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json'})
   with opener(req, timeout=18) as resp:
    raw = resp.read(3_000_001)
   if len(raw) > 3_000_000:
    raise ValueError('ResponseTooLarge')
   data = json.loads(raw)
   if not isinstance(data, dict) or not isinstance(data.get('elements'), list):
    raise ValueError('InvalidOverpassResponse')
   rows = normalize(data['elements'], spec)
   if rows:
    return rows
   failures.append(f'instance{index}:NoListings')
   continue
  except urllib.error.HTTPError as ex:
   failures.append(f'instance{index}:HTTP{ex.code}')
  except (urllib.error.URLError, TimeoutError, OSError) as ex:
   failures.append(f'instance{index}:{type(ex).__name__}')
  except (ValueError, KeyError, TypeError) as ex:
   failures.append(f'instance{index}:{type(ex).__name__}')
 # No exception messages, URLs, credentials or response bodies in logs.
 raise RuntimeError('Overpass attempts failed: ' + ', '.join(failures))


def normalize(elements,spec):
 result=[]; seen=set()
 for e in elements:
  tags=e.get('tags') or {}; name=str(tags.get('name') or '').strip()
  if not name: continue
  web=str(tags.get('website') or tags.get('contact:website') or '').strip()
  if not web.startswith(('https://','http://')):web=''
  parsed=urllib.parse.urlsplit(web)
  if parsed.username or parsed.password: web=''
  domain=parsed.netloc.lower().removeprefix('www.') if web else ''
  k=(name.casefold(),domain)
  if k in seen:continue
  seen.add(k)
  kind=e.get('type'); eid=e.get('id')
  if kind not in ('node','way','relation') or not isinstance(eid,int):continue
  source=f'https://www.openstreetmap.org/{kind}/{eid}'
  result.append({'name':name[:250], 'city':spec['city'],'country':'Pakistan',
     'website':web[:2048], 'phone':str(tags.get('contact:phone') or tags.get('phone') or '')[:80],
     'email':str(tags.get('contact:email') or tags.get('email') or '')[:180],
     'source_name':'OpenStreetMap','source_url':source,
     'confidence':'Source-listed, not independently verified',
     'lat':e.get('lat',(e.get('center') or {}).get('lat')),
     'lon':e.get('lon',(e.get('center') or {}).get('lon'))})
  if len(result)>=spec['limit']:break
 return result

def claim(jobid):
 # Atomic conditional update: only one worker can take a queued row.
 q='aevone_research_jobs?id=eq.'+urllib.parse.quote(str(jobid))+'&status=eq.queued'
 rows=api(q,'PATCH',{'status':'running','started_at':timestamp(),'error':None})
 return len(rows)==1

def finish(jobid,fields):
 q='aevone_research_jobs?id=eq.'+urllib.parse.quote(str(jobid))+'&status=eq.running'
 return api(q,'PATCH',{**fields,'finished_at':timestamp()})

def process(job):
 if not claim(job['id']):return False
 try:
  spec=plan(job['query'])
  rows, notes = discover(spec, fetch_osm)
  finish(job['id'],{'status':'complete','results':rows,'result_count':len(rows),'error':None})
  if notes: print('Optional source diagnostics:', ','.join(notes))
  print('Completed job',str(job['id'])[:8], 'results',len(rows))
 except ValueError:
  finish(job['id'],{'status':'failed','error':'Please specify a supported industry and city.'})
  print('Invalid query',str(job['id'])[:8])
 except Exception as err:
  # Do not print API URLs, request bodies or credentials.
  finish(job['id'],{'status':'failed','error':'Discovery provider temporarily unavailable. Retry this research.'})
  FAILED_JOBS.append(str(job['id'])[:8])
  safe_code = str(err) if isinstance(err, ProviderError) else type(err).__name__
  print('Provider failure',str(job['id'])[:8], safe_code)
 return True

def run():
 if not BASE.startswith('https://') or len(KEY)<25:
  raise RuntimeError('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as GitHub Actions secrets')
 jobs=api('aevone_research_jobs?select=id,query,status&status=eq.queued&order=created_at.asc&limit='+str(MAX_JOBS))
 FAILED_JOBS.clear()
 processed=sum(bool(process(job)) for job in jobs)
 print(f'Queued={len(jobs)} Processed={processed} Failed={len(FAILED_JOBS)}')
 if FAILED_JOBS:
  raise RuntimeError(f'{len(FAILED_JOBS)} research job(s) failed; see sanitized provider diagnostics above')
 return processed

if __name__=='__main__':sys.exit(0 if run()>=0 else 1)
