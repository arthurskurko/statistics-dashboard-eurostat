import React from 'react';
import type { DataSeries } from '../../features/dashboard/types';
import { DataPointMusicPlayer } from '../../lib/datapointMusic';

type UseChartMusicArgs = {
  cardId: string;
  providerId: string;
  filteredSeries: DataSeries[];
};

export function useChartMusic({ cardId, providerId, filteredSeries }: UseChartMusicArgs) {
  const [musicPlaying, setMusicPlaying] = React.useState(false);
  const [currentMusicStep, setCurrentMusicStep] = React.useState<
    | {
        step: number;
        points: Array<{ seriesLabel: string; label: string; value: number }>;
      }
    | null
  >(null);
  const [musicModalOpen, setMusicModalOpen] = React.useState(false);
  const [musicTempo, setMusicTempo] = React.useState(120);
  const [musicScale, setMusicScale] = React.useState<'major' | 'minor' | 'pentatonic' | 'chromatic'>('major');
  const [musicOctaveShift, setMusicOctaveShift] = React.useState(0);
  const [musicInstrument, setMusicInstrument] = React.useState<OscillatorType | 'auto'>('auto');
  const [musicArpeggiate, setMusicArpeggiate] = React.useState(false);
  const [musicSwing, setMusicSwing] = React.useState(0.08);
  const [musicDelayTime, setMusicDelayTime] = React.useState(0.18);
  const [musicDelayFeedback, setMusicDelayFeedback] = React.useState(0.35);
  const [musicReverbWet, setMusicReverbWet] = React.useState(0.18);
  const [musicReverbDecay, setMusicReverbDecay] = React.useState(2.4);
  const [musicVolume, setMusicVolume] = React.useState(1);
  const [musicPhaseOffset, setMusicPhaseOffset] = React.useState(0);
  const [globalRecording, setGlobalRecording] = React.useState(() => DataPointMusicPlayer.isGlobalRecording());
  const [globalRecordingBusy, setGlobalRecordingBusy] = React.useState(false);

  const musicPlayerRef = React.useRef<DataPointMusicPlayer | null>(null);

  React.useEffect(() => {
    let hash = 0;
    for (let index = 0; index < cardId.length; index += 1) {
      hash = (hash * 31 + cardId.charCodeAt(index)) >>> 0;
    }
    setMusicPhaseOffset(hash % 16);
  }, [cardId]);

  const handleMusicStep = React.useCallback(
    (info: {
      step: number;
      points: Array<{ seriesLabel: string; label: string; value: number }>;
    }) => {
      setCurrentMusicStep(info);
    },
    [],
  );

  React.useEffect(() => {
    if (!musicPlayerRef.current) {
      musicPlayerRef.current = new DataPointMusicPlayer(filteredSeries, {
        tempoBpm: musicTempo,
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
      musicPlayerRef.current?.dispose();
      musicPlayerRef.current = null;
    },
    [],
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
      if (!playing) {
        setMusicModalOpen(false);
        setCurrentMusicStep(null);
      }
    } catch (error) {
      console.error('Could not start data music:', error);
      setMusicPlaying(false);
    }
  }, []);

  return {
    musicPlayerRef,
    musicPlaying,
    currentMusicStep,
    musicModalOpen,
    setMusicModalOpen,
    musicTempo,
    setMusicTempo,
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
