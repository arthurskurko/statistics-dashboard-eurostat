export type RenderSafetyLimits = {
  maxSeries: number;
  maxPeriods: number;
  maxTotalPoints: number;
  maxRenderCells: number;
};

const DEFAULT_RENDER_SAFETY: RenderSafetyLimits = {
  maxSeries: 16,
  maxPeriods: 900,
  maxTotalPoints: 8000,
  maxRenderCells: 10000,
};

const OPEN_METEO_RENDER_SAFETY: RenderSafetyLimits = {
  maxSeries: 16,
  maxPeriods: 2200,
  maxTotalPoints: 12000,
  // ECharts cost scales heavily with series x periods even when sparse.
  maxRenderCells: 9000,
};

export function getRenderSafetyLimits(providerId: string): RenderSafetyLimits {
  if (providerId === 'openmeteo') {
    return OPEN_METEO_RENDER_SAFETY;
  }
  return DEFAULT_RENDER_SAFETY;
}
