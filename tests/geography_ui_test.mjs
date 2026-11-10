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
