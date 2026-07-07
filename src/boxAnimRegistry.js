/**
 * Curated boxanimations → game-state mappings.
 * Paths are relative to /anims/baked/ (no .json).
 * Applied after core pack clips; only overrides when baked file exists at runtime.
 */

/** @type {Record<string, string>} All packs — locomotion, reactions, traversal */
export const BOX_ANIM_GLOBAL = {
  dodgeBack: "boxanimations/locomotion/Dodging Back",
  roll: "boxanimations/locomotion/Quick Roll To Run (1)",
  jumpAttack: "boxanimations/locomotion/Jump Attack",
  jump: "boxanimations/locomotion/Unarmed Jump Running",
  fallLoop: "boxanimations/locomotion/Fall B Loop",
  landHard: "boxanimations/locomotion/Falling (2)",
  taunt: "boxanimations/emotes/Standing Taunt Battlecry",
  hit: "boxanimations/reactions/Hit Reaction",
  death: "boxanimations/reactions/Dying",
  blockIdle: "boxanimations/locomotion/Standing Block Idle",
  blockHit: "boxanimations/locomotion/Standing Block React Large",
  climb: "boxanimations/traversal/Climbing To Top",
  climbDown: "boxanimations/traversal/Climbing Down Wall",
  crouch: "boxanimations/locomotion/Crouch Walk",
  sneak: "boxanimations/locomotion/Sneak Walk",
  sprintFwd: "boxanimations/locomotion/Standing Sprint Forward",
  runBack: "boxanimations/locomotion/Run Backwards",
  strafe: "boxanimations/locomotion/Strafing",
  turn180: "boxanimations/locomotion/Running Turn 180",
};

/** @type {Record<string, Record<string, string>>} Per anim-pack combat overlays */
export const BOX_ANIM_BY_PACK = {
  sword_shield: {
    combo1: "boxanimations/unarmed/Standing Melee Combo Attack Ver. 1",
    combo2: "boxanimations/unarmed/Standing Melee Combo Attack Ver. 2 (2)",
    combo3: "boxanimations/unarmed/Standing Melee Combo Attack Ver. 3",
    slash2: "boxanimations/sword_shield/Stable Sword Outward Slash (2)",
    slash3: "boxanimations/sword_shield/Sword And Shield Slash (3)",
    slash4: "boxanimations/sword_shield/Sword And Shield Slash (4)",
    attack2: "boxanimations/sword_shield/Stable Sword Inward Slash",
    attack3: "boxanimations/unarmed/Two Hand Sword Combo (1)",
    cast: "boxanimations/sword_shield/Sword And Shield Casting (2)",
    draw: "boxanimations/sword_shield/Draw Sword 2",
    sheath: "boxanimations/sword_shield/Sheath Sword 1",
    block: "boxanimations/locomotion/Standing Block",
    dead: "boxanimations/sword_shield/Sword And Shield Death",
    powerUp: "boxanimations/sword_shield/Great Sword Casting (3)",
  },
  magic: {
    cast: "boxanimations/magic/Magic Spell Casting",
    cast2H: "boxanimations/magic/Fireball (1)",
    aoe: "boxanimations/magic/Magic Heal",
    attack1: "boxanimations/magic/Great Sword Casting (3)",
  },
  longbow: {
    attack1: "boxanimations/longbow/Standing Aim Recoil (1)",
    draw: "boxanimations/longbow/Standing Draw Arrow (1)",
    aimIdle: "boxanimations/longbow/Standing Aim Idle 02 Looking",
    disarm: "boxanimations/longbow/Standing Disarm Bow",
  },
  rifle: {
    fire: "boxanimations/rifle/Firing Rifle",
    fire2: "boxanimations/rifle/Shooting",
    reload: "boxanimations/rifle/Grab Rifle From Back",
    aimIdle: "boxanimations/rifle/Rifle Aiming Idle",
    block: "boxanimations/rifle/Block With Rifle",
  },
  pistol: {
    fire: "boxanimations/rifle/Gunplay (3)",
    aimIdle: "boxanimations/rifle/Rifle Aiming Idle",
  },
  unarmed: {
    attack1: "boxanimations/unarmed/Punch Combo (1)",
    attack2: "boxanimations/unarmed/Hook Punch",
    attack3: "boxanimations/unarmed/Flying Kick",
    combo1: "boxanimations/unarmed/One Hand Sword Combo",
    combo2: "boxanimations/unarmed/Dual Weapon Combo (1)",
    combo3: "boxanimations/unarmed/Dual Weapon Combo (2)",
  },
};

/**
 * Merge box clip overrides into a rel map for loadBakedPackClips.
 * @param {Map<string, string>} rels
 * @param {string} packName
 */
export function applyBoxAnimOverrides(rels, packName) {
  for (const [state, rel] of Object.entries(BOX_ANIM_GLOBAL)) {
    if (!rels.has(state)) rels.set(state, rel);
  }
  const pack = BOX_ANIM_BY_PACK[packName] || {};
  for (const [state, rel] of Object.entries(pack)) {
    rels.set(state, rel);
  }
}