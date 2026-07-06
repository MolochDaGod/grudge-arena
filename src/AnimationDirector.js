/**
 * AnimationDirector — damped gait blend + overlay channel.
 * Ported from lib/character-kit/src/animDirector.ts (GRUDGE /world runtime).
 */

import * as THREE from 'three';

const BANDS = [
  { state: 'idle', at: 0 },
  { state: 'walk', at: 0.34 },
  { state: 'run', at: 0.7 },
  { state: 'sprint', at: 1 },
];

const GAIT_RATE_ACCEL = 9;
const GAIT_RATE_DECEL = 13;
const OVERLAY_EASE = 1.35;
const LOCO_WEIGHT_FLOOR = 0.001;

function clampBlend(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

export class AnimationDirector {
  /**
   * @param {THREE.AnimationMixer} mixer
   * @param {{ idle: THREE.AnimationClip, walk: THREE.AnimationClip, run: THREE.AnimationClip, sprint: THREE.AnimationClip }} clips
   */
  constructor(mixer, clips) {
    this.mixer = mixer;
    this.gait = 0;
    this.gaitTarget = 0;
    this.overlay = null;
    this.overlayLoop = false;
    this.overlayFade = 0.12;
    this.overlayInf = 0;
    this.overlayTarget = 0;
    this.finishing = false;
    this.overlayEnd = null;
    this.overlayClones = new Map();
    this.buffered = null;

    const mk = (clip) => {
      const a = mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      return a;
    };

    this.loco = {
      idle: mk(clips.idle),
      walk: mk(clips.walk),
      run: mk(clips.run),
      sprint: mk(clips.sprint),
    };
    this.loco.idle.setEffectiveWeight(1);
    this.onFinished = this._onFinished.bind(this);
    this.mixer.addEventListener('finished', this.onFinished);
    this.mixer.update(0);
  }

  get busy() {
    return this.overlay !== null && !this.overlayLoop && !this.finishing;
  }

  setGaitTarget(moving, sprinting) {
    this.gaitTarget = !moving ? 0 : sprinting ? 1 : 0.7;
  }

  primeLocomotion() {
    this.gait = 0;
    this.gaitTarget = 0;
    for (const st of BANDS) {
      const w = st.state === 'idle' ? 1 : 0;
      this.loco[st.state].setEffectiveWeight(w);
    }
    this.mixer.update(0);
  }

  _overlayActionFor(clip) {
    let c = this.overlayClones.get(clip.uuid);
    if (!c) {
      c = clip.clone();
      this.overlayClones.set(clip.uuid, c);
    }
    return this.mixer.clipAction(c);
  }

  playOneShot(clip, opts = {}) {
    if (this.overlay) this.overlay.stop();
    const a = this._overlayActionFor(clip);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = opts.timeScale ?? 1;
    a.setEffectiveWeight(1);
    a.play();
    this.overlay = a;
    this.overlayLoop = false;
    this.overlayFade = opts.fade ?? 0.12;
    this.overlayTarget = clampBlend(opts.blend);
    this.finishing = false;
    this.overlayEnd = opts.onEnd ?? null;
    this.buffered = null;
  }

  requestOneShot(clip, opts = {}) {
    if (this.overlay && !this.overlayLoop && !this.finishing) {
      const remaining = this.overlay.getClip().duration - this.overlay.time;
      if (remaining > (opts.fade ?? 0.12)) {
        this.buffered = { clip, opts };
        return;
      }
    }
    this.playOneShot(clip, opts);
  }

  playLoop(clip, fade = 0.15, blend = 1) {
    if (this.overlay) this.overlay.stop();
    const a = this._overlayActionFor(clip);
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = false;
    a.timeScale = 1;
    a.setEffectiveWeight(1);
    a.play();
    this.overlay = a;
    this.overlayLoop = true;
    this.overlayFade = fade;
    this.overlayTarget = clampBlend(blend);
    this.finishing = false;
    this.overlayEnd = null;
    this.buffered = null;
  }

  clearOverlay(fade = 0.15) {
    if (!this.overlay) return;
    this.overlayFade = fade;
    this.overlayTarget = 0;
    this.finishing = true;
  }

  _onFinished(e) {
    if (this.overlay && e.action === this.overlay && !this.overlayLoop) {
      this.finishing = true;
      this.overlayTarget = 0;
    }
  }

  update(delta) {
    const gaitRate = this.gaitTarget < this.gait ? GAIT_RATE_DECEL : GAIT_RATE_ACCEL;
    this.gait += (this.gaitTarget - this.gait) * (1 - Math.exp(-gaitRate * delta));

    const w = { idle: 0, walk: 0, run: 0, sprint: 0 };
    if (this.gait >= 1) {
      w.sprint = 1;
    } else {
      for (let i = 0; i < BANDS.length - 1; i++) {
        const a = BANDS[i];
        const b = BANDS[i + 1];
        if (this.gait >= a.at && this.gait <= b.at) {
          const t = (this.gait - a.at) / (b.at - a.at);
          w[a.state] = 1 - t;
          w[b.state] = t;
          break;
        }
      }
    }

    if (this.overlay) {
      const k = 1 - Math.exp(-(OVERLAY_EASE / Math.max(0.02, this.overlayFade)) * delta);
      this.overlayInf += (this.overlayTarget - this.overlayInf) * k;

      if (this.buffered && !this.overlayLoop && !this.finishing) {
        const remaining = this.overlay.getClip().duration - this.overlay.time;
        if (remaining <= this.overlayFade) {
          const b = this.buffered;
          this.buffered = null;
          this.playOneShot(b.clip, b.opts);
        }
      }

      if (this.finishing && this.overlayInf < 0.02) {
        this.overlay.stop();
        const end = this.overlayEnd;
        this.overlay = null;
        this.overlayEnd = null;
        this.finishing = false;
        this.overlayInf = 0;
        if (end) end();
      }
    } else {
      this.overlayInf = 0;
    }

    const locoScale = 1 - this.overlayInf;
    let locoSum = 0;
    for (const { state } of BANDS) {
      const bandWeight = w[state] * locoScale;
      this.loco[state].setEffectiveWeight(bandWeight);
      locoSum += bandWeight;
    }

    if (locoSum < LOCO_WEIGHT_FLOOR && !this.overlay) {
      this.loco.idle.setEffectiveWeight(Math.max(LOCO_WEIGHT_FLOOR, locoScale));
    }
    if (this.overlay) this.overlay.setEffectiveWeight(this.overlayInf);

    this.mixer.update(delta);
  }

  dispose() {
    this.mixer.removeEventListener('finished', this.onFinished);
    this.overlayClones.clear();
  }
}