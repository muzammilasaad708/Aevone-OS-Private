import {esc,safeHref} from './util.mjs';
import {countries, stateOptions, cityOptions, hasCountryGeography, cityPoint, industries} from './geography.mjs';
export class LeadWorkspace {
 constructor(){this.jobs=[];this.active=null;this.error='';this.busy=false;this.tab='Chat';this.api=null;this.userId=null;this.onSave=null;this.status='';this.lastDispatch='scheduled';this.dispatchFor=null;this.dispatchAttempts=new Map();this.filters={country:'',city:'',state:'',stateManual:'',cityManual:'',industry:'',quantity:'20'};this.draft='';}
 async load(api,userId){this.api=api;this.userId=userId;await this.refresh();}
 async refresh(){this.jobs=await this.api.table('aevone_research_jobs',{select:'id,query,status,results,result_count,error,created_at,dispatch_requested_at',query:'order=created_at.desc&limit=60'});if(!this.active&&this.jobs.length)this.active=this.jobs[0].id;this.status='';}

 get current(){return this.jobs.find(x=>x.id===this.active);}
 setFilter(name,value){
  if(!Object.hasOwn(this.filters,name))return;
  this.filters[name]=String(value||'').slice(0,120);
  if(name==='country'){
   this.filters.state='';this.filters.city='';
   this.filters.stateManual='';this.filters.cityManual='';
  }
  if(name==='state'){
   this.filters.city='';this.filters.cityManual='';
  }
 }
 filteredQuery(){
  const f=this.filters,industry=industries.find(x=>x.label===f.industry);
  if(!f.country||!f.industry)return '';
  if(!industry?.supported)throw new Error('This sector is in the target catalogue, but no discovery connector is enabled for it yet. Choose a supported directory category.');
  const country=countries.find(c=>c.code===f.country);
  if(!country)throw new Error('Choose a country');
  const state=f.state==='__other__'?f.stateManual.trim():f.state.trim();
  const city=f.city==='__other__'?f.cityManual.trim():f.city.trim();
  if(f.state==='__other__'&&!state)throw new Error('Enter the unlisted state/province name.');
  if(f.city==='__other__'&&!city)throw new Error('Enter the unlisted city name.');
  const place=[city||state,country.name].filter(Boolean).join(', ');
  const quantity=Math.max(1,Math.min(50,Number(f.quantity)||20));
  return 'Find '+quantity+' '+industry.searchTerm+' in '+place+'.';
 }
 fieldUI(){
  const f=this.filters;
  const option=(value,label,selected)=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
  const countryOpts=countries.map(c=>option(c.code,c.name,f.country)).join('');
  const states=stateOptions(f.country);
  const chosenState=states.find(x=>x.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===String(f.state).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase())||f.state;
  const stateOpts=states.map(x=>option(x,x,chosenState)).join('');
  const cities=cityOptions(f.country,chosenState);
  const cityOpts=cities.map(x=>option(x,x,f.city)).join('');
  const industryGroups=[...new Set(industries.map(x=>x.group))].map(group=>'<optgroup label="'+esc(group)+'">'+industries.filter(x=>x.group===group).map(x=>option(x.label,x.label+(x.supported?'':' (source pending)'),f.industry)).join('')+'</optgroup>').join('');
  const stateManual=f.state==='__other__'?'<input name="stateManual" data-research-filter type="text" maxlength="100" placeholder="Type unlisted state/province" value="'+esc(f.stateManual)+'" aria-label="Unlisted state or province">':'';
  const cityManual=f.city==='__other__'?'<input name="cityManual" data-research-filter type="text" maxlength="100" placeholder="Type unlisted city" value="'+esc(f.cityManual)+'" aria-label="Unlisted city">':'';
  return '<div class="research-filtergrid" aria-label="Global business research filters">'+
    '<label>Country<select name="country" data-research-filter><option value="">Choose country</option>'+countryOpts+'</select></label>'+
    '<label>State / Province<select name="state" data-research-filter '+(f.country?'':'disabled')+'><option value="">'+(f.country?'Choose state / province':'Choose country first')+'</option>'+stateOpts+option('__other__','Other / Enter manually',f.state)+'</select>'+stateManual+'</label>'+
    '<label>City<select name="city" data-research-filter '+(f.country&&(f.state||!states.length)?'':'disabled')+'><option value="">'+(f.state?(cities.length?'Choose city':'No cities listed, choose Other'):'Choose state first')+'</option>'+cityOpts+option('__other__','Other / Enter manually',f.city)+'</select>'+cityManual+'</label>'+
    '<label>Industry<select name="industry" data-research-filter><option value="">Choose sector</option>'+industryGroups+'</select></label>'+
    '<label>Quantity<input type="number" min="1" max="50" step="1" name="quantity" data-research-filter value="'+esc(f.quantity)+'"></label>'+
    '</div><p class="research-filterhint">Geography: '+(hasCountryGeography(f.country)?'CSC verified snapshot loaded':'offline backup suggestions; full CSC snapshot not loaded')+' · Data © <a href="https://github.com/dr5hn/countries-states-cities-database" target="_blank" rel="noopener noreferrer">CSC contributors (ODbL 1.0)</a>. Select Other to enter missing places.</p>';
 }
 dispatchHelp(reason=this.lastDispatch){
  if(reason==='edge_request_failed_http_422'||reason==='unsupported_city_or_business_query')return 'This query cannot be handled by the free discovery connector. Choose a supported industry, city and country.';
  if(reason==='edge_request_failed_http_409'||reason.startsWith('job_already_'))return 'This research is already running or complete. Refresh the results.';
  if(reason==='edge_request_failed_http_403')return 'Cloud authentication failed. Sign out and sign in again.';
  return 'Instant Supabase research unavailable ('+reason+'). Check Supabase Edge Function logs.';
 }
 async dispatch(jobId){
  if(!jobId)return 'invalid_job';
  const previous=this.dispatchAttempts.get(jobId)||{count:0,at:0};
  this.dispatchAttempts.set(jobId,{count:previous.count+1,at:Date.now()});
  this.dispatchFor=jobId;this.lastDispatch='requesting';
  const payload={job_id:jobId};
  const f=this.filters,job=this.jobs.find(x=>x.id===jobId);
  const point=cityPoint(f.country,f.state,f.city);
  // Use accurate CSC location coordinates only for the exact filter-generated query.
  if(point&&job){
   try{if(job.query.trim()===this.filteredQuery().trim())payload.location=point;}
   catch{/* manual natural-language query needs server-side country scoping */}
  }
  try{
   const result=await this.api.invoke('aevone-research-now',payload);
   this.lastDispatch=result?.accepted===true?'requested':String(result?.reason||'edge_dispatch_unavailable');
   if(result?.accepted===true)await this.refresh();
  }catch(error){
   this.lastDispatch='edge_request_failed'+(error?.status?'_http_'+error.status:'');
   if(error?.message)this.error=String(error.message).slice(0,250);
  }
  return this.lastDispatch;
 }
 render(){const j=this.current;return `<div class="leadchat-header"><div><div class="eyebrow">AEVONE LEAD INTELLIGENCE</div><h2>Research businesses, naturally.</h2><p>Real source-backed results. No invented decision-makers, emails or audit claims.</p></div><span class="research-pill">Global research queue</span></div>
 <div class="research-layout"><aside class="research-sidebar"><div class="research-sidehead"><strong>Research history</strong><button type="button" data-lead-act="refresh" title="Reload results">↻</button><button type="button" data-lead-act="new" aria-label="New research">+</button></div><div class="research-sidejobs">${this.jobs.map(x=>`<button class="research-job ${x.id===this.active?'chosen':''}" data-research-id="${esc(x.id)}"><strong>${esc(x.query.slice(0,65))}</strong><span>${esc(x.status)} · ${Number(x.result_count)||0} results</span></button>`).join('')||'<p>No research sessions yet.</p>'}</div><div class="research-disclaimer">Sources can be incomplete. Review records before outreach.</div></aside>
 <section class="research-main">${j?`<div class="research-thread"><div class="research-prompt">${esc(j.query)}</div><div class="research-answer"><strong>Research status: ${esc(j.status)}</strong>${j.status==='queued'?`<p>${j.id===this.dispatchFor&&this.lastDispatch==='requested'?'Supabase Edge worker launched. Collecting public records now.':j.id===this.dispatchFor&&this.lastDispatch!=='scheduled'?esc(this.dispatchHelp()):'Queued. Start instant research now.'}</p><button class="ghostbtn" type="button" data-lead-act="dispatch">Start instant research ↗</button>`:j.status==='running'?'<p>Collecting public directory records…</p>':j.status==='failed'?`<p>${esc(j.error||'Source unavailable')}</p>`:`<p>${Number(j.result_count)||0} directory listings returned. Identity and contact data remain unverified until reviewed.</p>`}</div>
 <div class="research-results">${(Array.isArray(j.results)?j.results:[]).map((x,i)=>`<article class="research-card"><div class="research-cardtop"><span class="research-monogram">${esc(x.name?.charAt(0)||'B')}</span><div><strong>${esc(x.name||'Unknown')}</strong><small>${esc([x.city,x.country].filter(Boolean).join(', '))}</small></div><span class="tag tag-unverified">Unverified</span></div><div class="research-fields"><span>Website: ${safeHref(x.website)?`<a href="${esc(x.website)}" target="_blank" rel="noopener noreferrer">Official site ↗</a>`:'Not available'}</span><span>Business phone: ${esc(x.phone||'Not available')}</span><span>Email: ${esc(x.email||'Not available')}</span><span>Founder/CEO: Not publicly verified</span>${x.apollo_match?`<span>Apollo organization match: ${esc(x.apollo_match.name||"Provider-listed")}, pending independent verification</span>`:""}<span>Confidence: ${esc(x.confidence||"Unverified")}</span>${String(x.source_name||"").startsWith("OpenStreetMap") ? '<span>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL)</span>' : ""}<span>Source: ${safeHref(x.source_url)?`<a href="${esc(x.source_url)}" target="_blank" rel="noopener noreferrer">${esc(x.source_name||'Source record')} ↗</a>`:'Not available'}</span></div><button class="ghostbtn" data-save-result="${i}">Save to CRM ↗</button></article>`).join('')}</div></div>`:`<div class="research-welcome"><span>✦</span><h3>Which businesses should we research?</h3><p>Describe a business category, city and country. Results contain source-linked, unverified listings.</p><div class="research-examples">Bakeries in Istanbul, Turkey · Perfume shops in Dubai, UAE · Hotels in Karachi, Pakistan</div></div>`}
 <form class="research-compose" id="research-form">${this.fieldUI()}<textarea name="query" maxlength="1000" rows="2" placeholder="Optional natural-language query. Leave blank to use the five filters.">${esc(this.draft)}</textarea><div><span>${this.busy?'Submitting research…':'Public-source discovery · Source URLs · CRM saving'}</span><button class="primary compact" type="submit" ${this.busy?'disabled':''}>Research ↗</button></div></form></section></div>`;}
 async submit(q){
  if(this.busy)return;
  let val=String(q||'').trim();
  if(!val)val=this.filteredQuery();
  if(val.length<2||val.length>1000)throw new Error('Enter a research prompt or select country and industry.');
  this.busy=true;
  try{
   const result=await this.api.table('aevone_research_jobs',{method:'POST',body:{query:val,user_id:this.userId},headers:{Prefer:'return=representation'}});
   const created=result?.[0]?.id;
   if(!created)throw new Error('Research was not accepted: no job ID was returned');
   this.active=created;this.draft='';
   await this.refresh();
   await this.dispatch(created);
  }finally{this.busy=false;}
 }
 async save(i){const job=this.current;if(!job||job.status!=='complete')throw new Error('Research is not completed');const x=job.results?.[i];if(!x||!x.name||!x.source_url)throw new Error('Invalid research result');const body={name:x.name,city:x.city||'',country:x.country||'',website:x.website||'',source_name:x.source_name||'OpenStreetMap',source_url:x.source_url,created_by:this.userId,status:'unverified',notes:[x.phone?'Public phone (source-listed): '+x.phone:'',x.email?'Public email (source-listed): '+x.email:''].filter(Boolean).join('\n')};await this.api.table('aevone_leads',{method:'POST',body,headers:{Prefer:'return=representation'}});return x.name;}
}
