type CatalogCodeSuggestion = {
  code: string;
  title: string;
};

type CatalogCodeSearchProps = {
  customCode: string;
  onCustomCodeChange: (value: string) => void;
  suggestions: CatalogCodeSuggestion[];
  onSuggestionSelect: (code: string) => void;
  onAddByCode: (code: string) => void;
  inputPlaceholder?: string;
  addButtonLabel?: string;
  inputWrapperClassName?: string;
  addButtonClassName?: string;
};

export function CatalogCodeSearch({
  customCode,
  onCustomCodeChange,
  suggestions,
  onSuggestionSelect,
  onAddByCode,
  inputPlaceholder = 'Search catalog or enter code',
  addButtonLabel = 'Add by code',
  inputWrapperClassName = 'relative flex-1',
  addButtonClassName = 'bat-btn h-12 rounded-2xl px-5 font-medium',
}: CatalogCodeSearchProps) {
  const hasInput = customCode.trim().length > 0;

  return (
    <>
      <div className={inputWrapperClassName}>
        <input
          type="text"
          value={customCode}
          onChange={(event) => onCustomCodeChange(event.target.value)}
          placeholder={inputPlaceholder}
          className="bat-input h-12 w-full rounded-2xl px-4 text-white outline-none transition"
        />

        {hasInput && suggestions.length > 0 ? (
          <div className="bat-suggestions absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-auto rounded-2xl p-3 text-sm text-slate-200 backdrop-blur">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Suggestions</div>
            <ul className="space-y-1">
              {suggestions.map((entry) => (
                <li key={entry.code}>
                  <button
                    type="button"
                    onClick={() => onSuggestionSelect(entry.code)}
                    className="w-full rounded-lg px-2 py-1 text-left text-xs transition hover:bg-white/10 hover:text-white"
                  >
                    <span className="font-semibold">{entry.code}</span> - {entry.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          const code = customCode.trim();
          if (!code) return;
          onAddByCode(code);
        }}
        className={addButtonClassName}
      >
        {addButtonLabel}
      </button>
    </>
  );
}
