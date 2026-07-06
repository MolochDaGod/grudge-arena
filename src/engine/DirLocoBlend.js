/**
 * 8-direction locomotion with damped idle→walk→run→sprint gait blending.
 * Ported from arpg-game dirLocoBlend.ts (dangerroom.puter.site motion).
 */

const BANDS = [
  { band: "idle", at: 0 },
  { band: "walk", at: 0.34 },
  { band: "run", at: 0.7 },
  { band: "sprint", at: 1 },
];

const GAIT_RATE = 9;
const GAIT_RATE_AIM = 6.5;

/** @typedef {'forward'|'back'|'left'|'right'} LocoDir */
/** @typedef {'idle'|'walk'|'run'|'sprint'} LocoBand */

export function computeGaitTarget(speed01, sprint, moving) {
  if (!moving || speed01 < 0.05) return 0;
  if (sprint) return 1;
  const t = Math.min(1, speed01);
  if (t < 0.6) return 0.34 + (t / 0.6) * 0.36;
  return 0.7 + ((t - 0.6) / 0.4) * 0.29;
}

/** Map camera-relative stick to locomotion direction. */
export function resolveLocoDir(ix, iz) {
  if (Math.abs(ix) < 0.01 && Math.abs(iz) < 0.01) return "forward";
  if (Math.abs(ix) >= Math.abs(iz)) return ix < 0 ? "left" : "right";
  return iz < 0 ? "forward" : "back";
}

const DEFAULT_LOCO = {
  forward: { idle: "idle", walk: "walk", run: "run", sprint: "sprint" },
  back: { idle: "idle", walk: "walkBack", run: "runBack", sprint: "runBack" },
  left: { idle: "idle", walk: "strafeLeft", run: "strafeLeft", sprint: "strafeLeft" },
  right: { idle: "idle", walk: "strafeRight", run: "strafeRight", sprint: "strafeRight" },
};

export function defaultLocoClip(band, dir) {
  return DEFAULT_LOCO[dir]?.[band] ?? DEFAULT_LOCO.forward[band] ?? "idle";
}

export class DirLocoBlend {
  constructor(ensureAction) {
    this.ensureAction = ensureAction;
    this.gait = 0;
    this.gaitTarget = 0;
    this.gaitRate = GAIT_RATE;
    this.dir = "forward";
    this.bandKeys = { idle: "", walk: "", run: "", sprint: "" };
    this.bandActions = {};
    this.singleKey = null;
    this.singleAction = null;
    this.mode = "single";
    this.locoScale = 1;
    this.bandTimeScale = { idle: 1, walk: 1, run: 1, sprint: 1 };
  }

  setLocoScale(scale) {
    this.locoScale = Math.min(1, Math.max(0, scale));
  }

  /** Nudge walk/run/sprint playback speed to reduce foot sliding vs physics speed. */
  setBandTimeScales(scales = {}) {
    for (const { band } of BANDS) {
      const ts = scales[band];
      if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
      this.bandTimeScale[band] = Math.min(3.2, Math.max(0.55, ts));
      const action = this.bandActions[band];
      if (action) action.timeScale = this.bandTimeScale[band];
    }
    if (this.singleAction && this.mode === "single") {
      this.singleAction.timeScale = this.bandTimeScale.idle;
    }
  }

  setSingle(key, fade = 0.18) {
    if (this.mode === "single" && this.singleKey === key) return;
    this.fadeOutBlend(fade);
    this.mode = "single";
    this.gait = 0;
    this.gaitTarget = 0;
    const next = this.ensureAction(key);
    if (!next) return;
    const prev = this.singleAction;
    this.singleKey = key;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.fadeIn(fade);
    next.play();
    if (prev && prev !== next) prev.fadeOut(fade);
    this.singleAction = next;
  }

  setBlend(dir, resolve, fade = 0.15) {
    if (this.singleAction) {
      this.singleAction.fadeOut(fade);
      this.singleAction = null;
      this.singleKey = null;
    }
    this.mode = "blend";
    this.dir = dir;
    for (const { band } of BANDS) {
      const key = resolve(band, dir);
      if (key === this.bandKeys[band] && this.bandActions[band]) continue;
      this.bandKeys[band] = key;
      const action = this.ensureAction(key);
      if (!action) continue;
      const prev = this.bandActions[band];
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.timeScale = this.bandTimeScale[band] ?? 1;
      action.play();
      if (prev && prev !== action) prev.fadeOut(fade);
      this.bandActions[band] = action;
    }
  }

  setGaitTarget(target) {
    this.gaitTarget = target;
  }

  setAiming(aiming) {
    this.gaitRate = aiming ? GAIT_RATE_AIM : GAIT_RATE;
  }

  update(dt) {
    if (this.mode !== "blend") return;
    this.gait += (this.gaitTarget - this.gait) * (1 - Math.exp(-this.gaitRate * dt));
    const w = { idle: 0, walk: 0, run: 0, sprint: 0 };
    if (this.gait >= 1) {
      w.sprint = 1;
    } else {
      for (let i = 0; i < BANDS.length - 1; i++) {
        const a = BANDS[i];
        const b = BANDS[i + 1];
        if (this.gait >= a.at && this.gait <= b.at) {
          const t = (this.gait - a.at) / (b.at - a.at);
          w[a.band] = 1 - t;
          w[b.band] = t;
          break;
        }
      }
    }
    for (const { band } of BANDS) {
      const action = this.bandActions[band];
      if (action) action.setEffectiveWeight(w[band] * this.locoScale);
    }
  }

  fadeOutBlend(fade) {
    for (const { band } of BANDS) {
      this.bandActions[band]?.fadeOut(fade);
    }
  }

  reset() {
    this.gait = 0;
    this.gaitTarget = 0;
    this.mode = "single";
    this.singleKey = null;
    this.singleAction = null;
    for (const { band } of BANDS) {
      this.bandKeys[band] = "";
      delete this.bandActions[band];
    }
  }
}