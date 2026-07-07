/**
 * AnimationController-compatible wrapper — DirLocoBlend gait + AnimationDirector overlay.
 * Danger room Grudge6 Bip001 pipeline (dangerroom.puter.site baked motion).
 */

import { AnimationDirector } from './AnimationDirector.js';
import {
  DirLocoBlend,
  computeGaitTarget,
} from './engine/DirLocoBlend.js';
import { classifyDir, gaitTargetWhileAiming } from './engine/tpsMath.js';
import { resolveBakedLocoClipKey, SPRINT_LOCO_MULT } from './bakedAnimLoader.js';
import { getAnimOverdrive } from './dangerRoom/dangerRoomStore.js';

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

    director.externalLoco = true;

    this.actions = new Map();
    for (const [name, clip] of clips) {
      const action = mixer.clipAction(clip, root);
      this.actions.set(name, action);
      if (name === 'running') this.actions.set('run', action);
      if (name === 'walking') this.actions.set('walk', action);
    }

    this._locoBlend = new DirLocoBlend((key) => this.actions.get(key) || null);
    this._locoBlend.setSingle('idle', 0);
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
  setDirLocomotion(lx, lz, speed01, sprinting, aiming, fade = 0.12) {
    this._aiming = !!aiming;
    const moving = Math.abs(lx) > 0.01 || Math.abs(lz) > 0.01 || speed01 > 0.05;
    const dir8 = classifyDir(lx, lz);
    const wt = this._weaponType;

    if (!moving) {
      const idleKey = resolveBakedLocoClipKey('idle', dir8, wt);
      this._locoBlend.setSingle(idleKey, fade);
      this._locoBlend.update(0);
      return;
    }

    this._locoBlend.setBlend(
      dir8,
      (band, d) => resolveBakedLocoClipKey(band, d, wt),
      fade,
    );
    const gait = gaitTargetWhileAiming(
      computeGaitTarget(speed01, sprinting, moving),
      aiming,
      wt,
    );
    this._locoBlend.setGaitTarget(gait);
    this._locoBlend.setAiming(aiming);
    const od = getAnimOverdrive();
    if (moving) {
      const s = Math.min(1, Math.max(0, speed01));
      this._locoBlend.setBandTimeScales({
        idle: od,
        walk: (0.72 + s * 0.45) * od,
        run: (0.88 + s * 0.42) * od,
        sprint: SPRINT_LOCO_MULT * od,
      });
    } else {
      this._locoBlend.setBandTimeScales({
        idle: od,
        walk: od,
        run: od,
        sprint: od,
      });
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

  playOnce(stateName, speed = 1) {
    return this.play(stateName, { loop: false, speed });
  }

  update(dt) {
    const locoScale = 1 - (this.director.overlayInf || 0);
    this._locoBlend.setLocoScale?.(locoScale);
    this._locoBlend.update(dt);
    this.director.update(dt);
  }

  stop() {
    this.director.clearOverlay(0.1);
    this._locoBlend.setSingle('idle', 0.1);
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
  director.externalLoco = true;
  const ctrl = new BakedAnimationController(mixer, root, director, allClips, opts);
  ctrl.setWeaponType(weaponType);
  return ctrl;
}