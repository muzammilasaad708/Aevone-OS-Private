"""Country-aware, evidence-first business search planning.

ISO 3166 countries and dependent territories come from pinned pycountry data.
Cities are free-form within an explicit country; no tiny hard-coded city allowlist.
Validation of actual business locations belongs to the source, not the parser.
"""
import re
import unicodedata
import pycountry

CATEGORIES = {
 'baker':'bakery', 'restaurant':'restaurant', 'clothing':'clothes', 'fashion':'clothes',
 'salon':'hairdresser', 'barber':'hairdresser', 'clinic':'clinic',
 'hotel':'hotel', 'hotal':'hotel', 'cafe':'cafe', 'coffee':'cafe',
 'pharmac':'pharmacy', 'school':'school', 'gym':'fitness_centre',
 'supermarket':'supermarket', 'shop':'shop', 'store':'shop',
 'perfum':'perfumery', 'fragrance':'perfumery', 'cosmetic':'cosmetics',
 'jewel':'jewelry', 'jewell':'jewelry', 'electronic':'electronics',
 'bookstore':'books', 'bookshop':'books', 'florist':'florist',
 'car wash':'car_wash', 'car dealer':'car', 'car showroom':'car',
 'dentist':'dentist', 'bank':'bank'
}
# Prefer the longest match to avoid "shop" beating "bookshop".
CATEGORIES = dict(sorted(CATEGORIES.items(), key=lambda pair: -len(pair[0])))

# Aliases are for recognition, NOT evidence of a real geospatial location.
COUNTRY_ALIASES = {
 'usa': ('US','United States'), 'u.s.a': ('US','United States'),
 'united states of america': ('US','United States'),
 'america': ('US','United States'), 'us': ('US','United States'),
 'uk': ('GB','United Kingdom'), 'britain': ('GB','United Kingdom'),
 'great britain': ('GB','United Kingdom'),
 'uae': ('AE','United Arab Emirates'),
 'emirates': ('AE','United Arab Emirates'),
 'ksa': ('SA','Saudi Arabia'),
 'saudi': ('SA','Saudi Arabia'),
 'turkey': ('TR','Turkey'), 'türkiye': ('TR','Turkey'),
 'turkiye': ('TR','Turkey'), 'italia': ('IT','Italy'),
 'pakistan': ('PK','Pakistan'),
}
CITY_DEFAULT_COUNTRIES = {
 'karachi':'Pakistan','lahore':'Pakistan','islamabad':'Pakistan',
 'rawalpindi':'Pakistan','faisalabad':'Pakistan','multan':'Pakistan',
 'peshawar':'Pakistan','hyderabad':'Pakistan','quetta':'Pakistan',
 'sialkot':'Pakistan','kpk':'Pakistan',
 'dubai':'United Arab Emirates','abu dhabi':'United Arab Emirates',
 'istanbul':'Turkey','ankara':'Turkey',
 'riyadh':'Saudi Arabia','makkah':'Saudi Arabia','mecca':'Saudi Arabia',
 'madinah':'Saudi Arabia','medina':'Saudi Arabia','jeddah':'Saudi Arabia',
 'new york':'United States','new york city':'United States',
 'washington dc':'United States','washington d.c.':'United States',
 'toronto':'Canada','vancouver':'Canada','rome':'Italy',
 'london':'United Kingdom'
}
CITY_ALIASES = {'istambol':'Istanbul','istanbul':'Istanbul','newyork':'New York',
 'new york city':'New York','washington d.c.':'Washington DC',
 'washington dc':'Washington DC','makka':'Makkah','mecca':'Makkah',
 'madina':'Madinah','medina':'Madinah','kpk':'Khyber Pakhtunkhwa',
 'quetta':'Quetta','lahore':'Lahore','karachi':'Karachi',
 'islamabad':'Islamabad','peshawar':'Peshawar','multan':'Multan'}

def fold(value):
 value = unicodedata.normalize('NFKD', value).casefold()
 return ''.join(c for c in value if not unicodedata.combining(c)).strip()

def countries():
 """Canonical country/territory index from ISO 3166 data (includes 195 states)."""
 by_name = {fold(c.name):(c.alpha_2,c.name) for c in pycountry.countries}
 for c in pycountry.countries:
  by_name[fold(c.alpha_2)] = (c.alpha_2,c.name)
  for alt in (getattr(c,'official_name',None),getattr(c,'common_name',None)):
   if alt: by_name[fold(alt)] = (c.alpha_2,c.name)
 by_name.update({fold(k):v for k,v in COUNTRY_ALIASES.items()})
 return by_name

COUNTRIES = countries()
COUNTRY_SUFFIXES = sorted(COUNTRIES, key=len, reverse=True)

def location_parts(location):
 loc = re.sub(r'\s+', ' ', location.strip().strip(' .!?'))
 if not loc: raise ValueError('Specify a city and country')
 region, _, last = loc.rpartition(',')
 if region and fold(last) in COUNTRIES:
  code,country = COUNTRIES[fold(last)]
  return region.strip(),country,code
 key=fold(loc)
 if key in COUNTRIES:
  code,country=COUNTRIES[key]
  return '',country,code
 # Allow "in Istanbul Turkey" and "in Dubai UAE" without a comma.
 for suffix in COUNTRY_SUFFIXES:
  if key.endswith(' '+suffix):
   offset=len(loc)-len(suffix)
   city=loc[:offset].strip(' ,')
   if city:
    code,country=COUNTRIES[suffix]
    return city,country,code
 if key in CITY_DEFAULT_COUNTRIES:
  country=CITY_DEFAULT_COUNTRIES[key]
  code,_=COUNTRIES[fold(country)]
  return loc,country,code
 raise ValueError('Specify a country after the city, e.g. Istanbul, Turkey')

def plan(text):
 if not isinstance(text,str) or not 2<=len(text.strip())<=1000:
  raise ValueError('Query must be 2 to 1000 characters')
 t=text.casefold()
 count=re.search(r'\b(\d{1,3})\b',t)
 limit=min(50,max(1,int(count.group(1)))) if count else 15
 category=next((v for k,v in CATEGORIES.items() if k in t),None)
 if not category: raise ValueError('Specify a supported business category')
 match=re.search(r'\b(?:in|within|around|near)\s+(.+)$',text,flags=re.I)
 if not match: raise ValueError('Specify a city and country, e.g. Istanbul, Turkey')
 city,country,code=location_parts(match.group(1))
 city=CITY_ALIASES.get(fold(city),city)
 if city and not re.fullmatch(r"[\w\s.'’\-]{1,100}",city,re.UNICODE):
  raise ValueError('Invalid location name')
 scope='city' if city else 'country'
 if fold(city)=='khyber pakhtunkhwa':scope='region'
 return {'category':category,'city':city or country,'country':country,
         'country_code':code,'limit':limit,'scope':scope}
