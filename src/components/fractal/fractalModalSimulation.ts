import type { FractalStepPacket, Vec2 } from './fractalTypes';

type ModalSeedPoint = {
  value: number;
  seed: number;
  color: string;
};

type PendingModalSeed = {
  seedPoint: ModalSeedPoint;
  index: number;
  total: number;
  enqueuedAtMs: number;
};

export type ModalFractalSegment = {
  a: Vec2;
  b: Vec2;
  width: number;
  generation: number;
};

export type ModalFractalTree = {
  segments: ModalFractalSegment[];
  life: number;
  decay: number;
  colorRgb: { r: number; g: number; b: number };
  seedId: number;
};

const MODAL_TREE_CENTER_X = 88;
const MODAL_TREE_BASELINE_Y = 180;

function normalizeValues(values: number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values.map((value) => Math.abs(value)), 0.000001);
  return values.map((value) => Math.max(0, Math.min(1, Math.abs(value) / max)));
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let next = Math.imul(t ^ (t >>> 15), 1 | t);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function hashPoint(cardId: string, label: string, value: number, index: number, step: number): number {
  let hash = (2166136261 ^ step ^ index) >>> 0;
  for (let i = 0; i < cardId.length; i += 1) {
    hash ^= cardId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  for (let i = 0; i < label.length; i += 1) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const valueHash = Math.floor(Math.abs(value) * 1000) >>> 0;
  hash ^= valueHash;
  hash = Math.imul(hash, 16777619);
  return hash >>> 0;
}

function parseHexColor(color: string): { r: number; g: number; b: number } {
  const compact = color.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(compact)) {
    return { r: 245, g: 158, b: 11 };
  }
  return {
    r: Number.parseInt(compact.slice(0, 2), 16),
    g: Number.parseInt(compact.slice(2, 4), 16),
    b: Number.parseInt(compact.slice(4, 6), 16),
  };
}

function buildModalSeedPoints(packet: FractalStepPacket): ModalSeedPoint[] {
  const stepInfo = packet.stepInfo;
  if (!stepInfo || stepInfo.points.length === 0) return [];
  const capped = stepInfo.points.slice(0, 10);
  const normalized = normalizeValues(capped.map((point) => point.value));
  return capped.map((point, index) => ({
    value: normalized[index] ?? 0,
    seed: hashPoint(packet.cardId, point.label, point.value, index, stepInfo.step),
    color: point.color,
  }));
}

function createModalFractalTree(seedPoint: ModalSeedPoint, index: number, total: number): ModalFractalTree {
  const random = mulberry32(seedPoint.seed);
  const intensity = Math.max(0.08, seedPoint.value);
  const segments: ModalFractalSegment[] = [];

  const centerSpread = total > 1 ? (index / Math.max(1, total - 1) - 0.5) * 13 : 0;
  const trunkRoot: Vec2 = {
    x: MODAL_TREE_CENTER_X + centerSpread,
    y: MODAL_TREE_BASELINE_Y,
  };

  const trunkLength = 21 + intensity * 30;
  const trunkWidth = 1.15 + intensity * 1.25;
  const minLength = 6 + intensity * 2;
  const shrink = 0.69 + random() * 0.08;
  const maxDepth = 8;
  const trunkAngle = -Math.PI / 2 + (random() - 0.5) * 0.08;

  const grow = (p1: Vec2, length: number, angle: number, width: number, depth: number): void => {
    const p2: Vec2 = {
      x: p1.x + Math.cos(angle) * length,
      y: p1.y + Math.sin(angle) * length,
    };

    segments.push({
      a: p1,
      b: p2,
      width,
      generation: depth,
    });

    if (length <= minLength || depth >= maxDepth) return;

    const angleDelta = random() * (Math.PI / 4);
    const nextLength = length * shrink;
    const nextWidth = width * 0.82;

    // This mirrors the simple recursive split from 3.html: same endpoint, +angle and -angle.
    grow(p2, nextLength, angle + angleDelta, nextWidth, depth + 1);
    grow(p2, nextLength, angle - angleDelta, nextWidth, depth + 1);
  };

  grow(trunkRoot, trunkLength, trunkAngle, trunkWidth, 0);

  return {
    segments,
    life: 1,
    decay: 0.004 + random() * 0.004,
    colorRgb: parseHexColor(seedPoint.color),
    seedId: seedPoint.seed,
  };
}

export class FractalModalSimulation {
  private readonly trees: ModalFractalTree[] = [];
  private readonly pendingSeeds: PendingModalSeed[] = [];

  enqueueStep(packet: FractalStepPacket): void {
    const nowMs = performance.now();
    const seeds = buildModalSeedPoints(packet);
    for (let index = 0; index < seeds.length; index += 1) {
      this.pendingSeeds.push({
        seedPoint: seeds[index],
        index,
        total: seeds.length,
        enqueuedAtMs: nowMs,
      });
    }
  }

  clearPendingSeeds(): void {
    this.pendingSeeds.length = 0;
  }

  clear(): void {
    this.pendingSeeds.length = 0;
    this.trees.length = 0;
  }

  hasWork(): boolean {
    return this.pendingSeeds.length > 0 || this.trees.length > 0;
  }

  prepareFrame(maxSeedsPerFrame: number, maxTreesRetained: number, nowMs: number, staleSeedMaxAgeMs: number, maxPendingSeeds: number): void {
    const staleCutoff = nowMs - staleSeedMaxAgeMs;
    while (this.pendingSeeds.length > 0 && this.pendingSeeds[0].enqueuedAtMs < staleCutoff) {
      this.pendingSeeds.shift();
    }

    if (this.pendingSeeds.length > maxPendingSeeds) {
      this.pendingSeeds.splice(0, this.pendingSeeds.length - maxPendingSeeds);
    }

    let generated = 0;
    while (generated < maxSeedsPerFrame && this.pendingSeeds.length > 0) {
      const pending = this.pendingSeeds.shift();
      if (!pending) break;
      this.trees.push(createModalFractalTree(pending.seedPoint, pending.index, pending.total));
      generated += 1;
    }

    if (this.trees.length > maxTreesRetained) {
      this.trees.splice(0, this.trees.length - maxTreesRetained);
    }
  }

  getTrees(): readonly ModalFractalTree[] {
    return this.trees;
  }

  ageAndCompact(fadeFactor: number, minLife = 0.02): void {
    const smoothedFadeFactor = Math.max(0.65, Math.min(1.25, fadeFactor));
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.trees.length; readIndex += 1) {
      const tree = this.trees[readIndex];
      if (tree.life <= minLife) continue;
      tree.life -= tree.decay * smoothedFadeFactor;
      this.trees[writeIndex] = tree;
      writeIndex += 1;
    }
    this.trees.length = writeIndex;
  }
}
