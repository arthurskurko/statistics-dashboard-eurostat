import { useCallback, useEffect, useRef, useState } from 'react';
import type { MusicPlaybackMode } from '../../lib/datapointMusic';

const DRAG_COMMIT_INTERVAL_MS = 80;

function useThrottledCommittedNumber(value: number, commit: (value: number) => void, open: boolean) {
  const [draft, setDraft] = useState(value);
  const pendingValueRef = useRef(value);
  const timeoutIdRef = useRef<number | null>(null);

  useEffect(() => {
    setDraft(value);
    pendingValueRef.current = value;
  }, [value, open]);

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  const flush = useCallback(() => {
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    commit(pendingValueRef.current);
  }, [commit]);

  const setDraftAndCommit = useCallback((nextValue: number) => {
    setDraft(nextValue);
    pendingValueRef.current = nextValue;
    if (timeoutIdRef.current !== null) {
      return;
    }
    timeoutIdRef.current = window.setTimeout(() => {
      timeoutIdRef.current = null;
      commit(pendingValueRef.current);
    }, DRAG_COMMIT_INTERVAL_MS);
  }, [commit]);

  return { draft, setDraftAndCommit, flush };
}

type MusicSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  musicTempo: number;
  setMusicTempo: (value: number) => void;
  globalTempoSyncEnabled: boolean;
  setGlobalTempoSyncEnabled: (value: boolean) => void;
  musicPlaybackMode: MusicPlaybackMode;
  setMusicPlaybackMode: (value: MusicPlaybackMode) => void;
  musicVolume: number;
  setMusicVolume: (value: number) => void;
  musicSwing: number;
  setMusicSwing: (value: number) => void;
  musicScale: 'major' | 'minor' | 'pentatonic' | 'chromatic';
  setMusicScale: (value: 'major' | 'minor' | 'pentatonic' | 'chromatic') => void;
  musicOctaveShift: number;
  setMusicOctaveShift: (value: number) => void;
  musicPhaseOffset: number;
  setMusicPhaseOffset: (value: number) => void;
  musicInstrument: OscillatorType | 'auto';
  setMusicInstrument: (value: OscillatorType | 'auto') => void;
  musicDelayTime: number;
  setMusicDelayTime: (value: number) => void;
  musicDelayFeedback: number;
  setMusicDelayFeedback: (value: number) => void;
  musicReverbWet: number;
  setMusicReverbWet: (value: number) => void;
  musicReverbDecay: number;
  setMusicReverbDecay: (value: number) => void;
  musicArpeggiate: boolean;
  setMusicArpeggiate: (value: boolean) => void;
  globalRecordingSupported: boolean;
  globalRecordingBusy: boolean;
  globalRecording: boolean;
  onGlobalRecording: () => void;
};

export function MusicSettingsModal({
  open,
  onClose,
  musicTempo,
  setMusicTempo,
  globalTempoSyncEnabled,
  setGlobalTempoSyncEnabled,
  musicPlaybackMode,
  setMusicPlaybackMode,
  musicVolume,
  setMusicVolume,
  musicSwing,
  setMusicSwing,
  musicScale,
  setMusicScale,
  musicOctaveShift,
  setMusicOctaveShift,
  musicPhaseOffset,
  setMusicPhaseOffset,
  musicInstrument,
  setMusicInstrument,
  musicDelayTime,
  setMusicDelayTime,
  musicDelayFeedback,
  setMusicDelayFeedback,
  musicReverbWet,
  setMusicReverbWet,
  musicReverbDecay,
  setMusicReverbDecay,
  musicArpeggiate,
  setMusicArpeggiate,
  globalRecordingSupported,
  globalRecordingBusy,
  globalRecording,
  onGlobalRecording,
}: MusicSettingsModalProps) {
  const tempo = useThrottledCommittedNumber(musicTempo, setMusicTempo, open);
  const volume = useThrottledCommittedNumber(musicVolume, setMusicVolume, open);
  const swing = useThrottledCommittedNumber(musicSwing, setMusicSwing, open);
  const octaveShift = useThrottledCommittedNumber(musicOctaveShift, setMusicOctaveShift, open);
  const phaseOffset = useThrottledCommittedNumber(musicPhaseOffset, setMusicPhaseOffset, open);
  const delayTime = useThrottledCommittedNumber(musicDelayTime, setMusicDelayTime, open);
  const delayFeedback = useThrottledCommittedNumber(musicDelayFeedback, setMusicDelayFeedback, open);
  const reverbWet = useThrottledCommittedNumber(musicReverbWet, setMusicReverbWet, open);
  const reverbDecay = useThrottledCommittedNumber(musicReverbDecay, setMusicReverbDecay, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:py-6">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/20 bg-slate-950/95 shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Data music controls</h2>
            <p className="mt-1 text-sm text-slate-300">Tweak tempo, scale and the synthesis style.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm text-slate-200">
          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Tempo</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={30}
                max={240}
                value={tempo.draft}
                onChange={(event) => tempo.setDraftAndCommit(Number(event.target.value))}
                onMouseUp={tempo.flush}
                onTouchEnd={tempo.flush}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{tempo.draft} bpm</span>
            </div>
          </label>

          <button
            type="button"
            onClick={() => setGlobalTempoSyncEnabled(!globalTempoSyncEnabled)}
            className="bat-btn w-full rounded-2xl px-3 py-2 text-xs font-medium"
          >
            {globalTempoSyncEnabled ? 'Global tempo sync: on' : 'Global tempo sync: off'}
          </button>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Playback mode</span>
            <select
              value={musicPlaybackMode}
              onChange={(event) => setMusicPlaybackMode(event.target.value as MusicPlaybackMode)}
              className="bat-input w-full rounded-2xl px-3 py-2 text-sm text-white outline-none"
            >
              <option value="points">Points (one note per datapoint)</option>
              <option value="line">Line-follow (glide to next datapoint)</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Volume</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume.draft}
                onChange={(event) => volume.setDraftAndCommit(Number(event.target.value))}
                onMouseUp={volume.flush}
                onTouchEnd={volume.flush}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(volume.draft * 100)}%</span>
            </div>
          </label>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Swing</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={swing.draft}
                onChange={(event) => swing.setDraftAndCommit(Number(event.target.value))}
                onMouseUp={swing.flush}
                onTouchEnd={swing.flush}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(swing.draft * 100)}%</span>
            </div>
          </label>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Scale</span>
            <select
              value={musicScale}
              onChange={(event) => setMusicScale(event.target.value as 'major' | 'minor' | 'pentatonic' | 'chromatic')}
              className="bat-input w-full rounded-2xl px-3 py-2 text-sm text-white outline-none"
            >
              <option value="major">Major</option>
              <option value="minor">Minor</option>
              <option value="pentatonic">Pentatonic</option>
              <option value="chromatic">Chromatic</option>
            </select>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="font-medium text-slate-100">Octave shift</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-3}
                  max={3}
                  step={1}
                  value={octaveShift.draft}
                  onChange={(event) => octaveShift.setDraftAndCommit(Number(event.target.value))}
                  onMouseUp={octaveShift.flush}
                  onTouchEnd={octaveShift.flush}
                  className="h-2 w-full cursor-pointer accent-emerald-400"
                />
                <span className="w-10 text-right text-xs text-slate-200">{octaveShift.draft}</span>
              </div>
            </label>

            <label className="grid gap-2">
              <span className="font-medium text-slate-100">Phase offset</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={16}
                  step={1}
                  value={phaseOffset.draft}
                  onChange={(event) => phaseOffset.setDraftAndCommit(Number(event.target.value))}
                  onMouseUp={phaseOffset.flush}
                  onTouchEnd={phaseOffset.flush}
                  className="h-2 w-full cursor-pointer accent-emerald-400"
                />
                <span className="w-10 text-right text-xs text-slate-200">{phaseOffset.draft}</span>
              </div>
              <p className="text-xs text-slate-500">Shift the timing of this chart (16th-note increments) relative to others.</p>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Instrument</span>
            <select
              value={musicInstrument}
              onChange={(event) => setMusicInstrument(event.target.value as OscillatorType | 'auto')}
              className="bat-input w-full rounded-2xl px-3 py-2 text-sm text-white outline-none"
            >
              <option value="auto">Auto</option>
              <option value="sine">Sine</option>
              <option value="triangle">Triangle</option>
              <option value="square">Square</option>
              <option value="sawtooth">Sawtooth</option>
            </select>
          </label>

          <div className="grid gap-2">
            <span className="font-medium text-slate-100">Delay</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.02}
                value={delayTime.draft}
                onChange={(event) => delayTime.setDraftAndCommit(Number(event.target.value))}
                onMouseUp={delayTime.flush}
                onTouchEnd={delayTime.flush}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{delayTime.draft.toFixed(2)}s</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Feedback</span>
              <input
                type="range"
                min={0}
                max={0.95}
                step={0.01}
                value={delayFeedback.draft}
                onChange={(event) => delayFeedback.setDraftAndCommit(Number(event.target.value))}
                onMouseUp={delayFeedback.flush}
                onTouchEnd={delayFeedback.flush}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-12 text-right text-xs text-slate-200">{Math.round(delayFeedback.draft * 100)}%</span>
            </div>
          </div>

          <div className="grid gap-2">
            <span className="font-medium text-slate-100">Reverb</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={reverbWet.draft}
                onChange={(event) => reverbWet.setDraftAndCommit(Number(event.target.value))}
                onMouseUp={reverbWet.flush}
                onTouchEnd={reverbWet.flush}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(reverbWet.draft * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Decay</span>
              <input
                type="range"
                min={0.5}
                max={6}
                step={0.1}
                value={reverbDecay.draft}
                onChange={(event) => reverbDecay.setDraftAndCommit(Number(event.target.value))}
                onMouseUp={reverbDecay.flush}
                onTouchEnd={reverbDecay.flush}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{reverbDecay.draft.toFixed(1)}s</span>
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={musicArpeggiate}
              onChange={(event) => setMusicArpeggiate(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-400"
            />
            <span className="text-sm text-slate-200">Arpeggiate (play one series at a time)</span>
          </label>

          <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">
            Tip: Try slow tempo with pentatonic scale for an ambient vibe, or crank tempo + sawtooth for
            intense "cyber soundtrack" energy.
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Global mix export</div>
            <button
              type="button"
              onClick={onGlobalRecording}
              disabled={!globalRecordingSupported || globalRecordingBusy}
              className="bat-btn w-full rounded-2xl px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!globalRecordingSupported
                ? 'Recording not supported on this browser'
                : globalRecording
                  ? (globalRecordingBusy ? 'Stopping and preparing download...' : 'Stop and download global mix')
                  : (globalRecordingBusy ? 'Starting global recording...' : 'Record global mix')}
            </button>
            <p className="mt-2 text-xs text-slate-400">
              Captures all chart music currently routed through the app into one audio file.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
