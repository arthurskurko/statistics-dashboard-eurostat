import urllib.request, json

URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/DEMO_FABORTORD'

def fetch(geos):
    params = '&'.join(f'geo={g}' for g in geos)
    url = f"{URL}?lang=en&{params}"
    data = json.load(urllib.request.urlopen(url))
    return data

for geos in [['EE','EU27_2020'], ['EE','EU27_2020','DE']]:
    d = fetch(geos)
    ids=d['id']; dims=d['dimension']
    # determine geo dimension codes returned
    geoDim=dims['geo']['category']
    codes = geoDim['index'] if isinstance(geoDim['index'], list) else list(geoDim['index'].keys())
    labels = geoDim.get('label', {})
    print('request', geos, 'returned geos:', [(c, labels.get(c)) for c in codes])
