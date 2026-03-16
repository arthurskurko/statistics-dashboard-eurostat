import json
import urllib.request

# Fetch dataset for Germany + Africa birth cohort without filtering age/sex
url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_070?lang=en&unit=NR&geo=DE&c_birth=AFR'
print('fetching', url)
with urllib.request.urlopen(url) as resp:
    js = json.load(resp)

# Helpers from src/lib/eurostat.ts (simplified)

def get_dimension_info(dataset):
    dimensions = dataset['id']
    info = []
    for dim in dimensions:
        cat = dataset['dimension'][dim]['category']
        idx = cat['index']
        if isinstance(idx, list):
            codes = idx
        else:
            codes = [k for k, _ in sorted(idx.items(), key=lambda x: x[1])]
        labels = cat.get('label', {})
        info.append({'id': dim, 'codes': codes, 'labels': labels})
    return info


def infer_sort_key(period):
    # simplified from TS
    try:
        return int(period) * 100
    except:
        return 0


def format_period_label(code):
    # basically direct
    return code


def unravel_index(flat_index, sizes):
    coords = []
    r = flat_index
    for size in reversed(sizes):
        coords.insert(0, r % size)
        r //= size
    return coords


def parse_series(dataset, series_dimension_id=None):
    dimensions = get_dimension_info(dataset)
    time_dim = next((d for d in dimensions if 'time' in d['id'].lower()), dimensions[-1])
    geo_dim = next((d for d in dimensions if d['id'].lower() == 'geo'), None)
    series_dim = next((d for d in dimensions if d['id'] == series_dimension_id), None) if series_dimension_id else None
    series_dim_index = dimensions.index(series_dim) if series_dim else -1

    time_index = dimensions.index(time_dim)
    geo_index = dimensions.index(geo_dim) if geo_dim else -1

    # periods list
    periods = [format_period_label(c) for c in time_dim['codes']]

    values = dataset['value']
    if isinstance(values, dict):
        items = ((int(k), v) for k, v in values.items())
    else:
        items = enumerate(values)

    series_map = {}
    for flat_idx, raw in items:
        if raw is None:
            continue
        try:
            v = float(raw)
        except Exception:
            continue
        if v != v:
            continue
        coords = unravel_index(flat_idx, dataset['size'])
        period_code = time_dim['codes'][coords[time_index]]
        geo_code = geo_dim['codes'][coords[geo_index]] if geo_dim else '??'
        geo_label = geo_dim['labels'].get(geo_code, geo_code) if geo_dim else geo_code
        series_label = geo_label
        if series_dim and series_dim_index >= 0:
            series_code = series_dim['codes'][coords[series_dim_index]]
            series_label = f"{geo_label} — {series_dim['labels'].get(series_code, series_code)}"

        point = {
            'periodCode': period_code,
            'label': format_period_label(period_code),
            'sortKey': infer_sort_key(period_code),
            'value': v,
        }
        series_map.setdefault(series_label, []).append(point)

    series = []
    for label, points in series_map.items():
        points = sorted(points, key=lambda p: p['sortKey'])
        series.append({'id': label, 'label': label, 'points': points})
    return series, periods


series, periods = parse_series(js, series_dimension_id='age')
print('total series:', len(series))
for s in series:
    print('---', s['label'], 'points:', len(s['points']), 'first/last:', s['points'][0], s['points'][-1])

# show any series that have multiple points for same year
for s in series:
    seen = {}
    dup = []
    for p in s['points']:
        if p['label'] in seen:
            dup.append(p['label'])
        seen[p['label']] = True
    if dup:
        print('DUPLICATE YEARS in', s['label'], dup[:5])

PY