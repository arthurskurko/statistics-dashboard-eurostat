import React from 'react';
import { FractalEngine, type FractalStepInfo } from './fractal/fractalEngine';

type GlobalMusicState = {
  cardId: string;
  providerId: string;
  playing: boolean;
  stepInfo: FractalStepInfo | null;
  tempoBpm?: number;
};

const GLOBAL_MUSIC_STATE_EVENT = 'datapoint-music-global-state';
const GLOBAL_TEMPO_EVENT = 'datapoint-music-tempo-change';
const GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT = 'datapoint-music-global-toggle-request';
const COMPACT_MIN_FRAME_INTERVAL_MS = 1000 / 24;
const MODAL_MIN_FRAME_INTERVAL_MS = 1000 / 16;

type GlobalMusicToggleRequest =
  | { scope: 'playing-all' }
  | { scope: 'resume-many'; cardIds: string[] }
  | { cardId: string };

export function GlobalMusicTransport() {
  const [playingCount, setPlayingCount] = React.useState(0);
  const [lastCardId, setLastCardId] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const modalCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const fractalEngineRef = React.useRef(new FractalEngine());
  const animationFrameRef = React.useRef<number | null>(null);
  const renderCallbackRef = React.useRef<((timestamp: number) => void) | null>(null);
  const lastFrameTimeRef = React.useRef<number | null>(null);
  const lastCompactFrameTimeRef = React.useRef<number | null>(null);
  const lastModalFrameTimeRef = React.useRef<number | null>(null);
  const currentTempoRef = React.useRef(120);
  const playingCardIdsRef = React.useRef(new Set<string>());
  const pausedCardIdsRef = React.useRef<string[]>([]);
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
      // Avoid replay bursts in modal by dropping stale queued seeds at open time.
      fractalEngineRef.current.clearPendingSeeds();
      ensureRenderLoop();
      return;
    }
    // Compact fractals are disabled; clear engine state when modal closes.
    fractalEngineRef.current.clear();
  }, [modalOpen, ensureRenderLoop]);

  React.useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // When tab is backgrounded, queued visual seeds can build up and burst on return.
        fractalEngineRef.current.clearPendingSeeds();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  React.useEffect(() => {
    const onGlobalMusicState = (event: Event) => {
      const detail = (event as CustomEvent<GlobalMusicState>).detail;
      if (!detail) return;

      if (typeof detail.tempoBpm === 'number' && Number.isFinite(detail.tempoBpm)) {
        currentTempoRef.current = Math.max(30, Math.min(240, Math.round(detail.tempoBpm)));
      }

      if (detail.playing) {
        playingCardIdsRef.current.add(detail.cardId);
        pausedCardIdsRef.current = pausedCardIdsRef.current.filter((cardId) => cardId !== detail.cardId);
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

      if (detail.playing && detail.stepInfo && modalOpenRef.current) {
        fractalEngineRef.current.enqueueStep({ cardId: detail.cardId, stepInfo: detail.stepInfo });
        ensureRenderLoop();
      }
    };

    const onGlobalTempo = (event: Event) => {
      const detail = (event as CustomEvent<{ tempoBpm?: number }>).detail;
      if (!detail || typeof detail.tempoBpm !== 'number' || !Number.isFinite(detail.tempoBpm)) return;
      currentTempoRef.current = Math.max(30, Math.min(240, Math.round(detail.tempoBpm)));
    };

    window.addEventListener(GLOBAL_MUSIC_STATE_EVENT, onGlobalMusicState);
    window.addEventListener(GLOBAL_TEMPO_EVENT, onGlobalTempo);
    return () => {
      window.removeEventListener(GLOBAL_MUSIC_STATE_EVENT, onGlobalMusicState);
      window.removeEventListener(GLOBAL_TEMPO_EVENT, onGlobalTempo);
    };
  }, [ensureRenderLoop]);

  React.useEffect(() => {
    const fractalEngine = fractalEngineRef.current;

    const render = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameRef.current = window.requestAnimationFrame(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
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
      const modalDpr = Math.min(window.devicePixelRatio || 1, 1);
      if (modalOpenRef.current && modalCanvas) {
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

      const compactMode = !modalOpenRef.current;
      if (compactMode) {
        const lastCompactTs = lastCompactFrameTimeRef.current;
        if (typeof lastCompactTs === 'number' && timestamp - lastCompactTs < COMPACT_MIN_FRAME_INTERVAL_MS) {
          animationFrameRef.current = window.requestAnimationFrame(render);
          return;
        }
        lastCompactFrameTimeRef.current = timestamp;
        lastModalFrameTimeRef.current = null;
      } else {
        const lastModalTs = lastModalFrameTimeRef.current;
        if (typeof lastModalTs === 'number' && timestamp - lastModalTs < MODAL_MIN_FRAME_INTERVAL_MS) {
          animationFrameRef.current = window.requestAnimationFrame(render);
          return;
        }
        lastModalFrameTimeRef.current = timestamp;
        lastCompactFrameTimeRef.current = null;
      }

      fractalEngine.renderFrame({
        mainCtx: ctx,
        mainWidth: rect.width,
        mainHeight: rect.height,
        mainDpr: dpr,
        suppressMainDrawing: true,
        modalCtx,
        modalWidth: modalRect?.width,
        modalHeight: modalRect?.height,
        modalDpr,
        fadeFactor,
        timestampMs: timestamp,
        tempoBpm: currentTempoRef.current,
      });

      const hasWork =
        fractalEngine.hasWork() ||
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
      lastCompactFrameTimeRef.current = null;
      lastModalFrameTimeRef.current = null;
      fractalEngine.clear();
    };
  }, [ensureRenderLoop]);

  const handleToggle = React.useCallback(() => {
    if (playingCount > 0) {
      pausedCardIdsRef.current = [...playingCardIdsRef.current];
      window.dispatchEvent(
        new CustomEvent<GlobalMusicToggleRequest>(GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT, {
          detail: { scope: 'playing-all' as const },
        }),
      );
      return;
    }

    if (pausedCardIdsRef.current.length > 0) {
      window.dispatchEvent(
        new CustomEvent<GlobalMusicToggleRequest>(GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT, {
          detail: { scope: 'resume-many' as const, cardIds: [...pausedCardIdsRef.current] },
        }),
      );
      pausedCardIdsRef.current = [];
      return;
    }

    if (!lastCardId) return;
    window.dispatchEvent(
      new CustomEvent<GlobalMusicToggleRequest>(GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT, {
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
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.12),rgba(251,191,36,0.04)_58%,transparent_90%)]" />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
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
        <div className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="relative w-full max-w-[600px] overflow-hidden rounded-3xl border border-amber-400/30 bg-slate-950/90 shadow-2xl shadow-amber-900/30">
            <div className="flex items-center justify-between border-b border-amber-400/20 px-4 py-3 text-amber-100">
              <div className="text-sm uppercase tracking-[0.15em] text-amber-200/90">Fractal Forest</div>
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
