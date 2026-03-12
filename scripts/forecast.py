#!/usr/bin/env python3
import sys
import json

# minimal forecast using ExponentialSmoothing from statsmodels
try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
except ImportError:
    sys.stderr.write('statsmodels not installed\n')
    sys.exit(1)


def predict(history, steps):
    # history is list of numbers
    if len(history) < 3 or steps <= 0:
        return [history[-1] if history else 0] * steps
    try:
        model = ExponentialSmoothing(history, trend="add", seasonal=None, initialization_method="estimated")
        fit = model.fit(optimized=True)
        return fit.forecast(steps).tolist()
    except Exception:
        # fallback to simple linear extrapolation
        x = list(range(len(history)))
        y = history
        # compute slope
        n = len(x)
        if n < 2:
            return [y[-1]] * steps
        slope = (y[-1] - y[0]) / (n - 1)
        return [y[-1] + slope * (i + 1) for i in range(steps)]


def main():
    data = json.load(sys.stdin)
    history = data.get('history', [])
    steps = data.get('steps', 0)
    preds = predict(history, steps)
    json.dump({'predictions': preds}, sys.stdout)


if __name__ == '__main__':
    main()
