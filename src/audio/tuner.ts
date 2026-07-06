/**
 * Microphone tuner: reads time-domain audio through an AnalyserNode and
 * estimates the pitch with an autocorrelation detector (the well-known ACF2+
 * variant), which is robust enough for a practice tuner down to the cello's
 * low C2 (~65 Hz).
 */

const A4 = 440;

export type Pitch = {
  /** Detected fundamental, in Hz. */
  freq: number;
  /** Nearest MIDI note number. */
  midi: number;
  /** Deviation from that note in cents, -50..50. */
  cents: number;
};

export function toPitch(freq: number): Pitch {
  const midiFloat = 69 + 12 * Math.log2(freq / A4);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  return { freq, midi, cents };
}

/** Solfège spelling (the app is in Spanish): midi 69 → LA. */
const NOTE_NAMES = ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI'];

export function noteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

/** Scientific octave number: midi 69 (LA/A4) → 4. */
export function noteOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/**
 * Autocorrelation pitch detection over one analyser buffer. Returns the
 * fundamental in Hz, or -1 when the signal is too quiet / has no clear pitch.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;

  // Gate on signal level so room noise doesn't produce ghost notes.
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return -1;

  // Trim the quiet skirts of the buffer to sharpen the correlation.
  const thres = 0.2;
  let r1 = 0;
  let r2 = n - 1;
  for (let i = 0; i < n / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < n / 2; i++) {
    if (Math.abs(buf[n - i]) < thres) {
      r2 = n - i;
      break;
    }
  }
  const b = buf.slice(r1, r2);
  const size = b.length;
  if (size < 32) return -1;

  const c = new Float32Array(size);
  for (let lag = 0; lag < size; lag++) {
    let sum = 0;
    for (let j = 0; j < size - lag; j++) sum += b[j] * b[j + lag];
    c[lag] = sum;
  }

  // Skip the initial peak at lag 0, then take the strongest peak after it.
  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < size; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  if (maxpos <= 0) return -1;

  // Parabolic interpolation around the peak for sub-sample precision.
  let t0 = maxpos;
  if (t0 > 0 && t0 < size - 1) {
    const x1 = c[t0 - 1];
    const x2 = c[t0];
    const x3 = c[t0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const bb = (x3 - x1) / 2;
    if (a) t0 = t0 - bb / (2 * a);
  }

  return sampleRate / t0;
}

export class Tuner {
  /** Fired every animation frame with the current pitch (null = no signal). */
  onPitch: ((p: Pitch | null) => void) | null = null;

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(2048);
  private raf = 0;

  get running(): boolean {
    return this.ctx != null;
  }

  /** Asks for mic permission; rejects if the user denies it. */
  async start(): Promise<void> {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Processing tuned for voice calls distorts instrument pitch — off.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);

    const loop = () => {
      this.analyser!.getFloatTimeDomainData(this.buf);
      const f = detectPitch(this.buf, this.ctx!.sampleRate);
      // Anything outside ~an octave below cello C2 .. violin E7 is noise.
      this.onPitch?.(f > 40 && f < 2200 ? toPitch(f) : null);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
  }
}
