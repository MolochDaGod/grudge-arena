/**
 * Camera recoil + shake — danger room / arpg-game CameraRig parity.
 * Trauma² shake model; recoil nudges look-at pitch/yaw.
 */

export const BASE_RECOIL_PITCH = 0.012;
export const BASE_RECOIL_YAW = 0.006;
export const BASE_RECOIL_WEAPON = 0.045;
const RECOIL_DECAY = 14;
const SHAKE_BIAS_DECAY = 14;

const DEFAULT_SHAKE = {
  perShot: 0.32,
  decay: 2.8,
  trans: 0.14,
  roll: 0.035,
  recoilYawCouple: 0.35,
  freq: 1,
};

const SHAKE_BY_KIND = {
  rifle: {
    perShot: 0.3,
    decay: 2.9,
    trans: 0.13,
    roll: 0.032,
    recoilYawCouple: 0.4,
    freq: 1,
  },
  bow: {
    perShot: 0.14,
    decay: 3.8,
    trans: 0.06,
    roll: 0.012,
    recoilYawCouple: 0.15,
    freq: 1.2,
  },
};

const RECOIL_SCALE = {
  rifle: 1,
  bow: 0.6,
  greatsword: 0.35,
  sabres: 0.3,
  staff: 0.25,
  mace: 0.3,
  scythe: 0.35,
};

export const recoil = {
  camPitch: 0,
  camYaw: 0,
  weapon: 0,
};

export const shake = {
  trauma: 0,
  time: 0,
  profile: { ...DEFAULT_SHAKE },
  yawBias: 0,
};

export function shakeProfileFor(weaponType) {
  return SHAKE_BY_KIND[weaponType] ?? DEFAULT_SHAKE;
}

export function recoilScaleFor(weaponType) {
  return RECOIL_SCALE[weaponType] ?? 0.4;
}

export function recoilKick(recoilScale, rng = Math.random) {
  const s = Math.max(0, recoilScale);
  return {
    pitch: BASE_RECOIL_PITCH * s,
    yaw: (rng() - 0.5) * 2 * BASE_RECOIL_YAW * s,
    weapon: BASE_RECOIL_WEAPON * s,
  };
}

export function addRecoil(weaponType) {
  const scale = recoilScaleFor(weaponType);
  const k = recoilKick(scale);
  recoil.camPitch = Math.min(0.2, recoil.camPitch + k.pitch);
  recoil.camYaw += k.yaw;
  recoil.weapon = Math.min(0.08, recoil.weapon + k.weapon);
}

export function addShake(weaponType) {
  const scale = recoilScaleFor(weaponType);
  const profile = shakeProfileFor(weaponType);
  shake.profile = profile;
  shake.trauma = Math.min(1, shake.trauma + profile.perShot * scale);
  shake.yawBias = Math.min(
    0.12,
    Math.max(-0.12, recoil.camYaw * profile.recoilYawCouple),
  );
}

export function updateCameraRecoil(dt) {
  const d = Math.exp(-RECOIL_DECAY * dt);
  recoil.camPitch *= d;
  recoil.camYaw *= d;
  recoil.weapon *= d;

  shake.time += dt;
  shake.trauma = Math.max(0, shake.trauma - shake.profile.decay * dt);
  shake.yawBias *= Math.exp(-SHAKE_BIAS_DECAY * dt);
}

/**
 * Apply screen-space shake offset to camera (call after lookAt).
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} dt
 */
export function applyCameraShake(camera, dt) {
  if (shake.trauma < 1e-4) return;
  const prof = shake.profile;
  const trans = prof.trans ?? 0.14;
  const roll = prof.roll ?? 0.035;
  const f = prof.freq ?? 1;
  const s = shake.trauma * shake.trauma;
  const t = shake.time;
  const nx =
    Math.sin(t * 61 * f) * 0.6 +
    Math.sin(t * 113 * f + 1.7) * 0.4 +
    shake.yawBias;
  const ny = Math.sin(t * 47 * f + 1.3) * 0.6 + Math.sin(t * 97 * f + 0.5) * 0.4;
  const nr = Math.sin(t * 53 * f + 2.1);
  camera.translateX(nx * s * trans);
  camera.translateY(ny * s * trans);
  camera.rotateZ(nr * s * roll);
}