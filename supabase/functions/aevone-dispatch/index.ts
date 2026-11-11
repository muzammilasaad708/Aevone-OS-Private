// Legacy client compatibility. Route old AEVONE OS aevone-dispatch calls
// to the new Supabase instant worker, never to the broken private GitHub PAT.
const D=Deno;
const PROJECT=D.env.get("SUPABASE_URL")??"";
const ORIGINS=new Set(["http://localhost:4173","http://127.0.0.1:4173","http://localhost:5173","http://127.0.0.1:5173",
 ...(D.env.get("AEVONE_ALLOWED_ORIGINS")??"").split(",").map(s=>s.trim()).filter(Boolean)]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cors(req:Request){
 const origin=req.headers.get("origin")??"";
 return origin&&ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"}:{};
}
function reply(req:Request,status:number,value:unknown){return new Response(JSON.stringify(value),
 {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...cors(req)}});}
D.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")??"";
 if(origin&&!ORIGINS.has(origin))return reply(req,403,{dispatched:false,reason:"origin_forbidden"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=="POST")return reply(req,405,{dispatched:false,reason:"method_not_allowed"});
 const auth=req.headers.get("authorization")??"",apiKey=req.headers.get("apikey")??"";
 if(!/^Bearer \S+$/i.test(auth)||!apiKey)return reply(req,401,{dispatched:false,reason:"login_required"});
 const body=await req.json().catch(()=>null),id=String(body?.job_id??"");
 if(!UUID.test(id))return reply(req,400,{dispatched:false,reason:"invalid_job_id"});
 if(!PROJECT.startsWith("https://"))return reply(req,503,{dispatched:false,reason:"project_unconfigured"});
 try{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
  try{
   const r=await fetch(PROJECT+"/functions/v1/aevone-research-now",{
    method:"POST",signal:ctrl.signal,
    headers:{Authorization:auth,apikey:apiKey,"Content-Type":"application/json",...(origin?{origin}:{})},
    body:JSON.stringify({job_id:id})
   });
   const data=await r.json().catch(()=>null);
   if(r.status===202&&data?.accepted===true)return reply(req,200,{dispatched:true,reason:"supabase_edge_instant"});
   return reply(req,200,{dispatched:false,reason:String(data?.reason||"instant_worker_http_"+r.status)});
  }finally{clearTimeout(timer);}
 }catch{return reply(req,200,{dispatched:false,reason:"instant_worker_unreachable"});}
});
