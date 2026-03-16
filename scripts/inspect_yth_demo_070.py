import urllib.request
import json

url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_070?lang=en&geo=EE'
resp = json.load(urllib.request.urlopen(url))
dims = resp['dimension']

print('dimensions:', resp['id'])
print('geo labels sample:', list(dims['geo']['category']['label'].items())[:10])
print('geo code count:', len(dims['geo']['category']['label']))
print('time sample:', list(dims['time']['category']['index'])[:5])
print('sex codes:', dims['sex']['category']['index'])
print('age codes sample:', list(dims['age']['category']['index'])[:20])

# Find the code for Mexico (if present)
mb = dims['c_birth']['category']['label']
mex_codes = [code for code,label in mb.items() if 'Mexico' in label]
print('mexico codes:', mex_codes)
print('birth cohort codes sample:', list(dims['c_birth']['category']['index'])[:20])

# Now fetch with filters matching the screenshot (Mexico cohort, sex=Total, unit=Number)
if mex_codes:
    mx = mex_codes[0]
    url2 = url + f'&geo=EE&c_birth={mx}&sex=T&unit=NR'
    print('\nfetching filtered dataset:', url2)
    resp2 = json.load(urllib.request.urlopen(url2))
    ids2 = resp2['id']
    dims2 = resp2['dimension']

    # helper to get code list for a dimension
    def get_codes(dim):
        idx = dims2[dim]['category']['index']
        if isinstance(idx, list):
            return idx
        return [c for c, _ in sorted(idx.items(), key=lambda kv: kv[1])]

    age_codes = get_codes('age')
    time_codes = get_codes('time')

    # gather values by age group
    series = {}
    for k,v in resp2['value'].items():
        if v is None:
            continue
        flat = int(k)
        rem = flat
        pos = []
        for s in resp2['size'][::-1]:
            pos.append(rem % s)
            rem //= s
        pos = list(reversed(pos))
        age = age_codes[pos[ids2.index('age')]]
        time = time_codes[pos[ids2.index('time')]]
        series.setdefault(age, []).append((time, v))

    for age, pts in series.items():
        pts_sorted = sorted(pts, key=lambda x: x[0])
        print('\nage', age, 'last 8:', pts_sorted[-8:])
        vals = [v for (_, v) in pts_sorted]
        ratios = [vals[i]/vals[i-1] for i in range(1, len(vals)) if vals[i-1] != 0]
        print('  median ratio (last 8):', (sorted(ratios)[len(ratios)//2] if ratios else None))
