/**
 * Generative Danger Room music bed — ported from arpg-game DangerRoomMusic.ts.
 */

const ROOTS = [110, 87.31, 130.81, 98];
const CHORDS = [
  [0, 3, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 12],
];

let singleton = null;

export class DangerRoomMusic {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.timer = null;
    this.noteIndex = 0;
    this.chordIndex = 0;
    this.nextNoteAt = 0;
    this.intensity = 0.35;
    this.intensityTarget = 0.35;
    this.volume = 0.65;
    this.enabled = true;
    this.started = false;
  }

  async resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 1400;
      this.filter.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.nextNoteAt = this.ctx.currentTime + 0.05;
      this.timer = setInterval(() => this.schedule(), 60);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    this.applyVolume();
  }

  setVolume(v) {
    this.volume = v;
    this.applyVolume();
  }

  setIntensityTarget(v) {
    this.intensityTarget = Math.max(0, Math.min(1, v));
  }

  update(dt) {
    const lambda = 2.2;
    this.intensity += (this.intensityTarget - this.intensity) * (1 - Math.exp(-lambda * dt));
    return {
      intensity: this.intensity,
      beat: this.noteIndex,
      beatPhase: 0,
    };
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.started = false;
  }

  applyVolume() {
    if (!this.master || !this.ctx) return;
    const g = this.enabled ? 0.1 * this.volume : 0;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.08);
  }

  schedule() {
    if (!this.ctx || !this.filter || !this.enabled) return;
    const now = this.ctx.currentTime;
    const noteDur = 0.55 - this.intensity * 0.22;
    while (this.nextNoteAt < now + 0.12) {
      const root = ROOTS[this.chordIndex % ROOTS.length];
      const chord = CHORDS[this.chordIndex % CHORDS.length];
      const note = chord[this.noteIndex % chord.length];
      const freq = root * Math.pow(2, note / 12);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, this.nextNoteAt);
      gain.gain.linearRampToValueAtTime(0.04 + this.intensity * 0.06, this.nextNoteAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.nextNoteAt + noteDur);
      osc.connect(gain);
      gain.connect(this.filter);
      osc.start(this.nextNoteAt);
      osc.stop(this.nextNoteAt + noteDur + 0.02);
      this.noteIndex++;
      if (this.noteIndex % 8 === 0) this.chordIndex++;
      this.nextNoteAt += noteDur;
    }
  }
}

export function getDangerRoomMusic() {
  if (!singleton) singleton = new DangerRoomMusic();
  return singleton;
}

export function disposeDangerRoomMusic() {
  singleton?.dispose();
  singleton = null;
}