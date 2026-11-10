import assert from 'node:assert/strict';
import { countries, stateOptions, cityOptions, industries } from '../web/geography.mjs';
import { LeadWorkspace } from '../web/lead.mjs';

// Strict country-count regression: 195 recognized states (including 2 observers).
assert.equal(countries.length,195);
assert.equal(new Set(countries.map(x=>x.code)).size,195);
for (const code of ['PK','TR','AE','US','CA','SA','IT','GB','PS','VA']) {
 assert.ok(countries.some(x=>x.code===code),code+' absent');
}
assert.ok(stateOptions('PK').includes('Sindh'));
assert.equal(stateOptions('TR').length,81, 'All 81 Turkish provinces should be available');
assert.equal(stateOptions('AE').length,7, 'All UAE emirates should be available');
assert.ok(stateOptions('AL').includes('Kukës'), 'The PDF Albania regions must be indexed');
assert.ok(cityOptions('AL','Kukës').includes('Bajram Curri'), 'The supplied PDF city must be available');
assert.ok(cityOptions('AL','Shkodër').includes('Bajzë'), 'The supplied PDF town must be available');
assert.ok(cityOptions('TR','İstanbul').includes('Istanbul'), 'Localised Turkish province name must match the Istanbul city');
assert.ok(cityOptions('PK','Sindh').includes('Karachi'), 'Local Pakistan city fallback remains available');
assert.ok(stateOptions('VA').length===0, 'Vatican City has no provinces and must not be invented');

assert.ok(cityOptions('PK','Sindh').includes('Karachi'));
assert.ok(cityOptions('TR','Istanbul').includes('Istanbul'));
assert.deepEqual(cityOptions('WS',''),[]); // No invented city labels.
const w=new LeadWorkspace();
w.setFilter('country','TR');
w.setFilter('state','Istanbul');
w.setFilter('city','Istanbul');
w.setFilter('industry','Bakeries');
w.setFilter('quantity','30');
assert.equal(w.filteredQuery(),'Find 30 bakeries in Istanbul, Turkey.');
assert.match(w.fieldUI(),/name="country"/);
assert.match(w.fieldUI(),/name="city"/);
assert.match(w.fieldUI(),/name="state"/);
assert.match(w.fieldUI(),/name="industry"/);
assert.match(w.fieldUI(),/name="quantity"/);
assert.match(w.fieldUI(),/<select name="state"/);
assert.match(w.fieldUI(),/<select name="city"/);
assert.doesNotMatch(w.fieldUI(),/<input name="city" list=/);
w.setFilter('state','__other__');
w.setFilter('stateManual','Istanbul Province');
w.setFilter('city','__other__');
assert.match(w.fieldUI(),/name="cityManual"/);
assert.throws(()=>w.filteredQuery(),/unlisted city name/);
w.setFilter('cityManual','Istanbul');
assert.match(w.filteredQuery(),/bakeries in Istanbul, Turkey/);
w.setFilter('state','Istanbul');
w.setFilter('city','Istanbul');

assert.ok(industries.find(x=>x.label==='Personal Care'));
assert.ok(industries.find(x=>x.label==='FinTech'));
assert.ok(industries.find(x=>x.label==='EdTech'));
w.setFilter('industry','FinTech');
assert.throws(()=>w.filteredQuery(),/no discovery connector/);
w.setFilter('country','AE');
assert.equal(w.filters.city,'');
assert.equal(w.filters.state,'');
w.setFilter('city','Dubai');
w.setFilter('industry','Perfume Stores');
assert.match(w.filteredQuery(),/perfume shops in Dubai, United Arab Emirates/);
const stored=[];
w.userId='test-user';
w.api={
 table:async (_table,{method}={})=>{
   if(method==='POST')return [{id:'bbbbbbbb-1111-2222-3333-aaaaaaaaaaaa'}];
   return [{id:'bbbbbbbb-1111-2222-3333-aaaaaaaaaaaa',query:'Find 20 perfume shops in Dubai, United Arab Emirates.',status:'queued',result_count:0,results:[]}];
 },
 invoke:async(fn,body)=>{stored.push({fn,body});return {dispatched:true};}
};
await w.submit('Find 20 perfume shops in Dubai, United Arab Emirates.');
assert.equal(w.lastDispatch,'requested');
assert.equal(stored.length,1);
assert.equal(stored[0].fn,'aevone-dispatch');
assert.equal(w.dispatchAttempts.get(w.active).count,1);
await w.dispatch(w.active);
assert.equal(w.dispatchAttempts.get(w.active).count,2);
console.log('195 country options, 5 filters, regional suggestions and instant dispatch passed.');
