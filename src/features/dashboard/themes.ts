export const THEMES = [
  { id: 'ember-noir', label: 'Ember Noir' },
  { id: 'batcave', label: 'Batcave Pixel' },
  { id: 'neon-grid', label: 'Neon Grid' },
  { id: 'aurora-core', label: 'Aurora Core' },
  { id: 'solar-flare', label: 'Solar Flare' },
  { id: 'mystic-forest', label: 'Mystic Forest' },
  { id: 'retro-console', label: 'Retro Console' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
