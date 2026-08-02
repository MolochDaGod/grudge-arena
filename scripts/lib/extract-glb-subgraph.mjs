/**
 * Extract a node subtree from a GLB into a standalone binary GLB.
 */

import { writeGLB } from "./glb-scale.mjs";

function collectSubtree(json, rootIndices) {
  const nodes = new Set();
  const meshes = new Set();
  const skins = new Set();
  const accessors = new Set();
  const materials = new Set();
  const textures = new Set();
  const images = new Set();

  function walkNode(i) {
    if (nodes.has(i)) return;
    nodes.add(i);
    const node = json.nodes?.[i];
    if (!node) return;
    if (node.mesh != null) {
      meshes.add(node.mesh);
      const mesh = json.meshes?.[node.mesh];
      for (const prim of mesh?.primitives || []) {
        if (prim.material != null) materials.add(prim.material);
        for (const acc of Object.values(prim.attributes || {})) accessors.add(acc);
        if (prim.indices != null) accessors.add(prim.indices);
        for (const target of prim.targets || []) {
          for (const acc of Object.values(target)) accessors.add(acc);
        }
      }
    }
    if (node.skin != null) {
      skins.add(node.skin);
      const skin = json.skins?.[node.skin];
      for (const j of skin?.joints || []) nodes.add(j);
      if (skin?.skeleton != null) nodes.add(skin.skeleton);
      if (skin?.inverseBindMatrices != null) accessors.add(skin.inverseBindMatrices);
    }
    for (const c of node.children || []) walkNode(c);
  }

  for (const ri of rootIndices) walkNode(ri);

  for (const mi of materials) {
    const mat = json.materials?.[mi];
    if (mat?.pbrMetallicRoughness?.baseColorTexture != null) {
      textures.add(mat.pbrMetallicRoughness.baseColorTexture.index);
    }
    if (mat?.normalTexture != null) textures.add(mat.normalTexture.index);
    if (mat?.emissiveTexture != null) textures.add(mat.emissiveTexture.index);
  }
  for (const ti of textures) {
    const tex = json.textures?.[ti];
    if (tex?.source != null) images.add(tex.source);
  }

  const bufferViews = new Set();
  for (const ai of accessors) {
    const acc = json.accessors?.[ai];
    if (acc?.bufferView != null) bufferViews.add(acc.bufferView);
    if (acc?.sparse?.indices?.bufferView != null) bufferViews.add(acc.sparse.indices.bufferView);
    if (acc?.sparse?.values?.bufferView != null) bufferViews.add(acc.sparse.values.bufferView);
  }

  return { nodes, meshes, skins, accessors, materials, textures, images, bufferViews };
}

function remapIndex(set, index) {
  const arr = [...set].sort((a, b) => a - b);
  const map = new Map(arr.map((v, i) => [v, i]));
  return map.get(index);
}

function copyBufferViews(srcBin, bufferViews, srcJson) {
  const sorted = [...bufferViews].sort((a, b) => a - b);
  const newBinParts = [];
  const bvMap = new Map();
  let offset = 0;
  for (const bvi of sorted) {
    const bv = srcJson.bufferViews[bvi];
    const start = bv.byteOffset || 0;
    const len = bv.byteLength;
    const slice = srcBin.slice(start, start + len);
    const pad = (4 - (len % 4)) % 4;
    newBinParts.push(slice);
    if (pad) newBinParts.push(Buffer.alloc(pad));
    bvMap.set(bvi, {
      byteOffset: offset,
      byteLength: len,
      byteStride: bv.byteStride,
      target: bv.target,
    });
    offset += len + pad;
  }
  return { bin: Buffer.concat(newBinParts), bvMap };
}

/**
 * @param {object} srcJson
 * @param {Buffer} srcBin
 * @param {number[]} rootNodeIndices — skeleton roots inside an AuxScene
 */
export function extractGlbSubgraph(srcJson, srcBin, rootNodeIndices) {
  const used = collectSubtree(srcJson, rootNodeIndices);
  const { bin: newBin, bvMap } = copyBufferViews(srcBin, used.bufferViews, srcJson);

  const newJson = {
    asset: srcJson.asset,
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [],
    meshes: [],
    skins: [],
    accessors: [],
    bufferViews: [],
    materials: [],
    textures: [],
    images: [],
    buffers: [{ byteLength: newBin.length }],
  };

  const nodeRemap = new Map();
  for (const ni of [...used.nodes].sort((a, b) => a - b)) {
    const src = srcJson.nodes[ni];
    const out = { ...src };
    if (out.mesh != null) out.mesh = remapIndex(used.meshes, out.mesh);
    if (out.skin != null) out.skin = remapIndex(used.skins, out.skin);
    if (out.children) {
      out.children = out.children
        .filter((c) => used.nodes.has(c))
        .map((c) => remapIndex(used.nodes, c));
    }
    nodeRemap.set(ni, newJson.nodes.length);
    newJson.nodes.push(out);
  }

  for (const mi of [...used.meshes].sort((a, b) => a - b)) {
    const mesh = JSON.parse(JSON.stringify(srcJson.meshes[mi]));
    for (const prim of mesh.primitives || []) {
      if (prim.material != null) prim.material = remapIndex(used.materials, prim.material);
      for (const [k, acc] of Object.entries(prim.attributes || {})) {
        prim.attributes[k] = remapIndex(used.accessors, acc);
      }
      if (prim.indices != null) prim.indices = remapIndex(used.accessors, prim.indices);
    }
    newJson.meshes.push(mesh);
  }

  for (const si of [...used.skins].sort((a, b) => a - b)) {
    const skin = { ...srcJson.skins[si] };
    skin.joints = skin.joints.map((j) => nodeRemap.get(j));
    if (skin.skeleton != null) skin.skeleton = nodeRemap.get(skin.skeleton);
    if (skin.inverseBindMatrices != null) {
      skin.inverseBindMatrices = remapIndex(used.accessors, skin.inverseBindMatrices);
    }
    newJson.skins.push(skin);
  }

  const bvRemap = new Map();
  for (const bvi of [...used.bufferViews].sort((a, b) => a - b)) {
    bvRemap.set(bvi, newJson.bufferViews.length);
    newJson.bufferViews.push(bvMap.get(bvi));
  }

  for (const ai of [...used.accessors].sort((a, b) => a - b)) {
    const acc = { ...srcJson.accessors[ai] };
    if (acc.bufferView != null) acc.bufferView = bvRemap.get(acc.bufferView);
    if (acc.sparse?.indices?.bufferView != null) {
      acc.sparse = { ...acc.sparse, indices: { ...acc.sparse.indices } };
      acc.sparse.indices.bufferView = bvRemap.get(acc.sparse.indices.bufferView);
    }
    if (acc.sparse?.values?.bufferView != null) {
      acc.sparse = { ...acc.sparse, values: { ...acc.sparse.values } };
      acc.sparse.values.bufferView = bvRemap.get(acc.sparse.values.bufferView);
    }
    newJson.accessors.push(acc);
  }

  for (const mi of [...used.materials].sort((a, b) => a - b)) {
    newJson.materials.push(JSON.parse(JSON.stringify(srcJson.materials[mi])));
  }
  for (const ti of [...used.textures].sort((a, b) => a - b)) {
    newJson.textures.push(JSON.parse(JSON.stringify(srcJson.textures[ti])));
  }
  for (const ii of [...used.images].sort((a, b) => a - b)) {
    newJson.images.push(JSON.parse(JSON.stringify(srcJson.images[ii])));
  }

  const roots = rootNodeIndices
    .map((ri) => nodeRemap.get(ri))
    .filter((v) => v != null);
  if (roots.length === 1) {
    newJson.scenes[0].nodes = roots;
  } else {
    newJson.nodes.push({ name: "ForgePrefabRoot", children: roots });
    newJson.scenes[0].nodes = [newJson.nodes.length - 1];
  }

  return writeGLB(newJson, newBin);
}