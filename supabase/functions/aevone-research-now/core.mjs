// Bounded directory discovery with public OSM provenance; no invented contacts.
const CODES="AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CR CI HR CU CY CZ CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");
const countries=new Intl.DisplayNames(["en"],{type:"region"});
function fold(x){return String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("en").replace(/\s+/g," ");}
const index=new Map(CODES.map(code=>[fold(countries.of(code)),code]));
for(const [alias,code] of Object.entries({"turkey":"TR","türkiye":"TR","turkiye":"TR","uae":"AE","ksa":"SA","usa":"US","america":"US","united states":"US","uk":"GB","britain":"GB","south korea":"KR","north korea":"KP","vatican city":"VA","palestine":"PS","iran":"IR","ivory coast":"CI","czechia":"CZ","vietnam":"VN","bolivia":"BO","syria":"SY"}))index.set(fold(alias),code);
const mapping=[
 [/\b(?:women'?s? beauty salons?|beauty salons?|salons?|hairdressers?|barbers?|grooming)\b/i,"shop","hairdresser"],
 [/\b(?:bakeries|bakery|bakers)\b/i,"shop","bakery"],
 [/\b(?:restaurants?)\b/i,"amenity","restaurant"],
 [/\b(?:hotels?)\b/i,"tourism","hotel"],
 [/\b(?:perfum(?:e|ery)(?: shops?| stores?| brands?)?|fragrance(?: shops?| stores?)?)\b/i,"shop","perfumery"],
 [/\b(?:cafes?|coffee shops?)\b/i,"amenity","cafe"],
 [/\b(?:clothing stores?|fashion stores?|clothes)\b/i,"shop","clothes"],
 [/\b(?:car dealerships?|car dealers?|car showroom)\b/i,"shop","car"],
 [/\b(?:cosmetics?(?: shops?| stores?)?)\b/i,"shop","cosmetics"],
 [/\b(?:clinics?)\b/i,"amenity","clinic"],
 [/\b(?:pharmacies|pharmacy)\b/i,"amenity","pharmacy"],
 [/\b(?:schools?)\b/i,"amenity","school"],
 [/\b(?:supermarkets?)\b/i,"shop","supermarket"],
 [/\b(?:dentists?|dental practices?)\b/i,"amenity","dentist"],
 [/\b(?:gyms?|fitness centres?|fitness centers?)\b/i,"leisure","fitness_centre"],
 [/\b(?:jewel(?:ry|lery) stores?)\b/i,"shop","jewelry"],
 [/\b(?:electronics?(?: stores?| shops?)?)\b/i,"shop","electronics"],
 [/\b(?:bookshops?|bookstores?)\b/i,"shop","books"],
 [/\b(?:florists?)\b/i,"shop","florist"],
 [/\b(?:banks?)\b/i,"amenity","bank"],
 [/\b(?:car washes?|car wash services?)\b/i,"amenity","car_wash"]
];
const validPlace=/^[\p{L}\p{M}\p{N}\s.'’\-]+$/u;
export function parseJob(query,location={}){
 const text=String(query||"").trim().replace(/[.!?]+$/,"");
 const m=/^(?:find|locate|research)\s+(\d{1,3})\s+(.+?)\s+(?:in|near|around)\s+(.+)$/i.exec(text);
 if(!m)throw Error("invalid_research_query");
 const limit=Math.min(50,Math.max(1,Number(m[1])));
 const category=mapping.find(row=>row[0].test(m[2]));if(!category)throw Error("unsupported_business_category");
 const parts=m[3].split(",").map(s=>s.trim()).filter(Boolean);
 if(parts.length<2)throw Error("city_country_required");
 const country=parts.at(-1),city=parts.slice(0,-1).join(", ");
 const code=index.get(fold(country));
 if(!code||!city||city.length>100||!validPlace.test(city))throw Error("unknown_country_or_city");
 const point=location&&location.country_code===code&&fold(location.city)===fold(city)?location:null;
 let lat=Number(point?.latitude),lon=Number(point?.longitude);
 if(!point||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){lat=null;lon=null;}
 return {limit,city,country,code,tag:category[1],value:category[2],lat,lon};
}
export function overpassQL(spec){
 const key=spec.tag,value=spec.value,basic="[out:json][timeout:14];";
 if(spec.lat!==null&&spec.lon!==null){
  const radius=spec.value==="hairdresser"||spec.value==="bakery"?18000:14000;
  return basic+'nwr["'+key+'"="'+value+'"]["name"](around:'+radius+','+spec.lat+','+spec.lon+');out center '+Math.min(140,spec.limit*4)+';';
 }
 const city=spec.city.replace(/\\/g,"\\\\").replace(/"/g,'\\"'),code=spec.code;
 return basic+'area["ISO3166-1"="'+code+'"][admin_level=2]->.country;'+
  '(area(area.country)["name"="'+city+'"][boundary=administrative];area(area.country)["name:en"="'+city+'"][boundary=administrative];)->.target;'+
  'nwr(area.target)["'+key+'"="'+value+'"]["name"];out center '+Math.min(140,spec.limit*4)+';';
}
export function normalizeListings(elements,spec){
 if(!Array.isArray(elements))throw Error("bad_osm_response");
 const found=[],seen=new Set();
 for(const row of elements){
  if(!row||!["node","way","relation"].includes(row.type)||!Number.isSafeInteger(row.id)||row.id<=0)continue;
  const tags=row.tags||{},name=String(tags.name||"").trim().slice(0,200);
  if(!name)continue;
  let website=String(tags.website||tags["contact:website"]||"").trim().slice(0,500);
  try{const u=new URL(website);if(!["https:","http:"].includes(u.protocol)||u.username||u.password||u.hostname==="localhost")website="";}catch{website="";}
  const dedup=fold(name)+"|"+website.toLowerCase();if(seen.has(dedup))continue;seen.add(dedup);
  const source_url="https://www.openstreetmap.org/"+row.type+"/"+row.id;
  found.push({name,city:spec.city,country:spec.country,website,
    phone:String(tags["contact:phone"]||tags.phone||"").slice(0,80),
    email:String(tags["contact:email"]||tags.email||"").slice(0,160),
    source_name:"OpenStreetMap",source_url,confidence:"Source-listed; unverified",
    lat:row.lat??row.center?.lat??null,lon:row.lon??row.center?.lon??null,
    evidence:[{field:"business_listing",provider:"OpenStreetMap",source_url,verified:false}]});
  if(found.length>=spec.limit)break;
 }
 return found;
}
