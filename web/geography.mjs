// AEVONE worldwide targeting: 195 states in the supplied reference, ISO country codes.
// City/state suggestions are examples only. Free text is accepted for unlisted places.
// Display labels are country names only; no businesses are inferred from this catalogue.
const countryCodes = "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CR CI HR CU CY CZ CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");
const englishNames = new Intl.DisplayNames(["en"],{type:"region"});
const overrides = {TR:"Turkey",US:"United States",AE:"United Arab Emirates",GB:"United Kingdom",PS:"Palestine",VA:"Vatican City",CI:"Côte d'Ivoire",CZ:"Czechia",KR:"South Korea",KP:"North Korea"};
export const countries = countryCodes.map(code=>({code,name:overrides[code]||englishNames.of(code)}))
  .sort((a,b)=>a.name.localeCompare(b.name));
if(countries.length!==195 || new Set(countries.map(x=>x.code)).size!==195) throw new Error("Country catalogue count mismatch");

// State/province examples from the submitted geography reference, supplemented
// with widely used city names. NEVER treat this as an exhaustive gazetteer.
export const locations = {
 PK: {"Sindh":["Karachi","Hyderabad","Sukkur","Larkana"],"Punjab":["Lahore","Faisalabad","Multan","Rawalpindi","Sialkot","Gujranwala"],"Balochistan":["Quetta","Gwadar","Turbat","Khuzdar"],"Khyber Pakhtunkhwa":["Peshawar","Mardan","Abbottabad","Swat"],"Islamabad Capital Territory":["Islamabad"],"Gilgit-Baltistan":["Gilgit","Skardu","Hunza"],"Azad Jammu and Kashmir":["Muzaffarabad","Mirpur"]},
 TR: {"Istanbul":["Istanbul"],"Ankara":["Ankara"],"Izmir":["Izmir"],"Bursa":["Bursa"],"Antalya":["Antalya","Alanya"],"Adana":["Adana"],"Gaziantep":["Gaziantep"],"Muğla":["Bodrum","Fethiye"],"Konya":["Konya"],"Trabzon":["Trabzon"]},
 AE: {"Dubai":["Dubai","Hatta"],"Abu Dhabi":["Abu Dhabi","Al Ain"],"Sharjah":["Sharjah","Khor Fakkan"],"Ajman":["Ajman"],"Ras Al Khaimah":["Ras Al Khaimah"],"Fujairah":["Fujairah"],"Umm Al Quwain":["Umm Al Quwain"]},
 SA: {"Riyadh":["Riyadh"],"Makkah":["Makkah","Jeddah","Taif"],"Madinah":["Madinah","AlUla"],"Eastern Province":["Dammam","Khobar","Dhahran"],"Asir":["Abha"],"Tabuk":["Tabuk"]},
 US: {"New York":["New York City","Buffalo"],"California":["Los Angeles","San Francisco","San Diego"],"Texas":["Houston","Dallas","Austin"],"Illinois":["Chicago"],"Washington":["Seattle"],"Florida":["Miami","Orlando"],"District of Columbia":["Washington DC"],"Massachusetts":["Boston"],"Nevada":["Las Vegas"]},
 CA: {"Ontario":["Toronto","Ottawa"],"British Columbia":["Vancouver","Victoria"],"Quebec":["Montreal","Quebec City"],"Alberta":["Calgary","Edmonton"],"Nova Scotia":["Halifax"],"Manitoba":["Winnipeg"]},
 IT: {"Lazio":["Rome"],"Lombardy":["Milan","Bergamo"],"Campania":["Naples"],"Veneto":["Venice","Verona"],"Tuscany":["Florence","Pisa"],"Piedmont":["Turin"],"Emilia-Romagna":["Bologna"],"Sicily":["Palermo","Catania"]},
 GB: {"England":["London","Manchester","Birmingham","Bristol","Oxford"],"Scotland":["Edinburgh","Glasgow"],"Wales":["Cardiff","Swansea"],"Northern Ireland":["Belfast"]},
 IN: {"Maharashtra":["Mumbai","Pune"],"Delhi":["New Delhi"],"Karnataka":["Bengaluru"],"Telangana":["Hyderabad"],"Tamil Nadu":["Chennai"],"West Bengal":["Kolkata"],"Gujarat":["Ahmedabad"],"Uttar Pradesh":["Lucknow"]},
 DE: {"Berlin":["Berlin"],"Bavaria":["Munich","Nuremberg"],"Hamburg":["Hamburg"],"Hesse":["Frankfurt","Wiesbaden"],"North Rhine-Westphalia":["Cologne","Düsseldorf"],"Saxony":["Leipzig","Dresden"]},
 FR: {"Île-de-France":["Paris"],"Auvergne-Rhône-Alpes":["Lyon"],"Provence-Alpes-Côte d'Azur":["Marseille","Nice"],"Nouvelle-Aquitaine":["Bordeaux"],"Occitanie":["Toulouse"],"Grand Est":["Strasbourg"]},
 AU: {"New South Wales":["Sydney"],"Victoria":["Melbourne"],"Queensland":["Brisbane","Gold Coast"],"Western Australia":["Perth"],"South Australia":["Adelaide"],"Australian Capital Territory":["Canberra"]},
 JP: {"Tokyo":["Tokyo"],"Osaka":["Osaka"],"Kyoto":["Kyoto"],"Hokkaido":["Sapporo"],"Aichi":["Nagoya"],"Fukuoka":["Fukuoka"]},
 KR: {"Seoul":["Seoul"],"Busan":["Busan"],"Incheon":["Incheon"],"Daegu":["Daegu"],"Gyeonggi":["Suwon"]},
 CN: {"Beijing":["Beijing"],"Shanghai":["Shanghai"],"Guangdong":["Guangzhou","Shenzhen"],"Sichuan":["Chengdu"],"Zhejiang":["Hangzhou"]},
 ZA: {"Gauteng":["Johannesburg","Pretoria"],"Western Cape":["Cape Town"],"KwaZulu-Natal":["Durban"]},
 BR: {"São Paulo":["São Paulo"],"Rio de Janeiro":["Rio de Janeiro"],"Bahia":["Salvador"],"Federal District":["Brasília"]},
 QA: {"Doha":["Doha"],"Al Rayyan":["Al Rayyan"],"Al Wakrah":["Al Wakrah"],"Al Daayen":["Lusail"]},
 OM: {"Muscat":["Muscat"],"Dhofar":["Salalah"],"North Al Batinah":["Sohar"]}
};
export function stateOptions(code){return Object.keys(locations[code]||{}).sort();}
export function cityOptions(code,state=""){
 const states=locations[code]||{};
 return [...new Set((state&&states[state] ? states[state] : Object.values(states).flat()))].sort();
}
// Only supported OS source categories are enabled for research. Other sectors
// remain visible as target categories, not falsely claimed as live integrations.
const sectorRows = {
 "Beauty & Personal Care":[["Women's Beauty Salons","salons"],["Barbers & Grooming","barbers"],["Cosmetics Stores","cosmetics stores"],["Perfume Stores","perfume shops"],["Beauty & Wellbeing"],["Personal Care"],["Hair Care"],["Skin Care"],["Oral Care"],["Feminine Care"],["Intimate Wellness"],["Hygiene"],["Germ Protection"],["Personal Health Care"]],
 "Food & FMCG":[["Bakeries","bakeries"],["Restaurants","restaurants"],["Coffee Shops & Cafés","cafes"],["Supermarkets","supermarkets"],["Nutrition & Foods"],["Baby & Infant Nutrition"],["Bottled Water"],["Dairy & Creamers"],["Chocolate & Confectionery"],["Culinary"],["Frozen Foods"],["Prepared Foods"],["Drinks & Beverages"],["Snacks"],["Breakfast & Pantry"],["Cookies & Biscuits"],["Baked Snacks"],["Gum & Mints"],["Spices & Recipe Mixes"],["Cooking Oil & Ghee"],["Pet Food"]],
 "Fashion & Luxury":[["Fashion & Clothing Stores","clothing stores"],["Jewellery Stores","jewellery stores"],["Fashion Brands"],["Perfume Brands"],["Watches & Timepieces"],["Footwear"],["Accessories"],["Luxury Goods"]],
 "Automotive & Mobility":[["Car Dealerships","car dealers"],["Car Wash Services","car wash"],["Automobile Manufacturers"],["Auto Parts"],["Electric Vehicles"],["Mobility Services"]],
 "Home & Household":[["Home Care"],["Fabric Care"],["Family Care"],["Household Care"],["Commercial Care"],["Baby Care"],["Furniture"],["Home Decor"],["Cleaning Services"]],
 "Healthcare & Wellness":[["Medical Clinics","clinics"],["Pharmacies","pharmacies"],["Dental Practices","dentists"],["Gyms & Fitness Centres","gyms"],["Healthcare"],["Nutrition"],["Supplements"],["Self Care & Health"],["Oral Health"],["Pet Health"],["Skin Health"],["Hospitals"]],
 "Technology & Finance":[["Electronics Stores","electronics stores"],["IT Services"],["Software & SaaS"],["Mobile & Telecom"],["FinTech"],["EdTech"],["E-commerce"],["Cybersecurity"],["Cloud Services"],["Artificial Intelligence"],["Banking & Microfinance"]],
 "Other Target Sectors":[["Hotels","hotels"],["Schools","schools"],["Bookshops","bookshops"],["Florists","florists"],["Real Estate"],["Hospitality & Tourism"],["Education"],["Logistics"],["Construction"],["Manufacturing"],["Energy"],["Media & Entertainment"],["Professional Services"],["Agriculture"],["Sports & Leisure"],["Pet Care"]]
};
export const industries=Object.entries(sectorRows).flatMap(([group,items])=>items.map(entry=>({group,label:entry[0],searchTerm:entry[1]||null,supported:!!entry[1]})));
