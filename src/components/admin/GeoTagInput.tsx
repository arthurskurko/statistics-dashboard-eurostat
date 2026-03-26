import React from 'react';
import { KNOWN_GEOS } from '../chart-card/helpers';

type Geo = { code: string; label: string };

type GeoTagInputProps = {
  providerId?: 'eurostat' | 'worldbank' | 'who' | 'openmeteo';
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: Geo[];
  placeholder?: string;
  singleSelect?: boolean;
};

export default function GeoTagInput({ providerId, values, onChange, suggestions, placeholder, singleSelect }: GeoTagInputProps) {
  const [input, setInput] = React.useState('');

  const catalog = React.useMemo(() => {
    const merged = new Map<string, Geo>();

    const fallback = providerId === 'eurostat' ? KNOWN_GEOS : [];

    for (const geo of suggestions ?? fallback) merged.set(geo.code, geo);
    if (providerId === 'eurostat') {
      for (const geo of KNOWN_GEOS) if (!merged.has(geo.code)) merged.set(geo.code, geo);
    }

    return [...merged.values()];
  }, [providerId, suggestions]);

  const inputUpper = input.trim().toUpperCase();
  const filtered = React.useMemo(() => {
    if (!inputUpper) return [] as Geo[];
    return catalog
      .filter((g) => g.code.startsWith(inputUpper) || g.label.toUpperCase().includes(inputUpper))
      .slice(0, 10);
  }, [catalog, inputUpper]);

  function addValue(code: string) {
    const value = code.trim().toUpperCase();
    if (!value) return;
    if (values.includes(value)) return setInput('');
    if (singleSelect) return onChange([value]);
    onChange([...values, value]);
    setInput('');
  }

  const safeValues = Array.isArray(values) ? values : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {safeValues.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="bat-btn rounded-full px-1 text-xs"
            >
              x
            </button>
          </span>
        ))}
        {!singleSelect ? (
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder ?? 'Add geo (e.g. EE)'}
              className="bat-input h-9 w-40 rounded-2xl px-3 text-xs text-white outline-none transition"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addValue(input);
                }
              }}
            />
            {inputUpper && filtered.length > 0 ? (
              <div className="bat-suggestions absolute left-0 top-full z-10 mt-1 max-h-40 w-full overflow-auto rounded-xl">
                {filtered.map((geo) => (
                  <button
                    key={geo.code}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/10"
                    onClick={() => addValue(geo.code)}
                  >
                    {geo.code} - {geo.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
