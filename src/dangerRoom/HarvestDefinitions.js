/**
 * Harvest tool + node definitions for island combat sandbox.
 */

export const HARVEST_TOOLS = [
  {
    id: "axe",
    label: "Axe",
    equipSlot: "axe",
    variant: "A",
    types: ["wood"],
    glow: 0x7fd46a,
    anim: "attack1",
  },
  {
    id: "pickaxe",
    label: "Pickaxe",
    equipSlot: "dagger",
    variant: null,
    types: ["ore"],
    glow: 0x60a5fa,
    anim: "attack1",
  },
  {
    id: "hammer",
    label: "Hammer",
    equipSlot: "hammer",
    variant: "A",
    types: ["stone"],
    glow: 0xfbbf24,
    anim: "attack1",
  },
];

/** @typedef {'wood'|'stone'|'ore'} HarvestNodeType */

export const NODE_HP = 4;
export const SWING_REACH = 4.2;
export const SWING_CONE_DOT = 0.34;
export const SWING_THROTTLE_MS = 480;
export const HIT_DELAY_MS = 230;
export const FACE_LERP = 10;

export const HARVEST_REWARDS = {
  wood: { catalogId: "resource-wood", label: "Wood", icon: "🪵", perHit: [1, 2], final: [2, 4] },
  stone: { catalogId: "resource-stone", label: "Stone", icon: "🪨", perHit: [1, 2], final: [1, 3] },
  ore: { catalogId: "resource-ore", label: "Ore", icon: "⛏️", perHit: [1, 2], final: [2, 3] },
};

export const NODE_GLOW = {
  wood: 0x5fd46a,
  stone: 0xd4d4d8,
  ore: 0x5eb3ff,
};

export function toolForType(type) {
  return HARVEST_TOOLS.find((t) => t.types.includes(type)) ?? null;
}

export function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}