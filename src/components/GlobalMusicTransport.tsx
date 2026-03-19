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
  tipSize: number;
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

  // Render a glowing terminal tip so branch endings are readable at small size.
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
  branch: LightningBranch,
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

export function GlobalMusicTransport() {
  const [playingCount, setPlayingCount] = React.useState(0);
  const [lastCardId, setLastCardId] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const modalCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const lightningRef = React.useRef<LightningBranch[]>([]);
  const pendingSeedsRef = React.useRef<PendingSeed[]>([]);
  const animationFrameRef = React.useRef<number | null>(null);
  const renderCallbackRef = React.useRef<((timestamp: number) => void) | null>(null);
  const lastFrameTimeRef = React.useRef<number | null>(null);
  const playingCardIdsRef = React.useRef(new Set<string>());
  const playingCountRef = React.useRef(0);
  const lastCardIdRef = React.useRef<string | null>(null);
  const modalOpenRef = React.useRef(false);

  const ensureRenderLoop = React.useCallback(() => {
    if (animationFrameRef.current !== null || !renderCallbackRef.current) return;
    animationFrameRef.current = window.requestAnimationFrame(renderCallbackRef.current);
  }, []);

  React.useEffect(() => {
    modalOpenRef.current = modalOpen;
    if (modalOpen) {
      ensureRenderLoop();
    }
  }, [modalOpen, ensureRenderLoop]);

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
            const seedPoint = seeds[index];
            pendingSeedsRef.current.push({ seedPoint, index, total: seeds.length });
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

      const modalCanvas = modalCanvasRef.current;
      let modalCtx: CanvasRenderingContext2D | null = null;
      let modalRect: DOMRect | null = null;
      let modalDpr = dpr;
      if (modalOpenRef.current && modalCanvas) {
        modalDpr = Math.min(window.devicePixelRatio || 1, 2);
        modalRect = modalCanvas.getBoundingClientRect();
        const modalWidth = Math.max(1, Math.round(modalRect.width * modalDpr));
        const modalHeight = Math.max(1, Math.round(modalRect.height * modalDpr));
        if (modalCanvas.width !== modalWidth || modalCanvas.height !== modalHeight) {
          modalCanvas.width = modalWidth;
          modalCanvas.height = modalHeight;
        }
        modalCtx = modalCanvas.getContext('2d');
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
      const modalPulse = 0.5 + 0.5 * Math.sin(timestamp * 0.01);
      if (modalCtx && modalRect) {
        modalCtx.setTransform(modalDpr, 0, 0, modalDpr, 0, 0);
        modalCtx.clearRect(0, 0, modalRect.width, modalRect.height);
        modalCtx.fillStyle = 'rgba(2, 10, 26, 0.92)';
        modalCtx.fillRect(0, 0, modalRect.width, modalRect.height);
      }

      const branches = lightningRef.current;
      let modalDrawBudget = 140;
      let writeIndex = 0;
      for (let readIndex = 0; readIndex < branches.length; readIndex += 1) {
        const branch = branches[readIndex];
        if (branch.life <= 0.02) continue;
        drawBranch(ctx, branch);
        if (modalCtx && modalRect && modalDrawBudget > 0) {
          drawBranchInModalHorizontal(modalCtx, branch, modalRect.width, modalRect.height, modalPulse);
          modalDrawBudget -= 1;
        }
        branch.life -= branch.decay * fadeFactor;
        branches[writeIndex] = branch;
        writeIndex += 1;
      }
      branches.length = writeIndex;

      const hasWork =
        playingCountRef.current > 0 ||
        pendingSeedsRef.current.length > 0 ||
        branches.length > 0 ||
        modalOpenRef.current;

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
  const showEnlargeAction = playingCount > 0;

  return (
    <>
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

        <div className="pointer-events-auto absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
          <button
            type="button"
            onClick={handleToggle}
            disabled={!hasPlayableTarget}
            className={`flex h-14 items-center justify-center border border-amber-300/50 bg-slate-900/90 text-amber-200 shadow-lg shadow-amber-600/20 backdrop-blur-sm transition-all duration-200 hover:border-amber-200/70 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-55 ${showEnlargeAction ? 'w-12 rounded-r-none border-r-0' : 'w-14 rounded-full'}`}
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

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex h-14 items-center justify-center overflow-hidden rounded-r-full border border-amber-300/45 bg-slate-900/90 text-amber-200 shadow-lg shadow-amber-600/15 transition-all duration-200 hover:border-amber-200/70 hover:text-amber-100"
            style={{
              width: showEnlargeAction ? '3rem' : '0rem',
              opacity: showEnlargeAction ? 1 : 0,
              pointerEvents: showEnlargeAction ? 'auto' : 'none',
              borderLeftWidth: showEnlargeAction ? '1px' : '0px',
              borderLeftColor: 'rgba(252, 211, 77, 0.35)',
            }}
            title="Enlarge fractal view"
            aria-label="Open fractal modal"
            disabled={!showEnlargeAction}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path d="M4 9V4H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M20 9V4H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M4 15V20H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M20 15V20H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        </div>
      </div>
      </div>

      {modalOpen ? (
        <div className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-[600px] overflow-hidden rounded-3xl border border-amber-400/30 bg-slate-950/90 shadow-2xl shadow-amber-900/30">
            <div className="flex items-center justify-between border-b border-amber-400/20 px-4 py-3 text-amber-100">
              <div className="text-sm uppercase tracking-[0.15em] text-amber-200/90">Fractal Forest + Lightning</div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-full border border-amber-300/45 px-2.5 py-1 text-sm font-semibold text-amber-200 transition hover:border-amber-200/80 hover:text-amber-100"
                aria-label="Close fractal modal"
              >
                X
              </button>
            </div>
            <div className="relative h-[420px] w-full bg-slate-950/95">
              <canvas ref={modalCanvasRef} className="h-full w-full" aria-hidden />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
