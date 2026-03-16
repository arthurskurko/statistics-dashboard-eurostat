import urllib.request
import json

BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tps00149"


def get_codes(dims, dim_id):
    idx = dims[dim_id]['category']['index']
    if isinstance(idx, list):
        return idx
    return [code for code, _ in sorted(idx.items(), key=lambda kv: kv[1])]


def fetch(sex):
    url = f"{BASE_URL}?lang=en&geo=EE&geo=EU27_2020&sex={sex}"
    data = json.load(urllib.request.urlopen(url))

    ids = data['id']
    dims = data['dimension']
    geo_codes = get_codes(dims, 'geo')
    time_codes = get_codes(dims, 'time')
    sex_codes = get_codes(dims, 'sex')

    series = {}
    values = data['value']
    sizes = data['size']

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
        time = time_codes[pos[ids.index('time')]]
        sex_code = sex_codes[pos[ids.index('sex')]]

        label = f"{dims['geo']['category']['label'][geo]} — {dims['sex']['category']['label'][sex_code]}"
        series.setdefault(label, []).append((time, v))

    return series


if __name__ == '__main__':
    out_lines = []
    for sex in ['T', 'M', 'F']:
        series = fetch(sex)
        out_lines.append(f"### sex={sex}")
        for label, pts in sorted(series.items()):
            years = sorted({int(t) for t, _ in pts})
            miss = [y for y in range(min(years), max(years) + 1) if str(y) not in {t for t, _ in pts}]
            out_lines.append(f"{label}: years {min(years)}-{max(years)}, count {len(years)}, missing {miss}")
    print('\n'.join(out_lines))
