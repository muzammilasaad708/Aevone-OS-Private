import {esc} from './util.mjs';

export class BrainWorkspace {
 constructor(){this.reset();}
 reset(){this.chats=[];this.chatId=null;this.messages=[];this.providers=[];this.provider='auto';this.model='';this.models=[];this.loading=false;this.sending=false;this.error='';this.notice='';this.freeOnly=true;this.left=0;this.loaded=false;this.lastReply=null;this.api=null;this.userId=null;this.redraw=()=>{};}
 async load(api,userId,redraw){
  if(this.api&&this.userId!==userId)this.reset();
  this.api=api;this.userId=userId;this.redraw=redraw;
  if(this.loaded)return;
  this.loading=true;this.redraw();
  try{await Promise.all([this.refreshStatus(false),this.refreshChats(false)]);this.loaded=true;this.error='';}
  catch(e){this.error=e.message||'Unable to load AI Brain';}
  finally{this.loading=false;this.redraw();}
 }
 async refreshStatus(redraw=true){
  const reply=await this.api.invoke('aevone-brain');
  this.providers=reply.providers||[];this.freeOnly=reply.free_only!==false;this.left=Number(reply.remaining_today??0);
  if(redraw)this.redraw();
 }
 async refreshChats(redraw=true){
  this.chats=await this.api.table('aevone_ai_chats',{select:'id,title,created_at,updated_at',query:`user_id=eq.${encodeURIComponent(this.userId)}&order=updated_at.desc&limit=80`});
  if(redraw)this.redraw();
 }
 async chooseChat(id){
  if(this.sending)return;
  this.chatId=id;this.messages=[];this.error='';
  try{this.messages=await this.api.table('aevone_ai_messages',{select:'id,chat_id,role,content,provider,model,created_at',query:`chat_id=eq.${encodeURIComponent(id)}&order=created_at.asc&limit=120`});}
  catch(e){this.error=e.message;}
  this.redraw();this.scrollBottom();
 }
 async createChat(){this.chatId=null;this.messages=[];this.error='';this.lastReply=null;this.redraw();}
 async deleteChat(id){
  if(!confirm('Delete this conversation and its saved messages?'))return;
  await this.api.table('aevone_ai_chats',{method:'DELETE',query:`id=eq.${encodeURIComponent(id)}`});
  if(this.chatId===id){this.chatId=null;this.messages=[];}
  await this.refreshChats();
 }
 async chooseProvider(provider){
  if(this.sending)return;
  if(provider!=='auto'&&!this.providers.some(x=>x.id===provider))return;
  this.provider=provider;this.models=[];this.model='';this.error='';this.redraw();
  if(provider==='auto')return;
  const entry=this.providers.find(x=>x.id===provider);
  if(!entry?.connected){this.error='This provider is not configured. Add its credential in Connectors.';this.redraw();return;}
  if(this.freeOnly&&['paid','credits'].includes(entry.tier)){this.error='This provider is disabled by free-only mode. No chargeable calls will be made.';this.redraw();return;}
  try{
   this.loading=true;this.redraw();
   const data=await this.api.invoke('aevone-brain',{action:'models',provider});
   this.models=data.models||[];
   if(this.models.some(m=>m.id===data.default_model))this.model=data.default_model;
   else if(this.models.length)this.model=this.models[0].id;
   else this.model=data.default_model||'';
  }catch(e){this.error=e.message||'Could not load models';}
  finally{this.loading=false;this.redraw();}
 }
 async send(form){
  if(this.sending)return;
  const textarea=form.querySelector('[name=message]');const content=textarea?.value?.trim()||'';
  if(!content)return;
  if(content.length>5000){this.error='Message must be under 5000 characters';this.redraw();return;}
  const context=this.messages.slice(-15).map(m=>({role:m.role,content:m.content}));
  context.push({role:'user',content});
  // Match server context cap without silently deleting the new user turn.
  while(context.length>1&&context.reduce((n,m)=>n+m.content.length,0)>8000)context.shift();
  this.error='';this.sending=true;
  try{
   if(!this.chatId){
    const newChat=await this.api.table('aevone_ai_chats',{method:'POST',headers:{Prefer:'return=representation'},body:{user_id:this.userId,title:content.slice(0,75)}});
    this.chatId=newChat?.[0]?.id;
    if(!this.chatId)throw Error('Could not create a conversation in Supabase');
    await this.refreshChats(false);
   }
   const userMessage={role:'user',content,provider:'',model:'',created_at:new Date().toISOString()};
   const storedUser=await this.api.table('aevone_ai_messages',{method:'POST',headers:{Prefer:'return=representation'},body:{chat_id:this.chatId,user_id:this.userId,...userMessage}});
   this.messages.push(storedUser?.[0]||userMessage);
   this.redraw();this.scrollBottom();
   const response=await this.api.invoke('aevone-brain',{action:'chat',provider:this.provider,model:this.provider==='auto'?'':this.model,messages:context});
   if(!response?.answer||typeof response.answer!=='string')throw Error('Provider returned an empty response');
   const assistant={chat_id:this.chatId,user_id:this.userId,role:'assistant',content:response.answer,provider:response.provider,model:response.model};
   const saved=await this.api.table('aevone_ai_messages',{method:'POST',headers:{Prefer:'return=representation'},body:assistant});
   this.messages.push(saved?.[0]||assistant);
   this.lastReply=response;this.left=Math.max(0,this.left-1);
   await this.api.table('aevone_ai_chats',{method:'PATCH',query:`id=eq.${encodeURIComponent(this.chatId)}`,body:{updated_at:new Date().toISOString()}});
   await this.refreshChats(false);
  }catch(e){this.error=(e?.message||'AI request failed')+'. Your message remains saved for retry.';}
  finally{this.sending=false;this.redraw();this.scrollBottom();}
 }
 async onClick(button){
  const action=button.dataset.brainAction,id=button.dataset.brainId;
  try{
   if(action==='new')await this.createChat();
   else if(action==='chat'&&id)await this.chooseChat(id);
   else if(action==='delete'&&id)await this.deleteChat(id);
   else if(action==='refresh'){await this.refreshStatus();await this.refreshChats();this.error='';}
   else if(action==='copy'){const value=this.messages.filter(m=>m.role==='assistant').at(-1)?.content;if(value)await navigator.clipboard.writeText(value);}
   else if(action==='go-connectors')this.navigate?.('Connectors');
  }catch(e){this.error=e.message||'Request failed';this.redraw();}
 }
 scrollBottom(){requestAnimationFrame(()=>{const el=document.getElementById('brain-thread');if(el)el.scrollTop=el.scrollHeight;});}
 render(){
  const usable=this.providers.filter(x=>x.connected&&!(this.freeOnly&&['paid','credits'].includes(x.tier)));
  const chosen=this.providers.find(x=>x.id===this.provider);
  const items=this.messages.map(m=>`<article class="brain-message ${m.role==='user'?'from-user':'from-ai'}"><div class="brain-msg-avatar">${m.role==='user'?'YOU':'✦'}</div><div class="brain-msg-body"><div class="brain-msg-meta">${m.role==='user'?'You':(m.provider||'AEVONE AI')}${m.model?' · '+esc(m.model):''}</div><div class="brain-msg-content">${esc(m.content)}</div></div></article>`).join('');
  return `<div class="brain-header"><div><div class="eyebrow">AEVONE INTELLIGENCE SYSTEM</div><h2>Master AI Brain<span class="brain-spark"> ✦</span></h2><p>One workspace, multiple model providers. Real responses, secure cloud history.</p></div><div class="brain-head-actions"><span class="brain-usage">${this.freeOnly?'Free-only guard ON':'Paid providers permitted'} · ${this.left} requests remaining</span><button class="ghostbtn" data-brain-action="refresh" type="button">↻ Refresh</button></div></div>
  <div class="brain-frame"><aside class="brain-conversations"><div class="brain-conv-head"><strong>Conversations</strong><button data-brain-action="new" class="brain-new" title="New chat" type="button">＋</button></div><div class="brain-conv-list">${this.chats.length?this.chats.map(x=>`<div class="brain-conv ${this.chatId===x.id?'is-active':''}"><button type="button" class="brain-conv-title" data-brain-action="chat" data-brain-id="${esc(x.id)}">${esc(x.title)}</button><button type="button" class="brain-conv-delete" aria-label="Delete conversation" data-brain-action="delete" data-brain-id="${esc(x.id)}">×</button></div>`).join(''):'<p class="brain-no-conv">Your conversations will be saved to Supabase.</p>'}</div><div class="brain-conv-foot">Private to your user account</div></aside>
   <div class="brain-main"><div class="brain-toolbar"><div class="brain-config"><label>Provider<select id="brain-provider" aria-label="Select AI provider" ${this.sending?'disabled':''}><option value="auto" ${this.provider==='auto'?'selected':''}>✦ Auto (free waterfall)</option>${this.providers.map(x=>`<option value="${esc(x.id)}" ${this.provider===x.id?'selected':''}>${esc(x.name)} · ${x.connected?'configured':'not configured'}${this.freeOnly&&['paid','credits'].includes(x.tier)?' · disabled':''}</option>`).join('')}</select></label><label>Model<select id="brain-model" aria-label="Select model" ${this.provider==='auto'||this.sending?'disabled':''}>${this.provider==='auto'?'<option>Auto-selected free model</option>':(this.models.length?this.models.map(m=>`<option value="${esc(m.id)}" ${this.model===m.id?'selected':''}>${esc(m.id)}</option>`).join(''):`<option value="${esc(this.model||'')}">${esc(this.model||'Select connected provider')}</option>`)}</select></label></div><div class="brain-status">${usable.length?'<span class="green-dot"></span> '+usable.length+' free-route providers configured':'No free provider configured'}</div></div>
   <div id="brain-thread" class="brain-thread">${!this.messages.length?`<div class="brain-welcome"><div class="brain-orbit">✦</div><div class="eyebrow">AEVONE AI BRAIN</div><h3>What are we building today?</h3><p>Ask for ideas, research planning, brand strategy, proposals or analysis. Responses are AI-generated and not automatically fact-checked.</p><div class="brain-suggestions"><span>Brand positioning</span><span>Creative concepts</span><span>Sales proposals</span><span>Client research planning</span></div></div>`:items}${this.sending?'<div class="brain-thinking"><span class="spinner"></span> AI provider is responding…</div>':''}</div>
   ${this.error?`<div class="brain-error" role="alert">${esc(this.error)}</div>`:''}
   <form id="brain-compose" class="brain-compose"><textarea name="message" required maxlength="5000" rows="2" placeholder="Ask the AI Brain anything..." ${this.sending?'disabled':''}></textarea><div class="brain-compose-row"><span>Free-only routing · AI answers require source checking</span><button type="submit" class="primary" ${this.sending?'disabled':''}>${this.sending?'Thinking…':'Send ↗'}</button></div></form>
   </div><aside class="brain-providers"><div class="sectionover">MODEL NETWORK</div><h3>Provider connections</h3><div class="brain-provider-list">${this.providers.map(x=>`<div class="brain-provider"><span class="brain-light ${x.connected?'on':''}"></span><div><strong>${esc(x.name)}</strong><small>${x.connected?'Key configured':'Credential needed'} · ${esc(x.tier)}</small></div></div>`).join('')}</div><button class="ghostbtn" data-brain-action="go-connectors" type="button">Manage connectors ↗</button><div class="brain-safe-note">AI responses aren't proof of business facts. Lead verification requires independent source evidence.</div></aside>
  </div>`;
 }
}
