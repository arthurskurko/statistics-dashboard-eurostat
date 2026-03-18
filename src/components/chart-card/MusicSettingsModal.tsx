type MusicSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  musicTempo: number;
  setMusicTempo: (value: number) => void;
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
                value={musicTempo}
                onChange={(event) => setMusicTempo(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{musicTempo} bpm</span>
            </div>
          </label>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Volume</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={musicVolume}
                onChange={(event) => setMusicVolume(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(musicVolume * 100)}%</span>
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
                value={musicSwing}
                onChange={(event) => setMusicSwing(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(musicSwing * 100)}%</span>
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
                  value={musicOctaveShift}
                  onChange={(event) => setMusicOctaveShift(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer accent-emerald-400"
                />
                <span className="w-10 text-right text-xs text-slate-200">{musicOctaveShift}</span>
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
                  value={musicPhaseOffset}
                  onChange={(event) => setMusicPhaseOffset(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer accent-emerald-400"
                />
                <span className="w-10 text-right text-xs text-slate-200">{musicPhaseOffset}</span>
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
                value={musicDelayTime}
                onChange={(event) => setMusicDelayTime(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{musicDelayTime.toFixed(2)}s</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Feedback</span>
              <input
                type="range"
                min={0}
                max={0.95}
                step={0.01}
                value={musicDelayFeedback}
                onChange={(event) => setMusicDelayFeedback(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-12 text-right text-xs text-slate-200">{Math.round(musicDelayFeedback * 100)}%</span>
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
                value={musicReverbWet}
                onChange={(event) => setMusicReverbWet(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(musicReverbWet * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Decay</span>
              <input
                type="range"
                min={0.5}
                max={6}
                step={0.1}
                value={musicReverbDecay}
                onChange={(event) => setMusicReverbDecay(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{musicReverbDecay.toFixed(1)}s</span>
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
