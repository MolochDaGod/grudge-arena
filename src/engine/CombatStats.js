/**
 * Combat timing derived from champion build stats (haste, CDR, swing speed).
 */

/** @typedef {{ haste: number, gcd: number, swingMult: number, castMult: number, damageMult: number }} CombatTiming */

const BASE_GCD = 1.5;
const MIN_GCD = 0.75;

/**
 * @param {object|null} profile BuildProfile component or _derivePlayerProfile output
 * @returns {CombatTiming}
 */
export function deriveCombatTiming(profile) {
  const hasteRating = profile?.hasteRating ?? 0;
  const haste = 1 + Math.min(0.45, hasteRating * 0.0018);
  const cdr = profile?.cdrMult ?? 1;
  const gcd = Math.max(MIN_GCD, (BASE_GCD / haste) * cdr);
  return {
    haste,
    gcd,
    swingMult: 1 / haste,
    castMult: 1 / haste,
    damageMult: profile?.damageMult ?? 1,
  };
}

export function scaledSwingInterval(weaponAttackSpeed, timing) {
  const base = 1 / Math.max(0.2, weaponAttackSpeed || 1);
  return base * (timing?.swingMult ?? 1);
}

export function scaledCastTime(castTime, timing) {
  if (!castTime) return 0;
  return castTime * (timing?.castMult ?? 1);
}

/** Ability-specific cooldown (CDR only — not haste). */
export function scaledAbilityCooldown(cooldown, cdrMult = 1) {
  if (!cooldown) return 0;
  return cooldown * cdrMult;
}