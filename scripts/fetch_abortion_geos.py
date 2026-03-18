import urllib.request
import json

URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/DEMO_FABORTORD'

def fetch(geo):
    url = f"{URL}?lang=en&geo={geo}"
    data = json.load(urllib.request.urlopen(url))
    return data

for geo in ['EE', 'EU27_2020', 'DE']:
    d = fetch(geo)
    vals = [v for v in d['value'].values() if v is not None]
    print(f"{geo}: values={len(vals)} min={min(vals) if vals else None} max={max(vals) if vals else None}")
