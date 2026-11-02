import assert from 'node:assert/strict';
const listeners={};
const root={innerHTML:'',addEventListener:(kind,handler)=>listeners[kind]=handler,querySelectorAll:()=>[]};
const id='11111111-2222-4333-8444-555555555555';
const leads=[];let status=200;
const storage=new Map();
globalThis.document={getElementById:k=>k==='app'?root:null};
globalThis.window={AEVONE_CONFIG:{url:'https://test.supabase.co',publishableKey:'sb_publishable_'+'x'.repeat(32)}};
globalThis.location={hash:'',pathname:'/',search:'',origin:'http://localhost:4173'};
globalThis.history={replaceState:()=>{}};
globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.FormData=class{constructor(form){return Object.entries(form._data)}};
globalThis.fetch=async(url,opts={})=>{
 const path=new URL(url).pathname;let body={};const method=opts.method||'GET';
 if(path.endsWith('/token'))body={access_token:'jwt.mock',refresh_token:'refresh.mock',expires_in:3600};
 else if(path.endsWith('/user'))body={id,email:'founder@example.com'};
 else if(path.includes('/aevone_workspace_members'))body=[{user_id:id,role:'owner',status:'active'}];
 else if(path.includes('/aevone_profiles'))body=[];
 else if(path.includes('/aevone_leads')){
  if(method==='POST'){const r={...JSON.parse(opts.body),id:'a6f00711-2222-4333-8444-555555555555',stage:'Discovered',created_at:'2026-10-28T10:00:00Z'};leads.push(r);body=[r]}
  else body=leads;
 }
 else if(path.includes('/aevone-vault'))body={vault_ready:false,items:[]};
 else if(path.includes('/aevone-team'))body={members:[]};
 else if(path.includes('/aevone_lead_evidence')||path.includes('/aevone_lead_contacts'))body=[];
 return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
};
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
await import('../web/app.js');await tick();
assert.match(root.innerHTML,/Welcome back/);
const makeForm=(formId,data)=>({preventDefault(){},target:{id:formId,_data:data,querySelector:()=>({disabled:false})}});
await listeners.submit(makeForm('login-form',{email:'founder@example.com',password:'some-password'}));
assert.match(root.innerHTML,/Good to have you here/);
async function click(attrs){await listeners.click({target:{closest:()=>({dataset:attrs})}})}
await click({go:'Lead Generation'});
assert.match(root.innerHTML,/Save to cloud CRM/);
await listeners.submit(makeForm('lead-form',{name:'<img src=x onerror=1>',city:'Karachi',country:'Pakistan',website:'https://example.com',source_url:'https://example.com/contact',source_name:'Official',notes:''}));
assert.match(root.innerHTML,/&lt;img src=x onerror=1&gt;/);
assert(!root.innerHTML.includes('<img src=x onerror=1>'));
assert.equal(leads.length,1);
await click({go:'Connectors'});
assert.match(root.innerHTML,/OpenAI/);
await click({go:'Settings'});
assert.match(root.innerHTML,/Change your password/);
console.log('DOM state transitions passed');
