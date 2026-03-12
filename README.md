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
