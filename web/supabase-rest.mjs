// Zero-dependency Supabase Auth and REST client.
// Stores a session only in sessionStorage (not localStorage), never stores passwords.
import {validateConfig} from './util.mjs';
const SESSION_KEY = 'aevone_session_v1';
export class ApiError extends Error {constructor(message,status=0){super(message);this.name='ApiError';this.status=status;}}
export class SupabaseApi {
 constructor(config, store=null) {
  if (!validateConfig(config)) throw new Error('Invalid Supabase public configuration');
  this.url=config.url.replace(/\/$/,'');this.key=config.publishableKey;
  this.store=store ?? (typeof sessionStorage==='undefined'?null:sessionStorage);
  this.session=null;this.refreshing=null;
  try {const saved=this.store?.getItem(SESSION_KEY);if(saved)this.session=JSON.parse(saved);}catch{this.clear();}
 }
 clear(){this.session=null;try{this.store?.removeItem(SESSION_KEY);}catch{}}
 persist(data){
  if(!data?.access_token||!data?.refresh_token)throw new ApiError('Invalid authentication response');
  this.session={access_token:data.access_token,refresh_token:data.refresh_token,
   expires_at:data.expires_at??Math.floor(Date.now()/1000)+(data.expires_in??3600),user:data.user??this.session?.user??null};
  try{this.store?.setItem(SESSION_KEY,JSON.stringify(this.session));}catch{}
  return this.session;
 }
 async request(path, {method='GET',body,auth=false,headers={},retry=true}={}) {
  const bearer=auth? await this.accessToken() : null;
  if(auth&&!bearer)throw new ApiError('Sign in required',401);
  let response;
  try {response=await fetch(this.url+path,{method,headers:{apikey:this.key,...(bearer?{Authorization:`Bearer ${bearer}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});}
  catch{throw new ApiError('Network connection failed. Check your internet and Supabase project.');}
  if(response.status===401&&auth&&retry&&this.session?.refresh_token){
   try{await this.refresh();return this.request(path,{method,body,auth,headers,retry:false});}catch{this.clear();throw new ApiError('Session expired. Please sign in again.',401);}
  }
  const data=await response.json().catch(()=>null);
  if(!response.ok){
   const message=data?.msg||data?.error_description||data?.message||data?.error||`Request failed (${response.status})`;
   // Only server-side sanitized provider statuses, never raw upstream bodies/keys.
   const attempts=Array.isArray(data?.attempts)?data.attempts.filter(x=>typeof x?.provider==='string'&&typeof x?.status==='string').slice(0,4).map(x=>x.provider+': '+x.status).join('; '):'';
   throw new ApiError(message+(attempts?' Tried: '+attempts:''),response.status);
  }
  return data;
 }
 async login(email,password) {
  const data=await this.request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  return this.persist(data);
 }
 async refresh(){
  if(this.refreshing)return this.refreshing;
  if(!this.session?.refresh_token)throw new ApiError('Session unavailable',401);
  this.refreshing=(async()=>{
   const body={refresh_token:this.session.refresh_token};
   const data=await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body});
   return this.persist(data);
  })();
  try{return await this.refreshing;}finally{this.refreshing=null;}
 }
 async accessToken(){
  if(!this.session)return null;
  if(this.session.expires_at<=Math.floor(Date.now()/1000)+45){try{await this.refresh();}catch{this.clear();return null;}}
  return this.session?.access_token??null;
 }
 async me(){return this.request('/auth/v1/user',{auth:true});}
 async logout(){try{if(this.session)await this.request('/auth/v1/logout',{method:'POST',auth:true,retry:false});}finally{this.clear();}}
 async recover(email){return this.request(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin+location.pathname)}`,{method:'POST',body:{email}});}
 async changePassword(password){return this.request('/auth/v1/user',{method:'PUT',auth:true,body:{password}});}
 async table(name,{select='*',query='',method='GET',body,headers={}}={}){
  if(!/^[a-z_]+$/.test(name))throw new ApiError('Invalid table');
  const suffix=query ? `&${query.replace(/^&/,'')}`:'';
  return this.request(`/rest/v1/${name}?select=${encodeURIComponent(select)}${suffix}`,{method,body,auth:true,headers});
 }
 async invoke(fn,body){
  if(!/^[a-z-]+$/.test(fn))throw new ApiError('Invalid function name');
  return this.request(`/functions/v1/${fn}`,{method:body===undefined?'GET':'POST',body,auth:true});
 }
}
