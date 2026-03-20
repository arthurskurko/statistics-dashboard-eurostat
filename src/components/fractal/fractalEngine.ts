import { drawMainBranch, drawModalRecursiveTree, clearMainCanvas, clearModalCanvas, computeTempoPulse } from './fractalRenderers';
import { FractalModalSimulation } from './fractalModalSimulation';
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
const MAX_BRANCHES_RETAINED_COMPACT = 320;
const MAX_PENDING_SEEDS = 260;
const STALE_PENDING_SEED_MAX_AGE_MS = 2200;
const MAX_MODAL_SEEDS_PER_FRAME = 2;
const MAX_MODAL_TREES_RETAINED = 8;

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

export class FractalEngine {
  private readonly simulation = new FractalSimulation();
  private readonly modalSimulation = new FractalModalSimulation();

  enqueueStep(packet: FractalStepPacket): void {
    this.simulation.enqueueStep(packet);
    this.modalSimulation.enqueueStep(packet);
  }

  clear(): void {
    this.simulation.clear();
    this.modalSimulation.clear();
  }

  clearPendingSeeds(): void {
    this.simulation.clearPendingSeeds();
    this.modalSimulation.clearPendingSeeds();
  }

  hasWork(): boolean {
    return this.simulation.hasWork() || this.modalSimulation.hasWork();
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

    this.simulation.prepareFrame(
      MAX_SEEDS_PER_FRAME_COMPACT,
      MAX_BRANCHES_RETAINED_COMPACT,
      timestampMs,
      STALE_PENDING_SEED_MAX_AGE_MS,
      MAX_PENDING_SEEDS,
    );

    if (modalActive) {
      this.modalSimulation.prepareFrame(
        MAX_MODAL_SEEDS_PER_FRAME,
        MAX_MODAL_TREES_RETAINED,
        timestampMs,
        STALE_PENDING_SEED_MAX_AGE_MS,
        MAX_PENDING_SEEDS,
      );
    }

    if (!suppressMainDrawing) {
      clearMainCanvas(mainCtx, mainWidth, mainHeight, mainDpr);
    }
    const pulse = computeTempoPulse(timestampMs, tempoBpm);

    if (modalCtx && modalWidth && modalHeight && modalDpr) {
      clearModalCanvas(modalCtx, modalWidth, modalHeight, modalDpr);
    }

    const branches = this.simulation.getBranches();
    const compactHighDensity = branches.length > 220;

    for (let index = 0; index < branches.length; index += 1) {
      const branch = branches[index];
      if (branch.life <= 0.02) continue;
      if (!suppressMainDrawing && (!compactHighDensity || shouldDrawCompactSample(branch))) {
        drawMainBranch(mainCtx, branch, { lightweight: !modalActive });
      }
    }

    if (modalCtx && modalWidth && modalHeight) {
      const modalTrees = this.modalSimulation.getTrees();
      for (let treeIndex = 0; treeIndex < modalTrees.length; treeIndex += 1) {
        const tree = modalTrees[treeIndex];
        if (tree.life <= 0.008) continue;
        drawModalRecursiveTree(modalCtx, tree, modalWidth, modalHeight, pulse);
      }
    }
    this.simulation.ageAndCompact(fadeFactor);
    if (modalActive) {
      this.modalSimulation.ageAndCompact(fadeFactor * 0.55);
    }
  }
}
