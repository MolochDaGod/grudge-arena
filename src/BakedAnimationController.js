/**
 * AnimationController-compatible wrapper around AnimationDirector + baked clips.
 * Used by danger room for Grudge6 Bip001 characters.
 */

import { AnimationDirector } from './AnimationDirector.js';

const LOCO_STATES = new Set(['idle', 'walk', 'run', 'sprint', 'running', 'walking']);

const LOOP_STATES = new Set([
  'idle', 'walk', 'run', 'sprint', 'running', 'walking',
  'blockIdle', 'aimIdle', 'fallLoop', 'jumpLoop',
]);

const PLAY_FALLBACKS = {
  heavy: ['combo1', 'attack1', 'attack'],
  dodge: ['dodge', 'jump'],
  fall: ['jump', 'idle'],
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
  constructor(mixer, root, director, clips) {
    this.mixer = mixer;
    this.root = root;
    this.director = director;
    this.clips = clips;
    this.useBakedLoco = true;
    this.currentState = 'idle';
    this.currentAction = null;
    this._onFinish = null;

    this.actions = new Map();
    for (const [name, clip] of clips) {
      const action = mixer.clipAction(clip, root);
      this.actions.set(name, action);
      if (name === 'running') this.actions.set('run', action);
      if (name === 'walking') this.actions.set('walk', action);
    }
  }

  registerActions() {}

  setGaitTarget(moving, sprinting) {
    this.director.setGaitTarget(moving, sprinting);
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

    if (isLoop) {
      this.director.playLoop(resolved.clip, fade);
    } else {
      this.director.playOneShot(resolved.clip, {
        fade,
        timeScale: opts.speed ?? 1,
        onEnd: () => {
          if (this._onFinish) this._onFinish();
        },
      });
    }

    this.currentState = stateName;
    this.currentAction = this.actions.get(resolved.stateName) || null;
    return true;
  }

  playOnce(stateName, speed = 1) {
    return this.play(stateName, { loop: false, speed });
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

export function createBakedController(mixer, root, locoClips, allClips) {
  const director = new AnimationDirector(mixer, locoClips);
  director.primeLocomotion();
  return new BakedAnimationController(mixer, root, director, allClips);
}