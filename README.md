# Estonia Statistics Dashboard

A Docker-ready React + TypeScript dashboard that lets you choose a Eurostat topic from a dropdown and add it to a chart dashboard.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Apache ECharts
- Docker + Nginx

## Topics included

- Population (the card now uses two y‑axes when Estonia is plotted against the EU so the smaller line isn’t squashed)
- Immigration (total flows into Estonia and EU)
- Induced abortions (legal terminations, Estonia vs EU)


## Forecasting missing values

Some topics (e.g. abortion counts) may lack the latest EU aggregate because
not all countries have reported yet.  The app can automatically generate a
short‑term forecast for any trailing gap using a small Python model.

To enable this feature you need a Python 3 installation and the package
`statsmodels` (used for forecasting).  The helper script uses only the
standard library for downloading; no third‑party network libraries are
required.

Install statsmodels with:

```sh
pip install statsmodels
```

A helper script lives in `scripts/forecast.py` and is invoked by the
frontend when it detects missing periods.  Forecast points are drawn with a
**dashed line** and are marked `predicted` in the tooltip.

You can run the script manually for debugging:

```sh
echo '{"history":[100,90,80],"steps":2}' | python scripts/forecast.py
``` 

- Unemployment rate
- Inflation (HICP annual rate)
- GDP per capita

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Production build

```bash
npm install
npm run build
npm run preview
```

## Run with Docker

```bash
docker compose up --build
```

Then open `http://localhost:8080`.

## Notes

- The app fetches live data from Eurostat's public API.
- If a Eurostat dataset changes its filter codes, that chart can fail until the mapping is updated. For example the unemployment series dropped the 15‑74 age class in favour of 25‑74 in 2025, which required updating the app filters.
- Dashboard cards are persisted in local storage.
