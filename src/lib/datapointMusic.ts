import type { DataSeries } from '../features/dashboard/types';

type PreparedSeries = {
  label: string;
  points: Array<{ label: string; value: number }>;
  min: number;
  max: number;
  waveform: OscillatorType;
};

export type MusicScale = 'chromatic' | 'major' | 'minor' | 'pentatonic';
export type MusicPlaybackMode = 'points' | 'line';

export type MusicSettings = {
  tempoBpm: number;
  playbackMode: MusicPlaybackMode;
  scale: MusicScale;
  octaveShift: number;
  instrumentOverride: OscillatorType | 'auto';
  arpeggiate: boolean;
  spread: number; // 0–1
  swing: number; // 0–0.5
  delayTime: number; // seconds
  delayFeedback: number; // 0–0.95
  delayWet: number; // 0–1
  reverbWet: number; // 0–1
  reverbDecay: number; // seconds
  volume: number; // 0–1
  /** Called on each played step. */
  onStep?: (info: {
    step: number;
    points: Array<{ seriesLabel: string; label: string; value: number }>;
  }) => void;
};

const INSTRUMENTS: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];
const MAX_SIMULTANEOUS_SERIES = 6;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULER_LOOKAHEAD_SEC = 0.12;
const WAVEFORM_GAIN_MULTIPLIER: Record<OscillatorType, number> = {
  sine: 1.0,
  triangle: 0.9,
  sawtooth: 0.66,
  square: 0.58,
  custom: 0.8,
};

const BASE_MIDI = 48; // C3

const SCALE_DEGREES: Record<MusicScale, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  pentatonic: [0, 2, 4, 7, 9, 12],
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}


function extractInstrumentKey(label: string): string {
  const parts = label.split(/\s*[—-]\s*/);
  return parts[1] ?? parts[0] ?? 'default';
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function normalizeValue(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return (value - min) / (max - min);
}

function buildPreparedSeries(series: DataSeries[], settings: MusicSettings): PreparedSeries[] {
  const instrumentOverride = settings.instrumentOverride !== 'auto';

  return series
    .filter((entry) => !entry.label.includes('(forecast)') && entry.points.length > 0)
    .slice(0, MAX_SIMULTANEOUS_SERIES)
    .map((entry) => {
      const points = entry.points.map((point) => ({ label: point.label, value: point.value }));
      const min = Math.min(...points.map((p) => p.value));
      const max = Math.max(...points.map((p) => p.value));
      const instrumentKey = extractInstrumentKey(entry.label);
      const waveform = instrumentOverride
        ? (settings.instrumentOverride as OscillatorType)
        : INSTRUMENTS[hashString(instrumentKey) % INSTRUMENTS.length];

      return { label: entry.label, points, min, max, waveform };
    });
}

export class DataPointMusicPlayer {
  private static sharedAudioContext: AudioContext | null = null;
  private static sharedRecordingDestination: MediaStreamAudioDestinationNode | null = null;
  private static activeMasterGains = new Set<GainNode>();
  private static globalRecorder: MediaRecorder | null = null;
  private static globalChunks: BlobPart[] = [];
  private static activeInstanceCount = 0;

  private audioContext: AudioContext | null = null;

  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;

  private schedulerId: number | null = null;
  private nextStepTime = 0;

  private stepIndex = 0;
  private phaseOffset = 0;

  private running = false;

  private preparedSeries: PreparedSeries[] = [];
  private sourceSeries: DataSeries[] = [];

  private settings: MusicSettings = {
    tempoBpm: 120,
    playbackMode: 'points',
    scale: 'major',
    octaveShift: 0,
    instrumentOverride: 'auto',
    arpeggiate: false,
    spread: 0.4,
    swing: 0.08,
    delayTime: 0.18,
    delayFeedback: 0.35,
    delayWet: 0.18,
    reverbWet: 0.18,
    reverbDecay: 2.4,
    volume: 0.8,
  };

  constructor(series: DataSeries[], settings?: Partial<MusicSettings>) {
    DataPointMusicPlayer.activeInstanceCount += 1;

    if (settings) {
      this.settings = { ...this.settings, ...settings };
    }
    this.sourceSeries = series;
    this.preparedSeries = buildPreparedSeries(series, this.settings);
  }

  static isGlobalRecording(): boolean {
    return this.globalRecorder?.state === 'recording';
  }

  static canRecordGlobalMix(): boolean {
    return typeof MediaRecorder !== 'undefined';
  }

  static async startGlobalRecording(): Promise<void> {
    if (!this.canRecordGlobalMix()) {
      throw new Error('MediaRecorder is not available in this browser.');
    }

    if (this.isGlobalRecording()) {
      return;
    }

    const context = this.getSharedAudioContext();
    if (context.state === 'suspended') {
      await context.resume();
    }

    if (!this.sharedRecordingDestination) {
      this.sharedRecordingDestination = context.createMediaStreamDestination();
      this.activeMasterGains.forEach((gainNode) => {
        try {
          gainNode.connect(this.sharedRecordingDestination as AudioNode);
        } catch {
          /* ignore stale/disconnected nodes */
        }
      });
    }

    const mimeType = this.pickSupportedRecordingMimeType();
    this.globalChunks = [];
    this.globalRecorder = mimeType
      ? new MediaRecorder(this.sharedRecordingDestination.stream, { mimeType })
      : new MediaRecorder(this.sharedRecordingDestination.stream);

    this.globalRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.globalChunks.push(event.data);
      }
    };

    this.globalRecorder.start(250);
    this.emitGlobalRecordingChange();
  }

  static async stopGlobalRecording(): Promise<Blob> {
    const recorder = this.globalRecorder;
    if (!recorder) {
      throw new Error('Global recording is not active.');
    }

    if (recorder.state === 'inactive') {
      const fallbackType = recorder.mimeType || 'audio/webm';
      const blob = new Blob(this.globalChunks, { type: fallbackType });
      this.globalChunks = [];
      this.globalRecorder = null;
      this.emitGlobalRecordingChange();
      return blob;
    }

    return new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => {
        this.globalRecorder = null;
        this.globalChunks = [];
        this.emitGlobalRecordingChange();
        reject(new Error('Global recording failed.'));
      };

      recorder.onstop = () => {
        const blobType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.globalChunks, { type: blobType });
        this.globalChunks = [];
        this.globalRecorder = null;
        this.emitGlobalRecordingChange();
        resolve(blob);
      };

      recorder.stop();
    });
  }

  get isPlaying(): boolean {
    return this.running;
  }

  setSeries(series: DataSeries[]): void {
    this.sourceSeries = series;
    this.preparedSeries = buildPreparedSeries(series, this.settings);
    this.stepIndex = 0;
    if (this.running && this.preparedSeries.length === 0) {
      this.stop();
    }
  }

  setTempo(bpm: number): void {
    const nextTempo = Math.max(10, Math.min(240, Math.round(bpm)));
    if (this.settings.tempoBpm === nextTempo) return;
    this.settings.tempoBpm = nextTempo;
    if (this.running) {
      this.restartLoop();
    }
  }

  setPhaseOffset(offset: number): void {
    const nextOffset = Math.floor(offset);
    if (this.phaseOffset === nextOffset) return;
    this.phaseOffset = nextOffset;
    if (this.running) {
      this.restartLoop();
    }
  }

  setSwing(swing: number): void {
    const nextSwing = Math.max(0, Math.min(0.5, swing));
    if (Math.abs(this.settings.swing - nextSwing) < 0.0001) return;
    this.settings.swing = nextSwing;
    if (this.running) {
      this.restartLoop();
    }
  }

  setScale(scale: MusicScale): void {
    this.settings.scale = scale;
  }

  setPlaybackMode(mode: MusicPlaybackMode): void {
    this.settings.playbackMode = mode;
  }

  setOctaveShift(shift: number): void {
    this.settings.octaveShift = Math.max(-3, Math.min(3, shift));
  }

  setInstrumentOverride(instrument: OscillatorType | 'auto'): void {
    this.settings.instrumentOverride = instrument;
    this.preparedSeries = buildPreparedSeries(this.sourceSeries, this.settings);
  }

  setSpread(spread: number): void {
    this.settings.spread = Math.max(0, Math.min(1, spread));
  }

  setDelayTime(seconds: number): void {
    this.settings.delayTime = Math.max(0, Math.min(2, seconds));
    this.updateEffectSettings();
  }

  setVolume(volume: number): void {
    this.settings.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = Math.min(1.2, Math.max(0, this.settings.volume));
    }
  }

  setDelayFeedback(feedback: number): void {
    this.settings.delayFeedback = Math.max(0, Math.min(0.95, feedback));
    this.updateEffectSettings();
  }

  setDelayWet(wet: number): void {
    this.settings.delayWet = Math.max(0, Math.min(1, wet));
    this.updateEffectSettings();
  }

  setReverbWet(wet: number): void {
    this.settings.reverbWet = Math.max(0, Math.min(1, wet));
    this.updateEffectSettings();
  }

  setReverbDecay(decay: number): void {
    this.settings.reverbDecay = Math.max(0.1, Math.min(6, decay));
    this.updateEffectSettings();
  }

  setArpeggiate(arpeggiate: boolean): void {
    this.settings.arpeggiate = arpeggiate;
  }

  setStepCallback(callback?: (info: { step: number; points: Array<{ seriesLabel: string; label: string; value: number }> }) => void): void {
    this.settings.onStep = callback;
  }

  getSettings(): MusicSettings {
    return { ...this.settings };
  }

  async toggle(): Promise<boolean> {
    if (this.running) {
      this.stop();
      return false;
    }

    await this.start();
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running || this.preparedSeries.length === 0) return;

    const context = this.getAudioContext();
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        return;
      }
    }

    if (context.state !== 'running') {
      return;
    }

    this.running = true;
    this.ensureEffectNodes();

    this.stepIndex = 0;
    this.startLoop();
  }

  async unlockAudio(): Promise<boolean> {
    try {
      const context = this.getAudioContext();
      if (context.state === 'suspended') {
        await context.resume();
      }

      // iOS Safari can require a user-gesture-started source before Web Audio becomes audible.
      const unlockBuffer = context.createBuffer(1, 1, context.sampleRate);
      const source = context.createBufferSource();
      source.buffer = unlockBuffer;
      source.connect(context.destination);
      source.start(0);

      return context.state === 'running';
    } catch {
      return false;
    }
  }

  private startLoop(): void {
    const context = this.getAudioContext();
    const baseSec = 60 / this.settings.tempoBpm;
    const phaseSec = (this.phaseOffset / 16) * baseSec;

    this.nextStepTime = context.currentTime + phaseSec;

    const scheduleAhead = () => {
      if (!this.running) return;

      const scheduleUntil = context.currentTime + SCHEDULER_LOOKAHEAD_SEC;
      while (this.nextStepTime <= scheduleUntil) {
        const step = this.stepIndex;
        this.playStep(step, this.nextStepTime);

        const swingFactor = 1 + (step % 2 === 1 ? this.settings.swing : -this.settings.swing);
        this.nextStepTime += baseSec * swingFactor;
        this.stepIndex += 1;
      }
    };

    scheduleAhead();
    this.schedulerId = window.setInterval(scheduleAhead, SCHEDULER_INTERVAL_MS);
  }

  private stopLoop(): void {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private restartLoop(): void {
    this.stopLoop();
    if (this.running) {
      this.startLoop();
    }
  }

  stop(): void {
    this.stopLoop();
    this.running = false;
  }

  private ensureEffectNodes(): void {
    const context = this.getAudioContext();
    if (this.masterGain) return;

    this.masterGain = context.createGain();
    this.masterGain.gain.value = Math.min(1.2, Math.max(0, this.settings.volume));
    this.masterGain.connect(context.destination);
    DataPointMusicPlayer.activeMasterGains.add(this.masterGain);
    if (DataPointMusicPlayer.sharedRecordingDestination) {
      this.masterGain.connect(DataPointMusicPlayer.sharedRecordingDestination);
    }

    this.delayNode = context.createDelay(2.0);
    this.delayFeedback = context.createGain();
    this.delayWet = context.createGain();

    this.convolver = context.createConvolver();
    this.reverbWet = context.createGain();

    // Feed delay feedback loop
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);

    // Connect delay and reverb to master
    this.delayWet.connect(this.masterGain);
    this.reverbWet.connect(this.masterGain);
    this.delayNode.connect(this.delayWet);
    this.convolver.connect(this.reverbWet);

    // Dry signal directly to master
    this.dryGain = context.createGain();
    this.dryGain.connect(this.masterGain);

    this.updateEffectSettings();
  }

  private lastReverbDecay = -1;
  private cachedImpulse: AudioBuffer | null = null;

  private updateEffectSettings(): void {
    if (!this.delayNode || !this.delayFeedback || !this.delayWet || !this.dryGain) return;

    // Apply delay settings
    this.delayNode.delayTime.value = this.settings.delayTime;
    this.delayFeedback.gain.value = this.settings.delayFeedback;

    const wet = this.settings.delayWet;
    this.delayWet.gain.value = wet;
    this.dryGain.gain.value = 1 - wet;

    // Apply reverb wet mix
    if (this.reverbWet) {
      this.reverbWet.gain.value = this.settings.reverbWet;
    }

    // Rebuild impulse only when decay changes (expensive)
    if (this.convolver) {
      if (this.settings.reverbDecay !== this.lastReverbDecay || !this.cachedImpulse) {
        this.cachedImpulse = this.createReverbImpulse(this.settings.reverbDecay);
        this.lastReverbDecay = this.settings.reverbDecay;
      }
      this.convolver.buffer = this.cachedImpulse;
    }
  }

  private createReverbImpulse(decay: number): AudioBuffer {
    const context = this.getAudioContext();
    const length = context.sampleRate * 2.5;
    const impulse = context.createBuffer(2, length, context.sampleRate);

    for (let channel = 0; channel < 2; channel += 1) {
      const buffer = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        buffer[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  dispose(): void {
    this.stop();

    if (this.masterGain) {
      DataPointMusicPlayer.activeMasterGains.delete(this.masterGain);
      try {
        this.masterGain.disconnect();
      } catch {
        /* ignore */
      }
    }

    DataPointMusicPlayer.activeInstanceCount = Math.max(0, DataPointMusicPlayer.activeInstanceCount - 1);
    if (DataPointMusicPlayer.activeInstanceCount === 0) {
      DataPointMusicPlayer.teardownSharedAudio();
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = DataPointMusicPlayer.getSharedAudioContext();
    }
    return this.audioContext;
  }

  private static getSharedAudioContext(): AudioContext {
    if (!this.sharedAudioContext) {
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('Web Audio API is not available in this browser.');
      }
      this.sharedAudioContext = new AudioContextCtor();
    }
    return this.sharedAudioContext;
  }

  private static pickSupportedRecordingMimeType(): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    for (const candidate of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return '';
  }

  private static emitGlobalRecordingChange(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('datapoint-music-recording-change', {
        detail: { recording: this.isGlobalRecording() },
      }),
    );
  }

  private static teardownSharedAudio(): void {
    if (this.globalRecorder && this.globalRecorder.state !== 'inactive') {
      this.globalRecorder.stop();
    }
    this.globalRecorder = null;
    this.globalChunks = [];
    this.sharedRecordingDestination = null;
    this.activeMasterGains.clear();

    if (this.sharedAudioContext) {
      this.sharedAudioContext.close().catch(() => {
        /* ignore */
      });
      this.sharedAudioContext = null;
    }

    this.emitGlobalRecordingChange();
  }

  private playStep(step: number, atTime: number): void {
    if (!this.running || this.preparedSeries.length === 0) return;

    const context = this.getAudioContext();
    const now = atTime;
    const stepMs = 60000 / this.settings.tempoBpm;
    const duration = Math.max(0.12, stepMs / 1000 - 0.08);

    const seriesToPlay = this.settings.arpeggiate
      ? [this.preparedSeries[step % this.preparedSeries.length]]
      : this.preparedSeries;

    const spreadMultiplier = this.settings.spread;

    const playedPoints: Array<{ seriesLabel: string; label: string; value: number }> = [];

    seriesToPlay.forEach((entry, index) => {
      if (entry.points.length === 0) return;

      const point = entry.points[step % entry.points.length];
      const value = point.value;
      const label = point.label;
      playedPoints.push({ seriesLabel: entry.label, label, value });

      const normalized = normalizeValue(value, entry.min, entry.max);

      const scale = SCALE_DEGREES[this.settings.scale];
      const degree = scale[Math.floor(normalized * (scale.length - 1))];
      const octaveOffset = this.settings.octaveShift * 12;

      const spreadSemitones = Math.round(spreadMultiplier * index * 4);
      const midi = BASE_MIDI + octaveOffset + degree + spreadSemitones;
      const frequency = midiToFrequency(midi);

      const nextPoint = entry.points[(step + 1) % entry.points.length];
      const nextNormalized = normalizeValue(nextPoint.value, entry.min, entry.max);
      const nextDegree = scale[Math.floor(nextNormalized * (scale.length - 1))];
      const nextMidi = BASE_MIDI + octaveOffset + nextDegree + spreadSemitones;
      const nextFrequency = midiToFrequency(nextMidi);

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = entry.waveform;
      oscillator.frequency.setValueAtTime(frequency, now);
      if (this.settings.playbackMode === 'line') {
        oscillator.frequency.linearRampToValueAtTime(nextFrequency, now + duration);
      }

      const waveformGain = WAVEFORM_GAIN_MULTIPLIER[entry.waveform] ?? 0.8;
      const seriesGain = 1 / Math.sqrt(index + 1);
      const baseGain = 0.28 * waveformGain * seriesGain;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.012);
      if (this.settings.playbackMode === 'line') {
        const sustainUntil = Math.max(now + 0.02, now + duration - 0.03);
        gain.gain.setValueAtTime(baseGain, sustainUntil);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      if (this.dryGain && this.delayNode && this.delayFeedback && this.delayWet && this.convolver && this.reverbWet) {
        oscillator.connect(gain);
        gain.connect(this.dryGain);

        // Delay and reverb are preconnected once in ensureEffectNodes.
        gain.connect(this.delayNode);
        gain.connect(this.convolver);
      } else {
        oscillator.connect(gain);
        gain.connect(context.destination);
      }

      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    });

    if (this.settings.onStep) {
      this.settings.onStep({ step, points: playedPoints });
    }

  }
}

