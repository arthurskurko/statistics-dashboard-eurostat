import React from 'react';

type GlobalStepInfo = {
  step: number;
  points: Array<{ seriesLabel: string; label: string; value: number; color: string }>;
};

type GlobalMusicState = {
  cardId: string;
  providerId: string;
  playing: boolean;
  stepInfo: GlobalStepInfo | null;
};

const GLOBAL_MUSIC_STATE_EVENT = 'datapoint-music-global-state';
const GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT = 'datapoint-music-global-toggle-request';

type Vec2 = { x: number; y: number };

type LightningBranch = {
  points: Vec2[];
  life: number;
  decay: number;
  width: number;
  colorRgb: { r: number; g: number; b: number };
};

type SeedPoint = {
  value: number;
  seed: number;
  color: string;
};

const FRACTAL_CENTER: Vec2 = { x: 88, y: 88 };
const FRACTAL_MAX_RADIUS = 84;
const MAX_SEEDS_PER_FRAME = 4;
const MAX_BRANCHES_RETAINED = 560;

type PendingSeed = {
  seedPoint: SeedPoint;
  index: number;
  total: number;
};

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

function buildSeedPoints(cardId: string, stepInfo: GlobalStepInfo | null): SeedPoint[] {
  if (!stepInfo || stepInfo.points.length === 0) return [];
  const capped = stepInfo.points.slice(0, 18);
  const normalized = normalizeValues(capped.map((point) => point.value));
  return capped.map((point, index) => ({
    value: normalized[index] ?? 0,
    seed: hashPoint(cardId, point.label, point.value, index, stepInfo.step),
    color: point.color,
  }));
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

function createFractalBranches(seedPoint: SeedPoint, index: number, total: number): LightningBranch[] {
  const random = mulberry32(seedPoint.seed);
  const intensity = Math.max(0.08, seedPoint.value);
  const branches: LightningBranch[] = [];
  // Use seeded circular placement so concurrent charts fill the full orbit, not only mirrored sides.
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
      colorRgb: parseHexColor(seedPoint.color),
    });

    if (depth <= 0) return;

    const branchChance = 0.5 + intensity * 0.24;
    if (random() < branchChance) {
      const childCount = random() < 0.45 ? 1 : random() < 0.86 ? 2 : 3;
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
  const depth = 3 + Math.floor(intensity * 2.8);
  const rootLength = 22 + intensity * 30;
  const rootWidth = 1 + intensity * 1.5;
  grow(root, baseAngle, rootLength, depth, rootWidth);
  return branches;
}

function drawBranch(ctx: CanvasRenderingContext2D, branch: LightningBranch) {
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
}

export function GlobalMusicTransport() {
  const [playingCount, setPlayingCount] = React.useState(0);
  const [lastCardId, setLastCardId] = React.useState<string | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const lightningRef = React.useRef<LightningBranch[]>([]);
  const pendingSeedsRef = React.useRef<PendingSeed[]>([]);
  const animationFrameRef = React.useRef<number | null>(null);
  const renderCallbackRef = React.useRef<((timestamp: number) => void) | null>(null);
  const lastFrameTimeRef = React.useRef<number | null>(null);
  const playingCardIdsRef = React.useRef(new Set<string>());
  const playingCountRef = React.useRef(0);
  const lastCardIdRef = React.useRef<string | null>(null);

  const ensureRenderLoop = React.useCallback(() => {
    if (animationFrameRef.current !== null || !renderCallbackRef.current) return;
    animationFrameRef.current = window.requestAnimationFrame(renderCallbackRef.current);
  }, []);

  React.useEffect(() => {
    const onGlobalMusicState = (event: Event) => {
      const detail = (event as CustomEvent<GlobalMusicState>).detail;
      if (!detail) return;

      if (detail.playing) {
        playingCardIdsRef.current.add(detail.cardId);
        if (lastCardIdRef.current !== detail.cardId) {
          lastCardIdRef.current = detail.cardId;
          setLastCardId(detail.cardId);
        }
      } else {
        playingCardIdsRef.current.delete(detail.cardId);
      }

      const nextPlayingCount = playingCardIdsRef.current.size;
      if (nextPlayingCount !== playingCountRef.current) {
        playingCountRef.current = nextPlayingCount;
        setPlayingCount(nextPlayingCount);
      }

      if (detail.playing && detail.stepInfo) {
        const seeds = buildSeedPoints(detail.cardId, detail.stepInfo);
        if (seeds.length > 0) {
          for (let index = 0; index < seeds.length; index += 1) {
            pendingSeedsRef.current.push({ seedPoint: seeds[index], index, total: seeds.length });
          }
          ensureRenderLoop();
        }
      }
    };

    window.addEventListener(GLOBAL_MUSIC_STATE_EVENT, onGlobalMusicState);
    return () => {
      window.removeEventListener(GLOBAL_MUSIC_STATE_EVENT, onGlobalMusicState);
    };
  }, [ensureRenderLoop]);

  React.useEffect(() => {
    const render = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameRef.current = window.requestAnimationFrame(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width * dpr));
      const nextHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameRef.current = window.requestAnimationFrame(render);
        return;
      }

      const elapsed = lastFrameTimeRef.current ? Math.min(42, timestamp - lastFrameTimeRef.current) : 16;
      lastFrameTimeRef.current = timestamp;
      const fadeFactor = elapsed / 16;

      // Spread branch generation work across frames to avoid step-time spikes.
      let generated = 0;
      while (generated < MAX_SEEDS_PER_FRAME && pendingSeedsRef.current.length > 0) {
        const pending = pendingSeedsRef.current.shift();
        if (!pending) break;
        const nextBranches = createFractalBranches(pending.seedPoint, pending.index, pending.total);
        lightningRef.current.push(...nextBranches);
        generated += 1;
      }
      if (lightningRef.current.length > MAX_BRANCHES_RETAINED) {
        lightningRef.current.splice(0, lightningRef.current.length - MAX_BRANCHES_RETAINED);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const branches = lightningRef.current;
      let writeIndex = 0;
      for (let readIndex = 0; readIndex < branches.length; readIndex += 1) {
        const branch = branches[readIndex];
        if (branch.life <= 0.02) continue;
        drawBranch(ctx, branch);
        branch.life -= branch.decay * fadeFactor;
        branches[writeIndex] = branch;
        writeIndex += 1;
      }
      branches.length = writeIndex;

      const hasWork =
        playingCountRef.current > 0 ||
        pendingSeedsRef.current.length > 0 ||
        branches.length > 0;

      if (!hasWork) {
        animationFrameRef.current = null;
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(render);
    };

    renderCallbackRef.current = render;
    ensureRenderLoop();
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      renderCallbackRef.current = null;
      lastFrameTimeRef.current = null;
    };
  }, [ensureRenderLoop]);

  const handleToggle = React.useCallback(() => {
    if (playingCount > 0) {
      window.dispatchEvent(
        new CustomEvent(GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT, {
          detail: { scope: 'playing-all' as const },
        }),
      );
      return;
    }
    if (!lastCardId) return;
    window.dispatchEvent(
      new CustomEvent(GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT, {
        detail: { cardId: lastCardId },
      }),
    );
  }, [lastCardId, playingCount]);

  const hasPlayableTarget = playingCount > 0 || Boolean(lastCardId);

  return (
    <div className="pointer-events-none fixed bottom-2 right-2 z-50 sm:bottom-3 sm:right-3">
      <div className="relative h-44 w-44 sm:h-48 sm:w-48">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.24),rgba(251,191,36,0.08)_55%,rgba(251,191,36,0.03)_78%,transparent_96%)]" />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{
            opacity: hasPlayableTarget ? 1 : 0.35,
            transition: 'opacity 220ms ease',
          }}
          aria-hidden
        />
        <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/40 bg-slate-900/62" aria-hidden />

        <button
          type="button"
          onClick={handleToggle}
          disabled={!hasPlayableTarget}
          className="pointer-events-auto absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-300/50 bg-slate-900/90 text-amber-200 shadow-lg shadow-amber-600/20 backdrop-blur-sm transition hover:scale-[1.03] hover:border-amber-200/70 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-55"
          title={playingCount > 0 ? `Pause all playing charts (${playingCount})` : lastCardId ? `Play music for ${lastCardId}` : 'Start chart music to activate'}
          aria-label={playingCount > 0 ? 'Pause all playing music' : 'Play music'}
        >
          {playingCount > 0 ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" aria-hidden>
              <path d="M8 5.5L19 12L8 18.5V5.5Z" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
