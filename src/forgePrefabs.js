/**
 * Forge prefab GLBs — pre-composed D1 loadouts from 30grudge6characters.glb.
 * Combat sandbox uses these as default hero meshes (baked JSON anims still drive motion).
 */

import { assetUrl } from "./assetConfig.js";
import { isCombatSandboxMode } from "./combatSandbox.js";
import { loadArenaPrefabManifest } from "./arenaPrefab.js";
import { DefaultHeroForRace } from "./HeroRegistry.js";
import { getRaceClassArmor } from "./d1SlotCatalog.js";
import { createGLTFLoader } from "./gltfLoader.js";

const FORGE_MANIFEST_URL = assetUrl("assets/forge/forge-prefab-manifest.json");

let _forgeManifestPromise = null;
let _forgeGltfCache = new Map();

export async function loadForgePrefabManifest(force = false) {
  if (!force && _forgeManifestPromise) return _forgeManifestPromise;
  _forgeManifestPromise = fetch(FORGE_MANIFEST_URL)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return _forgeManifestPromise;
}

export function getForgePrefabEntry(manifest, prefabId) {
  if (!manifest?.prefabs) return null;
  return manifest.prefabs.find((p) => p.prefabId === prefabId) || null;
}

export function resolveForgePrefabId(race, weapon, heroId = null) {
  const hid = heroId || DefaultHeroForRace[race] || race;
  return `${hid}_${weapon}_default`;
}

/** Custom D1 armor edits → fall back to modular race GLB + EquipmentManager. */
export function hasCustomD1Armor(meshLoadout, race = "human", classId = "warrior") {
  const armor = meshLoadout?.armor || {};
  const defaults = getRaceClassArmor(race, classId);
  return Object.keys(armor).some((k) => {
    const v = armor[k];
    if (!v) return false;
    const expected = defaults[k];
    if (!expected) return true;
    return String(v).toUpperCase() !== String(expected).toUpperCase();
  });
}

/** Combat sandbox: use forge GLB when exported prefab exists and loadout is not customized. */
export async function shouldUseForgePrefab(race, weapon, meshLoadout, opts = {}) {
  if (opts.useForgePrefab === false) return false;
  if (!isCombatSandboxMode() && opts.useForgePrefab !== true) return false;
  if (hasCustomD1Armor(meshLoadout, race, opts.classId)) return false;
  const path = await resolveForgeModelPath(race, weapon, opts.heroId);
  return !!path;
}

export async function resolveForgeModelPath(race, weapon, heroId = null) {
  const prefabId = resolveForgePrefabId(race, weapon, heroId);
  const [forgeManifest, arenaManifest] = await Promise.all([
    loadForgePrefabManifest(),
    loadArenaPrefabManifest(),
  ]);

  const forgeEntry = getForgePrefabEntry(forgeManifest, prefabId);
  if (forgeEntry?.glbPath) return forgeEntry.glbPath;

  const arenaPrefab = arenaManifest?.prefabs?.[prefabId];
  if (arenaPrefab?.forgeModelPath) return arenaPrefab.forgeModelPath;
  if (arenaPrefab?.modelPath?.includes("/assets/forge/")) return arenaPrefab.modelPath;

  return null;
}

export function clearForgeGltfCache() {
  _forgeGltfCache.clear();
}

/** Load a pre-composed forge prefab GLB (cached). */
export async function loadForgePrefabGltf(modelPath) {
  const url = modelPath.startsWith("http") ? modelPath : assetUrl(modelPath.replace(/^\//, ""));
  if (_forgeGltfCache.has(url)) return _forgeGltfCache.get(url);
  const promise = createGLTFLoader().then((loader) =>
    new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    }),
  );
  _forgeGltfCache.set(url, promise);
  return promise;
}