// AEVONE instant research: user-authorized, bounded OSM requests, no GitHub PAT.
// This is independent of the 30-minute GitHub scheduled fallback.
import {parseJob,overpassQL,normalizeListings} from "./core.mjs";

const PROJECT=Deno.env.get("SUPABASE_URL")??"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const allowed=new Set(["http://localhost:4173","http://127.0.0.1:4173",
 "http://localhost:5173","http://127.0.0.1:5173",
 ...(Deno.env.get("AEVONE_ALLOWED_ORIGINS")??"").split(",").map(x=>x.trim()).filter(Boolean)]);
const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.nchc.org.tw/api/interpreter"];
const uidPattern=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
function cors(req:Request){
 const origin=req.headers.get("origin")??"";
 return origin&&allowed.has(origin)?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"}:{};
}
function reply(req:Request,status:number,data:unknown){return new Response(JSON.stringify(data),
 {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...cors(req)}});}
async function db(path:string,method="GET",body?:unknown){
 const r=await fetch(PROJECT+"/rest/v1/"+path,{method,headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json","Prefer":"return=representation"},
  body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw Error("db_"+r.status);
 return r.json();
}
async function who(req:Request){
 const bearer=/^Bearer (\S+)$/i.exec(req.headers.get("authorization")??"");
 if(!bearer)return null;
 const r=await fetch(PROJECT+"/auth/v1/user",{headers:{apikey:SERVICE,Authorization:"Bearer "+bearer[1]}});
 if(!r.ok)return null;
 const user=await r.json().catch(()=>null);
 if(!user?.id)return null;
 const members=await db("aevone_workspace_members?select=status&user_id=eq."+encodeURIComponent(user.id)+"&limit=1");
 return members?.[0]?.status==="active"?user.id:null;
}
async function patch(id:string,fields:unknown){
 await db("aevone_research_jobs?id=eq."+encodeURIComponent(id)+"&status=eq.running","PATCH",fields);
}
async function fromSource(spec:ReturnType<typeof parseJob>){
 const payload=new URLSearchParams({data:overpassQL(spec)}).toString();
 let anyValid=false;
 for(const endpoint of endpoints){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),17000);
  try{
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:payload,signal:ctrl.signal});
   if(!r.ok)continue;
   const len=Number(r.headers.get("content-length")??0);
   if(len>3500000)continue;
   const text=await r.text();
   if(text.length>3500000)continue;
   const obj=JSON.parse(text);
   if(!Array.isArray(obj?.elements))continue;
   anyValid=true;
   const records=normalizeListings(obj.elements,spec);
   if(records.length)return records;
  }catch{/* next bounded public server */}finally{clearTimeout(timer);}
 }
 if(anyValid)return [];
 throw Error("osm_public_providers_unavailable");
}
async function process(job:{id:string;query:string;user_id:string},location:unknown){
 try{
  const spec=parseJob(job.query,location&&typeof location==="object"?location:{});
  // Exact-query cache is user-scoped; stale directory evidence is never verified.
  const since=new Date(Date.now()-7*86400000).toISOString();
  let rows:unknown[]=[];
  try{
   rows=await db("aevone_research_jobs?select=results,result_count&status=eq.complete&user_id=eq."+
    encodeURIComponent(job.user_id)+"&query=eq."+encodeURIComponent(job.query)+
    "&created_at=gte."+encodeURIComponent(since)+"&order=created_at.desc&limit=1");
  }catch{/* Cache is optional; never bypass fresh discovery on cache failure. */}
  const cached=Array.isArray(rows)&&rows[0]&&Array.isArray((rows[0] as {results?:unknown[]}).results);
  const listings=cached?(rows[0] as {results:unknown[]}).results.slice(0,spec.limit):await fromSource(spec);
  await patch(job.id,{status:"complete",results:listings,result_count:listings.length,error:null,finished_at:new Date().toISOString()});
 }catch(error){
  const code=error instanceof Error?error.message:"internal_error";
  const message=code==="osm_public_providers_unavailable"?
   "Public OpenStreetMap discovery providers are unavailable or rate-limited; no business records were invented.":
   code.startsWith("db_")?"Research storage unavailable; refresh status before retrying.":
   code==="unsupported_business_category"?"This industry is not yet supported by the free OSM discovery connector.":
   "Unsupported research query. Specify a supported industry, city and country.";
  await patch(job.id,{status:"failed",error:message,finished_at:new Date().toISOString()}).catch(()=>{});
 }
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(origin&&!allowed.has(origin))return reply(req,403,{accepted:false,reason:"origin_forbidden"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=="POST")return reply(req,405,{accepted:false,reason:"method_not_allowed"});
 if(!PROJECT.startsWith("https://")||SERVICE.length<20)return reply(req,503,{accepted:false,reason:"backend_not_configured"});
 try{
  const userId=await who(req);if(!userId)return reply(req,403,{accepted:false,reason:"not_authorized"});
  const body=await req.json().catch(()=>null);
  const id=String(body?.job_id??"");
  if(!uidPattern.test(id))return reply(req,400,{accepted:false,reason:"invalid_job_id"});
  const jobs=await db("aevone_research_jobs?select=id,query,status,user_id&user_id=eq."+encodeURIComponent(userId)+"&id=eq."+encodeURIComponent(id)+"&limit=1");
  const job=jobs?.[0];
  if(!job)return reply(req,404,{accepted:false,reason:"job_not_found"});
  if(job.status!=="queued")return reply(req,409,{accepted:false,reason:"job_already_"+job.status});
  // Validate before claiming. Bad input must fail fast, not sit queued for hours.
  try{parseJob(job.query,body?.location);}catch{return reply(req,422,{accepted:false,reason:"unsupported_city_or_business_query"});}
  const claimed=await db("aevone_research_jobs?select=id&id=eq."+encodeURIComponent(id)+
   "&user_id=eq."+encodeURIComponent(userId)+"&status=eq.queued","PATCH",
   {status:"running",started_at:new Date().toISOString(),error:null});
  if(!Array.isArray(claimed)||claimed.length!==1)return reply(req,409,{accepted:false,reason:"already_claimed"});
  // EdgeRuntime.waitUntil runs after response. The server, not the browser,
  // owns the credentials and keeps processing even if the tab closes.
  EdgeRuntime.waitUntil(process({id,query:job.query,user_id:userId},body?.location));
  return reply(req,202,{accepted:true,method:"supabase_edge_background"});
 }catch{return reply(req,503,{accepted:false,reason:"instant_research_unavailable"});}
});
