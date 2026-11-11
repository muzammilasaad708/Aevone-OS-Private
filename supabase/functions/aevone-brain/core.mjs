// AEVONE AI Brain: shared, deterministic request validation and provider registry.
// Never put credentials in this module.
export const PROVIDERS=Object.freeze({
 openrouter:{name:'OpenRouter',url:'https://openrouter.ai/api/v1/chat/completions',models:'https://openrouter.ai/api/v1/models',defaultModel:'openrouter/free',tier:'free',env:'OPENROUTER_API_KEY'},
 groq:{name:'Groq Cloud',url:'https://api.groq.com/openai/v1/chat/completions',models:'https://api.groq.com/openai/v1/models',defaultModel:'llama-3.3-70b-versatile',tier:'free-tier',env:'GROQ_API_KEY'},
 gemini:{name:'Google Gemini',url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',models:'https://generativelanguage.googleapis.com/v1beta/models',defaultModel:'gemini-2.5-flash',tier:'free-tier',env:'GEMINI_API_KEY'},
 huggingface:{name:'Hugging Face',url:'https://router.huggingface.co/v1/chat/completions',models:'https://router.huggingface.co/v1/models',defaultModel:'openai/gpt-oss-120b:fastest',tier:'credits',env:'HUGGINGFACE_TOKEN'},
 cerebras:{name:'Cerebras',url:'https://api.cerebras.ai/v1/chat/completions',models:'https://api.cerebras.ai/v1/models',defaultModel:'llama3.1-8b',tier:'free-tier',env:'CEREBRAS_API_KEY'},
 openai:{name:'OpenAI',url:'https://api.openai.com/v1/chat/completions',models:'https://api.openai.com/v1/models',defaultModel:'gpt-4.1-mini',tier:'paid',env:'OPENAI_API_KEY'},
 deepseek:{name:'DeepSeek',url:'https://api.deepseek.com/chat/completions',models:'https://api.deepseek.com/models',defaultModel:'deepseek-chat',tier:'paid',env:'DEEPSEEK_API_KEY'},
 grok:{name:'xAI Grok',url:'https://api.x.ai/v1/chat/completions',models:'https://api.x.ai/v1/models',defaultModel:'grok-3-mini',tier:'paid',env:'XAI_API_KEY'},
 together:{name:'Together AI',url:'https://api.together.xyz/v1/chat/completions',models:'https://api.together.xyz/v1/models',defaultModel:'meta-llama/Llama-3.3-70B-Instruct-Turbo',tier:'paid',env:'TOGETHERAI_API_KEY'},
 mistral:{name:'Mistral',url:'https://api.mistral.ai/v1/chat/completions',models:'https://api.mistral.ai/v1/models',defaultModel:'mistral-small-latest',tier:'paid',env:'MISTRAL_API_KEY'},
 cohere:{name:'Cohere',url:'https://api.cohere.com/compatibility/v1/chat/completions',models:null,defaultModel:'command-r7b-12-2024',tier:'paid',env:'COHERE_API_KEY'},
 siliconflow:{name:'SiliconFlow',url:'https://api.siliconflow.com/v1/chat/completions',models:'https://api.siliconflow.com/v1/models',defaultModel:'Qwen/Qwen2.5-7B-Instruct',tier:'paid',env:'SILICONFLOW_API_KEY'},
});
export const AUTO_ORDER=Object.freeze(['openrouter','groq','gemini','cerebras']);
export const CHAT_MAX_MESSAGES=16;
export const CHAT_MAX_CHARS=8000;
export const MAX_REPLY_TOKENS=768;
export const DAILY_REQUEST_LIMIT=50;
export function validModel(model){return typeof model==='string'&&model.length>0&&model.length<=160&&/^[a-zA-Z0-9][a-zA-Z0-9._:\/+-]*$/.test(model);}
export function modelAllowed(provider,model,paid=false){
 const cfg=PROVIDERS[provider];if(!cfg||!validModel(model))return false;
 if(cfg.tier==='paid'&&!paid)return false;
 if(provider==='openrouter'&&!paid)return model==='openrouter/free'||model.endsWith(':free');
 if(provider==='huggingface'&&!paid)return false; // credits are NOT zero-cost unlimited.
 return true;
}
export function normalizeMessages(messages){
 if(!Array.isArray(messages)||messages.length<1||messages.length>CHAT_MAX_MESSAGES)throw new Error('Messages must contain 1–16 chat turns');
 let chars=0;const cleaned=[];
 for(const m of messages){
  if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string')throw new Error('Only text user and assistant messages are supported');
  const s=m.content.trim();if(s.length<1||s.length>5000)throw new Error('A message must contain 1–5000 characters');
  chars+=s.length; if(chars>CHAT_MAX_CHARS)throw new Error('Conversation context too long. Start a fresh chat.');
  cleaned.push({role:m.role,content:s});
 }
 if(cleaned.at(-1).role!=='user')throw new Error('Last chat message must be from the user');
 return cleaned;
}
export function normalizeRequest(body,{allowPaid=false}={}){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid chat request');
 const messages=normalizeMessages(body.messages);
 const provider=String(body.provider||'auto');
 if(provider!=='auto'&&!Object.hasOwn(PROVIDERS,provider))throw new Error('Unsupported AI provider');
 const model=body.model?String(body.model):'';
 if(provider!=='auto'&&!modelAllowed(provider,model||PROVIDERS[provider].defaultModel,allowPaid))throw new Error('This model is unavailable in free-only mode');
 if(provider==='auto'&&model)throw new Error('Auto routing does not accept a model override');
 return {provider,model, messages};
}
export function candidateRoutes(req,available,allowPaid=false){
 if(req.provider!=='auto'){
  const model=req.model||PROVIDERS[req.provider].defaultModel;
  return available.has(req.provider)&&modelAllowed(req.provider,model,allowPaid)?[{provider:req.provider,model}]:[];
 }
 return AUTO_ORDER.filter(k=>available.has(k)).map(k=>({provider:k,model:PROVIDERS[k].defaultModel})).filter(x=>modelAllowed(x.provider,x.model,allowPaid));
}
export function normalizedModels(provider,raw,{allowPaid=false}={}){
 if(!Object.hasOwn(PROVIDERS,provider))throw new Error('Unknown provider');
 const values=Array.isArray(raw?.data)?raw.data:(Array.isArray(raw?.models)?raw.models:[]);
 const mapped=values.map(item=>typeof item==='string'?{id:item}:({id:item?.id?.replace(/^models\//,'')||item?.name?.replace(/^models\//,'')||'',pricing:item?.pricing})).filter(x=>validModel(x.id));
 const filtered=mapped.filter(x=>modelAllowed(provider,x.id,allowPaid));
 return [...new Map(filtered.map(x=>[x.id,{id:x.id,free:provider==='openrouter'?x.id.endsWith(':free'):!allowPaid,pricing:x.pricing??null}])).values()].slice(0,150);
}
export function safeError(status){
 if(status===401||status===403)return 'Provider rejected the stored API credential or permissions';
 if(status===402)return 'Provider reports billing or credits required';
 if(status===400||status===422)return 'Provider rejected this model or request format';
 if(status===404)return 'The chosen model is not available on this provider';
 if(status===429)return 'Provider rate limit reached';
 if(status>=500)return 'Provider temporarily unavailable';
 return 'Provider request could not be completed';
}
// Failure of one *free* upstream (including an invalid key/model) must not
// suppress the other authorized free providers. Explicit provider stays strict.
export function shouldFallback(status){return [400,401,402,403,404,408,422,429,500,502,503,504].includes(status);}
export function extractText(data){
 const c=data?.choices?.[0]?.message?.content;
 if(typeof c==='string')return c.trim();
 if(Array.isArray(c))return c.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n').trim();
 return '';
}
export function cleanAnswer(s){return String(s??'').trim().slice(0,24000);}
export function providerStatus(providers,ready){return Object.entries(PROVIDERS).map(([id,p])=>({id,name:p.name,tier:p.tier,connected:providers.has(id),available:false}));}
export function originAllowed(origin,allowlist){return !origin || allowlist.has(origin);}
