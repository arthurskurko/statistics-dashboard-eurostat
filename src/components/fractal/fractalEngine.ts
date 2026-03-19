import { drawMainBranch, drawModalHorizontalBranch, clearMainCanvas, clearModalCanvas, computeTempoPulse } from './fractalRenderers';
import { FractalSimulation } from './fractalSimulation';
import type { FractalStepPacket } from './fractalTypes';

export type { FractalStepPoint, FractalStepInfo, FractalStepPacket } from './fractalTypes';

export type FractalFrameParams = {
  mainCtx: CanvasRenderingContext2D;
  mainWidth: number;
  mainHeight: number;
  mainDpr: number;
  modalCtx?: CanvasRenderingContext2D | null;
  modalWidth?: number;
  modalHeight?: number;
  modalDpr?: number;
  fadeFactor: number;
  timestampMs: number;
  tempoBpm?: number;
};

const MAX_SEEDS_PER_FRAME = 4;
const MAX_BRANCHES_RETAINED = 560;
const MODAL_DRAW_BUDGET = 140;

export class FractalEngine {
  private readonly simulation = new FractalSimulation();

  enqueueStep(packet: FractalStepPacket): void {
    this.simulation.enqueueStep(packet);
  }

  clear(): void {
    this.simulation.clear();
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
      modalCtx,
      modalWidth,
      modalHeight,
      modalDpr,
      fadeFactor,
      timestampMs,
      tempoBpm,
    } = params;

    this.simulation.prepareFrame(MAX_SEEDS_PER_FRAME, MAX_BRANCHES_RETAINED);

    clearMainCanvas(mainCtx, mainWidth, mainHeight, mainDpr);
    const pulse = computeTempoPulse(timestampMs, tempoBpm);

    if (modalCtx && modalWidth && modalHeight && modalDpr) {
      clearModalCanvas(modalCtx, modalWidth, modalHeight, modalDpr);
    }

    let modalDrawBudget = MODAL_DRAW_BUDGET;
    for (const branch of this.simulation.getBranches()) {
      if (branch.life <= 0.02) continue;
      drawMainBranch(mainCtx, branch);
      if (modalCtx && modalWidth && modalHeight && modalDrawBudget > 0) {
        drawModalHorizontalBranch(modalCtx, branch, modalWidth, modalHeight, pulse);
        modalDrawBudget -= 1;
      }
    }
    this.simulation.ageAndCompact(fadeFactor);
  }
}
