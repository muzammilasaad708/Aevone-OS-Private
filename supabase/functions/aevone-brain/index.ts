// AEVONE AI Brain: authenticated multi-provider proxy. Keys never reach the browser.
// All provider hosts are constants; no user-supplied URLs are fetched.
import {PROVIDERS,DAILY_REQUEST_LIMIT,normalizeRequest,normalizeMessages,modelAllowed,candidateRoutes,normalizedModels,safeError,shouldFallback,extractText,cleanAnswer,providerStatus} from './core.mjs';
const D = Deno;
const PROJECT=D.env.get('SUPABASE_URL')??'';
const SERVICE=D.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const VAULT=D.env.get('AEVONE_VAULT_KEY_B64')??'';
const ALLOW_PAID=D.env.get('AEVONE_ALLOW_PAID_MODELS')==='true';
const ORIGINS=new Set(['http://localhost:4173','http://127.0.0.1:4173',...(D.env.get('AEVONE_ALLOWED_ORIGINS')??'').split(',').map(x=>x.trim()).filter(Boolean)]);
const cors=(r:Request)=>{const o=r.headers.get('origin');return o&&ORIGINS.has(o)?{'Access-Control-Allow-Origin':o,'Access-Control-Allow-Headers':'apikey,authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}:{};};
const reply=(r:Request,status:number,payload:unknown)=>new Response(JSON.stringify(payload),{status,headers:{...cors(r),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function admin(path:string,options:{method?:string,body?:unknown}={}){
 if(!PROJECT||!SERVICE)throw Error('Supabase backend unavailable');
 const r=await fetch(PROJECT+path,{method:options.method??'GET',headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json',Prefer:'return=representation'},body:options.body===undefined?undefined:JSON.stringify(options.body)});
 const data=await r.json().catch(()=>null);if(!r.ok)throw Error('Database unavailable');return data;
}
async function actor(req:Request){
 const match=/^Bearer (\S+)$/i.exec(req.headers.get('authorization')??'');if(!match||!PROJECT||!SERVICE)return null;
 const r=await fetch(PROJECT+'/auth/v1/user',{headers:{apikey:SERVICE,Authorization:'Bearer '+match[1]}});
 if(!r.ok)return null;const user=await r.json().catch(()=>null);if(!user?.id)return null;
 const rows=await admin('/rest/v1/aevone_workspace_members?select=role,status&user_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
 if(rows?.[0]?.status!=='active')return null;return {id:user.id,role:rows[0].role};
}
const b64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function decrypt(row:any,provider:string){
 if(!VAULT)return '';
 try{
  const bytes=b64(VAULT);if(bytes.byteLength!==32)return '';
  const k=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['decrypt']);
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(row.nonce),additionalData:new TextEncoder().encode(provider)},k,b64(row.ciphertext));
  return new TextDecoder().decode(data);
 }catch{return '';}
}
async function credentials(){
 const rows=await admin('/rest/v1/aevone_connector_credentials?select=connector_id,ciphertext,nonce&limit=100');
 const keys=new Map<string,string>();
 for(const [provider,config] of Object.entries(PROVIDERS)){
  const direct=D.env.get(config.env);if(direct&&direct.length>=10){keys.set(provider,direct);continue;}
  const row=rows.find((r:any)=>r.connector_id===provider);
  if(row){const key=await decrypt(row,provider);if(key)keys.set(provider,key);}
 }
 return keys;
}
async function quota(userId:string){
 const since=new Date(Date.now()-86400000).toISOString();
 const rows=await admin('/rest/v1/aevone_ai_requests?select=created_at&user_id=eq.'+encodeURIComponent(userId)+'&created_at=gte.'+encodeURIComponent(since)+'&order=created_at.desc&limit=55');
 const now=Date.now();const recent=(rows||[]).filter((v:any)=>now-new Date(v.created_at).valueOf()<60000).length;
 return {day:(rows||[]).length,minute:recent};
}
async function recordRequest(uid:string,p:string){await admin('/rest/v1/aevone_ai_requests',{method:'POST',body:{user_id:uid,provider:p}});}
async function chatUpstream(provider:string,model:string,key:string,messages:any[]){
 const cfg=PROVIDERS[provider];const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),28000);
 try{
  const r=await fetch(cfg.url,{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(provider==='openrouter'?{'HTTP-Referer':'https://aevone.example','X-Title':'AEVONE AI Brain'}:{})},body:JSON.stringify({model,messages,max_tokens:768,stream:false})});
  if(!r.ok)return {ok:false,status:r.status};
  const payload=await r.json().catch(()=>null);const content=cleanAnswer(extractText(payload));
  if(!content)return {ok:false,status:502};
  return {ok:true,content,usage:payload?.usage&&typeof payload.usage==='object'?{prompt_tokens:Number(payload.usage.prompt_tokens)||0,completion_tokens:Number(payload.usage.completion_tokens)||0}:null};
 }catch{return {ok:false,status:503};}finally{clearTimeout(timer);}
}
async function modelList(provider:string,key:string){
 const config=PROVIDERS[provider];if(!config?.models)return [];
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),12000);
 try{
  const headers:any={'Authorization':'Bearer '+key,'Accept':'application/json'};
  // Gemini's native models endpoint expects a Google API key header.
  if(provider==='gemini'){delete headers.Authorization;headers['x-goog-api-key']=key;}
  const result=await fetch(config.models,{headers,signal:controller.signal});if(!result.ok)throw Error(safeError(result.status));
  return normalizedModels(provider,await result.json(),{allowPaid:ALLOW_PAID});
 }finally{clearTimeout(t);}
}
D.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');if(origin&&!ORIGINS.has(origin))return reply(req,403,{error:'Origin not permitted'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
 if(!['GET','POST'].includes(req.method))return reply(req,405,{error:'Method not allowed'});
 try{
  const who=await actor(req);if(!who)return reply(req,403,{error:'Approved workspace sign-in required'});
  const keys=await credentials();
  if(req.method==='GET'){
   const used=await quota(who.id);
   return reply(req,200,{providers:providerStatus(keys,Boolean(PROJECT)),free_only:!ALLOW_PAID,remaining_today:Math.max(0,DAILY_REQUEST_LIMIT-used.day),auto_order:['openrouter','groq','gemini','cerebras'],disclaimer:'AI responses are not web-verified evidence. Check sources independently.'});
  }
  const size=Number(req.headers.get('content-length')??0);if(size>15000)return reply(req,413,{error:'Request too large'});
  const payload=await req.json().catch(()=>null);
  if(!payload||typeof payload!=='object')return reply(req,400,{error:'Invalid JSON body'});
  if(payload.action==='models'){
   const name=String(payload.provider??'');if(!Object.hasOwn(PROVIDERS,name))return reply(req,400,{error:'Unknown provider'});
   if(!keys.has(name))return reply(req,409,{error:'Provider credential is not configured'});
   if(PROVIDERS[name].tier==='paid'&&!ALLOW_PAID)return reply(req,403,{error:'Paid providers disabled by default'});
   if(name==='huggingface'&&!ALLOW_PAID)return reply(req,403,{error:'Hugging Face uses limited credits; paid-model permission required to enable it'});
   let models;try{models=await modelList(name,keys.get(name)!);}catch{return reply(req,502,{error:'Model catalog unavailable. Check provider credentials, model permissions and quota.'});}
   return reply(req,200,{provider:name,models,default_model:PROVIDERS[name].defaultModel});
  }
  if(payload.action!=='chat')return reply(req,400,{error:'Unsupported action'});
  let validated;
  try{validated=normalizeRequest(payload,{allowPaid:ALLOW_PAID});}catch(e){return reply(req,400,{error:String(e?.message??'Invalid request')});}
  const candidates=candidateRoutes(validated,new Set(keys.keys()),ALLOW_PAID);
  if(!candidates.length)return reply(req,409,{error:'No permitted, configured provider available for this selection. Configure OpenRouter or Groq in Connectors.'});
  const usage=await quota(who.id);
  if(usage.day>=DAILY_REQUEST_LIMIT||usage.minute>=8)return reply(req,429,{error:'AEVONE daily/minute usage guard reached. Try again after the quota resets.'});
  await recordRequest(who.id,validated.provider);
  const tried=[];
  for(const option of candidates.slice(0,4)){
   const result=await chatUpstream(option.provider,option.model,keys.get(option.provider)!,validated.messages);
   tried.push({provider:option.provider,status:result.ok?'success':safeError(result.status)});
   if(result.ok)return reply(req,200,{answer:result.content,provider:option.provider,model:option.model,usage:result.usage,attempts:tried.length,verified:false});
   if(validated.provider!=='auto'||!shouldFallback(result.status))break;
  }
  return reply(req,502,{error:'Configured providers could not generate a response. Check available credits/models in their dashboards.',attempts:tried});
 }catch{return reply(req,503,{error:'AI Brain temporarily unavailable. Check Supabase setup and connector credentials.'});}
});
