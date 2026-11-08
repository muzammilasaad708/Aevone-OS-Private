// AEVONE: secure on-demand dispatch, no paid provider calls and no secrets in browser.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
const projectUrl=Deno.env.get("SUPABASE_URL")??"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const githubToken=Deno.env.get("GITHUB_DISPATCH_TOKEN")??"";
const allowedOrigins=new Set(["http://localhost:4173","http://127.0.0.1:4173",...(Deno.env.get("AEVONE_ALLOWED_ORIGINS")??"").split(",").map(x=>x.trim()).filter(Boolean)]);
const jobPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cors(req:Request){const origin=req.headers.get("origin")??"";return origin&&allowedOrigins.has(origin)?{"Access-Control-Allow-Origin":origin,"Vary":"Origin","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"}:{};}
function result(req:Request,status:number,data:unknown){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...cors(req)}});}
async function admin(path:string,method="GET",body?:unknown){
 const response=await fetch(projectUrl+"/rest/v1/"+path,{method,headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json","Prefer":"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok)throw new Error("database_error");
 return response.json();
}
Deno.serve(async(req:Request)=>{
 if(req.headers.get("origin")&&!allowedOrigins.has(req.headers.get("origin")??""))return result(req,403,{dispatched:false,reason:"origin_forbidden"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=="POST")return result(req,405,{dispatched:false,reason:"method_not_allowed"});
 if(!projectUrl.startsWith("https://")||!serviceKey)return result(req,503,{dispatched:false,reason:"backend_not_configured"});
 const bearer=/^Bearer (\S+)$/i.exec(req.headers.get("authorization")??"");
 if(!bearer)return result(req,401,{dispatched:false,reason:"login_required"});
 try{
  const auth=await fetch(projectUrl+"/auth/v1/user",{headers:{apikey:serviceKey,Authorization:"Bearer "+bearer[1]}});
  if(!auth.ok)return result(req,401,{dispatched:false,reason:"login_required"});
  const user=await auth.json().catch(()=>null);
  if(!user?.id)return result(req,401,{dispatched:false,reason:"login_required"});
  const members=await admin("aevone_workspace_members?select=status&user_id=eq."+encodeURIComponent(user.id)+"&limit=1");
  if(members?.[0]?.status!=="active")return result(req,403,{dispatched:false,reason:"not_active"});
  const payload=await req.json().catch(()=>null);
  const id=String(payload?.job_id??"");
  if(!jobPattern.test(id))return result(req,400,{dispatched:false,reason:"invalid_job"});
  const jobs=await admin("aevone_research_jobs?select=id,status,created_at,user_id&user_id=eq."+encodeURIComponent(user.id)+"&id=eq."+encodeURIComponent(id)+"&limit=1");
  const job=jobs?.[0];
  if(!job||job.status!=="queued")return result(req,409,{dispatched:false,reason:"not_queued"});
  const age=Date.now()-Date.parse(job.created_at);
  if(!Number.isFinite(age)||age<0||age>120000)return result(req,200,{dispatched:false,reason:"scheduled_fallback"});
  if(!githubToken)return result(req,200,{dispatched:false,reason:"dispatch_secret_not_configured"});
  // Conditional DB claim: one GitHub workflow_dispatch per queued research ID.
  const stamp=new Date().toISOString();
  const claimed=await admin("aevone_research_jobs?select=id&id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(user.id)+"&status=eq.queued&dispatch_requested_at=is.null","PATCH",{dispatch_requested_at:stamp});
  if(!Array.isArray(claimed)||claimed.length!==1)return result(req,200,{dispatched:false,reason:"already_requested"});
  let ok=false;
  try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
   try{
    const response=await fetch("https://api.github.com/repos/muzammilasaad708/Aevone-OS-Private/actions/workflows/research.yml/dispatches",{
     method:"POST",signal:controller.signal,
     headers:{Authorization:"Bearer "+githubToken,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
     body:JSON.stringify({ref:"main"})
    });
    ok=response.status===204;
   }finally{clearTimeout(timer);}
  }catch{ok=false;}
  if(!ok){
   await admin("aevone_research_jobs?select=id&id=eq."+encodeURIComponent(id)+"&dispatch_requested_at=eq."+encodeURIComponent(stamp),"PATCH",{dispatch_requested_at:null}).catch(()=>{});
   return result(req,200,{dispatched:false,reason:"scheduled_fallback"});
  }
  return result(req,200,{dispatched:true});
 }catch{return result(req,503,{dispatched:false,reason:"dispatch_unavailable"});}
});
export {};
