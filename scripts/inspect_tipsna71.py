import urllib.request
import json
import statistics

BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'


def get_codes(dims, dim):
    idx = dims[dim]['category']['index']
    if isinstance(idx, list):
        return idx
    return [code for code, _ in sorted(idx.items(), key=lambda kv: kv[1])]


def fetch(dataset, geo='EE'):
    url = f"{BASE}/{dataset}?lang=en&geo={geo}"
    data = json.load(urllib.request.urlopen(url))
    return data


def extract_series(dataset, geo='EE'):
    data = fetch(dataset, geo)
    ids = data['id']
    dims = data['dimension']
    geo_codes = get_codes(dims, 'geo')
    time_codes = get_codes(dims, 'time')
    values = data['value']
    sizes = data['size']

    series = {}
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
        geo_code = geo_codes[pos[ids.index('geo')]]
        time_code = time_codes[pos[ids.index('time')]]
        label = dims['geo']['category']['label'][geo_code]
        series.setdefault(label, []).append((time_code, v))
    return series


if __name__ == '__main__':
    for geo in ['EE', 'EU27_2020']:
        series = extract_series('tipsna71', geo)
        for label, pts in series.items():
            pts_sorted = sorted(pts, key=lambda x: x[0])
            print('---', geo, label, 'count', len(pts_sorted), 'first', pts_sorted[0], 'last', pts_sorted[-1])
            print(' last 8', pts_sorted[-8:])
            # compute ratios for last 8 points
            vals = [v for (_, v) in pts_sorted]
            ratios = [vals[i]/vals[i-1] for i in range(1, len(vals)) if vals[i-1] != 0]
            print('  last ratios (last 8):', ratios[-8:])
            if ratios:
                print('  median ratio', statistics.median(ratios[-8:]))
