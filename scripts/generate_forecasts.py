#!/usr/bin/env python3
import sys
import json
import os
import urllib.request

EU27 = ['BE','BG','CZ','DK','DE','EE','IE','ES','FR','HR','IT','CY','LV','LT','LU','HU','MT','NL','AT','PL','PT','RO','SI','SK','FI','SE']

# simple forecast function using statsmodels if available
try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    _have_statsmodels = True
except ImportError:
    _have_statsmodels = False


def forecast(history, steps):
    if len(history) < 3 or steps <= 0:
        return [history[-1] if history else 0] * steps
    if _have_statsmodels:
        try:
            model = ExponentialSmoothing(history, trend="add", seasonal=None, initialization_method="estimated")
            fit = model.fit(optimized=True)
            return fit.forecast(steps).tolist()
        except Exception:
            pass
    # fallback linear trend
    x = list(range(len(history)))
    y = history
    n = len(x)
    if n < 2:
        return [y[-1]] * steps
    slope = (y[-1] - y[0]) / (n - 1)
    return [y[-1] + slope * (i + 1) for i in range(steps)]


def fetch_dataset(code, params=""):
    url = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{code}?lang=en{params}"
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)


def aggregate_eu(dataset):
    dims = dataset['dimension']
    time_codes = list(dims['time']['category']['index'].keys())
    geo_codes = list(dims['geo']['category']['index'].keys())

    sizes = dataset['size']
    values = dataset['value']

    def unravel(idx):
        pos = []
        r = idx
        for size in reversed(sizes):
            pos.insert(0, r % size)
            r //= size
        return pos

    data_map = {}
    ids = dataset['id']
    geo_idx = ids.index('geo')
    time_idx = ids.index('time')

    for k, v in (values.items() if isinstance(values, dict) else enumerate(values)):
        if isinstance(k, str):
            idx = int(k)
        else:
            idx = k
        pos = unravel(idx)
        geo = geo_codes[pos[geo_idx]]
        time = time_codes[pos[time_idx]]
        data_map.setdefault(geo, {})[time] = v

    # sum over EU27 for each time
    eu_series = {}
    for t in time_codes:
        eu_series[t] = sum(data_map.get(g, {}).get(t, 0) for g in EU27)
    return time_codes, eu_series


def main():
    out_dir = os.path.join('public', 'forecasts')
    os.makedirs(out_dir, exist_ok=True)

    codes = ['DEMO_FABORTORD', 'migr_imm1ctz']
    for code in codes:
        # configure parameters for API call; always include both geos when
        # forecasting EU/Estonia pairs to keep payload small.
        if code == 'DEMO_FABORTORD':
            # abortion dataset already has annual filter etc.
            params = '&freq=A&unit=NR&age=TOTAL&ord_brth=TOTAL&geo=EE&geo=EU27_2020'
        else:
            # generic two‑geo fetch; other filters are not strictly needed for
            # forecasting the EU series, but they won't hurt if left blank.
            params = '&geo=EE&geo=EU27_2020'

        try:
            print(f'fetching {code} with params: {params}')
            dataset = fetch_dataset(code, params=params)
        except Exception as e:
            print(f'skipping forecast for {code}: {e}')
            continue

        # build history from the EU series in the filtered dataset
        periods, eu_series = aggregate_eu(dataset)
        history = [eu_series[p] for p in periods]
        last = len(history) - 1
        while last >= 0 and history[last] == 0:
            last -= 1
        # drop trailing partial years (often a partial current year)
        while last > 0 and history[last] < history[last - 1] * 0.25:
            history.pop()
            last -= 1

        # forecast five years ahead
        steps = 5
        preds = forecast(history[: last+1 ], steps)
        preds = [max(0, p) for p in preds]
        if len(preds) > 0 and preds[0] <= 0:
            last_val = history[last] if last >= 0 else 0
            preds = [last_val for _ in range(steps)]

        out = {
            'periods': periods,
            'history': history,
            'forecast': preds,
        }
        with open(os.path.join(out_dir, f"{code}.json"), 'w', encoding='utf8') as f:
            json.dump(out, f, indent=2)
        print(f'generated forecast for {code}, steps={steps}')

if __name__ == '__main__':
    main()
