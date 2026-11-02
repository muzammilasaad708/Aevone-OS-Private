"""AEVONE scheduled worker. Python stdlib, no fabricated lead records. Supply GitHub Secrets."""
import os,json,urllib.request,urllib.parse,urllib.error,time,sys
from planner import plan
BASE=os.environ.get('SUPABASE_URL','').rstrip('/')
KEY=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
OVERPASS='https://overpass.kumi.systems/api/interpreter'
MAX_JOBS=3

def call(path,method='GET',body=None):
    data=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(BASE+'/rest/v1/'+path,data=data,method=method,headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=representation'})
    with urllib.request.urlopen(req,timeout=25) as resp: return json.loads(resp.read() or b'[]')

def osm_query(spec):
    # OSM names/tags may be sparse. This is NOT a Google Maps scraper.
    tag='shop' if spec['category'] in ('bakery','clothes','supermarket','shop') else 'amenity'
    value=spec['category']
    if value=='clothes': value='clothes'
    if value=='hairdresser': tag='shop'
    if value=='fitness_centre':tag='leisure'
    place=spec['city'].replace('"','')
    area='area["ISO3166-1"="PK"][admin_level=2]' if place=='Pakistan' else 'area["name"="'+place+'"]["boundary"="administrative"]'
    query='[out:json][timeout:22];'+area+'->.a;(nwr["'+tag+'"="'+value+'"]["name"](area.a););out center '+str(min(150,spec['limit']*4))+';'
    req=urllib.request.Request(OVERPASS,data=urllib.parse.urlencode({'data':query}).encode(),headers={'User-Agent':'AEVONE-Research/1.0 (personal CRM; low-volume)'})
    with urllib.request.urlopen(req,timeout=40) as res: content=json.loads(res.read(2500000))
    return normalize(content.get('elements',[]),spec)

def normalize(elements,spec):
    seen=set();items=[]
    for e in elements:
        tags=e.get('tags',{});name=str(tags.get('name','')).strip()
        if not name:continue
        web=tags.get('website') or tags.get('contact:website') or ''
        if web and not str(web).startswith(('https://','http://')):web=''
        domain=urllib.parse.urlsplit(web).netloc.lower().removeprefix('www.') if web else ''
        dedupe=(name.lower().strip(),domain)
        if dedupe in seen:continue
        seen.add(dedupe)
        url='https://www.openstreetmap.org/'+e.get('type','node')+'/'+str(e.get('id',''))
        items.append({'name':name[:250],'city':spec['city'],'country':'Pakistan','website':web[:2048],
        'phone':str(tags.get('contact:phone') or tags.get('phone') or '')[:80],
        'email':str(tags.get('contact:email') or tags.get('email') or '')[:180],
        'source_name':'OpenStreetMap','source_url':url,'confidence':'Source-listed, not independently verified',
        'lat':e.get('lat',e.get('center',{}).get('lat')),'lon':e.get('lon',e.get('center',{}).get('lon'))})
        if len(items)>=spec['limit']:break
    return items

def do_job(job):
    jobid=job['id']
    # Only service-role worker may change statuses; worker never accepts arbitrary URLs from prompts.
    try:
        spec=plan(job['query'])
        call('aevone_research_jobs?id=eq.'+urllib.parse.quote(jobid),'PATCH',{'status':'running','started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'error':None})
        data=osm_query(spec)
        call('aevone_research_jobs?id=eq.'+urllib.parse.quote(jobid),'PATCH',{'status':'complete','results':data,'result_count':len(data),'finished_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
        return len(data)
    except Exception as exc:
        # Do not log provider secrets or full exception body.
        print('Job failed:',jobid,type(exc).__name__)
        call('aevone_research_jobs?id=eq.'+urllib.parse.quote(jobid),'PATCH',{'status':'failed','error':'Discovery source temporarily unavailable; retry later','finished_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
        return 0

def run():
    if not BASE.startswith('https://') or len(KEY)<25: raise RuntimeError('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in GitHub Actions Secrets')
    jobs=call('aevone_research_jobs?select=id,query,status&status=eq.queued&order=created_at.asc&limit='+str(MAX_JOBS))
    for job in jobs: do_job(job)
    print('Processed',len(jobs),'jobs')
if __name__=='__main__':run()
