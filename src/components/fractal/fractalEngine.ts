import { drawMainBranch, drawModalHorizontalBranch, clearMainCanvas, clearModalCanvas, computeTempoPulse } from './fractalRenderers';
import { FractalSimulation } from './fractalSimulation';
import type { FractalStepPacket } from './fractalTypes';

export type { FractalStepPoint, FractalStepInfo, FractalStepPacket } from './fractalTypes';

export type FractalFrameParams = {
  mainCtx: CanvasRenderingContext2D;
  mainWidth: number;
  mainHeight: number;
  mainDpr: number;
  suppressMainDrawing?: boolean;
  modalCtx?: CanvasRenderingContext2D | null;
  modalWidth?: number;
  modalHeight?: number;
  modalDpr?: number;
  fadeFactor: number;
  timestampMs: number;
  tempoBpm?: number;
};

const MAX_SEEDS_PER_FRAME_COMPACT = 2;
const MAX_SEEDS_PER_FRAME_MODAL = 3;
const MAX_BRANCHES_RETAINED_COMPACT = 320;
const MAX_BRANCHES_RETAINED_MODAL = 380;
const MAX_PENDING_SEEDS = 260;
const STALE_PENDING_SEED_MAX_AGE_MS = 2200;

function shouldDrawCompactSample(branch: { points: Array<{ x: number; y: number }>; colorRgb: { r: number; g: number; b: number } }): boolean {
  const root = branch.points[0];
  const tip = branch.points[branch.points.length - 1] ?? root;
  // Stable geometry-based sampling avoids frame-to-frame on/off flicker from index parity.
  const hash =
    ((Math.floor((root?.x ?? 0) * 17) * 73856093) ^
      (Math.floor((root?.y ?? 0) * 19) * 19349663) ^
      (Math.floor((tip?.x ?? 0) * 13) * 83492791) ^
      (Math.floor((tip?.y ?? 0) * 11) * 29765731) ^
      (branch.colorRgb.r * 31 + branch.colorRgb.g * 17 + branch.colorRgb.b * 13)) >>>
    0;
  return (hash & 1) === 0;
}

function shouldDrawModalSample(branch: { points: Array<{ x: number; y: number }>; colorRgb: { r: number; g: number; b: number } }): boolean {
  const root = branch.points[0];
  const tip = branch.points[branch.points.length - 1] ?? root;
  const hash =
    ((Math.floor((root?.x ?? 0) * 23) * 2654435761) ^
      (Math.floor((root?.y ?? 0) * 29) * 2246822519) ^
      (Math.floor((tip?.x ?? 0) * 31) * 3266489917) ^
      (Math.floor((tip?.y ?? 0) * 37) * 668265263) ^
      (branch.colorRgb.r * 19 + branch.colorRgb.g * 11 + branch.colorRgb.b * 7)) >>>
    0;
  return (hash % 10) < 7;
}

function modalBranchHash(branch: {
  points: Array<{ x: number; y: number }>;
  colorRgb: { r: number; g: number; b: number };
  seedId?: number;
  generation?: number;
}): number {
  const root = branch.points[0];
  const tip = branch.points[branch.points.length - 1] ?? root;
  return (
    ((Math.floor((root?.x ?? 0) * 23) * 2654435761) ^
      (Math.floor((root?.y ?? 0) * 29) * 2246822519) ^
      (Math.floor((tip?.x ?? 0) * 31) * 3266489917) ^
      (Math.floor((tip?.y ?? 0) * 37) * 668265263) ^
      (branch.colorRgb.r * 19 + branch.colorRgb.g * 11 + branch.colorRgb.b * 7) ^
      ((branch.seedId ?? 0) * 31) ^
      ((branch.generation ?? 0) * 131)) >>>
    0
  );
}

export class FractalEngine {
  private readonly simulation = new FractalSimulation();

  enqueueStep(packet: FractalStepPacket): void {
    this.simulation.enqueueStep(packet);
  }

  clear(): void {
    this.simulation.clear();
  }

  clearPendingSeeds(): void {
    this.simulation.clearPendingSeeds();
  }

  hasWork(): boolean {
    return this.simulation.hasWork();
  }

  renderFrame(params: FractalFrameParams): void {
    const {
      mainCtx,
      mainWidth,
      mainHeight,
      mainDpr,
      suppressMainDrawing,
      modalCtx,
      modalWidth,
      modalHeight,
      modalDpr,
      fadeFactor,
      timestampMs,
      tempoBpm,
    } = params;

    const modalActive = Boolean(modalCtx && modalWidth && modalHeight && modalDpr);
    const maxSeedsPerFrame = modalActive ? MAX_SEEDS_PER_FRAME_MODAL : MAX_SEEDS_PER_FRAME_COMPACT;
    const maxBranchesRetained = modalActive ? MAX_BRANCHES_RETAINED_MODAL : MAX_BRANCHES_RETAINED_COMPACT;

    this.simulation.prepareFrame(
      maxSeedsPerFrame,
      maxBranchesRetained,
      timestampMs,
      STALE_PENDING_SEED_MAX_AGE_MS,
      MAX_PENDING_SEEDS,
    );

    if (!suppressMainDrawing) {
      clearMainCanvas(mainCtx, mainWidth, mainHeight, mainDpr);
    }
    const pulse = computeTempoPulse(timestampMs, tempoBpm);

    if (modalCtx && modalWidth && modalHeight && modalDpr) {
      clearModalCanvas(modalCtx, modalWidth, modalHeight, modalDpr);
    }

    const branches = this.simulation.getBranches();
    const compactHighDensity = !modalActive && branches.length > 220;
    const modalHighDensity = modalActive && branches.length > 180;

    for (let index = 0; index < branches.length; index += 1) {
      const branch = branches[index];
      if (branch.life <= 0.02) continue;
      if (!suppressMainDrawing && (!compactHighDensity || shouldDrawCompactSample(branch))) {
        drawMainBranch(mainCtx, branch, { lightweight: !modalActive });
      }
      const h = modalBranchHash(branch) % 100;
      const keepByGeneration =
        branch.generation <= 0 ? h < 98 :
        branch.generation === 1 ? h < 88 :
        branch.generation === 2 ? h < 68 :
        h < 42;
      const keepByLength = branch.pathLength >= 6;
      const drawInModal =
        !modalHighDensity ||
        ((keepByGeneration && keepByLength && h < 62) || shouldDrawModalSample(branch));
      if (modalCtx && modalWidth && modalHeight && drawInModal) {
        drawModalHorizontalBranch(modalCtx, branch, modalWidth, modalHeight, pulse);
      }
    }
    this.simulation.ageAndCompact(modalActive ? fadeFactor * 0.72 : fadeFactor);
  }
}
