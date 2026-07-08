/**
 * arenaPrefab/1.0 — single boot manifest for D1 Warlords character prefabs.
 * API: GET /models/characterManifest.json (bundled) | /cdn/models/... (R2 prod)
 */

import { modelUrl } from "./assetConfig.js";
import { getRaceClassArmor } from "./d1SlotCatalog.js";

let _manifestPromise = null;
let _cached = null;

export const SCHEMA = "arenaPrefab/1.0";

export async function loadArenaPrefabManifest(force = false) {
  if (_cached && !force) return _cached;
  if (!force && _manifestPromise) return _manifestPromise;
  _manifestPromise = fetch(modelUrl("characterManifest.json"))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const m = await _manifestPromise;
  _cached = m;
  return m;
}

export function getRacePrefab(manifest, race) {
  return manifest?.races?.[race] ?? null;
}

export function getHeroPrefab(manifest, heroId) {
  return manifest?.heroes?.[heroId] ?? null;
}

export function getLoadoutPrefab(manifest, prefabId) {
  return manifest?.prefabs?.[prefabId] ?? null;
}

/** Weapon → D1 slot mapping from manifest (falls back to code defaults). */
export function getWeaponMapping(manifest, weaponType) {
  const raceEntries = manifest?.races || {};
  const first = Object.values(raceEntries)[0];
  return (
    first?.weaponMappings?.[weaponType] ??
    manifest?.weaponMappings?.[weaponType] ??
    null
  );
}

/** Attach tuning: manifest → localStorage override at runtime. */
export function getAttachTuningFromManifest(manifest, weaponType) {
  const raceEntries = manifest?.races || {};
  for (const race of Object.values(raceEntries)) {
    if (race.attachTuning?.[weaponType]) return race.attachTuning[weaponType];
  }
  return manifest?.attachTuning?.[weaponType] ?? null;
}

export function getAnimPackForWeapon(manifest, weaponType) {
  const raceEntries = manifest?.races || {};
  for (const race of Object.values(raceEntries)) {
    const pack = race.animPacks?.byWeapon?.[weaponType] ?? race.animPacks?.default;
    if (pack) return pack;
  }
  return null;
}

/** Default D1 loadout for a hero (armor + weapon slots). */
export function getDefaultD1Loadout(manifest, heroId, weaponType) {
  const prefabId = `${manifest?.heroes?.[heroId]?.race || heroId}_${weaponType}_default`;
  const prefab = getLoadoutPrefab(manifest, prefabId);
  if (prefab?.d1) return structuredClone(prefab.d1);

  const hero = getHeroPrefab(manifest, heroId);
  const raceId = hero?.race || heroId;
  const race = getRacePrefab(manifest, raceId);
  const mapping = race?.weaponMappings?.[weaponType] || getWeaponMapping(manifest, weaponType);
  const classId = hero?.classId || "warrior";
  return {
    armor: {
      ...getRaceClassArmor(raceId, classId),
      ...(race?.defaultLoadout?.armor || {}),
    },
    weapon: mapping ? { ...mapping } : {},
    extras: mapping?.extras ? [...mapping.extras] : [],
  };
}

/** Slot catalog for gear UI without loading a live GLB. */
export function getSlotCatalog(manifest, race) {
  return getRacePrefab(manifest, race)?.slots ?? {};
}

export function manifestApiRoutes(manifest) {
  return (
    manifest?.api ?? {
      manifest: "/models/characterManifest.json",
      characters: "/cdn/assets/characters/{race}/{prefix}_Characters.glb",
      atlases: "/cdn/assets/characters/{race}/textures/{atlas}",
      bakedAnims: "/api/assets/anims/baked/{rel}.json",
      r2Base: "https://assets.grudge-studio.com/arena",
    }
  );
}