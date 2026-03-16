import urllib.request
import json

url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tps00149"
params = "lang=en&geo=EE&geo=EU27_2020&sex=T"
print('fetching', url + '?' + params)
with urllib.request.urlopen(f"{url}?{params}") as resp:
    data = json.load(resp)

ids = data['id']
dims = data['dimension']

# Handle index being either a list (ordered) or a dict mapping code -> position

def get_codes(dim_id):
    cat = dims[dim_id]['category']
    idx = cat['index']
    if isinstance(idx, list):
        return idx
    # index is a dict code->position
    return [code for code, _ in sorted(idx.items(), key=lambda kv: kv[1])]

geo_labels = dims['geo']['category']['label']
sex_labels = dims['sex']['category']['label']

values = data['value']
sizes = data['size']

geo_codes = get_codes('geo')
sex_codes = get_codes('sex')
time_codes = get_codes('time')

from collections import defaultdict
series = defaultdict(list)

for k, v in values.items():
    if v is None:
        continue
    idx = int(k)
    rem = idx
    pos = []
    for s in reversed(sizes):
        pos.append(rem % s)
        rem //= s
    pos = list(reversed(pos))
    geo = geo_codes[pos[ids.index('geo')]]
    sex = sex_codes[pos[ids.index('sex')]]
    time = time_codes[pos[ids.index('time')]]
    label = f"{geo_labels.get(geo, geo)} — {sex_labels.get(sex, sex)}"
    series[label].append((time, v))

out = []
for label, pts in series.items():
    pts_sorted = sorted(pts, key=lambda x: x[0])
    out.append(f"{label} points {len(pts_sorted)} first {pts_sorted[0]} last {pts_sorted[-1]}")
    out.append(' last5 ' + str(pts_sorted[-5:]))

for name in ['Estonia — Total', 'European Union - 27 countries (from 2020) — Total']:
    pts = series.get(name, [])
    years = [int(t) for t, _ in pts]
    out.append(f"{name} min {min(years) if years else None} max {max(years) if years else None} count {len(years)}")
    if years:
        miss = [y for y in range(min(years), max(years) + 1) if str(y) not in [t for t, _ in pts]]
        out.append(' missing ' + str(miss))

print('\n'.join(out))
