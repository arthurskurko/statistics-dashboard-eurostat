type BackendStatusSummaryProps = {
  backendMode: 'checking' | 'go' | 'local';
  backendStatusMessage: string;
  backendBaseUrl: string;
  onRefreshBackendStatus: () => void;
  isRefreshingBackendStatus: boolean;
};

export function BackendStatusSummary({
  backendMode,
  backendStatusMessage,
  backendBaseUrl,
  onRefreshBackendStatus,
  isRefreshingBackendStatus,
}: BackendStatusSummaryProps) {
  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            backendMode === 'go'
              ? 'bg-emerald-500/20 text-emerald-200'
              : backendMode === 'checking'
                ? 'bg-amber-500/20 text-amber-200'
                : 'bg-slate-500/20 text-slate-200'
          }`}
        >
          {backendMode === 'go'
            ? 'Mode: Go backend'
            : backendMode === 'checking'
              ? 'Mode: checking'
              : 'Mode: local storage'}
        </span>
        <button
          type="button"
          onClick={onRefreshBackendStatus}
          disabled={isRefreshingBackendStatus}
          className="bat-btn rounded-2xl px-2 py-0.5 text-[11px] font-medium disabled:opacity-60"
        >
          {isRefreshingBackendStatus ? 'Checking...' : 'Re-check backend'}
        </button>
      </div>
      <div className="mt-1 text-[11px] text-slate-300">{backendStatusMessage}</div>
      <div className="text-[11px] text-slate-400">Backend URL: {backendBaseUrl}</div>
    </>
  );
}