import assert from 'node:assert/strict';
import {shouldFallback, safeError, candidateRoutes, modelFallbacks, PROVIDERS} from '../supabase/functions/aevone-brain/core.mjs';
const upstreamFailures=[400,401,402,403,404,408,422,429,500,502,503,504];
for(const status of upstreamFailures)assert.equal(shouldFallback(status),true,'auto fallback: '+status);
assert.equal(shouldFallback(200),false);
assert.equal(shouldFallback(418),false);
assert.equal(candidateRoutes({provider:'auto'},new Set(['openrouter','groq','gemini','cerebras'])).length,4);
assert.equal(candidateRoutes({provider:'groq'},new Set(['openrouter','groq'])).length,1);
assert.match(safeError(400),/model or request format/i);
console.log('AI free-only waterfall fallback includes invalid model and provider key failures.');

assert.equal(PROVIDERS.groq.defaultModel,'openai/gpt-oss-120b');
assert.equal(PROVIDERS.gemini.defaultModel,'gemini-3.5-flash-lite');
assert.deepEqual(modelFallbacks('groq',[{id:'llama-3.3-70b-versatile'},{id:'openai/gpt-oss-120b'},{id:'openai/gpt-oss-20b'}],'llama-3.3-70b-versatile'),['openai/gpt-oss-120b','openai/gpt-oss-20b']);
assert.deepEqual(modelFallbacks('openrouter',[{id:'provider/paid-model'},{id:'provider/free:free'}],'openrouter/free'),['provider/free:free']);
assert.deepEqual(modelFallbacks('gemini',[{id:'gemini-3.5-flash-lite'},{id:'gemini-2.5-flash-image'},{id:'embedding-001'}],'gemini-2.5-flash'),['gemini-3.5-flash-lite']);
console.log('Current model catalog fallback: PASS');
