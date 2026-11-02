/** AEVONE API gateway. Deploy separately to Workers; no static secret in browser. */
const headers = (origin,allowed) => ({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin===allowed?{'Access-Control-Allow-Origin':allowed,'Vary':'Origin'}:{})});
export default {async fetch(request,env){
 const origin=request.headers.get('Origin')||'';
 const allowed=env.ALLOWED_ORIGIN||'';
 const hdr=headers(origin,allowed);
 const send=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:hdr});
 if(origin&&origin!==allowed)return send(403,{error:'Origin not allowed'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...hdr,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type,apikey'}});
 const url=new URL(request.url);
 if(url.pathname==='/health'&&request.method==='GET')return send(200,{ok:true,service:'AEVONE research gateway'});
 if(!['/jobs','/jobs/create'].includes(url.pathname))return send(404,{error:'Not found'});
 const jwt=request.headers.get('Authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(jwt)||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return send(401,{error:'Sign in required'});
 const auth=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:jwt}}).catch(()=>null);
 if(!auth?.ok)return send(401,{error:'Invalid session'});
 const user=await auth.json();if(!user?.id)return send(401,{error:'Invalid user'});
 const dbHdr={Authorization:jwt,apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
 let upstream;
 if(url.pathname==='/jobs'&&request.method==='GET'){
   upstream=await fetch(env.SUPABASE_URL+'/rest/v1/aevone_research_jobs?select=id,query,status,results,result_count,error,created_at&order=created_at.desc&limit=60',{headers:dbHdr});
 } else if(url.pathname==='/jobs/create'&&request.method==='POST'){
   const raw=await request.text();if(raw.length>3500)return send(413,{error:'Request too large'});
   let input;try{input=JSON.parse(raw)}catch{return send(400,{error:'Invalid JSON'})}
   if(typeof input?.query!=='string'||input.query.trim().length<2||input.query.length>1000)return send(400,{error:'Query must contain 2–1000 characters'});
   upstream=await fetch(env.SUPABASE_URL+'/rest/v1/aevone_research_jobs?select=id,query,status,created_at',{method:'POST',headers:{...dbHdr,Prefer:'return=representation'},body:JSON.stringify({query:input.query.trim(),user_id:user.id})});
 } else return send(405,{error:'Method not allowed'});
 if(!upstream.ok)return send(upstream.status,{error:'Job request rejected'});
 return new Response(await upstream.text(),{status:upstream.status,headers:hdr});
 }};
