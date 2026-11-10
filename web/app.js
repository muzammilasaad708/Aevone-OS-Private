import {SupabaseApi,ApiError} from './supabase-rest.mjs';
import {BrainWorkspace} from './brain.mjs';
import {LeadWorkspace} from './lead.mjs';
import registry from './registry.mjs';
import {esc,safeHref,shortDate,providerNames,navGroups,validateConfig,validateSecretInput,asCsv} from './util.mjs';
const root=document.getElementById('app');
const config=window.AEVONE_CONFIG;
let api=null;
const brain=new BrainWorkspace();
const leadResearch=new LeadWorkspace();
let connectorTab='AI Models';
brain.navigate=(page)=>navigate(page);
const state={page:'Dashboard',user:null,member:null,profile:null,leads:[],selected:null,evidence:[],contacts:[],
 vault:null,team:[],modal:null,message:null,recovery:false,initialized:false,busy:false,filter:''};
const isOwner=()=>state.member?.role==='owner';
const isLive=()=>!!state.user&&!!state.member&&state.member.status==='active';
const htmlLink=v=>safeHref(v)?`<a class="source" href="${esc(safeHref(v))}" target="_blank" rel="noopener noreferrer">Open source ↗</a>`:'Not provided';
function alert(message,type='info'){state.message={message,type};render();}
function clearAlert(){state.message=null;}
function setBusy(value){state.busy=value;render();}
function icon(name){return `<span class="navico" aria-hidden="true">${esc(name)}</span>`;}
function badge(label){const type=String(label).toLowerCase().replace(/\s+/g,'-');return `<span class="tag tag-${esc(type)}">${esc(label)}</span>`;}
function render(){
 if(!validateConfig(config))return renderUnconfigured();
 if(!state.initialized)return root.innerHTML='<div class="loading-page"><div class="spinner"></div><p>Establishing secure connection…</p></div>';
 if(!isLive())return renderAuth();
 const main=({Dashboard:renderDashboard,Profile:renderProfile,'AI Brain':()=>brain.render(),'Lead Generation':()=>leadResearch.render(),'Verified Leads':renderLeads,'Unverified Leads':renderLeads,Connectors:renderConnectors,Team:renderTeam,Settings:renderSettings})[state.page];
 root.innerHTML=`<div class="shell"><aside class="sidebar">
   <div class="brand"><div class="brandicon">A<span>✦</span></div><div><h1>AEVONE <small>OS</small></h1><p>PERSONAL AGENCY WORKSPACE</p></div></div>
   <div class="workspacelabel"><span class="green-dot"></span> PRIVATE WORKSPACE <span class="tiny-sup">v2.0</span></div>
   <nav aria-label="Main navigation">${navGroups.map((group,i)=>`<div class="navgroup">${group.map(item=>`<button class="navbutton ${state.page===item.name?'selected':''}" data-go="${esc(item.name)}">${icon(item.icon)}<span>${esc(item.name)}</span>${item.name==='Team'&&!isOwner()?'<span class="mini">Staff</span>':''}</button>`).join('')}</div>${i===0?'<div class="navdivider"></div>':''}`).join('')}</nav>
   <div class="sidebarbottom"><button data-go="Settings" class="navbutton ${state.page==='Settings'?'selected':''}">${icon('⚙')}<span>Settings</span></button>
   <button data-act="signout" class="navbutton">${icon('↪')}<span>Sign out</span></button>
   <div class="account"><div class="avatar">${esc((state.profile?.full_name||state.user?.email||'A').charAt(0).toUpperCase())}</div><div class="accounttext"><strong>${esc(state.profile?.full_name||state.user?.email||'Team member')}</strong><span>${esc(state.member?.role||'member')} · secure session</span></div></div></div>
  </aside><div class="workspace"><header class="topbar"><div><span class="topcrumb">AEVONE OS /</span> <strong>${esc(state.page)}</strong></div><div class="topactions"><span class="pill"><span class="green-dot"></span> Supabase connected</span><button class="roundbtn" title="Profile" data-go="Profile">${esc((state.profile?.full_name||'A')[0].toUpperCase())}</button></div></header>
  <main class="content">${state.message?`<div class="notice ${esc(state.message.type)}"><span>${esc(state.message.message)}</span><button data-act="dismiss" aria-label="Dismiss">×</button></div>`:''}
   ${main?main():renderUpcoming()}
  </main></div></div>${state.selected?renderLeadPanel():''}`;
}
let researchPollBusy=false;
async function pollResearch(){
 if(researchPollBusy || !isLive() || state.page!=='Lead Generation' || !leadResearch.api || document.hidden) return;
 if(!leadResearch.jobs.some(j=>j.status==='queued'||j.status==='running')) return;
 researchPollBusy=true;
 try{
  const signature=jobs=>JSON.stringify(jobs.map(j=>[j.id,j.status,j.result_count,j.error,j.dispatch_requested_at]));
  const old=signature(leadResearch.jobs);
  await leadResearch.refresh();
  // Recover stuck queues while this private app is open. One immediate
  // dispatch happens on submit; subsequent automatic attempts are rate-limited
  // to >=95 seconds apart and capped at three per page session.
  const queued=leadResearch.current;
  if(queued?.status==='queued'){
   const attempts=leadResearch.dispatchAttempts.get(queued.id);
   const lastLocal=attempts?.at||0;
   const lastServer=Date.parse(queued.dispatch_requested_at||'')||0;
   if((!attempts||attempts.count<3) && Date.now()-Math.max(lastLocal,lastServer)>=95000){
    await leadResearch.dispatch(queued.id);
   }
  }
  if(signature(leadResearch.jobs)!==old){
   const draft=root.querySelector('#research-form textarea')?.value||'';
   render();
   const next=root.querySelector('#research-form textarea');if(next)next.value=draft;
  }
 }catch{ /* Temporary network errors must not interrupt the compose box. */ }
 finally{researchPollBusy=false;}
}
setInterval(pollResearch,5000);
function renderUnconfigured(){root.innerHTML=`<div class="authcanvas"><div class="authcard narrow"><div class="monogram">A<span>✦</span></div><h2>Configuration needed</h2><p>Connect your Supabase project before signing in.</p><div class="codehint">Run <strong>CONFIGURE_AEVONE_OS.bat</strong> and enter only your public Supabase Project URL and publishable key.</div><p class="smallmuted">Do not paste an OpenAI API key, Supabase service-role key or password here.</p></div></div>`;}
function renderAuth(){
 const pw=state.recovery;
 root.innerHTML=`<div class="authcanvas"><div class="authleft"><div class="monogram">A<span>✦</span></div><div><div class="eyebrow">AEVONE · A ZIYAN VENTURE</div><h2>One workspace.<br><em>Every move matters.</em></h2><p>Secure operations foundation for your growing creative agency.</p></div><div class="authfoot">PRIVATE ACCESS · AEVONE OS</div></div>
 <div class="authright"><div class="authcard"><div class="labelcaps">ACCOUNT ACCESS</div><h2>${pw?'Set a new password':'Welcome back.'}</h2><p>${pw?'Choose a strong password to protect your workspace.':'Sign in to your private agency operating system.'}</p>
 ${state.message?`<div class="notice ${esc(state.message.type)}"><span>${esc(state.message.message)}</span></div>`:''}
 ${pw?`<form id="password-reset-form"><label>New password<input type="password" name="password" minlength="12" autocomplete="new-password" required></label><label>Confirm password<input type="password" name="confirm" minlength="12" autocomplete="new-password" required></label><button type="submit" class="primary" ${state.busy?'disabled':''}>Update password ↗</button></form>`:`<form id="login-form"><label>Work email<input type="email" name="email" placeholder="you@example.com" autocomplete="username" required></label><label>Password<input type="password" name="password" placeholder="Your password" autocomplete="current-password" required></label><button class="primary" type="submit" ${state.busy?'disabled':''}>${state.busy?'Signing in…':'Sign in to AEVONE OS ↗'}</button></form><button class="textbutton" data-act="forgot">Forgot password?</button>`}
 <p class="authnote">Invitation-only access. Accounts are approved by the workspace owner.</p></div></div></div>`;
}
function title(kicker,title,subtitle='',extra=''){return `<div class="pagehead"><div><div class="eyebrow">${esc(kicker)}</div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${extra}</div>`;}
function renderDashboard(){
 const total=state.leads.length, verified=state.leads.filter(x=>x.status==='verified').length, contacted=state.leads.filter(x=>['Contacted','Replied','Proposal','Won'].includes(x.stage)).length;
 const cards=[{label:'Saved companies',n:total,desc:'Cloud CRM records',icon:'▣'},{label:'Evidence reviewed',n:verified,desc:'Manually verified leads',icon:'✓'},{label:'Contacted',n:contacted,desc:'Pipeline activity',icon:'↗'},{label:'Team access',n:state.member?.role==='owner'?'Owner':state.member?.role,desc:'Authenticated workspace',icon:'♧'}];
 return `${title('AGENCY OVERVIEW','Good to have you here.','Your secure private workspace. Live numbers come from Supabase, never sample data.',`<button class="ghostbtn" data-act="refresh">↻ Refresh</button>`)}
 <div class="statsgrid">${cards.map(c=>`<div class="metric"><div class="metricrow"><span>${esc(c.label)}</span><span class="metricicon">${c.icon}</span></div><strong>${esc(c.n)}</strong><small>${esc(c.desc)}</small></div>`).join('')}</div>
 <div class="two-col"><section class="panel"><div class="panelhead"><div><span class="sectionover">RECENT ACTIVITY</span><h3>Recently saved companies</h3></div><button class="minibtn" data-go="Unverified Leads">View all ↗</button></div>
 ${state.leads.length?`<div class="recentrows">${state.leads.slice(0,6).map(x=>`<button class="recentrow" data-lead="${esc(x.id)}"><span class="listavatar">${esc(x.name[0].toUpperCase())}</span><span class="grow"><strong>${esc(x.name)}</strong><small>${esc(x.city||x.country||'Location not provided')}</small></span>${badge(x.status)}</button>`).join('')}</div>`:`<div class="empty"><div class="emptyico">◇</div><h3>Your CRM is ready</h3><p>Start by adding a company to your secure cloud workspace.</p><button class="primary compact" data-go="Lead Generation">Add first lead ↗</button></div>`}
 </section><section class="panel"><div class="panelhead"><div><span class="sectionover">SYSTEM STATUS</span><h3>Foundation health</h3></div></div>
 <div class="healthrows"><div><span>● Authentication</span>${badge('Active')}</div><div><span>● Supabase database</span>${badge('Active')}</div><div><span>● Row-level security</span>${badge('Enabled')}</div><div><span>● Employee access</span>${badge(state.member?.role||'Member')}</div><div><span>● AI Brain routing</span>${badge(brain.loaded?'Module ready':'Configure providers')}</div></div>
 <div class="tip"><strong>Built to grow.</strong><p>AI Brain and Cloud CRM are available. Lead discovery uses a scheduled, rate-limited public directory worker.</p></div></section></div>`;
}
function renderProfile(){return `${title('PERSONAL DETAILS','Your profile','Manage how your identity appears inside the workspace.')}
 <section class="panel formpanel"><div class="panelhead"><div><span class="sectionover">ACCOUNT PROFILE</span><h3>Professional identity</h3></div>${badge(state.member.role)}</div>
 <form id="profile-form" class="fieldgrid"><label>Full name<input name="full_name" maxlength="120" value="${esc(state.profile?.full_name||'')}" placeholder="Full name"></label>
 <label>Business role<input name="job_title" maxlength="120" value="${esc(state.profile?.job_title||'')}" placeholder="Founder / Creative Director"></label>
 <label>Phone number<input name="phone" maxlength="35" value="${esc(state.profile?.phone||'')}" placeholder="Optional"></label>
 <label>Login email <span class="readonly">Managed in Supabase Auth</span><input disabled value="${esc(state.user.email||'')}"></label>
 <div class="formactions"><button type="submit" class="primary compact">Save profile ↗</button></div></form></section>`;}
function renderLeadEntry(){return `${title('CRM FOUNDATION','Lead Generation workspace','Cloud saving is active. AI Brain is a separate live module; automated business discovery comes in the next development milestone.')}
 <div class="two-col"><section class="panel"><div class="panelhead"><div><span class="sectionover">ADD COMPANY</span><h3>Save a verified-source record</h3></div></div>
 <form id="lead-form" class="stackform"><label>Business / brand name *<input name="name" maxlength="250" required placeholder="Enter a real company name"></label>
 <div class="fieldgrid"><label>City<input name="city" placeholder="Karachi" maxlength="150"></label><label>Country<input name="country" placeholder="Pakistan" maxlength="150"></label></div>
 <label>Official website<input name="website" type="url" placeholder="https://example.com"></label>
 <label>Research source URL<input name="source_url" type="url" placeholder="https://official-source.example"></label>
 <label>Source type<input name="source_name" placeholder="Official website / business directory" maxlength="120"></label>
 <label>Internal notes<textarea name="notes" rows="4" maxlength="8000" placeholder="Facts observed, not assumptions"></textarea></label>
 <button type="submit" class="primary">Save to cloud CRM ↗</button></form></section>
 <section class="panel"><div class="panelhead"><div><span class="sectionover">COMING NEXT</span><h3>Natural-language research</h3></div></div><div class="chatpreview"><div class="mockuser">Find bakeries in Karachi</div><div class="mockagent"><span>✦</span><div>AI Brain will interpret this request, query permitted data sources and return business cards with citations. This service is <strong>not active</strong> in the foundation release.</div></div></div>
 <div class="tip"><strong>Evidence-first by default.</strong><p>Saved companies begin as <em>Unverified</em>. Attach a real source before marking a company verified. No CEO, phone or email will be invented.</p></div></section></div>`;}
function renderLeads(){
 const type=state.page==='Verified Leads'?'verified':'unverified';const leads=state.leads.filter(x=>type==='verified'?x.status==='verified':x.status!=='verified');
 return `${title('CLOUD CRM',type==='verified'?'Verified leads':'Unverified leads',type==='verified'?'Evidence-reviewed company records. Verification does not guarantee email deliverability.':'Companies awaiting manual evidence review.',`<button class="primary compact" data-go="Lead Generation">+ Add company</button>`)}
 <section class="panel tablepanel"><div class="tablehead"><span class="sectionover">${leads.length} COMPANIES</span><div class="tabletools"><input id="lead-filter" aria-label="Filter companies" placeholder="Search your CRM…" value="${esc(state.filter)}"><button class="ghostbtn" data-act="export">↓ Export CSV</button></div></div>
 ${leads.length?`<div class="tablescroll"><table><thead><tr><th>Company</th><th>Location</th><th>Status</th><th>Stage</th><th>Source</th><th>Saved</th><th></th></tr></thead><tbody>
 ${leads.map(l=>`<tr data-search-row="${esc((l.name+' '+l.city+' '+l.country).toLowerCase())}"><td><strong>${esc(l.name)}</strong><small>${esc(l.website||'Website not provided')}</small></td><td>${esc([l.city,l.country].filter(Boolean).join(', ')||'—')}</td><td>${badge(l.status)}</td><td>${esc(l.stage)}</td><td>${esc(l.source_name||'—')}</td><td>${esc(shortDate(l.created_at))}</td><td><button class="minibtn" data-lead="${esc(l.id)}">Inspect ↗</button></td></tr>`).join('')}
 </tbody></table></div>`:`<div class="empty"><div class="emptyico">☷</div><h3>No ${type} records yet</h3><p>Your data will appear here once saved to Supabase.</p></div>`}</section>`;
}
function renderConnectors(){
 const items=state.vault?.items||[];const set=new Set(items.map(x=>x.connector_id));const connected=new Set(brain.providers.filter(x=>x.connected).map(x=>x.id));
 const categories=['AI Models','Business Intelligence','Google Maps','Email & Contacts','Professional Networks','AI Agents'];
 const list=registry.filter(x=>x.group===connectorTab);
 const aiIds={'OpenRouter':'openrouter','Groq Cloud':'groq','Google Gemini':'gemini','Cerebras':'cerebras','Hugging Face':'huggingface','OpenAI':'openai','DeepSeek':'deepseek','xAI':'grok','Together AI':'together','Mistral':'mistral','Cohere':'cohere','SiliconFlow':'siliconflow'};
 return `${title('PROVIDER MANAGEMENT','Connectors & API vault','AI providers, lead data platforms and GitHub research tool registry. Listed ≠ installed ≠ working.')}
 <div class="banner"><div><strong>Real connection status</strong><p>Stored credentials are not proof of API availability. GitHub repositories require licensing, deployment and authenticated integration checks.</p></div>${badge(state.vault?.vault_ready?'Encrypted vault ready':'Encrypted vault pending')}</div>
 <section class="panel"><div class="connector-tabs">${categories.map(x=>`<button class="ghostbtn ${connectorTab===x?'active':''}" data-connector-tab="${esc(x)}">${esc(x)}</button>`).join('')}</div>
 <div class="panelhead"><div><span class="sectionover">CONNECTOR REGISTRY</span><h3>${esc(connectorTab)} · ${list.length} entries</h3></div><button class="ghostbtn" data-act="reload-vault">↻ Refresh</button></div>
 <div class="connectorgrid">${list.map(x=>{const id=x.kind==='provider'?aiIds[x.name]:x.id;const stored=set.has(id),runtime=connected.has(id);const status=x.kind==='repository'?'Not deployed':runtime?'Credential found':stored?'Stored':'Not configured';return `<div class="connector"><div class="providericon">${esc(x.name[0])}</div><div class="connectorinfo"><strong>${esc(x.name)}</strong><small>${esc(x.kind==='repository'?'GitHub repository · requires adapter + compatible host':x.kind==='platform'?'Data platform · provider access required':'AI provider')}</small></div>${badge(status)}${x.url?`<a class="minibtn" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Repo ↗</a>`:''}${isOwner()&&x.kind!=='repository'&&Object.hasOwn(providerNames,id)?`<button class="minibtn" data-provider="${esc(id)}">Manage</button>`:''}</div>`;}).join('')}</div>
 <div class="tip"><strong>Supported now:</strong> AI Brain adapters and scheduled OpenStreetMap discovery. Apollo, Apify, ZoomInfo, Agent Reach and third-party scrapers are inventory candidates, not deployed connectors.</div></section>`;
}
function renderTeam(){return `${title('STAFF & ACCESS','Team management','Control who can access your private workspace. Member invitations are sent by Supabase Auth.')}
 ${isOwner()?`<div class="two-col"><section class="panel"><div class="panelhead"><div><span class="sectionover">INVITE STAFF</span><h3>Invite a team member</h3></div></div><form id="invite-form" class="stackform"><label>Email<input required type="email" name="email" placeholder="employee@example.com"></label><label>Role<select name="role"><option value="member">Member (CRM access)</option><option value="admin">Admin (CRM access)</option></select></label><button class="primary" type="submit">Send invitation ↗</button></form><p class="smallmuted">Only the owner can invite, suspend or reactivate members. Admin cannot manage API keys or staff.</p></section>
 <section class="panel"><div class="panelhead"><div><span class="sectionover">WORKSPACE ACCESS</span><h3>Approved members</h3></div><button class="minibtn" data-act="reload-team">↻</button></div>
 ${state.team.length?state.team.map(x=>`<div class="teamrow"><div><strong>${esc(x.user_id===state.user.id?'You':x.user_id.slice(0,8)+'…')}</strong><small>${esc(x.user_id)}</small></div>${badge(x.role)}${badge(x.status)}${x.role==='owner'?'':`<button class="minibtn" data-status-user="${esc(x.user_id)}" data-status-next="${x.status==='active'?'suspended':'active'}">${x.status==='active'?'Suspend':'Activate'}</button>`}</div>`).join(''):'<div class="empty"><p>Staff list will load after deploying the team function.</p></div>'}</section></div>`:`<section class="panel"><div class="tip">You have <strong>${esc(state.member.role)}</strong> access. Ask the owner if you need a different role.</div></section>`}`;}
function renderSettings(){return `${title('ACCOUNT SECURITY','Settings','Protect your login and manage the active browser session.')}
 <div class="two-col"><section class="panel"><div class="panelhead"><div><span class="sectionover">PASSWORD</span><h3>Change your password</h3></div></div><form id="password-change-form" class="stackform"><label>New password<input type="password" name="password" autocomplete="new-password" minlength="12" required></label><label>Confirm password<input type="password" name="confirm" autocomplete="new-password" minlength="12" required></label><button type="submit" class="primary">Update password ↗</button></form></section>
 <section class="panel"><div class="panelhead"><div><span class="sectionover">ACCESS</span><h3>Secure session</h3></div></div><div class="healthrows"><div><span>Signed in as</span><strong class="muted">${esc(state.user.email)}</strong></div><div><span>Workspace role</span>${badge(state.member.role)}</div><div><span>Credentials</span><strong class="muted">Never stored in UI</strong></div></div><button data-act="signout" class="dangerbtn">Sign out of this session</button></section></div>`;}
function renderUpcoming(){return `${title('ROADMAP',state.page,'This panel is reserved for the next AEVONE OS development phase.')}
 <section class="panel placehold"><div class="emptyico">✦</div><h3>${esc(state.page)} is planned</h3><p>This module has not been built yet. Authentication, profiles, cloud CRM, team permissions and the secure connector vault are the focus of this release.</p><button class="ghostbtn" data-go="Dashboard">Return to dashboard</button></section>`;}
function renderLeadPanel(){
 const l=state.selected;
 return `<div class="shade" data-act="close-lead"></div><aside class="drawer" aria-label="Company detail"><div class="drawerhead"><div><span class="sectionover">COMPANY PROFILE</span><h2>${esc(l.name)}</h2><p>${esc([l.city,l.country].filter(Boolean).join(', ')||'Location not provided')}</p></div><button class="roundbtn" data-act="close-lead" aria-label="Close">×</button></div>
 <div class="drawerscroll"><div class="detailstats">${badge(l.status)}${badge(l.stage)}</div>
 <div class="detailblock"><span class="sectionover">PUBLIC REFERENCES</span><div class="detailrow"><span>Website</span>${htmlLink(l.website)}</div><div class="detailrow"><span>Source</span>${htmlLink(l.source_url)}</div><div class="detailrow"><span>Provider</span><strong>${esc(l.source_name||'Unknown')}</strong></div></div>
 <form id="lead-update-form" class="stackform"><label>Pipeline stage<select name="stage">${['Discovered','Qualified','Contacted','Replied','Proposal','Won','Lost'].map(x=>`<option ${l.stage===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Verification status<select name="status">${['unverified','reviewed','verified'].map(x=>`<option ${l.status===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Research notes<textarea name="notes" rows="3" maxlength="8000">${esc(l.notes||'')}</textarea></label><button type="submit" class="primary compact">Save changes ↗</button></form>
 <div class="detailblock"><span class="sectionover">EVIDENCE (${state.evidence.length})</span>${state.evidence.length?state.evidence.map(e=>`<div class="evidence"><strong>${esc(e.field_name)}</strong> ${htmlLink(e.source_url)}<p>${esc(e.note||'')}</p></div>`).join(''):'<p class="smallmuted">Add a public source before marking verified.</p>'}
 <form id="evidence-form" class="stackform"><label>Field<select name="field_name">${['company','website','phone','email','person','role','other'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Public evidence URL<input type="url" name="source_url" placeholder="https://..." required pattern="https://.*"></label><label>Source note<input name="note" maxlength="1000" placeholder="What does this prove?"></label><button type="submit" class="ghostbtn">+ Add source</button></form></div>
 <div class="detailblock"><span class="sectionover">CONTACTS (${state.contacts.length})</span>${state.contacts.length?state.contacts.map(c=>`<div class="evidence"><strong>${esc(c.full_name)}</strong> <span class="smallmuted">${esc(c.job_title)}</span><p>${esc(c.email||'Email not provided')} · ${esc(c.phone||'Phone not provided')}</p>${htmlLink(c.source_url)}<p>${badge(c.confidence)}</p></div>`).join(''):'<p class="smallmuted">No contacts saved. Do not invent names or addresses.</p>'}
 <form id="contact-form" class="stackform"><label>Name<input name="full_name" required maxlength="160"></label><label>Role<input name="job_title" maxlength="160"></label><label>Business email<input name="email" type="email"></label><label>Public source URL<input name="source_url" type="url" placeholder="https://..."></label><button type="submit" class="ghostbtn">+ Save contact</button></form></div>
 <button data-act="delete-lead" class="dangerbtn">Delete company record</button></div></aside>`;
}
async function getAccount(){
 const user=await api.me();const members=await api.table('aevone_workspace_members',{select:'user_id,role,status',query:`user_id=eq.${encodeURIComponent(user.id)}&limit=1`});
 if(!members?.length||members[0].status!=='active')throw new ApiError('This account is not approved for AEVONE OS. Ask the owner to approve your user ID.',403);
 state.user=user;state.member=members[0];
 const profiles=await api.table('aevone_profiles',{select:'user_id,full_name,phone,job_title',query:`user_id=eq.${encodeURIComponent(user.id)}&limit=1`});
 state.profile=profiles?.[0]||null;
}
async function loadLeads(){state.leads=await api.table('aevone_leads',{select:'id,name,city,country,website,status,stage,source_name,source_url,notes,created_at,created_by,verified_at',query:'order=created_at.desc&limit=300'});}
async function loadVault(){if(!isOwner())return;try{state.vault=await api.invoke('aevone-vault');}catch(error){state.vault={items:[],vault_ready:false};alert('API vault is not available yet. Deploy the vault Edge Function and configure its encryption secret.','warning');}}
async function loadTeam(){if(!isOwner())return;try{const result=await api.invoke('aevone-team');state.team=result?.members||[];}catch{state.team=[];alert('Team Edge Function is not available yet. Deploy it from the package.','warning');}}
async function openLead(id){const lead=state.leads.find(x=>x.id===id);if(!lead)return;
 state.selected=lead;state.evidence=[];state.contacts=[];render();
 try{const [e,c]=await Promise.all([api.table('aevone_lead_evidence',{select:'*',query:`lead_id=eq.${encodeURIComponent(id)}&order=created_at.desc`}),api.table('aevone_lead_contacts',{select:'*',query:`lead_id=eq.${encodeURIComponent(id)}&order=created_at.desc`})]);
 if(state.selected?.id===id){state.evidence=e;state.contacts=c;render();}}
 catch(err){alert(`Couldn't load evidence: ${err.message}`,'error');}}
async function navigate(page){state.page=page;state.filter='';state.selected=null;clearAlert();render();if(page==='Connectors'){await loadVault();brain.api=api;brain.userId=state.user.id;try{await brain.refreshStatus(false);}catch{}}if(page==='Team')await loadTeam();if(page==='AI Brain')await brain.load(api,state.user?.id,render);if(page==='Lead Generation'){try{await leadResearch.load(api,state.user.id);}catch(e){alert(e.message,'error');}}render();}
async function initialize(){
 if(!validateConfig(config)){state.initialized=true;render();return;}
 try{api=new SupabaseApi(config);
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  if(hash.has('access_token')&&hash.has('refresh_token')){
    api.persist({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in')||3600)});
    state.recovery=hash.get('type')==='recovery';history.replaceState({},'',location.pathname+location.search);
  }
  if(api.session)await getAccount();
  if(state.user)await loadLeads();
 }catch(error){
  if(error.status===403){state.message={message:error.message,type:'warning'};}else if(api)api.clear();
  state.user=null;state.member=null;
 }
 state.initialized=true;render();
}
root.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button)return;
 const go=button.dataset.go, action=button.dataset.act, lead=button.dataset.lead;
 if(go){await navigate(go);return;}
 if(button.dataset.brainAction){await brain.onClick(button);return;}
 if(button.dataset.connectorTab){connectorTab=button.dataset.connectorTab;render();return;}
 if(button.dataset.researchId){leadResearch.active=button.dataset.researchId;render();return;}
 if(button.dataset.leadAct==='new'){leadResearch.active=null;render();return;}
 if(button.dataset.leadAct==='refresh'){try{await leadResearch.refresh();render();}catch(e){alert(e.message,'error');}return;}
 if(button.dataset.leadAct==='dispatch'){try{const status=await leadResearch.dispatch(leadResearch.active);alert(status==='requested'?'GitHub worker requested. Status will refresh automatically.':'Instant dispatch not confirmed: '+status+'. Scheduled fallback remains enabled.',status==='requested'?'success':'warning');}catch(e){alert(e.message,'error');}return;}
 if(button.dataset.saveResult!==undefined){try{const name=await leadResearch.save(Number(button.dataset.saveResult));await loadLeads();alert(name+' saved as unverified.','success');}catch(e){alert(e.message,'error');}return;}
 if(lead){await openLead(lead);return;}
 if(button.dataset.provider){state.modal=button.dataset.provider;renderVaultModal();return;}
 if(button.dataset.statusUser){const uid=button.dataset.statusUser,next=button.dataset.statusNext;
  if(!confirm(`Change this member to ${next}?`))return;
  try{setBusy(true);await api.invoke('aevone-team',{action:'status',user_id:uid,status:next});await loadTeam();alert('Member access updated.','success');}catch(e){alert(e.message,'error');}finally{setBusy(false);}return;}
 if(!action)return;
 try{
  if(action==='dismiss'){clearAlert();render();}
  else if(action==='signout'){await api.logout();state.user=null;state.member=null;state.selected=null;state.vault=null;state.team=[];state.recovery=false;brain.reset();clearAlert();render();}
  else if(action==='forgot'){const email=prompt('Enter your work email for a password recovery link:');if(!email)return;await api.recover(email.trim());alert('If this email is registered and allowed, a recovery link will be sent.','success');}
  else if(action==='refresh'){await loadLeads();alert('Cloud records refreshed.','success');}
  else if(action==='reload-vault'){await loadVault();render();}
  else if(action==='reload-team'){await loadTeam();render();}
  else if(action==='close-lead'){state.selected=null;render();}
  else if(action==='export'){const data=asCsv(state.leads);const blob=new Blob([data],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='AEVONE_OS_Leads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  else if(action==='delete-lead'){if(!state.selected||!confirm(`Delete ${state.selected.name} from cloud CRM?`))return;const id=state.selected.id;await api.table('aevone_leads',{method:'DELETE',query:`id=eq.${encodeURIComponent(id)}`});state.selected=null;await loadLeads();alert('Company deleted.','success');}
 }catch(error){alert(error.message,'error');}
});
root.addEventListener('change',async event=>{
 if(event.target.matches('[data-research-filter]')){
  const form=event.target.closest('#research-form');
  if(form){
   const draft=form.querySelector('textarea[name=query]')?.value||'';
   leadResearch.setFilter(event.target.name,event.target.value);
   leadResearch.draft=draft;
   if(['country','state','city'].includes(event.target.name))render();
   return;
  }
 }
 if(event.target.id==='brain-provider'){await brain.chooseProvider(event.target.value);}
 else if(event.target.id==='brain-model'){brain.model=event.target.value;}
});
root.addEventListener('input',event=>{
 if(event.target.matches('#research-form textarea[name=query]')){leadResearch.draft=event.target.value;return;}
 if(event.target.matches('#research-form [data-research-filter]')){
  if(event.target.tagName==='INPUT')leadResearch.filters[event.target.name]=event.target.value;
  return;
 }
 if(event.target.id!=='lead-filter')return;
 state.filter=event.target.value;const term=state.filter.trim().toLowerCase();
 for(const row of root.querySelectorAll('tr[data-search-row]'))row.hidden=!row.dataset.searchRow.includes(term);
});
root.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.target;if(!form?.id)return;
 if(form.id==='brain-compose'){await brain.send(form);return;}
 const values=Object.fromEntries(new FormData(form));
 if(state.busy)return;
 try{
  state.busy=true;const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=true;
  if(form.id==='login-form'){
   await api.login(String(values.email||'').trim(),String(values.password||''));await getAccount();await loadLeads();state.page='Dashboard';clearAlert();render();return;
  }
  if(['password-reset-form','password-change-form'].includes(form.id)){
   if(String(values.password).length<12||values.password!==values.confirm)throw new ApiError('Passwords must match and be at least 12 characters');
   await api.changePassword(String(values.password));state.recovery=false;alert('Password updated successfully.','success');return;
  }
  if(form.id==='profile-form'){
   await api.table('aevone_profiles',{method:'POST',query:'on_conflict=user_id',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:{user_id:state.user.id,full_name:String(values.full_name||'').trim(),phone:String(values.phone||'').trim(),job_title:String(values.job_title||'').trim(),updated_at:new Date().toISOString()}});
   await getAccount();alert('Your profile was saved.','success');return;
  }
  if(form.id==='research-form'){try{
   for(const key of ['country','city','state','stateManual','cityManual','industry','quantity'])if(values[key]!==undefined)leadResearch.filters[key]=String(values[key]);
   await leadResearch.submit(String(values.query||''));alert(leadResearch.lastDispatch==='requested'?'On-demand research requested. Results will update automatically.':'Research saved, but instant dispatch is unavailable ('+leadResearch.lastDispatch+'). Scheduled worker is the backup.',leadResearch.lastDispatch==='requested'?'success':'warning');}catch(e){alert(e.message,'error');}return;}
  if(form.id==='lead-form'){
   const body={name:String(values.name||'').trim(),city:String(values.city||'').trim(),country:String(values.country||'').trim(),website:String(values.website||'').trim(),source_url:String(values.source_url||'').trim(),source_name:String(values.source_name||'').trim(),notes:String(values.notes||'').trim(),created_by:state.user.id,status:'unverified'};
   if(!body.name)throw new ApiError('Company name required');
   await api.table('aevone_leads',{method:'POST',body,headers:{Prefer:'return=representation'}});await loadLeads();state.page='Unverified Leads';alert('Company saved securely to Supabase.','success');return;
  }
  if(form.id==='lead-update-form'){
   if(!state.selected)return;const id=state.selected.id;
   await api.table('aevone_leads',{method:'PATCH',query:`id=eq.${encodeURIComponent(id)}`,body:{status:String(values.status),stage:String(values.stage),notes:String(values.notes||'')},headers:{Prefer:'return=representation'}});
   state.selected=null;await loadLeads();alert('Company updated in cloud CRM.','success');return;
  }
  if(form.id==='evidence-form'){
   if(!state.selected)throw new ApiError('No lead selected');
   const body={lead_id:state.selected.id,field_name:String(values.field_name),source_url:String(values.source_url||'').trim(),note:String(values.note||'').trim(),created_by:state.user.id};
   if(!safeHref(body.source_url)||!body.source_url.startsWith('https://'))throw new ApiError('Use a full https:// evidence URL');
   await api.table('aevone_lead_evidence',{method:'POST',body,headers:{Prefer:'return=representation'}});await openLead(state.selected.id);alert('Evidence source attached.','success');return;
  }
  if(form.id==='contact-form'){
   if(!state.selected)throw new ApiError('No lead selected');
   const body={lead_id:state.selected.id,full_name:String(values.full_name||'').trim(),job_title:String(values.job_title||'').trim(),email:String(values.email||'').trim(),source_url:String(values.source_url||'').trim(),confidence:'Unverified'};
   if(!body.full_name)throw new ApiError('Contact name required');
   await api.table('aevone_lead_contacts',{method:'POST',body,headers:{Prefer:'return=representation'}});await openLead(state.selected.id);alert('Contact added as unverified.','success');return;
  }
  if(form.id==='invite-form'){
   await api.invoke('aevone-team',{action:'invite',email:String(values.email).trim(),role:String(values.role)});await loadTeam();alert('Invitation created. Check the configured Supabase email service.','success');return;
  }

 }catch(error){alert(error.message,'error');}finally{state.busy=false;const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=false;}
});
function renderVaultModal(){
 const existing=document.getElementById('vault-dialog');if(existing)existing.remove();
 const provider=state.modal;if(!provider||!isOwner())return;
 const el=document.createElement('div');el.id='vault-dialog';el.className='modalwrap';
 el.innerHTML=`<div class="modalshade"></div><div class="modalcard"><div class="panelhead"><div><span class="sectionover">SERVER-SIDE API VAULT</span><h3>${esc(providerNames[provider])}</h3></div><button class="roundbtn" id="vault-close" type="button" aria-label="Close">×</button></div>
 <p>Enter a provider API key securely. It will be encrypted server-side and never displayed after saving.</p>
 <form id="vault-form" data-provider="${esc(provider)}" class="stackform"><label>Secret API key<input type="password" name="value" minlength="12" maxlength="16000" required autocomplete="off"></label><button type="submit" class="primary">Save encrypted credential ↗</button></form>
 <p class="smallmuted">For direct Edge Function Secrets, use your Supabase dashboard. Never put keys in browser config.js.</p>
 ${state.vault?.items?.some(x=>x.connector_id===provider)?'<button id="vault-delete" class="dangerbtn">Remove stored credential</button>':''}</div>`;
 document.body.append(el);
 el.querySelector('#vault-close').addEventListener('click',closeVaultModal);
 el.querySelector('.modalshade').addEventListener('click',closeVaultModal);
 el.querySelector('#vault-delete')?.addEventListener('click',async()=>{
  if(!confirm('Delete the stored connector credential?'))return;
  try{await api.invoke('aevone-vault',{action:'remove',connector_id:provider});closeVaultModal();await loadVault();alert('Credential deleted.','success');}catch(e){alert(e.message,'error');}
 });
 // Dialog is attached to body while regular forms delegate to root.
 el.querySelector('form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target;const value=String(new FormData(form).get('value')||'');
  if(!validateSecretInput(value)){alert('Invalid API key length','error');return;}
  const save=form.querySelector('button');save.disabled=true;
  try{await api.invoke('aevone-vault',{action:'set',connector_id:provider,value});form.reset();closeVaultModal();await loadVault();alert('Encrypted credential securely saved.','success');}catch(error){alert(error.message,'error');}finally{save.disabled=false;}
 });
}
function closeVaultModal(){document.getElementById('vault-dialog')?.remove();state.modal=null;}
initialize();
