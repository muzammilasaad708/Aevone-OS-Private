import assert from "node:assert/strict";
import {parseJob,overpassQL,normalizeListings} from "../supabase/functions/aevone-research-now/core.mjs";
const cases=[
 ["Find 30 bakeries in Istanbul, Turkey.","TR","bakery"],
 ["Find 50 salons in L'Aquila, Italy.","IT","hairdresser"],
 ["Find 20 women's beauty salons in Karachi, Pakistan.","PK","hairdresser"],
 ["Find 20 perfume shops in Dubai, United Arab Emirates.","AE","perfumery"],
 ["Find 30 restaurants in Toronto, Canada.","CA","restaurant"],
 ["Find 20 hotels in New York, United States.","US","hotel"]
];
for(const [query,code,value] of cases){
 const spec=parseJob(query);
 assert.equal(spec.code,code,query);
 assert.equal(spec.value,value,query);
 assert.match(overpassQL(spec),new RegExp('ISO3166-1.*'+code));
}
const geo=parseJob("Find 30 bakeries in Istanbul, Turkey.",{country_code:"TR",city:"Istanbul",latitude:41.006,longitude:28.97});
assert.match(overpassQL(geo),/around:18000,41.006,28.97/);
const malicious=parseJob("Find 30 bakeries in Istanbul, Turkey.",{country_code:"US",city:"New York",latitude:40,longitude:-74});
assert.equal(malicious.lat,null);assert.equal(malicious.lon,null);
assert.throws(()=>parseJob('Find 20 software companies in Dubai, UAE.'),/unsupported_business_category/);
assert.throws(()=>parseJob('Find 20 bakeries in Turkey.'),/city_country_required/);
assert.throws(()=>parseJob('Find 20 bakeries in Somewhere, NotRealCountry.'),/unknown_country_or_city/);
const fixture=[
 {id:123,type:"node",tags:{name:"Example Bakery",website:"https://example.org",phone:"+1234567"},lat:41.0,lon:28.9},
 {id:124,type:"node",tags:{name:"Example Bakery",website:"https://example.org"},lat:41.0,lon:28.91},
 {id:125,type:"way",tags:{name:"Second Bakery"},center:{lat:41.01,lon:28.92}}
];
const records=normalizeListings(fixture,geo);
assert.equal(records.length,2);
assert.equal(records[0].source_url,"https://www.openstreetmap.org/node/123");
assert.equal(records[0].confidence,"Source-listed; unverified");
assert.equal(records[1].source_url,"https://www.openstreetmap.org/way/125");
console.log("Instant global OSM search parser, country scope, real-source cards, and CSC coordinates: PASS");
