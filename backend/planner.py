"""AEVONE conservative, evidence-first business query parser."""
import re
CATEGORIES = {
 'baker':'bakery','restaurant':'restaurant','clothing':'clothes','fashion':'clothes',
 'salon':'hairdresser','clinic':'clinic','hotel':'hotel','cafe':'cafe',
 'coffee':'cafe','pharmac':'pharmacy','school':'school','gym':'fitness_centre',
 'supermarket':'supermarket','shop':'shop','store':'shop'
}
PLACES = {'karachi':'Karachi','lahore':'Lahore','islamabad':'Islamabad','rawalpindi':'Rawalpindi',
'faisalabad':'Faisalabad','multan':'Multan','peshawar':'Peshawar','hyderabad':'Hyderabad',
'quetta':'Quetta','sialkot':'Sialkot','pakistan':'Pakistan'}
def plan(text):
 if not isinstance(text,str) or not 2<=len(text.strip())<=1000: raise ValueError('Query must be 2 to 1000 characters')
 t=text.lower()
 found=re.search(r'\b(\d{1,3})\b',t)
 limit=min(50,max(1,int(found.group(1)))) if found else 15
 category=next((v for k,v in CATEGORIES.items() if k in t),None)
 city=next((v for k,v in PLACES.items() if re.search(r'\b'+re.escape(k)+r'\b',t)),None)
 if not category: raise ValueError('Specify a business type such as bakeries, restaurants or clothing stores')
 if not city: raise ValueError('Specify a supported Pakistani city or Pakistan')
 return {'category':category,'city':city,'limit':limit,'scope':'country' if city=='Pakistan' else 'city'}
