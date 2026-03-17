import React from 'react';
import { friendlyDimensionLabel, findDimensionValueLabel, KNOWN_GEOS, type DimensionOption } from './helpers';

type ChartCardHeaderProps = {
  topicId: string;
  datasetCode: string;
  title: string;
  description: string;
  forecastDisabledReason?: string;
  warning?: string;
  missingGeos: string[];
  chartError: string | null;
  geoValues: string[];
  geoInput: string;
  setGeoInput: (value: string) => void;
  setGeoValues: React.Dispatch<React.SetStateAction<string[]>>;
  seriesDimension: string;
  setSeriesDimension: (value: string) => void;
  dimensionFilters: Record<string, string | string[]>;
  setDimensionFilters: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>;
  availableDimensions: DimensionOption[];
  isSeriesTruncated: boolean;
  maxSeriesToRender: number;
  geoSuggestions?: Array<{ code: string; label: string }>;
};

export function ChartCardHeader({
  topicId,
  datasetCode,
  title,
  description,
  forecastDisabledReason,
  warning,
  missingGeos,
  chartError,
  geoValues,
  geoInput,
  setGeoInput,
  setGeoValues,
  seriesDimension,
  setSeriesDimension,
  dimensionFilters,
  setDimensionFilters,
  availableDimensions,
  isSeriesTruncated,
  maxSeriesToRender,
  geoSuggestions,
}: ChartCardHeaderProps) {
  const hasDimensionFilters = Object.values(dimensionFilters).some((value) => Boolean(value));
  const geoCatalog = geoSuggestions && geoSuggestions.length > 0 ? geoSuggestions : KNOWN_GEOS;

  return (
    <div className="mb-5 space-y-4">
      <div className="space-y-2 pr-10">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{datasetCode}</div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
      </div>

      {forecastDisabledReason ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong className="font-semibold">No reliable forecast:</strong> {forecastDisabledReason}
        </div>
      ) : null}

      {warning ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong className="font-semibold">Notice:</strong> {warning}
        </div>
      ) : null}

      {missingGeos.length > 0 ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <strong className="font-semibold">No data for:</strong>{' '}
          {missingGeos
            .map((code) => geoCatalog.find((geo) => geo.code === code)?.label ?? code)
            .join(', ')}
        </div>
      ) : null}

      {chartError ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <strong className="font-semibold">Rendering error:</strong> {chartError}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 text-sm text-slate-400">
        <span>Compare geos:</span>
        <div className="flex flex-wrap items-center gap-2">
          {geoValues.map((geo) => (
            <span key={geo} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs">
              {geo}
              <button
                type="button"
                onClick={() => setGeoValues((prev) => prev.filter((value) => value !== geo))}
                className="bat-btn rounded-full px-1 text-xs"
              >
                x
              </button>
            </span>
          ))}
          <div className="relative">
            <input
              value={geoInput}
              onChange={(event) => setGeoInput(event.target.value.toUpperCase())}
              placeholder="Add geo (e.g. DE)"
              className="bat-input h-9 w-40 rounded-2xl px-3 text-xs text-white outline-none transition"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const value = geoInput.trim().toUpperCase();
                  if (value && !geoValues.includes(value)) {
                    setGeoValues((prev) => [...prev, value]);
                  }
                  setGeoInput('');
                }
              }}
            />
            {geoInput ? (
              <div className="bat-suggestions absolute left-0 top-full z-10 mt-1 max-h-40 w-full overflow-auto rounded-xl">
                {geoCatalog
                  .filter(
                    (geo) =>
                      geo.code.startsWith(geoInput) ||
                      geo.label.toLowerCase().includes(geoInput.toLowerCase()),
                  )
                  .slice(0, 10)
                  .map((geo) => (
                    <button
                      key={geo.code}
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/10"
                      onClick={() => {
                        if (!geoValues.includes(geo.code)) {
                          if (topicId === 'yth_demo_070') {
                            setGeoValues([geo.code]);
                          } else {
                            setGeoValues((prev) => [...prev, geo.code]);
                          }
                        }
                        setGeoInput('');
                      }}
                    >
                      {geo.code} - {geo.label}
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {seriesDimension || hasDimensionFilters ? (
        <p className="text-sm text-slate-400">
          {seriesDimension ? (
            <span>
              Split series by <strong>{friendlyDimensionLabel(seriesDimension)}</strong>.
              {hasDimensionFilters ? ' ' : ''}
            </span>
          ) : null}
          {Object.entries(dimensionFilters)
            .filter(([, value]) => Boolean(value))
            .map(([key, value], index) => (
              <span key={key}>
                {index > 0 ? ', ' : ''}
                <strong>{friendlyDimensionLabel(key)}</strong>:{' '}
                {findDimensionValueLabel(availableDimensions, key, value)}
              </span>
            ))}
        </p>
      ) : null}

      {availableDimensions.filter((dim) => dim.values.length > 1).length > 0 ? (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-200">
            <span className="text-slate-400">Split series by</span>
            <div className="flex gap-2">
              <select
                value={seriesDimension}
                onChange={(event) => setSeriesDimension(event.target.value)}
                className="bat-input h-10 rounded-2xl px-3 text-sm text-white outline-none transition"
              >
                <option value="">(none)</option>
                {availableDimensions.map((dim) => (
                  <option key={dim.id} value={dim.id}>
                    {friendlyDimensionLabel(dim.id)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setSeriesDimension('');
                  setDimensionFilters({});
                }}
                className="bat-btn rounded-2xl px-3 text-xs font-medium"
              >
                Reset
              </button>
            </div>
          </label>

          {seriesDimension === 'unit' ? (
            (() => {
              const unitDim = availableDimensions.find((dim) => dim.id === 'unit');
              if (!unitDim) return null;
              const currentUnitFilter = dimensionFilters.unit;
              const selectedUnits = Array.isArray(currentUnitFilter)
                ? currentUnitFilter
                : currentUnitFilter
                ? [currentUnitFilter]
                : [];

              return (
                <label className="flex flex-col gap-1 text-xs text-slate-200">
                  <span className="text-slate-400">Units to include</span>
                  <select
                    multiple
                    value={selectedUnits}
                    onChange={(event) => {
                      const selected = Array.from(event.target.selectedOptions).map((opt) => opt.value);
                      setDimensionFilters((prev) => ({
                        ...prev,
                        unit: selected,
                      }));
                    }}
                    className="bat-input h-32 rounded-2xl px-3 text-sm text-white outline-none transition"
                  >
                    {unitDim.values.map((unit) => (
                      <option key={unit.code} value={unit.code}>
                        {unit.label ?? unit.code}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Select one or more units to keep the dataset small enough to fetch.
                  </p>
                </label>
              );
            })()
          ) : null}

          {availableDimensions
            .filter((dim) => dim.values.length > 1 && dim.id !== seriesDimension)
            .map((dim) => {
              const isUnitDim = dim.id === 'unit';
              const value = dimensionFilters[dim.id];

              return (
                <label key={dim.id} className="flex flex-col gap-1 text-xs text-slate-200">
                  <span className="text-slate-400">{friendlyDimensionLabel(dim.id)}</span>

                  {isUnitDim ? (
                    <select
                      multiple
                      value={Array.isArray(value) ? value : value ? [value] : []}
                      onChange={(event) => {
                        const selected = Array.from(event.target.selectedOptions).map((opt) => opt.value);
                        setDimensionFilters((prev) => ({
                          ...prev,
                          [dim.id]: selected,
                        }));
                      }}
                      className="bat-input h-32 rounded-2xl px-3 text-sm text-white outline-none transition"
                    >
                      {dim.values.map((unit) => (
                        <option key={unit.code} value={unit.code}>
                          {unit.label ?? unit.code}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) =>
                        setDimensionFilters((prev) => ({
                          ...prev,
                          [dim.id]: event.target.value,
                        }))
                      }
                      className="bat-input h-10 rounded-2xl px-3 text-sm text-white outline-none transition"
                    >
                      <option value="">(all)</option>
                      {dim.values.map((value) => (
                        <option key={value.code} value={value.code}>
                          {value.label ?? value.code}
                        </option>
                      ))}
                    </select>
                  )}

                  {isUnitDim ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Select one or more units to avoid huge downloads. If empty, the chart may not render.
                    </p>
                  ) : null}
                </label>
              );
            })}
        </div>
      ) : null}

      {isSeriesTruncated ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong className="font-semibold">Showing first {maxSeriesToRender} series.</strong>{' '}
          Reduce the number of selected countries or split dimensions to improve performance.
        </div>
      ) : null}
    </div>
  );
}
