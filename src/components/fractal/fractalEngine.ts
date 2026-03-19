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

type Vec2 = { x: number; y: number };

type SeedPoint = {
  value: number;
  seed: number;
  color: string;
};

type PendingSeed = {
  seedPoint: SeedPoint;
  index: number;
  total: number;
};

type FractalBranch = {
  points: Vec2[];
  life: number;
  decay: number;
  width: number;
  tipSize: number;
  colorRgb: { r: number; g: number; b: number };
};

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

const FRACTAL_CENTER: Vec2 = { x: 88, y: 88 };
const FRACTAL_MAX_RADIUS = 84;
const MAX_SEEDS_PER_FRAME = 4;
const MAX_BRANCHES_RETAINED = 560;
const MODAL_DRAW_BUDGET = 140;

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

  const grow = (start: Vec2, angle: number, length: number, depth: number, width: number) => {
    const segmentCount = 4 + Math.floor(random() * 3);
    const points: Vec2[] = [start];
    let current = start;
    let driftAngle = angle;

    for (let i = 0; i < segmentCount; i += 1) {
      const jitter = (random() - 0.5) * (0.55 + intensity * 0.38);
      driftAngle += jitter;
      const segLength = (length / segmentCount) * (0.88 + random() * 0.54);
      current = keepInsideRadius({
        x: current.x + Math.cos(driftAngle) * segLength,
        y: current.y + Math.sin(driftAngle) * segLength,
      });
      points.push(current);
    }

    branches.push({
      points,
      life: 1,
      decay: 0.013 + random() * 0.01,
      width,
      tipSize: 1.2 + intensity * 1.35,
      colorRgb: parseHexColor(seedPoint.color),
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
        grow(anchor, childAngle, length * (0.74 + random() * 0.18), depth - 1, width * 0.78);
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
  grow(root, baseAngle, rootLength, depth, rootWidth);
  return branches;
}

function drawBranch(ctx: CanvasRenderingContext2D, branch: FractalBranch) {
  if (branch.points.length < 2 || branch.life <= 0) return;
  ctx.beginPath();
  ctx.moveTo(branch.points[0].x, branch.points[0].y);
  for (let i = 1; i < branch.points.length; i += 1) {
    const p = branch.points[i];
    ctx.lineTo(p.x, p.y);
  }
  const alpha = Math.max(0, Math.min(1, branch.life));
  const { r, g, b } = branch.colorRgb;
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.16 + alpha * 0.62})`;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.24 + alpha * 0.44})`;
  ctx.shadowBlur = 8 + alpha * 11;
  ctx.lineWidth = branch.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  const tip = branch.points[branch.points.length - 1];
  if (tip) {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, branch.tipSize * (0.7 + alpha * 0.65), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.32 + alpha * 0.6})`;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.3 + alpha * 0.5})`;
    ctx.shadowBlur = 6 + alpha * 8;
    ctx.fill();
  }
}

function drawBranchInModalHorizontal(
  ctx: CanvasRenderingContext2D,
  branch: FractalBranch,
  width: number,
  height: number,
  pulse: number,
) {
  if (branch.points.length < 2 || branch.life <= 0) return;

  const alpha = Math.max(0, Math.min(1, branch.life));
  const { r, g, b } = branch.colorRgb;
  const centerX = width * 0.5;
  const baselineY = height * 0.56;
  const pulseScale = 0.9 + pulse * 0.2;
  const root = branch.points[0];
  const rootAngle = Math.atan2(root.y - FRACTAL_CENTER.y, root.x - FRACTAL_CENTER.x);
  const rootX = centerX + Math.cos(rootAngle) * width * 0.42;
  const direction = Math.sin(rootAngle) >= 0 ? -1 : 1;

  const mapPoint = (point: Vec2): Vec2 => {
    const dx = point.x - root.x;
    const dy = point.y - root.y;
    return {
      x: rootX + dx * 2.05,
      y: baselineY + direction * (Math.abs(dy) * 1.95 + Math.abs(dx) * 0.14),
    };
  };

  const mapped: Vec2[] = branch.points.map(mapPoint);
  if (mapped.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(mapped[0].x, mapped[0].y);
  for (let i = 1; i < mapped.length; i += 1) {
    const prev = mapped[i - 1];
    const cur = mapped[i];
    const midX = (prev.x + cur.x) * 0.5;
    const midY = (prev.y + cur.y) * 0.5;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }
  const tip = mapped[mapped.length - 1];
  ctx.lineTo(tip.x, tip.y);

  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.18 + alpha * 0.56) * pulseScale})`;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${(0.2 + alpha * 0.42) * pulseScale})`;
  ctx.shadowBlur = (5 + alpha * 7) * pulseScale;
  ctx.lineWidth = Math.max(0.9, branch.width * 1.35);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(tip.x, tip.y, Math.max(1.1, branch.tipSize * 0.95 * pulseScale), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.24 + alpha * 0.5) * pulseScale})`;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${(0.2 + alpha * 0.42) * pulseScale})`;
  ctx.shadowBlur = (6 + alpha * 7) * pulseScale;
  ctx.fill();
}

export class FractalEngine {
  private readonly branches: FractalBranch[] = [];
  private readonly pendingSeeds: PendingSeed[] = [];

  enqueueStep(packet: FractalStepPacket): void {
    const seeds = buildSeedPoints(packet);
    for (let index = 0; index < seeds.length; index += 1) {
      this.pendingSeeds.push({
        seedPoint: seeds[index],
        index,
        total: seeds.length,
      });
    }
  }

  clear(): void {
    this.pendingSeeds.length = 0;
    this.branches.length = 0;
  }

  hasWork(): boolean {
    return this.pendingSeeds.length > 0 || this.branches.length > 0;
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

    let generated = 0;
    while (generated < MAX_SEEDS_PER_FRAME && this.pendingSeeds.length > 0) {
      const pending = this.pendingSeeds.shift();
      if (!pending) break;
      const nextBranches = createFractalBranches(pending.seedPoint, pending.index, pending.total);
      this.branches.push(...nextBranches);
      generated += 1;
    }

    if (this.branches.length > MAX_BRANCHES_RETAINED) {
      this.branches.splice(0, this.branches.length - MAX_BRANCHES_RETAINED);
    }

    mainCtx.setTransform(mainDpr, 0, 0, mainDpr, 0, 0);
    mainCtx.clearRect(0, 0, mainWidth, mainHeight);

    let pulse = 0.5 + 0.5 * Math.sin(timestampMs * 0.01);
    if (typeof tempoBpm === 'number' && Number.isFinite(tempoBpm)) {
      const freq = Math.max(30, Math.min(240, tempoBpm)) / 60;
      pulse = 0.5 + 0.5 * Math.sin((timestampMs / 1000) * Math.PI * 2 * freq);
    }

    if (modalCtx && modalWidth && modalHeight && modalDpr) {
      modalCtx.setTransform(modalDpr, 0, 0, modalDpr, 0, 0);
      modalCtx.clearRect(0, 0, modalWidth, modalHeight);
      modalCtx.fillStyle = 'rgba(2, 10, 26, 0.92)';
      modalCtx.fillRect(0, 0, modalWidth, modalHeight);
    }

    let modalDrawBudget = MODAL_DRAW_BUDGET;
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.branches.length; readIndex += 1) {
      const branch = this.branches[readIndex];
      if (branch.life <= 0.02) continue;
      drawBranch(mainCtx, branch);
      if (modalCtx && modalWidth && modalHeight && modalDrawBudget > 0) {
        drawBranchInModalHorizontal(modalCtx, branch, modalWidth, modalHeight, pulse);
        modalDrawBudget -= 1;
      }
      branch.life -= branch.decay * fadeFactor;
      this.branches[writeIndex] = branch;
      writeIndex += 1;
    }
    this.branches.length = writeIndex;
  }
}
