import React from 'react';
import type { DataSeries } from '../../features/dashboard/types';
import { DataPointMusicPlayer, type MusicPlaybackMode } from '../../lib/datapointMusic';

const VISUAL_STEP_UPDATE_MIN_INTERVAL_MS = 90;
const GLOBAL_TEMPO_SYNC_EVENT = 'datapoint-music-tempo-sync-change';
const GLOBAL_TEMPO_EVENT = 'datapoint-music-tempo-change';
const GLOBAL_MUSIC_STATE_EVENT = 'datapoint-music-global-state';
const GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT = 'datapoint-music-global-toggle-request';
const STARTUP_INSTRUMENTS: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];

function hashSeed(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function createStartupAudioDefaults(seedKey: string): {
  instrument: OscillatorType;
  octaveShift: number;
  volume: number;
  playbackMode: MusicPlaybackMode;
  delayTime: number;
} {
  const random = mulberry32(hashSeed(seedKey));
  const instrument = STARTUP_INSTRUMENTS[Math.floor(random() * STARTUP_INSTRUMENTS.length)] ?? 'triangle';
  const playbackMode = random() < 0.9 ? 'points' : 'line';
  // Weighted toward -1 so defaults are less bright/harsh across many charts.
  const octaveChoices = [-3, -2, -1, -1, -1, 0, 0, 1, 2, 3];
  const octaveShift = octaveChoices[Math.floor(random() * octaveChoices.length)] ?? -1;
  const isBrightInstrument = instrument === 'square' || instrument === 'sawtooth';

  // Keep startup volume musically sensible and bounded (0..1) for all instruments.
  // Bright waveforms need a stricter octave curve to avoid harsh starts.
  const brightVolumeByOctave: Record<number, number> = {
    [-3]: 0.68,
    [-2]: 0.64,
    [-1]: 0.60,
    [0]: 0.56,
    [1]: 0.48,
    [2]: 0.40,
    [3]: 0.32,
  };

  const neutralVolumeByOctave: Record<number, number> = {
    [-3]: 0.92,
    [-2]: 0.86,
    [-1]: 0.80,
    [0]: 0.74,
    [1]: 0.66,
    [2]: 0.58,
    [3]: 0.50,
  };

  const rawVolume = isBrightInstrument
    ? (brightVolumeByOctave[octaveShift] ?? 0.56)
    : (neutralVolumeByOctave[octaveShift] ?? 0.74);

  const volume = Math.max(0, Math.min(1, rawVolume));
  const delayTime = random() < 0.5 ? 0.18 : 0.36;
  return { instrument, octaveShift, volume, playbackMode, delayTime };
}

let globalTempoSyncEnabledState = true;
let globalTempoBpmState = 120;

type UseChartMusicArgs = {
  cardId: string;
  providerId: string;
  filteredSeries: DataSeries[];
  visualUpdatesEnabled?: boolean;
  onVisualStep?: (stepInfo: MusicVisualStepInfo | null) => void;
};

export type MusicVisualStepInfo = {
  step: number;
  points: Array<{ seriesLabel: string; label: string; value: number; color: string }>;
};

export function useChartMusic({ providerId, cardId, filteredSeries, visualUpdatesEnabled = true, onVisualStep }: UseChartMusicArgs) {
  const startupAudioDefaults = React.useMemo(
    () => createStartupAudioDefaults(`${providerId}:${cardId}`),
    [providerId, cardId],
  );

  const [musicPlaying, setMusicPlaying] = React.useState(false);
  const [musicModalOpen, setMusicModalOpen] = React.useState(false);
  const [musicTempo, setMusicTempoState] = React.useState(globalTempoBpmState);
  const [globalTempoSyncEnabled, setGlobalTempoSyncEnabledState] = React.useState(globalTempoSyncEnabledState);
  const [musicPlaybackMode, setMusicPlaybackMode] = React.useState<MusicPlaybackMode>(startupAudioDefaults.playbackMode);
  const [musicScale, setMusicScale] = React.useState<'major' | 'minor' | 'pentatonic' | 'chromatic'>('pentatonic');
  const [musicOctaveShift, setMusicOctaveShift] = React.useState(startupAudioDefaults.octaveShift);
  const [musicInstrument, setMusicInstrument] = React.useState<OscillatorType | 'auto'>(startupAudioDefaults.instrument);
  const [musicArpeggiate, setMusicArpeggiate] = React.useState(false);
  const [musicSwing, setMusicSwing] = React.useState(0);
  const [musicDelayTime, setMusicDelayTime] = React.useState(startupAudioDefaults.delayTime);
  const [musicDelayFeedback, setMusicDelayFeedback] = React.useState(0.35);
  const [musicReverbWet, setMusicReverbWet] = React.useState(0.18);
  const [musicReverbDecay, setMusicReverbDecay] = React.useState(2.4);
  const [musicVolume, setMusicVolume] = React.useState(startupAudioDefaults.volume);
  const [musicPhaseOffset, setMusicPhaseOffset] = React.useState(0);
  const [globalRecording, setGlobalRecording] = React.useState(() => DataPointMusicPlayer.isGlobalRecording());
  const [globalRecordingBusy, setGlobalRecordingBusy] = React.useState(false);

  const musicPlayerRef = React.useRef<DataPointMusicPlayer | null>(null);
  const lastSeriesSignatureRef = React.useRef<string>('');
  const lastVisualStepUpdateMsRef = React.useRef(0);
  const lastVisualStepInfoRef = React.useRef<MusicVisualStepInfo | null>(null);
  const musicPlayingRef = React.useRef(false);
  const musicTempoRef = React.useRef(globalTempoBpmState);
  const applySettingsRafRef = React.useRef<number | null>(null);

  const seriesSignature = React.useMemo(() => {
    let hash = 2166136261 >>> 0;
    const mix = (value: string | number) => {
      const str = typeof value === 'number' ? String(value) : value;
      for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    };

    mix(filteredSeries.length);
    for (let index = 0; index < filteredSeries.length; index += 1) {
      const series = filteredSeries[index];
      mix(series.id);
      mix(series.label);
      mix(series.points.length);
      const first = series.points[0];
      const last = series.points[series.points.length - 1];
      if (first) {
        mix(first.label);
        mix(first.value);
      }
      if (last) {
        mix(last.label);
        mix(last.value);
      }
    }

    return String(hash >>> 0);
  }, [filteredSeries]);

  const seriesColorByLabel = React.useMemo(() => {
    const baseColors = new Map<string, string>([
      ['Estonia', '#00e676'],
      ['Estonia - Total', '#00e676'],
      ['Estonia - Males', '#a855f7'],
      ['Estonia - Females', '#facc15'],
      ['European Union - 27 countries (from 2020)', '#4c9aff'],
    ]);

    const normalizeSeriesLabel = (label: string) => {
      const estonia = /Estonia/i.test(label);
      if (!estonia) return label;

      if (/\bTotal\b/i.test(label) || /^Estonia\s*$/i.test(label)) return 'Estonia - Total';
      if (/\bMales?\b/i.test(label)) return 'Estonia - Males';
      if (/\bFemales?\b/i.test(label)) return 'Estonia - Females';
      return label;
    };

    const palette = ['#00e676', '#4c9aff', '#f97316', '#a855f7', '#facc15', '#ec4899', '#22c55e', '#38bdf8', '#f43f5e'];
    const colorMap = new Map<string, string>(baseColors);
    const usedColors = new Set<string>(colorMap.values());
    let nextPaletteIndex = 0;

    filteredSeries
      .map((series) => normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, '')))
      .filter((label, index, arr) => arr.indexOf(label) === index)
      .forEach((baseLabel) => {
        if (!colorMap.has(baseLabel)) {
          while (usedColors.has(palette[nextPaletteIndex % palette.length])) {
            nextPaletteIndex += 1;
          }
          const color = palette[nextPaletteIndex % palette.length];
          usedColors.add(color);
          colorMap.set(baseLabel, color);
          nextPaletteIndex += 1;
        }
      });

    const byRawSeriesLabel = new Map<string, string>();
    filteredSeries.forEach((series) => {
      const normalizedLabel = normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, ''));
      byRawSeriesLabel.set(series.label, colorMap.get(normalizedLabel) ?? '#4c9aff');
    });

    return byRawSeriesLabel;
  }, [filteredSeries]);

  React.useEffect(() => {
    musicPlayingRef.current = musicPlaying;
  }, [musicPlaying]);

  React.useEffect(() => {
    musicTempoRef.current = musicTempo;
  }, [musicTempo]);

  const emitGlobalMusicState = React.useCallback(
    (
      playing: boolean,
      stepInfo?: {
        step: number;
        points: Array<{ seriesLabel: string; label: string; value: number; color: string }>;
      } | null,
    ) => {
      window.dispatchEvent(
        new CustomEvent(GLOBAL_MUSIC_STATE_EVENT, {
          detail: {
            cardId,
            providerId,
            playing,
            stepInfo: stepInfo ?? null,
            tempoBpm: musicTempoRef.current,
          },
        }),
      );
    },
    [cardId, providerId],
  );

  const setMusicTempo = React.useCallback(
    (value: number) => {
      const nextTempo = Math.max(30, Math.min(240, Math.round(value)));

      if (globalTempoSyncEnabled) {
        globalTempoBpmState = nextTempo;
        setMusicTempoState(nextTempo);
        window.dispatchEvent(
          new CustomEvent(GLOBAL_TEMPO_EVENT, {
            detail: { tempoBpm: nextTempo },
          }),
        );
        return;
      }

      setMusicTempoState(nextTempo);
    },
    [globalTempoSyncEnabled],
  );

  const setGlobalTempoSyncEnabled = React.useCallback(
    (enabled: boolean) => {
      globalTempoSyncEnabledState = enabled;
      setGlobalTempoSyncEnabledState(enabled);

      if (enabled) {
        globalTempoBpmState = musicTempo;
        window.dispatchEvent(
          new CustomEvent(GLOBAL_TEMPO_EVENT, {
            detail: { tempoBpm: globalTempoBpmState },
          }),
        );
      }

      window.dispatchEvent(
        new CustomEvent(GLOBAL_TEMPO_SYNC_EVENT, {
          detail: { enabled, tempoBpm: globalTempoBpmState },
        }),
      );
    },
    [musicTempo],
  );

  const handleMusicStep = React.useCallback(
    (info: {
      step: number;
      points: Array<{ seriesLabel: string; label: string; value: number }>;
    }) => {
      const now = performance.now();
      if (now - lastVisualStepUpdateMsRef.current < VISUAL_STEP_UPDATE_MIN_INTERVAL_MS) {
        return;
      }
      lastVisualStepUpdateMsRef.current = now;
      const stepInfoWithColor = {
        step: info.step,
        points: info.points.map((point) => ({
          ...point,
          color: seriesColorByLabel.get(point.seriesLabel) ?? '#f59e0b',
        })),
      };
      lastVisualStepInfoRef.current = stepInfoWithColor;
      if (visualUpdatesEnabled) {
        onVisualStep?.(stepInfoWithColor);
      }
      if (musicPlayingRef.current) {
        emitGlobalMusicState(true, stepInfoWithColor);
      }
    },
    [emitGlobalMusicState, onVisualStep, seriesColorByLabel, visualUpdatesEnabled],
  );

  React.useEffect(() => {
    if (!visualUpdatesEnabled) return;
    onVisualStep?.(lastVisualStepInfoRef.current);
  }, [onVisualStep, visualUpdatesEnabled]);

  React.useEffect(() => {
    const syncTempo = (event: Event) => {
      const detail = (event as CustomEvent<{ tempoBpm?: number }>).detail;
      if (!detail || typeof detail.tempoBpm !== 'number') return;

      const nextTempo = Math.max(30, Math.min(240, Math.round(detail.tempoBpm)));
      globalTempoBpmState = nextTempo;
      setMusicTempoState(nextTempo);
    };

    const syncToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean; tempoBpm?: number }>).detail;
      if (!detail || typeof detail.enabled !== 'boolean') return;

      globalTempoSyncEnabledState = detail.enabled;
      setGlobalTempoSyncEnabledState(detail.enabled);

      if (detail.enabled && typeof detail.tempoBpm === 'number') {
        const nextTempo = Math.max(30, Math.min(240, Math.round(detail.tempoBpm)));
        globalTempoBpmState = nextTempo;
        setMusicTempoState(nextTempo);
      }
    };

    window.addEventListener(GLOBAL_TEMPO_EVENT, syncTempo);
    window.addEventListener(GLOBAL_TEMPO_SYNC_EVENT, syncToggle);
    return () => {
      window.removeEventListener(GLOBAL_TEMPO_EVENT, syncTempo);
      window.removeEventListener(GLOBAL_TEMPO_SYNC_EVENT, syncToggle);
    };
  }, []);

  React.useEffect(() => {
    if (!globalTempoSyncEnabled) return;
    setMusicTempoState(globalTempoBpmState);
  }, [globalTempoSyncEnabled]);

  React.useEffect(() => {
    if (!musicPlayerRef.current) {
      musicPlayerRef.current = new DataPointMusicPlayer(filteredSeries, {
        onStep: handleMusicStep,
      });
      lastSeriesSignatureRef.current = seriesSignature;
      return;
    }

    musicPlayerRef.current.setStepCallback(handleMusicStep);
    if (lastSeriesSignatureRef.current !== seriesSignature) {
      musicPlayerRef.current.setSeries(filteredSeries);
      lastSeriesSignatureRef.current = seriesSignature;
    }

    if (filteredSeries.length === 0 && musicPlaying) {
      setMusicPlaying(false);
    }
  }, [
    filteredSeries,
    seriesSignature,
    musicPlaying,
    handleMusicStep,
  ]);

  React.useEffect(() => {
    if (applySettingsRafRef.current !== null) {
      window.cancelAnimationFrame(applySettingsRafRef.current);
    }

    applySettingsRafRef.current = window.requestAnimationFrame(() => {
      applySettingsRafRef.current = null;
      const player = musicPlayerRef.current;
      if (!player) return;

      player.setTempo(musicTempo);
      player.setPlaybackMode(musicPlaybackMode);
      player.setSwing(musicSwing);
      player.setScale(musicScale);
      player.setOctaveShift(musicOctaveShift);
      player.setInstrumentOverride(musicInstrument);
      player.setArpeggiate(musicArpeggiate);
      player.setDelayTime(musicDelayTime);
      player.setDelayFeedback(musicDelayFeedback);
      player.setReverbWet(musicReverbWet);
      player.setReverbDecay(musicReverbDecay);
      player.setVolume(musicVolume);
      player.setPhaseOffset(musicPhaseOffset);
    });

    return () => {
      if (applySettingsRafRef.current !== null) {
        window.cancelAnimationFrame(applySettingsRafRef.current);
        applySettingsRafRef.current = null;
      }
    };
  }, [
    musicTempo,
    musicPlaybackMode,
    musicSwing,
    musicScale,
    musicOctaveShift,
    musicInstrument,
    musicArpeggiate,
    musicDelayTime,
    musicDelayFeedback,
    musicReverbWet,
    musicReverbDecay,
    musicVolume,
    musicPhaseOffset,
  ]);

  React.useEffect(
    () => () => {
      window.dispatchEvent(
        new CustomEvent(GLOBAL_MUSIC_STATE_EVENT, {
          detail: {
            cardId,
            providerId,
            playing: false,
            stepInfo: null,
          },
        }),
      );
      musicPlayerRef.current?.dispose();
      musicPlayerRef.current = null;
    },
    [cardId, providerId],
  );

  React.useEffect(() => {
    const syncRecordingState = () => setGlobalRecording(DataPointMusicPlayer.isGlobalRecording());
    window.addEventListener('datapoint-music-recording-change', syncRecordingState);
    return () => {
      window.removeEventListener('datapoint-music-recording-change', syncRecordingState);
    };
  }, []);

  const globalRecordingSupported = DataPointMusicPlayer.canRecordGlobalMix();

  const handleGlobalRecording = React.useCallback(async () => {
    try {
      setGlobalRecordingBusy(true);

      if (!globalRecording) {
        await DataPointMusicPlayer.startGlobalRecording();
        setGlobalRecording(true);
        return;
      }

      const blob = await DataPointMusicPlayer.stopGlobalRecording();
      setGlobalRecording(false);

      const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${providerId}-global-mix-${timestamp}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Global mix recording failed:', error);
    } finally {
      setGlobalRecordingBusy(false);
    }
  }, [globalRecording, providerId]);

  const toggleMusicPlayback = React.useCallback(async () => {
    const player = musicPlayerRef.current;
    if (!player) return;

    try {
      await player.unlockAudio();
      const playing = await player.toggle();
      setMusicPlaying(playing);
      if (playing) {
        emitGlobalMusicState(true, lastVisualStepInfoRef.current);
      }
      if (!playing) {
        setMusicModalOpen(false);
        lastVisualStepInfoRef.current = null;
        onVisualStep?.(null);
        emitGlobalMusicState(false, null);
      }
    } catch (error) {
      console.error('Could not start data music:', error);
      setMusicPlaying(false);
      lastVisualStepInfoRef.current = null;
      onVisualStep?.(null);
      emitGlobalMusicState(false, null);
    }
  }, [emitGlobalMusicState, onVisualStep]);

  React.useEffect(() => {
    const onGlobalToggleRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ cardId?: string; scope?: 'playing-all' | 'resume-many'; cardIds?: string[] }>).detail;
      if (!detail) return;

      if (detail.scope === 'playing-all') {
        if (!musicPlaying) return;
      } else if (detail.scope === 'resume-many') {
        if (musicPlaying) return;
        if (!Array.isArray(detail.cardIds) || !detail.cardIds.includes(cardId)) return;
      } else if (detail.cardId !== cardId) {
        return;
      }

      void toggleMusicPlayback();
    };

    window.addEventListener(GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT, onGlobalToggleRequest);
    return () => {
      window.removeEventListener(GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT, onGlobalToggleRequest);
    };
  }, [cardId, musicPlaying, toggleMusicPlayback]);

  return {
    musicPlayerRef,
    musicPlaying,
    musicModalOpen,
    setMusicModalOpen,
    musicTempo,
    setMusicTempo,
    globalTempoSyncEnabled,
    setGlobalTempoSyncEnabled,
    musicPlaybackMode,
    setMusicPlaybackMode,
    musicScale,
    setMusicScale,
    musicOctaveShift,
    setMusicOctaveShift,
    musicInstrument,
    setMusicInstrument,
    musicArpeggiate,
    setMusicArpeggiate,
    musicSwing,
    setMusicSwing,
    musicDelayTime,
    setMusicDelayTime,
    musicDelayFeedback,
    setMusicDelayFeedback,
    musicReverbWet,
    setMusicReverbWet,
    musicReverbDecay,
    setMusicReverbDecay,
    musicVolume,
    setMusicVolume,
    musicPhaseOffset,
    setMusicPhaseOffset,
    globalRecording,
    globalRecordingBusy,
    globalRecordingSupported,
    handleGlobalRecording,
    toggleMusicPlayback,
  };
}
