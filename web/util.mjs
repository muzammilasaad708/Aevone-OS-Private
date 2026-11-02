export function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function safeHref(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}
export function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
export const providerNames = Object.freeze({
  openai:'OpenAI', gemini:'Gemini', deepseek:'DeepSeek', grok:'Grok', kimi:'Kimi', qwen:'Qwen',
  together:'Together AI',huggingface:'Hugging Face',apollo:'Apollo',apify:'Apify',
  zoominfo:'ZoomInfo',rapidapi:'RapidAPI',openrouter:'OpenRouter',groq:'Groq Cloud',cerebras:'Cerebras',mistral:'Mistral',cohere:'Cohere',siliconflow:'SiliconFlow',other:'Other'
});
export const navGroups = Object.freeze([
  [{name:'Dashboard',icon:'◫'},{name:'Profile',icon:'◉'},{name:'AI Brain',icon:'✦'},
   {name:'Lead Generation',icon:'⌕'},{name:'Verified Leads',icon:'✓'},{name:'Unverified Leads',icon:'◌'},
   {name:'Messages',icon:'✉'},{name:'Freelance Platforms',icon:'▣'}],
  [{name:'Packages',icon:'▤'},{name:'Brand Audit',icon:'✧'},{name:'Sales',icon:'↗'},
   {name:'Finance',icon:'◈'},{name:'HR',icon:'♧'},{name:'Connectors',icon:'⛓'},{name:'Team',icon:'♧'}],
]);
export function validateConfig(config) {
  if (!config || typeof config.url !== 'string' || typeof config.publishableKey !== 'string') return false;
  try {const u = new URL(config.url);return u.protocol === 'https:' && u.hostname.endsWith('.supabase.co') && config.publishableKey.length > 24 && !config.publishableKey.includes('YOUR_');}catch{return false;}
}
export function validateSecretInput(value) {return typeof value === 'string' && value.trim().length >= 12 && value.length <= 16000;}
export function csvSafe(value) { const text = String(value ?? ''); return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; }
export function asCsv(rows) {
  const heads=['Name','City','Country','Website','Status','Stage','Source','Source URL','Notes','Created'];
  const fields=['name','city','country','website','status','stage','source_name','source_url','notes','created_at'];
  const cell = x=> '"'+csvSafe(x).replaceAll('"','""')+'"';
  return '\ufeff'+[heads.map(cell).join(','),...rows.map(row=>fields.map(f=>cell(row[f])).join(','))].join('\r\n');
}
