import type { FractalBranch, FractalStepPacket, Vec2 } from './fractalTypes';

type SeedPoint = {
  value: number;
  seed: number;
  color: string;
};

type PendingSeed = {
  seedPoint: SeedPoint;
  index: number;
  total: number;
  enqueuedAtMs: number;
};

const FRACTAL_CENTER: Vec2 = { x: 88, y: 88 };
const FRACTAL_MAX_RADIUS = 84;

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

function buildSeedPoints(packet: FractalStepPacket): SeedPoint[] {
  const stepInfo = packet.stepInfo;
  if (!stepInfo || stepInfo.points.length === 0) return [];
  const capped = stepInfo.points.slice(0, 18);
  const normalized = normalizeValues(capped.map((point) => point.value));
  return capped.map((point, index) => ({
    value: normalized[index] ?? 0,
    seed: hashPoint(packet.cardId, point.label, point.value, index, stepInfo.step),
    color: point.color,
  }));
}

function createFractalBranches(seedPoint: SeedPoint, index: number, total: number): FractalBranch[] {
  const random = mulberry32(seedPoint.seed);
  const intensity = Math.max(0.08, seedPoint.value);
  const branches: FractalBranch[] = [];
  const baseAngle = random() * Math.PI * 2 + (index / Math.max(total, 1)) * 0.45;

  const keepInsideRadius = (point: Vec2): Vec2 => {
    const dx = point.x - FRACTAL_CENTER.x;
    const dy = point.y - FRACTAL_CENTER.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= FRACTAL_MAX_RADIUS) return point;
    const scale = FRACTAL_MAX_RADIUS / Math.max(dist, 0.0001);
    return {
      x: FRACTAL_CENTER.x + dx * scale,
      y: FRACTAL_CENTER.y + dy * scale,
    };
  };

  const grow = (start: Vec2, angle: number, length: number, depth: number, width: number, generation: number, seedRoot: Vec2) => {
    const segmentCount = 4 + Math.floor(random() * 3);
    const points: Vec2[] = [start];
    let current = start;
    let driftAngle = angle;
    let pathLength = 0;

    for (let i = 0; i < segmentCount; i += 1) {
      const jitter = (random() - 0.5) * (0.55 + intensity * 0.38);
      driftAngle += jitter;
      const segLength = (length / segmentCount) * (0.88 + random() * 0.54);
      current = keepInsideRadius({
        x: current.x + Math.cos(driftAngle) * segLength,
        y: current.y + Math.sin(driftAngle) * segLength,
      });
      pathLength += segLength;
      points.push(current);
    }

    branches.push({
      points,
      life: 1,
      decay: 0.013 + random() * 0.01,
      width,
      tipSize: 1.2 + intensity * 1.35,
      colorRgb: parseHexColor(seedPoint.color),
      seedId: seedPoint.seed,
      seedRoot,
      generation,
      pathLength,
    });

    if (depth <= 0) return;

    const branchChance = 0.56 + intensity * 0.26;
    if (random() < branchChance) {
      const childCount = random() < 0.3 ? 1 : random() < 0.78 ? 2 : 3;
      for (let child = 0; child < childCount; child += 1) {
        const anchorIndex = Math.max(1, Math.floor(points.length * (0.32 + random() * 0.38)));
        const anchor = points[Math.min(anchorIndex, points.length - 1)] ?? current;
        const branchBias = child === 0 ? -1 : child === 1 ? 1 : 0;
        const childAngle = driftAngle + (random() - 0.5) * 1.35 + branchBias * (0.22 + random() * 0.12);
        grow(anchor, childAngle, length * (0.74 + random() * 0.18), depth - 1, width * 0.78, generation + 1, seedRoot);
      }
    }
  };

  const entryRadius = 10 + random() * 8;
  const root: Vec2 = {
    x: FRACTAL_CENTER.x + Math.cos(baseAngle) * entryRadius,
    y: FRACTAL_CENTER.y + Math.sin(baseAngle) * entryRadius,
  };
  const depth = 3 + Math.floor(intensity * 3.2);
  const rootLength = 22 + intensity * 30;
  const rootWidth = 1 + intensity * 1.5;
  grow(root, baseAngle, rootLength, depth, rootWidth, 0, root);
  return branches;
}

export class FractalSimulation {
  private readonly branches: FractalBranch[] = [];
  private readonly pendingSeeds: PendingSeed[] = [];

  enqueueStep(packet: FractalStepPacket): void {
    const nowMs = performance.now();
    const seeds = buildSeedPoints(packet);
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
    this.branches.length = 0;
  }

  hasWork(): boolean {
    return this.pendingSeeds.length > 0 || this.branches.length > 0;
  }

  prepareFrame(
    maxSeedsPerFrame: number,
    maxBranchesRetained: number,
    nowMs: number,
    staleSeedMaxAgeMs: number,
    maxPendingSeeds: number,
  ): void {
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
      const nextBranches = createFractalBranches(pending.seedPoint, pending.index, pending.total);
      this.branches.push(...nextBranches);
      generated += 1;
    }

    if (this.branches.length > maxBranchesRetained) {
      this.branches.splice(0, this.branches.length - maxBranchesRetained);
    }
  }

  getBranches(): readonly FractalBranch[] {
    return this.branches;
  }

  ageAndCompact(fadeFactor: number, minLife = 0.02): void {
    const smoothedFadeFactor = Math.max(0.65, Math.min(1.25, fadeFactor));
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.branches.length; readIndex += 1) {
      const branch = this.branches[readIndex];
      if (branch.life <= minLife) continue;
      branch.life -= branch.decay * smoothedFadeFactor;
      this.branches[writeIndex] = branch;
      writeIndex += 1;
    }
    this.branches.length = writeIndex;
  }
}
