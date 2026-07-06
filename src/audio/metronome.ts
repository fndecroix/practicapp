/**
 * Web Audio metronome using the classic lookahead scheduler: a coarse JS
 * interval wakes up every 25ms and schedules any clicks falling within the
 * next 100ms on the AudioContext clock, so timing doesn't depend on
 * setInterval precision (which the browser throttles freely).
 */
export class Metronome {
  bpm = 80;
  beatsPerBar = 4;
  /** Fired (roughly) when each beat sounds, with its index (0 = accent). */
  onBeat: ((beat: number) => void) | null = null;

  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private nextNoteTime = 0;
  private beat = 0;

  get running(): boolean {
    return this.timer != null;
  }

  start(): void {
    if (this.timer != null) return;
    // Created here so it happens inside a user gesture (autoplay policy).
    if (!this.ctx) this.ctx = new AudioContext();
    void this.ctx.resume();
    this.beat = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.nextNoteTime < ctx.currentTime + 0.1) {
      this.click(this.nextNoteTime, this.beat === 0);
      this.notify(this.beat, this.nextNoteTime);
      this.nextNoteTime += 60 / this.bpm;
      this.beat = (this.beat + 1) % this.beatsPerBar;
    }
  }

  /** A short pitched blip; the bar's first beat rings higher and louder. */
  private click(time: number, accent: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1568 : 1047; // G6 / C6
    gain.gain.setValueAtTime(accent ? 0.5 : 0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  /** Defer the UI callback until the click actually plays. */
  private notify(beat: number, time: number): void {
    if (!this.onBeat) return;
    const delay = Math.max(0, (time - this.ctx!.currentTime) * 1000);
    window.setTimeout(() => {
      if (this.timer != null) this.onBeat?.(beat);
    }, delay);
  }
}
