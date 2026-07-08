/**
 * AnimationController-compatible wrapper — DirLocoBlend gait + AnimationDirector overlay.
 * Danger room Grudge6 Bip001 pipeline (dangerroom.puter.site baked motion).
 */

import { AnimationDirector } from './AnimationDirector.js';
import { computeGaitTarget } from './engine/DirLocoBlend.js';
import { gaitTargetWhileAiming } from './engine/tpsMath.js';
import {
  SPRINT_LOCO_MULT,
  loadBakedClip,
} from './bakedAnimLoader.js';
import { getAnimOverdrive } from './dangerRoom/dangerRoomStore.js';
import { bakedPathForState } from './animCatalog.js';
import { classifyOmniDir } from './omniLoco.js';
import { bindOmniBands } from './omniLocoBinder.js';

const LOCO_STATES = new Set(['idle', 'walk', 'run', 'sprint', 'running', 'walking']);

const LOOP_STATES = new Set([
  'idle', 'walk', 'run', 'sprint', 'running', 'walking',
  'walkBack', 'runBack', 'strafeLeft', 'strafeRight',
  'blockIdle', 'aimIdle', 'fallLoop', 'jumpLoop',
]);

const PLAY_FALLBACKS = {
  heavy: ['combo1', 'attack1', 'attack'],
  dodge: ['dodge', 'dodgeBack', 'roll', 'jump'],
  dodgeBack: ['dodge', 'roll', 'jump'],
  roll: ['dodge', 'dodgeBack', 'jump'],
  climb: ['jump', 'idle'],
  sneak: ['walk', 'crouch', 'idle'],
  fall: ['fallLoop', 'jump', 'idle'],
  fallLoop: ['fall', 'jump', 'idle'],
  landHard: ['jumpLand', 'jump', 'idle'],
  jumpLand: ['landHard', 'idle'],
  descendSlope: ['walk', 'idle'],
  runSlide: ['run', 'sprint'],
  turnLeft: ['walk', 'idle'],
  turnRight: ['walk', 'idle'],
  swing: ['attack1', 'attack'],
  combo3: ['combo2', 'combo1', 'attack1'],
  combo2: ['combo1', 'attack1'],
  combo1: ['attack1', 'attack'],
  jumpAttack: ['attack1', 'jump'],
  cast2H: ['cast', 'attack1'],
  aoe2: ['cast', 'attack1'],
  powerUp: ['taunt', 'cast'],
  dashAttack: ['combo1', 'attack1'],
  airAttack: ['attack1', 'jump'],
  fire: ['attack1', 'attack'],
  reload: ['aimIdle', 'idle'],
  running: ['run'],
  walking: ['walk'],
};

export class BakedAnimationController {
  /**
   * @param {THREE.AnimationMixer} mixer
   * @param {THREE.Object3D} root
   * @param {AnimationDirector} director
   * @param {Map<string, THREE.AnimationClip>} clips
   */
  constructor(mixer, root, director, clips, opts = {}) {
    this.mixer = mixer;
    this.root = root;
    this.director = director;
    this.clips = clips;
    /** @type {Map<string, string>} registry key → baked JSON rel path */
    this.clipSources = opts?.clipSources || new Map();
    this.useBakedLoco = true;
    this.currentState = 'idle';
    this.currentAction = null;
    this._onFinish = null;
    this._weaponType = 'greatsword';
    this._aiming = false;
    this._skillReqId = 0;
    this._clipCache = new Map();
    this._omniKeys = { idle: '', walk: '', run: '', sprint: '' };
    this._omniDir = 'forward';
    this._useWorldLoco = opts?.worldLoco !== false;

    this.actions = new Map();
    for (const [name, clip] of clips) {
      const action = mixer.clipAction(clip, root);
      this.actions.set(name, action);
      if (name === 'running') this.actions.set('run', action);
      if (name === 'walking') this.actions.set('walk', action);
    }

    if (this._useWorldLoco) {
      director.externalLoco = false;
      director.setOmniEnabled(true);
      director.setLocoTimeScale('sprint', SPRINT_LOCO_MULT);
    } else {
      director.externalLoco = true;
    }
  }

  /** Alternate idle loops at rest (/game/world idle variety). */
  bootstrapIdleVariety(clips) {
    if (!clips?.length) return;
    this.director.setIdleAlternates(clips);
  }

  registerActions() {}

  setWeaponType(weaponType) {
    this._weaponType = weaponType || 'greatsword';
  }

  setGaitTarget(moving, sprinting) {
    this.setDirLocomotion(0, moving ? 1 : 0, moving ? 0.7 : 0, sprinting, false);
  }

  setGaitFromSpeed(speed01, sprinting) {
    const moving = speed01 >= 0.05;
    this.setDirLocomotion(0, moving ? 1 : 0, speed01, sprinting, this._aiming);
  }

  /**
   * 8-direction locomotion in character-local frame (lx strafe+, lz forward+).
   */
  setDirLocomotion(lx, lz, speed01, sprinting, aiming) {
    this._aiming = !!aiming;
    const moving = Math.abs(lx) > 0.01 || Math.abs(lz) > 0.01 || speed01 > 0.05;
    const wt = this._weaponType;
    const d = this.director;

    const gait = gaitTargetWhileAiming(
      computeGaitTarget(speed01, sprinting, moving),
      aiming,
      wt,
    );
    d.setGaitScalar(gait);
    d.setIdleVarietyPaused(d.busy || d.loopActive || moving || sprinting);

    const omniDir = classifyOmniDir(lx, lz);
    const omniStale = !this._omniKeys.idle;
    if (omniDir !== this._omniDir || omniStale) {
      this._omniDir = omniDir;
      bindOmniBands(d, wt, omniDir, this._omniKeys, this._clipCache, this.root);
    }

    const od = getAnimOverdrive();
    if (moving) {
      const s = Math.min(1, Math.max(0, speed01));
      d.setLocoTimeScale('idle', od);
      d.setLocoTimeScale('walk', (0.72 + s * 0.45) * od);
      d.setLocoTimeScale('run', (0.88 + s * 0.42) * od);
      d.setLocoTimeScale('sprint', SPRINT_LOCO_MULT * od);
    } else {
      for (const st of ['idle', 'walk', 'run', 'sprint']) d.setLocoTimeScale(st, od);
    }
  }

  _resolveClip(stateName) {
    let clip = this.clips.get(stateName);
    if (clip) return { clip, stateName };

    for (const fb of PLAY_FALLBACKS[stateName] || []) {
      clip = this.clips.get(fb);
      if (clip) return { clip, stateName: fb };
    }

    for (const fb of ['idle', 'run', 'walk']) {
      clip = this.clips.get(fb);
      if (clip) return { clip, stateName: fb };
    }
    return null;
  }

  play(stateName, opts = {}) {
    if (LOCO_STATES.has(stateName)) {
      this.currentState = stateName;
      return true;
    }

    const resolved = this._resolveClip(stateName);
    if (!resolved) return false;

    const isLoop =
      opts.loop !== undefined ? opts.loop : LOOP_STATES.has(stateName);
    const fade = opts.fadeDuration ?? 0.12;
    this._onFinish = opts.onFinish ?? null;

    const shotOpts = {
      fade,
      blend: opts.blend ?? 1,
      timeScale: (opts.speed ?? 1) * getAnimOverdrive(),
      onEnd: () => {
        if (this._onFinish) this._onFinish();
      },
    };
    if (isLoop) {
      this.director.playLoop(resolved.clip, fade);
    } else if (this.director.busy) {
      this.director.requestOneShot(resolved.clip, shotOpts);
    } else {
      this.director.playOneShot(resolved.clip, shotOpts);
    }

    this.currentState = stateName;
    this.currentAction = this.actions.get(resolved.stateName) || null;
    return true;
  }

  playOnce(stateName, speed = 1, blend = 1) {
    return this.play(stateName, { loop: false, speed, blend });
  }

  _clipByRel(rel) {
    if (!rel) return null;
    if (this._clipCache.has(rel)) return this._clipCache.get(rel);
    for (const [name, src] of this.clipSources) {
      if (src === rel && this.clips.has(name)) return this.clips.get(name);
    }
    return null;
  }

  /**
   * World-style skill cast: async baked load, blend overlay, optional slow windup + follow chain.
   * @param {{ rel?: string, stateName?: string, blend?: number, extend?: number, followRel?: string|null, timeScale?: number }} opts
   */
  castSkill(opts = {}) {
    const {
      rel: relIn,
      stateName,
      blend = 0.85,
      extend = 1,
      followRel = null,
      timeScale = 1,
    } = opts;
    const rel = relIn || bakedPathForState(stateName, this._weaponType);
    if (!rel) {
      if (stateName) return this.playOnce(stateName, timeScale, blend);
      return false;
    }

    const reqId = ++this._skillReqId;
    const slow = Math.max(0.1, extend);
    const fade = 0.12;

    const chainFollow = (clip) => {
      if (!followRel || reqId !== this._skillReqId) return;
      const playFollow = (fc) => {
        if (reqId !== this._skillReqId) return;
        this.director.requestOneShot(fc, { fade, blend, timeScale });
      };
      const cached = this._clipCache.get(followRel) || this._clipByRel(followRel);
      if (cached) {
        playFollow(cached);
        return;
      }
      loadBakedClip(followRel, this.root)
        .then((fc) => {
          this._clipCache.set(followRel, fc);
          playFollow(fc);
        })
        .catch((err) => console.warn("[bakedAnim] follow clip:", followRel, err.message));
    };

    const go = (clip) => {
      if (reqId !== this._skillReqId) return;
      const shotOpts = {
        fade,
        blend,
        timeScale: (timeScale * getAnimOverdrive()) / slow,
      };
      if (this.director.busy) this.director.requestOneShot(clip, shotOpts);
      else this.director.playOneShot(clip, shotOpts);
      if (stateName) this.currentState = stateName;
      chainFollow(clip);
    };

    const cached = this._clipCache.get(rel) || this._clipByRel(rel);
    if (cached) {
      go(cached);
      return true;
    }

    loadBakedClip(rel, this.root)
      .then((clip) => {
        clip.name = stateName || rel;
        this._clipCache.set(rel, clip);
        if (!this.clips.has(clip.name)) {
          this.clips.set(clip.name, clip);
          this.actions.set(clip.name, this.mixer.clipAction(clip, this.root));
        }
        go(clip);
      })
      .catch((err) => {
        console.warn(`[bakedAnim] skill clip ${rel}:`, err.message);
        if (stateName) this.playOnce(stateName, timeScale, blend);
      });
    return true;
  }

  update(dt) {
    this.director.update(dt);
  }

  stop() {
    this.director.clearOverlay(0.1);
    this.director.primeLocomotion();
    this.currentAction = null;
    this.currentState = 'idle';
  }

  dispose() {
    this.director.dispose();
    this.actions.clear();
    this.clips.clear();
  }
}

export function createBakedController(mixer, root, locoClips, allClips, weaponType = 'greatsword', opts = {}) {
  const director = new AnimationDirector(mixer, locoClips);
  const ctrl = new BakedAnimationController(mixer, root, director, allClips, {
    ...opts,
    worldLoco: opts.worldLoco !== false,
  });
  ctrl.setWeaponType(weaponType);
  return ctrl;
}