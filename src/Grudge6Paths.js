/**
 * Grudge6Paths — canonical CDN paths for grudge6 race FBX models.
 * Mirrors playground/src/modules/Grudge6Paths.js and GrudgeBuilder/shared/fleet/character.ts
 */

export const RACE_FBX_FILES = {
  human: 'WK_Characters.fbx',
  barbarian: 'BRB_Characters.fbx',
  elf: 'ELF_Characters.fbx',
  dwarf: 'DWF_Characters.fbx',
  orc: 'ORC_Characters.fbx',
  undead: 'UD_Characters.fbx',
};

export function grudge6RaceModelPath(raceId) {
  const file = RACE_FBX_FILES[raceId];
  if (!file) return null;
  return `models/grudge6/races/${file}`;
}

/** Race texture atlases (arena bake — same UV layout as grudge6 FBX). */
export const RACE_TEXTURE_ATLAS = {
  human: 'arena/assets/characters/human/textures/Map__9.png',
  barbarian: 'arena/assets/characters/barbarian/textures/Map__9.png',
  elf: 'arena/assets/characters/elf/textures/Map__9.png',
  dwarf: 'arena/assets/characters/dwarf/textures/Map__12.png',
  orc: 'arena/assets/characters/orc/textures/Map__11.png',
  undead: 'arena/assets/characters/undead/textures/Map__11.png',
};