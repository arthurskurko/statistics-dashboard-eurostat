import React from 'react';
import type { DataSeries } from '../../features/dashboard/types';
import { DataPointMusicPlayer, type MusicPlaybackMode } from '../../lib/datapointMusic';

const VISUAL_STEP_UPDATE_MIN_INTERVAL_MS = 90;
const GLOBAL_TEMPO_SYNC_EVENT = 'datapoint-music-tempo-sync-change';
const GLOBAL_TEMPO_EVENT = 'datapoint-music-tempo-change';
const GLOBAL_MUSIC_STATE_EVENT = 'datapoint-music-global-state';
const GLOBAL_MUSIC_TOGGLE_REQUEST_EVENT = 'datapoint-music-global-toggle-request';

let globalTempoSyncEnabledState = false;
let globalTempoBpmState = 120;

type UseChartMusicArgs = {
  cardId: string;
  providerId: string;
  filteredSeries: DataSeries[];
};

export function useChartMusic({ providerId, cardId, filteredSeries }: UseChartMusicArgs) {
  const [musicPlaying, setMusicPlaying] = React.useState(false);
  const [currentMusicStep, setCurrentMusicStep] = React.useState<
    | {
        step: number;
        points: Array<{ seriesLabel: string; label: string; value: number; color: string }>;
      }
    | null
  >(null);
  const [musicModalOpen, setMusicModalOpen] = React.useState(false);
  const [musicTempo, setMusicTempoState] = React.useState(globalTempoBpmState);
  const [globalTempoSyncEnabled, setGlobalTempoSyncEnabledState] = React.useState(globalTempoSyncEnabledState);
  const [musicPlaybackMode, setMusicPlaybackMode] = React.useState<MusicPlaybackMode>('points');
  const [musicScale, setMusicScale] = React.useState<'major' | 'minor' | 'pentatonic' | 'chromatic'>('major');
  const [musicOctaveShift, setMusicOctaveShift] = React.useState(0);
  const [musicInstrument, setMusicInstrument] = React.useState<OscillatorType | 'auto'>('auto');
  const [musicArpeggiate, setMusicArpeggiate] = React.useState(false);
  const [musicSwing, setMusicSwing] = React.useState(0);
  const [musicDelayTime, setMusicDelayTime] = React.useState(0.18);
  const [musicDelayFeedback, setMusicDelayFeedback] = React.useState(0.35);
  const [musicReverbWet, setMusicReverbWet] = React.useState(0.18);
  const [musicReverbDecay, setMusicReverbDecay] = React.useState(2.4);
  const [musicVolume, setMusicVolume] = React.useState(1);
  const [musicPhaseOffset, setMusicPhaseOffset] = React.useState(0);
  const [globalRecording, setGlobalRecording] = React.useState(() => DataPointMusicPlayer.isGlobalRecording());
  const [globalRecordingBusy, setGlobalRecordingBusy] = React.useState(false);

  const musicPlayerRef = React.useRef<DataPointMusicPlayer | null>(null);
  const lastVisualStepUpdateMsRef = React.useRef(0);

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
      setCurrentMusicStep(stepInfoWithColor);
      if (musicPlaying) {
        emitGlobalMusicState(true, stepInfoWithColor);
      }
    },
    [emitGlobalMusicState, musicPlaying, seriesColorByLabel],
  );

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
        tempoBpm: musicTempo,
        playbackMode: musicPlaybackMode,
        scale: musicScale,
        octaveShift: musicOctaveShift,
        instrumentOverride: musicInstrument,
        arpeggiate: musicArpeggiate,
        swing: musicSwing,
        delayTime: musicDelayTime,
        delayFeedback: musicDelayFeedback,
        reverbWet: musicReverbWet,
        reverbDecay: musicReverbDecay,
        volume: musicVolume,
        onStep: handleMusicStep,
      });
      musicPlayerRef.current.setPhaseOffset(musicPhaseOffset);
      return;
    }

    musicPlayerRef.current.setStepCallback(handleMusicStep);
    musicPlayerRef.current.setSeries(filteredSeries);
    musicPlayerRef.current.setTempo(musicTempo);
    musicPlayerRef.current.setPlaybackMode(musicPlaybackMode);
    musicPlayerRef.current.setSwing(musicSwing);
    musicPlayerRef.current.setScale(musicScale);
    musicPlayerRef.current.setOctaveShift(musicOctaveShift);
    musicPlayerRef.current.setInstrumentOverride(musicInstrument);
    musicPlayerRef.current.setArpeggiate(musicArpeggiate);
    musicPlayerRef.current.setDelayTime(musicDelayTime);
    musicPlayerRef.current.setDelayFeedback(musicDelayFeedback);
    musicPlayerRef.current.setReverbWet(musicReverbWet);
    musicPlayerRef.current.setReverbDecay(musicReverbDecay);
    musicPlayerRef.current.setVolume(musicVolume);
    musicPlayerRef.current.setPhaseOffset(musicPhaseOffset);

    if (filteredSeries.length === 0 && musicPlaying) {
      setMusicPlaying(false);
    }
  }, [
    filteredSeries,
    musicPlaying,
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
    handleMusicStep,
  ]);

  React.useEffect(
    () => () => {
      emitGlobalMusicState(false, null);
      musicPlayerRef.current?.dispose();
      musicPlayerRef.current = null;
    },
    [emitGlobalMusicState],
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
        emitGlobalMusicState(true, currentMusicStep);
      }
      if (!playing) {
        setMusicModalOpen(false);
        setCurrentMusicStep(null);
        emitGlobalMusicState(false, null);
      }
    } catch (error) {
      console.error('Could not start data music:', error);
      setMusicPlaying(false);
      emitGlobalMusicState(false, null);
    }
  }, [currentMusicStep, emitGlobalMusicState]);

  React.useEffect(() => {
    const onGlobalToggleRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ cardId?: string; scope?: 'playing-all' }>).detail;
      if (!detail) return;
      if (detail.scope === 'playing-all' && !musicPlaying) return;
      if (!detail.scope && detail.cardId !== cardId) return;
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
    currentMusicStep,
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
