// Minimal Deno type for optional offline TypeScript checking.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
// AEVONE OS: owner-only encrypted API connector vault.
// No external npm deps. Compatible with Supabase Edge Functions (Deno).
const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const allowedIds = new Set(['openai','gemini','deepseek','grok','kimi','qwen','together','huggingface','apollo','apify','zoominfo','rapidapi','other','openrouter','groq','cerebras','mistral','cohere','siliconflow']);
const allowedOrigins = new Set([
  'http://localhost:4173', 'http://127.0.0.1:4173',
  ...(Deno.env.get('AEVONE_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim()).filter(Boolean),
]);
function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return origin && allowedOrigins.has(origin) ? {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  } : {};
}
function output(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    ...cors(req), 'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
  } });
}
async function adminRest(path: string, method='GET', body?: unknown) {
  const result = await fetch(`${projectUrl}${path}`, {
    method, headers:{ apikey:serviceKey, Authorization:`Bearer ${serviceKey}`,
      'Content-Type':'application/json', Prefer:'return=representation,resolution=merge-duplicates' },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(`Backend request failed (${result.status})`);
  return data;
}
async function owner(req: Request): Promise<{ userId: string } | null> {
  const match = /^Bearer (\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!match || !projectUrl || !serviceKey) return null;
  // Auth verifies the bearer token server-side; never trust decoded claims alone.
  const auth = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: {apikey:serviceKey,Authorization:`Bearer ${match[1]}`},
  });
  if (!auth.ok) return null;
  const person = await auth.json();
  if (!person?.id) return null;
  const members = await adminRest(`/rest/v1/aevone_workspace_members?select=role,status&user_id=eq.${encodeURIComponent(person.id)}&limit=1`);
  if (members?.[0]?.role !== 'owner' || members?.[0]?.status !== 'active') return null;
  return {userId:person.id};
}
const toBase64 = (v: Uint8Array): string => btoa(Array.from(v, x => String.fromCharCode(x)).join(''));
function fromBase64(v: string): Uint8Array {
  return Uint8Array.from(atob(v), c => c.charCodeAt(0));
}
async function encrypt(value: string, connectorId: string) {
  const encoded = Deno.env.get('AEVONE_VAULT_KEY_B64');
  if (!encoded) throw new Error('Vault encryption secret not configured');
  const raw = fromBase64(encoded);
  if (raw.byteLength !== 32) throw new Error('Vault encryption key must be 32 bytes');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode(connectorId)},key,new TextEncoder().encode(value));
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), nonce:toBase64(nonce) };
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && !allowedOrigins.has(origin)) return output(req,403,{error:'This site origin is not allowed'});
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors(req)});
  if (!['GET','POST'].includes(req.method)) return output(req,405,{error:'Method not allowed'});
  try {
    const actor = await owner(req);
    if (!actor) return output(req,403,{error:'Owner sign-in required'});
    if (req.method === 'GET') {
      const items = await adminRest('/rest/v1/aevone_connector_credentials?select=connector_id,updated_at,updated_by&order=connector_id.asc');
      return output(req,200,{vault_ready:Boolean(Deno.env.get('AEVONE_VAULT_KEY_B64')),items});
    }
    const length = Number(req.headers.get('content-length') ?? 0);
    if (length > 25000) return output(req,413,{error:'Request too large'});
    const payload = await req.json().catch(() => null);
    const connectorId = String(payload?.connector_id ?? '');
    const action = String(payload?.action ?? '');
    if (!allowedIds.has(connectorId)) return output(req,400,{error:'Unsupported connector'});
    if (action === 'remove') {
      await adminRest(`/rest/v1/aevone_connector_credentials?connector_id=eq.${encodeURIComponent(connectorId)}`,'DELETE');
      return output(req,200,{ok:true,connector_id:connectorId});
    }
    if (action !== 'set') return output(req,400,{error:'Invalid action'});
    const value = payload?.value;
    if (typeof value !== 'string' || value.trim().length < 12 || value.length > 16000) {
      return output(req,400,{error:'Provide a valid provider API key (12 to 16000 characters)'});
    }
    const encrypted = await encrypt(value.trim(),connectorId);
    await adminRest('/rest/v1/aevone_connector_credentials?on_conflict=connector_id','POST',{
      connector_id: connectorId,...encrypted,updated_by:actor.userId,updated_at:new Date().toISOString(),
    });
    // Never return plaintext, ciphertext, nonce, key length or key prefix.
    return output(req,200,{ok:true,connector_id:connectorId});
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return output(req,detail.includes('not configured')?503:500,{error:detail.includes('Vault encryption')?'Vault needs secure server configuration':'Request failed'});
  }
});

export {};
