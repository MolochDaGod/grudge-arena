/**
 * AnimClipSanitize — Three.js best practices for in-place character animation.
 *
 * Contract (game-ready Bip001 / Mixamo):
 *   • XZ  — character root is driven by ArenaController / AI (never by anim root motion)
 *   • Y   — character root Y is driven by ground snap / physics AFTER mixer.update()
 *   • Bones — AnimationMixer applies rotation (quaternion) only on the skeleton
 *
 * Why strip position tracks:
 *   Hip / Bip001 position keys cause sliding feet, floating, and fight with HipRecenter
 *   + FootIk. Rotation-only clips retarget cleanly across race scales.
 *
 * Usage: sanitize every clip before mixer.clipAction(clip, animRoot).
 */

import * as THREE from "three";

const ROOT_BONE_RE = /^(Armature|Bip001|Hips|mixamorig:?Hips|Root|root)$/i;
const PELVIS_RE = /Pelvis|Hips/i;

/**
 * Parse "Bone.property" → { bone, prop }
 * @param {string} trackName
 */
export function splitTrackName(trackName) {
  const dot = trackName.indexOf(".");
  if (dot === -1) return { bone: trackName, prop: "" };
  return {
    bone: trackName.slice(0, dot),
    prop: trackName.slice(dot + 1),
  };
}

/**
 * Keep only quaternion (and legacy Euler rotation) tracks.
 * Strips position (root motion XZ + hip float Y) and scale.
 * @param {THREE.AnimationClip} clip
 * @returns {THREE.AnimationClip}
 */
export function toRotationOnlyClip(clip) {
  if (!clip?.tracks) return clip;
  const kept = [];
  for (const track of clip.tracks) {
    const { prop } = splitTrackName(track.name);
    if (prop === "quaternion" || prop === "rotation" || prop.startsWith("rotation[")) {
      kept.push(track);
    }
  }
  clip.tracks = kept;
  clip.resetDuration();
  return clip;
}

/**
 * Extra safety: drop any track on armature/root bones that isn't quaternion.
 * (Some bakes put root translation on "Bip001.position" even when pelvis is clean.)
 * @param {THREE.AnimationClip} clip
 */
export function stripRootMotionTracks(clip) {
  if (!clip?.tracks) return clip;
  clip.tracks = clip.tracks.filter((track) => {
    const { bone, prop } = splitTrackName(track.name);
    if (ROOT_BONE_RE.test(bone) && prop !== "quaternion" && prop !== "rotation") {
      return false;
    }
    // Pelvis position = classic foot-slide / hop — always strip
    if (PELVIS_RE.test(bone) && (prop === "position" || prop.startsWith("position["))) {
      return false;
    }
    return true;
  });
  clip.resetDuration();
  return clip;
}

/**
 * Full in-place sanitize for arena locomotion + combat overlays.
 * @param {THREE.AnimationClip} clip
 * @returns {THREE.AnimationClip}
 */
export function sanitizeClipInPlace(clip) {
  if (!clip) return clip;
  toRotationOnlyClip(clip);
  stripRootMotionTracks(clip);
  // Avoid NaN durations from empty clips
  if (!clip.tracks.length) {
    console.warn(`[AnimClipSanitize] clip "${clip.name}" has no tracks after sanitize`);
  } else if (!(clip.duration > 0)) {
    clip.resetDuration();
  }
  return clip;
}

/**
 * Ensure loco map has valid clips (clone chain) so AnimationDirector never gets null.
 * @param {Map<string, THREE.AnimationClip>} clips
 * @param {{ idle?: THREE.AnimationClip, walk?: THREE.AnimationClip, run?: THREE.AnimationClip, sprint?: THREE.AnimationClip }} loco
 */
export function ensureLocoClips(clips, loco = {}) {
  let idle = loco.idle || clips.get("idle");
  let walk = loco.walk || clips.get("walk");
  let run = loco.run || clips.get("run");
  let sprint = loco.sprint || clips.get("sprint");

  const pick = (...cands) => cands.find((c) => c && c.tracks?.length);

  idle = pick(idle, walk, run, sprint);
  if (!idle) {
    // Empty 1-frame identity clip so mixer still runs
    idle = new THREE.AnimationClip("idle_empty", 0.033, []);
  }
  walk = pick(walk, idle);
  run = pick(run, walk, idle);
  if (!sprint || sprint === run) {
    sprint = run.clone();
    sprint.name = "sprint";
  }

  // Sanitize all
  for (const c of [idle, walk, run, sprint]) sanitizeClipInPlace(c);

  clips.set("idle", idle);
  clips.set("walk", walk);
  clips.set("run", run);
  clips.set("sprint", sprint);

  return { idle, walk, run, sprint };
}

/**
 * Three.js best-practice: one mixer per character, bound to the armature root
 * that owns the skinned skeleton (not the full scene with weapons props).
 * @param {THREE.Object3D} animRoot
 * @returns {THREE.AnimationMixer}
 */
export function createCharacterMixer(animRoot) {
  const mixer = new THREE.AnimationMixer(animRoot);
  // timeScale 1 = real-time; overdrive applied per-action
  mixer.timeScale = 1;
  return mixer;
}

/**
 * clipAction with explicit root — always prefer this over mixer.clipAction(clip).
 * @param {THREE.AnimationMixer} mixer
 * @param {THREE.AnimationClip} clip
 * @param {THREE.Object3D} animRoot
 */
export function clipActionOnRoot(mixer, clip, animRoot) {
  const action = mixer.clipAction(clip, animRoot);
  action.clampWhenFinished = false;
  action.enabled = true;
  return action;
}
