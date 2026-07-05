/**
 * Combat feedback — combo counter, hit marker, ability slot flash, crosshair spread.
 */

let comboStage = 0;
let lastHitAt = 0;
let hitMarkerId = 0;
let lastAbilityKey = null;
let abilityFlashUntil = 0;
let crosshairSpread = 0;

const COMBO_DECAY_MS = 1600;

export function getComboStage() {
  return comboStage;
}

export function getHitMarkerId() {
  return hitMarkerId;
}

export function getCrosshairSpread() {
  return crosshairSpread;
}

export function getLastAbilityKey() {
  return lastAbilityKey;
}

export function isAbilityFlashing() {
  return performance.now() < abilityFlashUntil;
}

/** Call when damage lands on a valid target. */
export function registerHit() {
  const now = performance.now();
  if (now - lastHitAt < COMBO_DECAY_MS) comboStage = Math.min(comboStage + 1, 8);
  else comboStage = 1;
  lastHitAt = now;
  hitMarkerId = now;
}

export function resetCombo() {
  comboStage = 0;
  lastHitAt = 0;
}

export function flashAbilityUsed(key) {
  lastAbilityKey = key;
  abilityFlashUntil = performance.now() + 280;
}

/** Ranged weapons bloom crosshair briefly after shots. */
export function pulseCrosshairSpread(amount = 6) {
  crosshairSpread = Math.min(28, crosshairSpread + amount);
}

export function tickCombatFeedback(delta) {
  crosshairSpread = Math.max(0, crosshairSpread - delta * 22);
  const now = performance.now();
  if (comboStage > 0 && now - lastHitAt > COMBO_DECAY_MS) {
    comboStage = 0;
  }
}