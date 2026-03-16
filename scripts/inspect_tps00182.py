import urllib.request
import json

URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tps00182'

def fetch(geo: str):
    url = f"{URL}?lang=en&geo={geo}&sex=T"
    data = json.load(urllib.request.urlopen(url))
    return data

for geo in ['EE', 'EU27_2020']:
    data = fetch(geo)
    ids = data['id']
    dims = data['dimension']

    def get_codes(dim):
        idx = dims[dim]['category']['index']
        if isinstance(idx, list):
            return idx
        return [c for c,_ in sorted(idx.items(), key=lambda kv: kv[1])]

    time_codes = get_codes('time')

    size = data['size']

    values = []
    for flat, v in data['value'].items():
        if v is None:
            continue
        flat = int(flat)
        rem = flat
        pos = []
        for s in reversed(size):
            pos.append(rem % s)
            rem //= s
        pos = list(reversed(pos))
        # locate time position by looking at the dimension index for 'time'
        time_idx = ids.index('time')
        t = time_codes[pos[time_idx]]
        values.append(float(v))

    print(f"{geo}: points={len(values)} min={min(values) if values else None} max={max(values) if values else None}")
