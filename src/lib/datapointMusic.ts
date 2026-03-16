import type { DataSeries } from '../features/dashboard/types';

type PreparedSeries = {
  points: number[];
  min: number;
  max: number;
  waveform: OscillatorType;
};

const INSTRUMENTS: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];
const MAX_SIMULTANEOUS_SERIES = 6;

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

export type MusicScale = 'chromatic' | 'major' | 'minor' | 'pentatonic';

export type MusicSettings = {
  tempoBpm: number;
  scale: MusicScale;
  octaveShift: number;
  instrumentOverride: OscillatorType | 'auto';
  arpeggiate: boolean;
};

const SCALE_DEGREES: Record<MusicScale, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  pentatonic: [0, 2, 4, 7, 9, 12],
};

const BASE_MIDI = 48; // C3

export class DataPointMusicPlayer {
  private audioContext: AudioContext | null = null;

  private timerId: number | null = null;

  private stepIndex = 0;

  private running = false;

  private preparedSeries: PreparedSeries[] = [];
  private sourceSeries: DataSeries[] = [];

  private settings: MusicSettings = {
    tempoBpm: 120,
    scale: 'major',
    octaveShift: 0,
    instrumentOverride: 'auto',
    arpeggiate: false,
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
      this.restartTimer();
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
      await context.resume();
    }

    this.running = true;
    this.restartTimer();
    this.playStep();
  }

  private restartTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }

    const stepMs = 60000 / this.settings.tempoBpm;
    this.timerId = window.setInterval(() => {
      this.playStep();
    }, stepMs);
  }

  stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.running = false;
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

  private playStep(): void {
    if (!this.running || this.preparedSeries.length === 0) return;

    const context = this.getAudioContext();
    const now = context.currentTime;
    const stepMs = 60000 / this.settings.tempoBpm;
    const duration = Math.max(0.12, stepMs / 1000 - 0.08);

    const seriesToPlay = this.settings.arpeggiate
      ? [this.preparedSeries[this.stepIndex % this.preparedSeries.length]]
      : this.preparedSeries;

    seriesToPlay.forEach((entry, index) => {
      if (entry.points.length === 0) return;

      const value = entry.points[this.stepIndex % entry.points.length];
      const normalized = normalizeValue(value, entry.min, entry.max);

      const scale = SCALE_DEGREES[this.settings.scale];
      const degree = scale[Math.floor(normalized * (scale.length - 1))];
      const octaveOffset = this.settings.octaveShift * 12;
      const midi = BASE_MIDI + octaveOffset + degree + (index % 3) * 3;
      const frequency = midiToFrequency(midi);

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = entry.waveform;
      oscillator.frequency.setValueAtTime(frequency, now);

      const baseGain = 0.018 + index * 0.002;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    });

    this.stepIndex += 1;
  }
}
