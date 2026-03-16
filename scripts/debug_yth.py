import json
import urllib.request

url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_070?lang=en&unit=NR&geo=DE&c_birth=AFR'
print('fetching', url)
with urllib.request.urlopen(url) as resp:
    js = json.load(resp)

ids = js['id']
sizes = js['size']

id_index = {d: i for i, d in enumerate(ids)}

codes_raw = {d: js['dimension'][d]['category']['index'] for d in ids}
labels = {d: js['dimension'][d]['category'].get('label', {}) for d in ids}

# normalize codes to list

def list_codes(c):
    if isinstance(c, list):
        return c
    # assume dict code->index
    return sorted(c.keys(), key=lambda k: c[k])

codes = {d: list_codes(codes_raw[d]) for d in ids}

# unravel flat index into coordinate tuple

def unravel(flat_index, sizes):
    coords = []
    for size in reversed(sizes):
        coords.append(flat_index % size)
        flat_index //= size
    return list(reversed(coords))

# collect nonzero points per age
age_index = id_index['age']
time_index = id_index['time']
sex_index = id_index['sex']

points_by_age = {}

values = js['value']
if isinstance(values, dict):
    items = ((int(k), v) for k, v in values.items())
else:
    items = enumerate(values)

for flat_idx, raw in items:
    if raw is None:
        continue
    try:
        v = float(raw)
    except Exception:
        continue
    if v == 0:
        continue
    coords = unravel(flat_idx, sizes)
    age_code = codes['age'][coords[age_index]]
    time_code = codes['time'][coords[time_index]]
    sex_code = codes['sex'][coords[sex_index]]
    points_by_age.setdefault(age_code, []).append((time_code, v))

print('age groups with nonzero values:', len(points_by_age))
for age, pts in sorted(points_by_age.items(), key=lambda x: x[0]):
    pts_sorted = sorted(pts, key=lambda x: x[0])
    print(age, labels['age'].get(age, age), 'points:', len(pts_sorted), 'last:', pts_sorted[-5:])

# show the first 10 raw keys to see if they exist
if isinstance(values, dict):
    print('sample value keys:', list(values.keys())[:10])

print('dimensions:', ids)
print('sizes:', sizes)
print('age codes count:', len(codes['age']), 'sex codes count:', len(codes['sex']), 'time count:', len(codes['time']))
