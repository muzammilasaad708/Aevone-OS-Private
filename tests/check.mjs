import assert from 'node:assert/strict';
import {test} from 'node:test';
import {esc,safeHref,csvSafe,asCsv,validateConfig,validateSecretInput,providerNames,navGroups,shortDate} from '../web/util.mjs';
import {SupabaseApi,ApiError} from '../web/supabase-rest.mjs';
const samples=['<script>alert(1)</script>',`"'><img src=x onerror=alert(1)>`,'https://example.com?a=1&b=2','=HYPERLINK("bad")','\nnot a url','🎨 AI Brain'];
const rnd=(i)=> samples[i%samples.length]+String(i);
for(let batch=0;batch<12;batch++){
 test(`AEVONE invariant group ${batch+1}`,()=>{
  for(let i=0;i<1000;i++){
   const s=rnd(i+batch*17);
   switch(batch){
    case 0: assert(!esc(s).includes('<script>'));break;
    case 1: assert(!esc(s).includes('<img '));break;
    case 2: assert(!esc(s).includes('"'));break;
    case 3: assert(!safeHref('javascript:'+s));break;
    case 4: assert(!safeHref('data:text/html,'+s));break;
    case 5: assert(safeHref('https://example.org/test/'+i).startsWith('https://'));break;
    case 6: assert(csvSafe('='+s).startsWith("'="));break;
    case 7: assert(csvSafe('@'+s).startsWith("'@"));break;
    case 8: assert(asCsv([{name:'='+s}]).includes("\"'="));break;
    case 9: assert(validateConfig({url:'https://project.supabase.co',publishableKey:'sb_publishable_'+'a'.repeat(32)}));break;
    case 10: assert(!validateConfig({url:'http://evil.example.com',publishableKey:'sb_publishable_'+'a'.repeat(32)}));break;
    case 11: assert(validateSecretInput('x'.repeat(12+i%100)));break;
   }
  }
 });
}
test('all navigation options unique',()=>{
 const names=navGroups.flat().map(x=>x.name);
 assert.equal(new Set(names).size,names.length);
 assert(names.includes('AI Brain')); assert(names.includes('Verified Leads'));
});
test('provider catalog includes required services',()=>{
 for(const k of ['openai','gemini','grok','deepseek','kimi','qwen','apollo','apify','zoominfo']) assert(providerNames[k]);
});
test('date formatter handles bad data',()=>{
 assert.equal(shortDate('bad'),'—');
 assert.match(shortDate('2026-10-28T00:00:00Z'),/2026/);
});
test('auth login stores and logout clears session',async()=>{
 const cache=new Map();const store={getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 const orig=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(url.includes('grant_type=password'))return new Response(JSON.stringify({access_token:'dummy.jwt',refresh_token:'refresh.jwt',expires_in:3600}),{status:200});
  if(url.includes('/logout'))return new Response(null,{status:204});
  return new Response('{}',{status:200});
 };
 try{
  const api=new SupabaseApi({url:'https://foo.supabase.co',publishableKey:'sb_publishable_'+'A'.repeat(32)},store);
  await api.login('me@example.com','correct-password');assert.equal(await api.accessToken(),'dummy.jwt');assert(cache.size);
  await api.logout();assert.equal(await api.accessToken(),null);assert.equal(cache.size,0);
 }finally{globalThis.fetch=orig;}
});
test('session expiry performs refresh',async()=>{
 let refreshes=0;const orig=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url.includes('grant_type=refresh_token')){refreshes++;return new Response(JSON.stringify({access_token:'new',refresh_token:'new_refresh',expires_in:3600}),{status:200});}
  return new Response('{}',{status:200});
 };
 try{const api=new SupabaseApi({url:'https://foo.supabase.co',publishableKey:'sb_publishable_'+'A'.repeat(32)},new Map());
  api.session={access_token:'old',refresh_token:'refresh',expires_at:0};
  assert.equal(await api.accessToken(),'new');assert.equal(refreshes,1);
 }finally{globalThis.fetch=orig;}
});
test('invalid table name rejected before network',async()=>{
 const api=new SupabaseApi({url:'https://foo.supabase.co',publishableKey:'sb_publishable_'+'A'.repeat(32)},null);
 await assert.rejects(()=>api.table('leads?drop=1'),ApiError);
});
