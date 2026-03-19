export type FractalStepPoint = {
  seriesLabel: string;
  label: string;
  value: number;
  color: string;
};

export type FractalStepInfo = {
  step: number;
  points: FractalStepPoint[];
};

export type FractalStepPacket = {
  cardId: string;
  stepInfo: FractalStepInfo;
};

export type Vec2 = { x: number; y: number };

export type FractalBranch = {
  points: Vec2[];
  life: number;
  decay: number;
  width: number;
  tipSize: number;
  colorRgb: { r: number; g: number; b: number };
};
