/**
 * Forge GLB (30grudge6characters.glb) — scene matching + hero default catalog.
 */

import { HERO_PREFABS, WEAPON_EQUIP_MAP } from "./d1-slot-catalog.mjs";

export const RACE_PREFIX = {
  human: "WK",
  barbarian: "BRB",
  elf: "ELF",
  dwarf: "DWF",
  orc: "ORC",
  undead: "UD",
};

/** Combat sandbox units that should resolve to a forge prefab when available. */
export const FORGE_SANDBOX_LOADOUTS = [
  ...Object.entries(HERO_PREFABS).map(([heroId, h]) => ({
    prefabId: `${heroId}_${h.defaultWeapon}_default`,
    heroId,
    race: h.race,
    weapon: h.defaultWeapon,
    primary: true,
  })),
  { prefabId: "orc_greatsword_default", heroId: "orc", race: "orc", weapon: "greatsword", primary: false },
  { prefabId: "elf_bow_default", heroId: "elf", race: "elf", weapon: "bow", primary: false },
  { prefabId: "undead_staff_default", heroId: "undead", race: "undead", weapon: "staff", primary: false },
  { prefabId: "human_greatsword_default", heroId: "human", race: "human", weapon: "greatsword", primary: false },
  { prefabId: "human_staff_default", heroId: "human", race: "human", weapon: "staff", primary: false },
  { prefabId: "dwarf_mace_default", heroId: "dwarf", race: "dwarf", weapon: "mace", primary: false },
];

const WEAPON_MESH_HINTS = {
  greatsword: [/weapon_axe/i, /weapon_sword/i],
  mace: [/weapon_hammer/i, /weapon_mace/i, /weapon_axe/i],
  sabres: [/weapon_sword/i],
  runeblade: [/weapon_sword/i],
  scythe: [/weapon_spear/i, /weapon_axe/i],
  bow: [/weapon_bow/i],
  staff: [/weapon_staff/i],
  wand: [/weapon_staff/i],
  rifle: [/weapon_/i],
  unarmed: [],
};

export function collectSceneMeshes(nodes, rootIdx) {
  const meshes = [];
  function walk(i) {
    const n = nodes[i];
    if (!n) return;
    if (n.mesh != null && n.name) meshes.push(n.name);
    for (const c of n.children || []) walk(c);
  }
  walk(rootIdx);
  return meshes;
}

/** Score how well a forge AuxScene matches a race + arena weapon. */
export function scoreForgeScene(meshes, race, weapon) {
  const prefix = RACE_PREFIX[race];
  if (!prefix) return -1;
  const lower = meshes.map((m) => m.toLowerCase());
  if (!lower.some((m) => m.startsWith(prefix.toLowerCase()))) return -1;

  const mapping = WEAPON_EQUIP_MAP[weapon] || {};
  let score = 0;

  const hints = WEAPON_MESH_HINTS[weapon] || [/weapon_/i];
  if (hints.length && lower.some((m) => hints.some((re) => re.test(m)))) score += 3;

  if (mapping.lSlot === "shield" && lower.some((m) => /shield/i.test(m))) score += 3;
  if (mapping.lSlot === "bow" && lower.some((m) => /weapon_bow/i.test(m))) score += 3;
  if (mapping.lSlot === "staff" && lower.some((m) => /weapon_staff/i.test(m))) score += 3;
  if (mapping.rSlot && lower.some((m) => new RegExp(`weapon_${mapping.rSlot}`, "i").test(m))) {
    score += 2;
  }
  if (mapping.extras?.includes("quiver") && lower.some((m) => /quiver/i.test(m))) score += 1;

  const armorSlots = lower.filter((m) => /units_|_body_|_head_|_arms_|_legs_|shoulderpad/i.test(m));
  score += Math.min(armorSlots.length, 5) * 0.2;

  return score;
}

export function pickBestScene(scenes, race, weapon) {
  let best = null;
  let bestScore = -1;
  for (const scene of scenes) {
    const s = scoreForgeScene(scene.meshes, race, weapon);
    if (s > bestScore) {
      bestScore = s;
      best = scene;
    }
  }
  return bestScore >= 2 ? best : null;
}

export function listForgeAuxScenes(glbJson) {
  const nodes = glbJson.nodes || [];
  const sceneRoot = glbJson.scenes?.[0]?.nodes?.[0];
  const forge = nodes[sceneRoot];
  if (!forge?.children?.length) return [];

  const scenes = [];
  let index = 0;
  for (const childIdx of forge.children) {
    const aux = nodes[childIdx];
    if (aux?.name !== "AuxScene" || !aux.children?.length) continue;
    const skeletonRoots = aux.children;
    const meshes = [];
    for (const ri of skeletonRoots) meshes.push(...collectSceneMeshes(nodes, ri));
    scenes.push({
      index,
      auxNodeIndex: childIdx,
      skeletonRoots,
      meshes,
    });
    index++;
  }
  return scenes;
}