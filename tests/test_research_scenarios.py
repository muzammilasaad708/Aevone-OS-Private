import sys,pathlib,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'backend'))
from planner import plan
class TwelveResearchScenarios(unittest.TestCase):
 def test_twelve_business_queries(self):
  cases=[('10 bakeries in Karachi','bakery','Karachi'),('15 restaurants in Lahore','restaurant','Lahore'),
   ('20 clothing brands in Pakistan','clothes','Pakistan'),('5 salons in Islamabad','hairdresser','Islamabad'),
   ('8 clinics in Rawalpindi','clinic','Rawalpindi'),('12 hotels in Multan','hotel','Multan'),
   ('6 cafes in Quetta','cafe','Quetta'),('7 pharmacies in Faisalabad','pharmacy','Faisalabad'),
   ('9 schools in Peshawar','school','Peshawar'),('11 gyms in Karachi','fitness_centre','Karachi'),
   ('13 supermarkets in Hyderabad','supermarket','Hyderabad'),('14 shops in Sialkot','shop','Sialkot')]
  for q,c,city in cases:
   with self.subTest(q=q):
    p=plan(q)
    self.assertEqual((p['category'],p['city']),(c,city))
