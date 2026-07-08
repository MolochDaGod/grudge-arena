/**
 * Canonical Grudge6/D1 character asset paths and load diagnostics.
 * Single source for mesh + atlas URLs used by modelLoader and anim-test.
 */

import { charUrl, modelUrl, grudge6AssetUrl } from "./assetConfig.js";

/** Legacy grudge6 FBX filenames (final mesh fallback only). */
export const RACE_FBX_FILES = {
  human: "WK_Characters.fbx",
  barbarian: "BRB_Characters.fbx",
  elf: "ELF_Characters.fbx",
  dwarf: "DWF_Characters.fbx",
  orc: "ORC_Characters.fbx",
  undead: "UD_Characters.fbx",
};

export function grudge6RaceModelPath(raceId) {
  const file = RACE_FBX_FILES[raceId];
  if (!file) return null;
  return `models/grudge6/races/${file}`;
}

export const CHARACTER_RACES = [
  "human",
  "barbarian",
  "elf",
  "dwarf",
  "orc",
  "undead",
];

/** CDN GLB filenames (Synty D1 modular, Bip001 skeleton). */
export const RACE_GLB_FILES = {
  human: "WK_Characters.glb",
  barbarian: "BRB_Characters.glb",
  elf: "ELF_Characters.glb",
  dwarf: "DWF_Characters.glb",
  orc: "ORC_Characters.glb",
  undead: "UD_Characters.glb",
};

/**
 * Race texture atlas filenames under {race}/textures/.
 * Source of truth on disk — edit these files (or re-run scripts/sync-race-atlases.mjs).
 * Modular GLBs only ship a 1×1 placeholder; real atlases live beside the GLB.
 */
export const RACE_ATLAS_FILES = {
  human: "Map__9.png",
  barbarian: "Map__9.png",
  elf: "Map__9.png",
  dwarf: "Map__12.png",
  orc: "Map__11.png",
  undead: "Map__11.png",
};

/** Grudge6 R2 mirror paths for race atlases (fallback after /cdn). */
export const RACE_TEXTURE_ATLAS = Object.fromEntries(
  Object.entries(RACE_ATLAS_FILES).map(([race, file]) => [
    race,
    `arena/assets/characters/${race}/textures/${file}`,
  ]),
);

/**
 * Grudge6 CDN atlas WebP (sync-race-atlases.mjs source).
 * Used when bundled Map__*.png is only the 1×1 GLB placeholder (~70 B).
 */
export const RACE_CDN_ATLAS_WEBP = {
  human: "assets/western-kingdoms/textures/WK_Standard_Units.webp",
  barbarian: "assets/barbarians/textures/BRB_StandardUnits_texture.webp",
  elf: "assets/elves/textures/ELF_HighElves_Texture.webp",
  dwarf: "assets/dwarves/textures/DWF_Standard_Units.webp",
  orc: "assets/orcs/textures/ORC_StandardUnits.webp",
  undead: "assets/undead/textures/UD_Standard_Units.webp",
};

export const ATLAS_PLACEHOLDER_MAX_BYTES = 1024;

export function isPlaceholderMapImage(img) {
  if (!img) return true;
  const w = img.width ?? img.naturalWidth ?? 0;
  const h = img.height ?? img.naturalHeight ?? 0;
  if (w > 0 && h > 0) return w <= 1 && h <= 1;
  const bytes = img.data?.length ?? img.byteLength ?? 0;
  return bytes > 0 && bytes <= ATLAS_PLACEHOLDER_MAX_BYTES;
}

/** @param {import('three').Texture | import('three').Material} texOrMat */
export function isPlaceholderTexture(texOrMat) {
  // Material.map.image (patched atlas) or bare Texture.image (loader result)
  const img = texOrMat?.map?.image ?? texOrMat?.image;
  return isPlaceholderMapImage(img);
}

export class CharacterLoadError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, race?: string, paths?: Array<{path: string, message: string}>, missing?: string[], cause?: Error }} meta
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "CharacterLoadError";
    this.code = meta.code || "CHARACTER_LOAD_FAILED";
    this.race = meta.race;
    this.paths = meta.paths || [];
    this.missing = meta.missing || [];
    this.cause = meta.cause;
  }
}

export function isValidRace(race) {
  return CHARACTER_RACES.includes(race);
}

/** Primary production mesh URL (/cdn/assets/characters/{race}/*_Characters.glb). */
export function raceGlbUrl(race) {
  const file = RACE_GLB_FILES[race];
  return file ? charUrl(`${race}/${file}`) : null;
}

/**
 * Ordered mesh fallback chain — CDN GLB first, legacy local GLBs last, FBX only as final resort.
 */
export function raceModelFallbackPaths(race) {
  const paths = [];
  const primary = raceGlbUrl(race);
  if (primary) paths.push(primary);
  paths.push(modelUrl(`${race}.glb`), `/models/${race}.glb`);
  const fbxRel = grudge6RaceModelPath(race);
  if (fbxRel) paths.push(grudge6AssetUrl(fbxRel));
  return paths.filter(Boolean);
}

/**
 * Ordered atlas fallback — arena /cdn bake first, grudge6 R2 mirror second.
 */
export function raceTextureFallbackPaths(race, cacheBust) {
  const atlas = RACE_ATLAS_FILES[race];
  if (!atlas) return [];
  const q = cacheBust ? `?v=${cacheBust}` : "";
  const paths = [
    charUrl(`${race}/textures/${atlas}`) + q,
    grudge6AssetUrl(`arena/assets/characters/${race}/textures/${atlas}`) + q,
  ];
  const cdnWebp = RACE_CDN_ATLAS_WEBP[race];
  if (cdnWebp) paths.push(grudge6AssetUrl(cdnWebp) + q);
  return paths;
}

/** Count textured vs total materials on a loaded character scene. */
export function auditCharacterMaterials(root) {
  let total = 0;
  let withMap = 0;
  let placeholderMaps = 0;
  let visible = 0;
  root.traverse((ch) => {
    if (!ch.isMesh && !ch.isSkinnedMesh) return;
    if (ch.visible) visible++;
    const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
    for (const m of mats) {
      if (!m) continue;
      total++;
      const img = m.map?.image;
      if (img && ((img.width > 0 && img.height > 0) || img.data?.length > 0)) {
        withMap++;
        if (isPlaceholderMapImage(img)) placeholderMaps++;
      }
    }
  });
  return { total, withMap, placeholderMaps, visible };
}

/** Human-readable texture health for UI / logs. */
export function textureHealth({ withMap, total, placeholderMaps = 0 }) {
  if (total === 0 || withMap === 0) {
    return {
      ok: false,
      level: "error",
      label: "textures missing",
      detail: "No atlas applied — run: npm run sync:atlases",
    };
  }
  if (placeholderMaps > 0 || (withMap > 0 && placeholderMaps >= withMap)) {
    return {
      ok: false,
      level: "error",
      label: "placeholder atlas",
      detail:
        "1×1 embedded atlas — edit public/assets/characters/{race}/textures/ or npm run sync:atlases",
    };
  }
  if (withMap < total * 0.5) {
    return {
      ok: false,
      level: "warn",
      label: "partial textures",
      detail: `${withMap}/${total} materials textured`,
    };
  }
  return {
    ok: true,
    level: "ok",
    label: "textured OK",
    detail: `${withMap}/${total} materials textured`,
  };
}

/** Actionable hint for operators when a load fails. */
export function remediationHint(err) {
  const code = err?.code || "";
  if (code === "MODEL_NOT_FOUND") {
    return "Sync meshes: node scripts/build-character-library.mjs && npm run sync:assets";
  }
  if (code === "TEXTURE_MISSING") {
    return "Sync real atlases: npm run sync:atlases then redeploy";
  }
  if (code === "BAKED_ANIM_INCOMPLETE") {
    return "Bake clips in grudge-character-animator → /api/assets/anims/baked/";
  }
  if (code === "INVALID_RACE") {
    return `Valid races: ${CHARACTER_RACES.join(", ")}`;
  }
  return "See .agents/skills/grudge-arena-characters/SKILL.md";
}

export function formatCharacterLoadError(err) {
  const base = err?.message || String(err);
  const hint = remediationHint(err);
  const paths =
    err?.paths?.length > 0
      ? `\nTried:\n${err.paths.map((p) => `  • ${p.path}: ${p.message}`).join("\n")}`
      : "";
  const missing =
    err?.missing?.length > 0 ? `\nMissing: ${err.missing.join(", ")}` : "";
  return `${base}${paths}${missing}\n→ ${hint}`;
}