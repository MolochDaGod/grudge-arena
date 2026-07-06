/**
 * Poly Haven PBR terrain texture loading (combat island).
 */

import * as THREE from "three";

const loader = new THREE.TextureLoader();

/**
 * @param {string} basePath e.g. /textures/terrain/aerial_grass_rock
 * @param {string} prefix e.g. aerial_grass_rock
 * @param {{ repeat?: number, use4k?: boolean }} [opts]
 */
export async function loadTerrainPBR(basePath, prefix, opts = {}) {
  const repeat = opts.repeat ?? 10;
  const res = opts.use4k ? "4k" : "2k";

  const mapRes = res;
  const auxRes = res === "4k" ? "2k" : res;
  const paths = {
    map: `${basePath}/${prefix}_diff_${mapRes}.jpg`,
    normalMap: `${basePath}/${prefix}_nor_gl_${auxRes}.jpg`,
    roughnessMap: `${basePath}/${prefix}_rough_${auxRes}.jpg`,
  };

  const aoPath = `${basePath}/${prefix}_ao_${auxRes}.jpg`;
  paths.aoMap = aoPath;

  const maps = {};
  for (const [key, url] of Object.entries(paths)) {
    try {
      const tex = await loader.loadAsync(url);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      if (key === "map") tex.colorSpace = THREE.SRGBColorSpace;
      maps[key] = tex;
    } catch (err) {
      if (key !== "aoMap") throw err;
    }
  }

  return maps;
}

export function makeTerrainMaterial(maps, overrides = {}) {
  const useVertexColors = !!overrides.vertexColors;
  if (!useVertexColors) {
    return new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      aoMap: maps.aoMap ?? null,
      roughness: 1,
      metalness: 0,
      ...overrides,
    });
  }

  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    aoMap: maps.aoMap ?? null,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    ...overrides,
  });
}