/**
 * GLB scale utilities — bake mesh vertices to metres, reset node scales to 1.
 * Used by build-character-library.mjs and validate-arena-assets.mjs.
 */

import { readFileSync } from "fs";

const GLB_MAGIC = 0x46546c67;

export function parseGLB(buf) {
  const b = Buffer.isBuffer(buf) ? buf : readFileSync(buf);
  if (b.readUInt32LE(0) !== GLB_MAGIC) throw new Error("Not a valid GLB file");
  if (b.readUInt32LE(4) !== 2) throw new Error("Unsupported GLB version");

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < b.length) {
    const chunkLen = b.readUInt32LE(offset);
    const chunkType = b.readUInt32LE(offset + 4);
    const chunkData = b.slice(offset + 8, offset + 8 + chunkLen);
    offset += 8 + chunkLen;
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunkData.toString("utf8"));
    else if (chunkType === 0x004e4942) bin = chunkData;
  }
  if (!json) throw new Error("GLB missing JSON chunk");
  return { json, bin: bin || Buffer.alloc(0) };
}

export function writeGLB(json, bin) {
  const jsonStr = JSON.stringify(json);
  const jsonPad = (4 - (jsonStr.length % 4)) % 4;
  const jsonBytes = Buffer.from(jsonStr + " ".repeat(jsonPad));
  const binPad = bin?.length ? (4 - (bin.length % 4)) % 4 : 0;
  const binBytes = bin?.length ? Buffer.concat([bin, Buffer.alloc(binPad, 0)]) : Buffer.alloc(0);
  const totalLen = 12 + 8 + jsonBytes.length + (binBytes.length ? 8 + binBytes.length : 0);
  const out = Buffer.alloc(totalLen);
  let off = 0;
  out.writeUInt32LE(GLB_MAGIC, off);
  off += 4;
  out.writeUInt32LE(2, off);
  off += 4;
  out.writeUInt32LE(totalLen, off);
  off += 4;
  out.writeUInt32LE(jsonBytes.length, off);
  off += 4;
  out.writeUInt32LE(0x4e4f534a, off);
  off += 4;
  jsonBytes.copy(out, off);
  off += jsonBytes.length;
  if (binBytes.length) {
    out.writeUInt32LE(binBytes.length, off);
    off += 4;
    out.writeUInt32LE(0x004e4942, off);
    off += 4;
    binBytes.copy(out, off);
  }
  return out;
}

/** Collect mesh POSITION accessor indices. */
export function positionAccessorIds(glbJson) {
  const ids = new Set();
  for (const mesh of glbJson.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const idx = prim.attributes?.POSITION;
      if (idx != null) ids.add(idx);
    }
  }
  return [...ids];
}

/** World Y extent from vertex buffer (ignores accessor metadata drift). */
export function measureVertexExtents(glbJson, bin) {
  const accessors = glbJson.accessors || [];
  const bufferViews = glbJson.bufferViews || [];
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let count = 0;

  for (const accIdx of positionAccessorIds(glbJson)) {
    const acc = accessors[accIdx];
    if (!acc || acc.type !== "VEC3" || !bin?.length) continue;
    const bv = bufferViews[acc.bufferView];
    if (!bv) continue;
    const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || 12;
    for (let i = 0; i < acc.count; i++) {
      const base = off + i * stride;
      const x = bin.readFloatLE(base);
      const y = bin.readFloatLE(base + 4);
      const z = bin.readFloatLE(base + 8);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
      count++;
    }
  }

  if (!count) {
    return { height: 0, width: 0, depth: 0, vertices: 0 };
  }
  return {
    height: maxY - minY,
    width: maxX - minX,
    depth: maxZ - minZ,
    minY,
    maxY,
    vertices: count,
  };
}

/**
 * Effective armature/export scale (scene roots + Bip001).
 * Synty D1 often puts cm→m on Bip001 (≈0.0254), not the GLTF scene root.
 */
export function measureRootScale(glbJson) {
  const nodes = glbJson.nodes || [];
  const roots = new Set();
  for (const scene of glbJson.scenes || []) {
    for (const nid of scene.nodes || []) roots.add(nid);
  }
  let effectiveS = 1;
  const details = [];
  const consider = (n, nid) => {
    if (!n?.scale) return;
    const s = Math.max(Math.abs(n.scale[0]), Math.abs(n.scale[1]), Math.abs(n.scale[2]));
    if (Math.abs(s - 1) > 0.02) {
      details.push({ name: n.name || `node_${nid}`, scale: n.scale });
      // Prefer the smallest non-1 scale (cm→m) when multiple exist
      if (s < effectiveS || effectiveS === 1) effectiveS = s;
    }
  };
  for (const nid of roots) consider(nodes[nid], nid);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n?.name === "Bip001" || n?.name === "Bip001 ") consider(n, i);
  }
  return { maxS: effectiveS, details };
}

/** Effective world height = vertex height × max root scale. */
export function effectiveWorldHeight(glbJson, bin) {
  const ext = measureVertexExtents(glbJson, bin);
  const { maxS } = measureRootScale(glbJson);
  return {
    ...ext,
    rootScale: maxS,
    worldHeight: ext.height * maxS,
  };
}

function updateAccessorBounds(accessors, accIdx, min, max) {
  const acc = accessors[accIdx];
  if (!acc || acc.type !== "VEC3") return;
  acc.min = [min[0], min[1], min[2]];
  acc.max = [max[0], max[1], max[2]];
}

/**
 * Skinned GLBs — adjust root scale only (preserves bone/IBM bind). Never touch vertices.
 * @returns {{ json, bin, scaleFactor, before, after }}
 */
export function normalizeSkinnedGlbRootScale(glbJson, bin, targetWorldHeightM) {
  const json = structuredClone(glbJson);
  const before = effectiveWorldHeight(json, bin);
  // Use world height (verts × existing root/Bip001 scale), not raw verts alone.
  // Raw verts may be ~70 (cm) while Bip001 already has ×0.0254 → world ~1.8m.
  // Dividing target by raw verts would re-apply cm→m and double-scale.
  const currentWorld =
    before.worldHeight > 0.001
      ? before.worldHeight
      : before.height > 0.001
        ? before.height
        : 1;
  const factor = targetWorldHeightM / currentWorld;

  const roots = new Set();
  for (const scene of json.scenes || []) {
    for (const nid of scene.nodes || []) roots.add(nid);
  }
  // Prefer scaling the existing armature root (Bip001) if present
  let scaled = false;
  for (const node of json.nodes || []) {
    if (!node?.name) continue;
    if (node.name === "Bip001" || /^Bip001$/i.test(node.name)) {
      const prev = node.scale
        ? Math.max(Math.abs(node.scale[0]), Math.abs(node.scale[1]), Math.abs(node.scale[2]))
        : 1;
      const next = prev * factor;
      node.scale = [next, next, next];
      scaled = true;
      break;
    }
  }
  if (!scaled) {
    for (const nid of roots) {
      const node = json.nodes[nid];
      if (!node) continue;
      const prev = node.scale
        ? Math.max(Math.abs(node.scale[0]), Math.abs(node.scale[1]), Math.abs(node.scale[2]))
        : 1;
      const next = prev * factor;
      node.scale = [next, next, next];
    }
  }

  const after = effectiveWorldHeight(json, bin);
  return { json, bin, scaleFactor: factor, before, after };
}

/**
 * Static meshes — bake POSITION vertices to target height and reset node.scale → 1.
 * Do NOT use on skinned character GLBs (breaks rig).
 * @returns {{ json, bin, scaleFactor, before, after }}
 */
export function bakeGlbToMetres(glbJson, bin, targetHeightM) {
  const json = structuredClone(glbJson);
  const newBin = Buffer.from(bin);
  const before = effectiveWorldHeight(json, newBin);

  // Bake into vertex positions; root scales reset to 1 — scale vertex height only.
  const scaleFactor =
    before.height > 0.001 ? targetHeightM / before.height : targetHeightM / before.worldHeight;

  const accessors = json.accessors || [];
  const bufferViews = json.bufferViews || [];

  for (const accIdx of positionAccessorIds(json)) {
    const acc = accessors[accIdx];
    if (!acc || acc.type !== "VEC3") continue;
    const bv = bufferViews[acc.bufferView];
    if (!bv) continue;
    const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || 12;
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < acc.count; i++) {
      const base = off + i * stride;
      for (let c = 0; c < 3; c++) {
        const v = newBin.readFloatLE(base + c * 4) * scaleFactor;
        newBin.writeFloatLE(v, base + c * 4);
        min[c] = Math.min(min[c], v);
        max[c] = Math.max(max[c], v);
      }
    }
    updateAccessorBounds(accessors, accIdx, min, max);
  }

  for (const node of json.nodes || []) {
    if (node.scale) node.scale = [1, 1, 1];
  }

  const after = effectiveWorldHeight(json, newBin);
  return { json, bin: newBin, scaleFactor, before, after };
}

/** Multiply world size by factor (e.g. match a character bake factor on equipment). */
export function scaleGlbByFactor(glbJson, bin, factor) {
  const current = effectiveWorldHeight(glbJson, bin);
  if (Math.abs(factor - 1) < 0.0001) {
    return { json: glbJson, bin, scaleFactor: 1, before: current, after: current };
  }
  return bakeGlbToMetres(glbJson, bin, current.worldHeight * factor);
}

export const HUMANOID_MIN_M = 1.2;
export const HUMANOID_MAX_M = 2.5;
export const PROP_MAX_M = 25;

/** Per-race height multipliers (matches src/engine/RaceConfig.js). */
export const RACE_HEIGHT_SCALE = {
  human: 1.0,
  barbarian: 1.12,
  elf: 1.05,
  dwarf: 0.85,
  orc: 1.08,
  undead: 0.95,
};