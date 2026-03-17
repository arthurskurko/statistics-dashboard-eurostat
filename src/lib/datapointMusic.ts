import type { DataSeries } from '../features/dashboard/types';

type PreparedSeries = {
  points: number[];
  min: number;
  max: number;
  waveform: OscillatorType;
};

export type MusicScale = 'chromatic' | 'major' | 'minor' | 'pentatonic';

export type MusicSettings = {
  tempoBpm: number;
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
};

const INSTRUMENTS: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];
const MAX_SIMULTANEOUS_SERIES = 6;

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
      const points = entry.points.map((point) => point.value);
      const min = Math.min(...points);
      const max = Math.max(...points);
      const instrumentKey = extractInstrumentKey(entry.label);
      const waveform = instrumentOverride
        ? (settings.instrumentOverride as OscillatorType)
        : INSTRUMENTS[hashString(instrumentKey) % INSTRUMENTS.length];

      return { points, min, max, waveform };
    });
}

export class DataPointMusicPlayer {
  private audioContext: AudioContext | null = null;

  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;

  private timeoutId: number | null = null;

  private stepIndex = 0;
  private phaseOffset = 0;

  private running = false;

  private preparedSeries: PreparedSeries[] = [];
  private sourceSeries: DataSeries[] = [];

  private settings: MusicSettings = {
    tempoBpm: 120,
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
    volume: 1,
  };

  constructor(series: DataSeries[], settings?: Partial<MusicSettings>) {
    if (settings) {
      this.settings = { ...this.settings, ...settings };
    }
    this.sourceSeries = series;
    this.preparedSeries = buildPreparedSeries(series, this.settings);
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
    this.settings.tempoBpm = Math.max(10, Math.min(240, bpm));
    if (this.running) {
      this.restartLoop();
    }
  }

  setPhaseOffset(offset: number): void {
    this.phaseOffset = Math.floor(offset);
    if (this.running) {
      this.restartLoop();
    }
  }

  setSwing(swing: number): void {
    this.settings.swing = Math.max(0, Math.min(0.5, swing));
    if (this.running) {
      this.restartLoop();
    }
  }

  setScale(scale: MusicScale): void {
    this.settings.scale = scale;
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
      this.masterGain.gain.value = Math.min(2, Math.max(0, this.settings.volume * 1.6));
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
    const baseMs = 60000 / this.settings.tempoBpm;
    const phaseMs = (this.phaseOffset / 16) * baseMs;

    const scheduleNextTick = () => {
      if (!this.running) return;

      const swingFactor = 1 + (this.stepIndex % 2 === 1 ? this.settings.swing : -this.settings.swing);
      const delayMs = baseMs * swingFactor;

      this.timeoutId = window.setTimeout(() => {
        if (!this.running) return;
        this.playStep(this.stepIndex);
        this.stepIndex += 1;
        scheduleNextTick();
      }, delayMs);
    };

    // Apply initial phase offset as a delay before the first tick.
    this.timeoutId = window.setTimeout(() => {
      if (!this.running) return;
      this.playStep(this.stepIndex);
      this.stepIndex += 1;
      scheduleNextTick();
    }, phaseMs);
  }

  private stopLoop(): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
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
    this.masterGain.gain.value = Math.min(2, Math.max(0, this.settings.volume * 1.6));
    this.masterGain.connect(context.destination);

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
    if (this.audioContext) {
      this.audioContext.close().catch(() => {
        /* ignore */
      });
      this.audioContext = null;
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('Web Audio API is not available in this browser.');
      }
      this.audioContext = new AudioContextCtor();
    }
    return this.audioContext;
  }

  private playStep(step: number): void {
    if (!this.running || this.preparedSeries.length === 0) return;

    const context = this.getAudioContext();
    const now = context.currentTime;
    const stepMs = 60000 / this.settings.tempoBpm;
    const duration = Math.max(0.12, stepMs / 1000 - 0.08);

    const seriesToPlay = this.settings.arpeggiate
      ? [this.preparedSeries[step % this.preparedSeries.length]]
      : this.preparedSeries;

    const spreadMultiplier = this.settings.spread;

    seriesToPlay.forEach((entry, index) => {
      if (entry.points.length === 0) return;

      const value = entry.points[step % entry.points.length];
      const normalized = normalizeValue(value, entry.min, entry.max);

      const scale = SCALE_DEGREES[this.settings.scale];
      const degree = scale[Math.floor(normalized * (scale.length - 1))];
      const octaveOffset = this.settings.octaveShift * 12;

      const spreadSemitones = Math.round(spreadMultiplier * index * 4);
      const midi = BASE_MIDI + octaveOffset + degree + spreadSemitones;
      const frequency = midiToFrequency(midi);

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = entry.waveform;
      oscillator.frequency.setValueAtTime(frequency, now);

      const baseGain = 0.25 + index * 0.06;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      if (this.dryGain && this.delayNode && this.delayFeedback && this.delayWet && this.convolver && this.reverbWet) {
        // ensure effect settings updated
        this.updateEffectSettings();

        oscillator.connect(gain);
        gain.connect(this.dryGain);

        // Delay path
        gain.connect(this.delayNode);
        this.delayNode.connect(this.delayWet);

        // Reverb path
        gain.connect(this.convolver);
        this.convolver.connect(this.reverbWet);
      } else {
        oscillator.connect(gain);
        gain.connect(context.destination);
      }

      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    });

    this.stepIndex += 1;
  }
}

