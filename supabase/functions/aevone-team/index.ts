// Minimal Deno type for optional offline TypeScript checking.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
// AEVONE OS: owner-gated staff invitations and role control. Supabase Auth creates the email invitation.
const projectUrl=Deno.env.get('SUPABASE_URL')??'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const allowedOrigins=new Set(['http://localhost:4173','http://127.0.0.1:4173',...(Deno.env.get('AEVONE_ALLOWED_ORIGINS')??'').split(',').map(s=>s.trim()).filter(Boolean)]);
function cors(req:Request){const origin=req.headers.get('origin')??'';return origin&&allowedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}:{};}
function reply(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
async function privileged(path:string,method='GET',data?:unknown){
 const result=await fetch(`${projectUrl}${path}`,{method,headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',Prefer:'return=representation,resolution=merge-duplicates'},body:data===undefined?undefined:JSON.stringify(data)});
 const body=await result.json().catch(()=>({}));
 if(!result.ok)throw new Error(`Backend operation failed (${result.status})`);
 return body;
}
async function owner(req:Request):Promise<string|null>{
 const m=/^Bearer (\S+)$/i.exec(req.headers.get('authorization')??'');if(!m||!projectUrl||!serviceKey)return null;
 const r=await fetch(`${projectUrl}/auth/v1/user`,{headers:{apikey:serviceKey,Authorization:`Bearer ${m[1]}`}});if(!r.ok)return null;
 const u=await r.json();if(!u?.id)return null;
 const a=await privileged(`/rest/v1/aevone_workspace_members?select=role,status&user_id=eq.${encodeURIComponent(u.id)}&limit=1`);
 return a?.[0]?.role==='owner'&&a?.[0]?.status==='active'?u.id:null;
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');if(origin&&!allowedOrigins.has(origin))return reply(req,403,{error:'Origin not allowed'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
 if(!['GET','POST'].includes(req.method))return reply(req,405,{error:'Method not allowed'});
 try{
  const userId=await owner(req);if(!userId)return reply(req,403,{error:'Only workspace owner may manage staff'});
  if(req.method==='GET'){
   const members=await privileged('/rest/v1/aevone_workspace_members?select=user_id,role,status,joined_at&order=joined_at.asc');
   return reply(req,200,{members});
  }
  const payload=await req.json().catch(()=>null);
  if(payload?.action==='invite'){
   const email=String(payload.email??'').trim().toLowerCase();const role=String(payload.role??'member');
   if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!['member','admin'].includes(role))return reply(req,400,{error:'Valid email and role required'});
   const redirect=Deno.env.get('AEVONE_APP_URL')??'http://localhost:4173/';
   if(!allowedOrigins.has(new URL(redirect).origin))return reply(req,503,{error:'App redirect URL is not in allowed origins'});
   const created=await fetch(`${projectUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(redirect)}`,{
    method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({email})
   });
   const data=await created.json().catch(()=>({}));
   if(!created.ok)return reply(req,409,{error:'Invite failed. Check if user exists and email settings allow invitations.'});
   if(!data?.id)return reply(req,502,{error:'Invite did not return a user ID'});
   await privileged('/rest/v1/aevone_workspace_members?on_conflict=user_id','POST',{user_id:data.id,role,status:'active'});
   return reply(req,200,{ok:true,user_id:data.id});
  }
  if(payload?.action==='status'){
   const target=String(payload.user_id??'');const status=String(payload.status??'');
   if(!/^[a-f0-9-]{36}$/i.test(target)||!['active','suspended'].includes(status))return reply(req,400,{error:'Invalid member or status'});
   const rows=await privileged(`/rest/v1/aevone_workspace_members?select=role&user_id=eq.${encodeURIComponent(target)}`);
   if(rows?.[0]?.role==='owner')return reply(req,403,{error:'Owner cannot be suspended'});
   if(!rows?.length)return reply(req,404,{error:'Member not found'});
   await privileged(`/rest/v1/aevone_workspace_members?user_id=eq.${encodeURIComponent(target)}`,'PATCH',{status});
   return reply(req,200,{ok:true,user_id:target,status});
  }
  return reply(req,400,{error:'Unknown action'});
 }catch{return reply(req,500,{error:'Team operation failed'});}
});

export {};
