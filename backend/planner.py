"""Conservative prompt parser. Never invents a company or a contact."""
import re
CATEGORIES={"baker": "bakery", "restaurant":"restaurant", "clothing":"clothes", "fashion":"clothes", "salon":"hairdresser", "clinic":"clinic", "hotel":"hotel", "cafe":"cafe", "coffee":"cafe", "pharmac":"pharmacy", "school":"school", "gym":"fitness_centre", "supermarket":"supermarket", "shop":"shop", "store":"shop"}
PLACES={"karachi":"Karachi", "lahore":"Lahore", "islamabad":"Islamabad", "rawalpindi":"Rawalpindi", "faisalabad":"Faisalabad", "multan":"Multan", "peshawar":"Peshawar", "hyderabad":"Hyderabad", "quetta":"Quetta", "sialkot":"Sialkot", "pakistan":"Pakistan"}
def plan(text):
    if not isinstance(text,str) or not (2<=len(text.strip())<=1000): raise ValueError("Query must be 2 to 1000 characters")
    t=text.lower(); count=re.search(r"\b(\d{1,3})\b",t); n=min(50,max(1,int(count.group(1)))) if count else 15
    cat=next((v for k,v in CATEGORIES.items() if k in t),None)
    place=next((v for k,v in PLACES.items() if k in t),None)
    if not cat: raise ValueError("Specify a business category, e.g. bakeries, restaurants, fashion stores")
    if not place: raise ValueError("Specify a city, e.g. Karachi or Lahore")
    return {"category":cat,"city":place,"limit":n,"query":text.strip(),"scope":"country" if place=="Pakistan" else "city"}
