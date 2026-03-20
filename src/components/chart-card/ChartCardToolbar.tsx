type ChartCardToolbarProps = {
  selectablePeriods: string[];
  periodStart: string;
  onPeriodStartChange: (value: string) => void;
  periodEnd: string;
  onPeriodEndChange: (value: string) => void;
  musicPlaying: boolean;
  onToggleMusic: () => void;
  onOpenMusicSettings: () => void;
  showDualAxisButton: boolean;
  dualAxis: boolean;
  onToggleDualAxis: () => void;
  supportsForecast: boolean;
  forecastHorizon: number;
  onForecastHorizonChange: (value: number) => void;
  forecastOptions: number[];
  forecastUnitLabel: string;
};

export function ChartCardToolbar({
  selectablePeriods,
  periodStart,
  onPeriodStartChange,
  periodEnd,
  onPeriodEndChange,
  musicPlaying,
  onToggleMusic,
  onOpenMusicSettings,
  showDualAxisButton,
  dualAxis,
  onToggleDualAxis,
  supportsForecast,
  forecastHorizon,
  onForecastHorizonChange,
  forecastOptions,
  forecastUnitLabel,
}: ChartCardToolbarProps) {
  return (
    <div className="bat-chart-toolbar mb-3 flex flex-wrap items-center justify-end gap-2 rounded-2xl px-3 py-2">
      {selectablePeriods.length > 1 ? (
        <>
          <label className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium">
            <span className="whitespace-nowrap">From:</span>
            <select
              value={periodStart}
              onChange={(event) => onPeriodStartChange(event.target.value)}
              className="bat-input rounded-xl px-2 py-1 text-xs text-white outline-none"
            >
              {selectablePeriods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </label>

          <label className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium">
            <span className="whitespace-nowrap">To:</span>
            <select
              value={periodEnd}
              onChange={(event) => onPeriodEndChange(event.target.value)}
              className="bat-input rounded-xl px-2 py-1 text-xs text-white outline-none"
            >
              {selectablePeriods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <button
        type="button"
        onClick={onToggleMusic}
        className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
      >
        {musicPlaying ? 'Data music: on' : 'Data music: off'}
      </button>

      {musicPlaying ? (
        <button
          type="button"
          onClick={onOpenMusicSettings}
          className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium"
        >
          🎵 Music settings
        </button>
      ) : null}

      {showDualAxisButton ? (
        <button
          type="button"
          onClick={onToggleDualAxis}
          className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
        >
          {dualAxis ? 'Dual axes: on' : 'Dual axes: off'}
        </button>
      ) : null}

      {supportsForecast ? (
        <label className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium">
          <span className="whitespace-nowrap">Forecast:</span>
          <select
            value={forecastHorizon}
            onChange={(event) => onForecastHorizonChange(Number(event.target.value))}
            className="bat-input rounded-xl px-2 py-1 text-xs text-white outline-none"
          >
            {forecastOptions.map((value) => (
              <option key={value} value={value}>
                {value}{forecastUnitLabel}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
