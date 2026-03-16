import urllib.request
import json

URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tps00182'

resp = json.load(urllib.request.urlopen(URL + '?lang=en&geo=EE&sex=T'))
print('dimensions:', resp['id'])
print('unit labels sample:', list(resp['dimension']['unit']['category']['label'].items())[:20])
print('unit index type:', type(resp['dimension']['unit']['category']['index']))
print('unit index sample:', list(resp['dimension']['unit']['category']['index'].items())[:20] if isinstance(resp['dimension']['unit']['category']['index'], dict) else resp['dimension']['unit']['category']['index'][:20])

# look at actual values for unit=PC_HH? we'll see default
values = []
ids = resp['id']
size = resp['size']

def codes(dim):
    idx = resp['dimension'][dim]['category']['index']
    if isinstance(idx, list):
        return idx
    return [c for c,_ in sorted(idx.items(), key=lambda kv: kv[1])]

time_codes = codes('time')
unit_codes = codes('unit')

# pick first unit code
print('unit codes', unit_codes[:10])

for k,v in resp['value'].items():
    if v is None: continue
    # find unit & time for first few values
    flat=int(k); rem=flat; pos=[]
    for s in reversed(size):
        pos.append(rem % s); rem//=s
    pos=list(reversed(pos))
    unit = unit_codes[pos[ids.index('unit')]]
    time = time_codes[pos[ids.index('time')]]
    values.append((time, unit, v))

print('sample values:', values[:10])
