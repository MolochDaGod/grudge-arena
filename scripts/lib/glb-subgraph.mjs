/**
 * Extract glTF subgraphs from a GLB and write standalone GLB files.
 * Used by process-30grudge6-characters.mjs to split preset + modular outputs.
 */

import { parseGLB, writeGLB } from "./glb-scale.mjs";

function collectNodeTree(nodes, rootIdx, out) {
  if (rootIdx == null || out.has(rootIdx)) return;
  const n = nodes[rootIdx];
  if (!n) return;
  out.add(rootIdx);
  for (const c of n.children ?? []) collectNodeTree(nodes, c, out);
}

function collectSkinDeps(json, skinIdx, nodeSet, accessorSet) {
  const skin = json.skins?.[skinIdx];
  if (!skin) return;
  for (const j of skin.joints ?? []) nodeSet.add(j);
  if (skin.skeleton != null) nodeSet.add(skin.skeleton);
  if (skin.inverseBindMatrices != null) accessorSet.add(skin.inverseBindMatrices);
}

function collectMeshDeps(json, meshIdx, accessorSet, materialSet) {
  const mesh = json.meshes?.[meshIdx];
  if (!mesh) return;
  for (const prim of mesh.primitives ?? []) {
    for (const attr of Object.values(prim.attributes ?? {})) accessorSet.add(attr);
    if (prim.indices != null) accessorSet.add(prim.indices);
    if (prim.material != null) materialSet.add(prim.material);
  }
}

function collectMaterialDeps(json, matIdx, textureSet) {
  const mat = json.materials?.[matIdx];
  if (!mat) return;
  const pbr = mat.pbrMetallicRoughness ?? {};
  if (pbr.baseColorTexture?.index != null) textureSet.add(pbr.baseColorTexture.index);
  if (mat.normalTexture?.index != null) textureSet.add(mat.normalTexture.index);
  if (mat.emissiveTexture?.index != null) textureSet.add(mat.emissiveTexture.index);
  const unlit = mat.extensions?.KHR_materials_unlit;
  if (unlit?.baseColorTexture?.index != null) textureSet.add(unlit.baseColorTexture.index);
}

function collectTextureDeps(json, texIdx, imageSet) {
  const tex = json.textures?.[texIdx];
  if (tex?.source != null) imageSet.add(tex.source);
}

function collectAccessorDeps(json, accIdx, bufferViewSet) {
  const acc = json.accessors?.[accIdx];
  if (acc?.bufferView != null) bufferViewSet.add(acc.bufferView);
  if (acc?.sparse) {
    if (acc.sparse.indices?.bufferView != null) bufferViewSet.add(acc.sparse.indices.bufferView);
    if (acc.sparse.values?.bufferView != null) bufferViewSet.add(acc.sparse.values.bufferView);
  }
}

function collectImageDeps(json, imgIdx, bufferViewSet) {
  const img = json.images?.[imgIdx];
  if (img?.bufferView != null) bufferViewSet.add(img.bufferView);
}

/** Expand node roots to full dependency closure. */
export function closureForRoots(json, rootNodeIdxs) {
  const nodeSet = new Set();
  const nodes = json.nodes ?? [];
  for (const r of rootNodeIdxs) collectNodeTree(nodes, r, nodeSet);

  const meshSet = new Set();
  const skinSet = new Set();
  const accessorSet = new Set();
  const materialSet = new Set();
  const textureSet = new Set();
  const imageSet = new Set();
  const bufferViewSet = new Set();
  const animSet = new Set();

  const scanNodes = () => {
    for (const ni of [...nodeSet]) {
      const n = nodes[ni];
      if (!n) {
        nodeSet.delete(ni);
        continue;
      }
      if (n.mesh != null) meshSet.add(n.mesh);
      if (n.skin != null) skinSet.add(n.skin);
    }
  };

  scanNodes();
  for (const si of skinSet) collectSkinDeps(json, si, nodeSet, accessorSet);
  scanNodes();

  for (const mi of meshSet) collectMeshDeps(json, mi, accessorSet, materialSet);
  for (const mai of materialSet) collectMaterialDeps(json, mai, textureSet);
  for (const ti of textureSet) collectTextureDeps(json, ti, imageSet);
  for (const ai of accessorSet) collectAccessorDeps(json, ai, bufferViewSet);
  for (const ii of imageSet) collectImageDeps(json, ii, bufferViewSet);

  for (let i = 0; i < (json.animations?.length ?? 0); i++) {
    const anim = json.animations[i];
    for (const ch of anim.channels ?? []) {
      if (ch.target?.node != null && nodeSet.has(ch.target.node)) animSet.add(i);
    }
  }

  return {
    nodeSet,
    meshSet,
    skinSet,
    accessorSet,
    materialSet,
    textureSet,
    imageSet,
    bufferViewSet,
    animSet,
  };
}

function remapIndex(old, map) {
  if (old == null) return old;
  return map.get(old);
}

function remapNode(json, ni, newNodes, nodeMap) {
  const n = json.nodes[ni];
  const copy = { ...n };
  if (copy.children) copy.children = copy.children.map((c) => nodeMap.get(c));
  if (copy.mesh != null) copy.mesh = nodeMap.get(copy.mesh);
  if (copy.skin != null) copy.skin = nodeMap.get(copy.skin);
  if (copy.camera != null) delete copy.camera;
  if (copy.extensions) copy.extensions = structuredClone(copy.extensions);
  newNodes.push(copy);
}

function buildRemappedGlb(json, bin, closure, sceneRootNodeIdxs, opts = {}) {
  const {
    singleImageIdx = null,
    singleMaterialIdx = null,
    assetName = "Character",
  } = opts;

  const nodeOrder = [...closure.nodeSet].sort((a, b) => a - b);
  const meshOrder = [...closure.meshSet].sort((a, b) => a - b);
  const skinOrder = [...closure.skinSet].sort((a, b) => a - b);
  const accessorOrder = [...closure.accessorSet].sort((a, b) => a - b);
  const materialOrder =
    singleMaterialIdx != null ? [singleMaterialIdx] : [...closure.materialSet].sort((a, b) => a - b);
  let textureOrder = [...closure.textureSet].sort((a, b) => a - b);
  if (singleImageIdx != null) {
    const matched = textureOrder.filter((ti) => json.textures?.[ti]?.source === singleImageIdx);
    textureOrder = matched.length ? matched : textureOrder.slice(0, 1);
  }
  const imageOrder =
    singleImageIdx != null ? [singleImageIdx] : [...closure.imageSet].sort((a, b) => a - b);
  const bufferViewOrder = [...closure.bufferViewSet].sort((a, b) => a - b);
  const animOrder = [...closure.animSet].sort((a, b) => a - b);

  const nodeMap = new Map(nodeOrder.map((o, i) => [o, i]));
  const meshMap = new Map(meshOrder.map((o, i) => [o, i]));
  const skinMap = new Map(skinOrder.map((o, i) => [o, i]));
  const accessorMap = new Map(accessorOrder.map((o, i) => [o, i]));
  const materialMap = new Map(materialOrder.map((o, i) => [o, i]));
  const textureMap = new Map(textureOrder.map((o, i) => [o, i]));
  const imageMap = new Map(imageOrder.map((o, i) => [o, i]));
  const bufferViewMap = new Map(bufferViewOrder.map((o, i) => [o, i]));
  const animMap = new Map(animOrder.map((o, i) => [o, i]));

  const newBufferChunks = [];
  const newBufferViews = bufferViewOrder.map((oldBv) => {
    const bv = json.bufferViews[oldBv];
    const start = bv.byteOffset ?? 0;
    const slice = bin.slice(start, start + bv.byteLength);
    const newOffset = newBufferChunks.reduce((s, c) => s + c.length, 0);
    newBufferChunks.push(slice);
    return {
      buffer: 0,
      byteOffset: newOffset,
      byteLength: bv.byteLength,
      target: bv.target,
      byteStride: bv.byteStride,
    };
  });
  const newBin = Buffer.concat(newBufferChunks);

  const newAccessors = accessorOrder.map((old) => {
    const acc = { ...json.accessors[old] };
    acc.bufferView = remapIndex(acc.bufferView, bufferViewMap);
    if (acc.sparse) {
      acc.sparse = structuredClone(acc.sparse);
      acc.sparse.indices.bufferView = remapIndex(acc.sparse.indices.bufferView, bufferViewMap);
      acc.sparse.values.bufferView = remapIndex(acc.sparse.values.bufferView, bufferViewMap);
    }
    return acc;
  });

  const newImages = imageOrder.map((old) => {
    const img = { ...json.images[old] };
    if (img.bufferView != null) img.bufferView = remapIndex(img.bufferView, bufferViewMap);
    if (singleImageIdx != null) img.name = "body_atlas";
    return img;
  });

  const newTextures = textureOrder.map((old) => {
    const tex = { ...json.textures[old] };
    tex.source = remapIndex(tex.source, imageMap);
    return tex;
  });

  const newMaterials = materialOrder.map((old) => {
    const mat = structuredClone(json.materials[old]);
    mat.name = "body_atlas";
    if (mat.pbrMetallicRoughness?.baseColorTexture) {
      mat.pbrMetallicRoughness.baseColorTexture.index = 0;
    }
    return mat;
  });

  const newMeshes = meshOrder.map((old) => {
    const mesh = structuredClone(json.meshes[old]);
    for (const prim of mesh.primitives ?? []) {
      for (const [k, v] of Object.entries(prim.attributes ?? {})) {
        prim.attributes[k] = remapIndex(v, accessorMap);
      }
      if (prim.indices != null) prim.indices = remapIndex(prim.indices, accessorMap);
      prim.material = 0;
    }
    return mesh;
  });

  const newSkins = skinOrder.map((old) => {
    const skin = { ...json.skins[old] };
    skin.joints = (skin.joints ?? []).map((j) => nodeMap.get(j));
    if (skin.skeleton != null) skin.skeleton = nodeMap.get(skin.skeleton);
    if (skin.inverseBindMatrices != null) {
      skin.inverseBindMatrices = remapIndex(skin.inverseBindMatrices, accessorMap);
    }
    return skin;
  });

  const newNodes = [];
  for (const old of nodeOrder) {
    const n = json.nodes[old];
    const copy = { ...n };
    if (copy.children) copy.children = copy.children.map((c) => nodeMap.get(c)).filter((c) => c != null);
    if (copy.mesh != null) copy.mesh = meshMap.get(copy.mesh);
    if (copy.skin != null) copy.skin = skinMap.get(copy.skin);
    if (copy.camera != null) delete copy.camera;
    newNodes.push(copy);
  }

  const sceneRoots = sceneRootNodeIdxs.map((r) => nodeMap.get(r)).filter((r) => r != null);

  const newAnimations = animOrder.map((old) => {
    const anim = structuredClone(json.animations[old]);
    for (const ch of anim.channels ?? []) {
      if (ch.sampler != null) {
        const sampler = anim.samplers[ch.sampler];
        if (sampler.input != null) sampler.input = remapIndex(sampler.input, accessorMap);
        if (sampler.output != null) sampler.output = remapIndex(sampler.output, accessorMap);
      }
      if (ch.target?.node != null) ch.target.node = remapIndex(ch.target.node, nodeMap);
    }
    return anim;
  });

  const outJson = {
    asset: {
      ...(json.asset ?? {}),
      generator: "grudge-arena process-30grudge6-characters",
      version: "2.0",
    },
    scene: 0,
    scenes: [{ name: assetName, nodes: sceneRoots }],
    nodes: newNodes,
    meshes: newMeshes,
    skins: newSkins,
    accessors: newAccessors,
    bufferViews: newBufferViews,
    buffers: [{ byteLength: newBin.length }],
    materials: newMaterials,
    textures: newTextures,
    images: newImages,
  };
  if (newAnimations.length) outJson.animations = newAnimations;

  return writeGLB(outJson, newBin);
}

/** Extract one character preset (single AuxScene root) to a standalone GLB. */
export function extractPresetGlb(buf, rootNodeIdx, assetName = "Preset") {
  const { json, bin } = parseGLB(buf);
  const closure = closureForRoots(json, [rootNodeIdx]);
  return buildRemappedGlb(json, bin, closure, [rootNodeIdx], { assetName });
}

/** List mesh node names under a root (depth-first). */
export function meshNamesUnderRoot(json, rootNodeIdx) {
  const nodes = json.nodes ?? [];
  const names = [];
  (function walk(i) {
    const n = nodes[i];
    if (!n) return;
    if (n.mesh != null && n.name) names.push(n.name);
    for (const c of n.children ?? []) walk(c);
  })(rootNodeIdx);
  return names.sort();
}

/** Find the skeleton parent that holds Bip001 + mesh siblings. */
export function findMeshParentIdx(json, rootNodeIdx) {
  const nodes = json.nodes ?? [];
  let found = null;
  (function walk(i) {
    const n = nodes[i];
    if (!n) return;
    const childMeshes = (n.children ?? []).filter((c) => nodes[c]?.mesh != null);
    const hasBip = (n.children ?? []).some((c) => (nodes[c]?.name ?? "").startsWith("Bip001"));
    if (childMeshes.length > 0 && hasBip) found = i;
    for (const c of n.children ?? []) walk(c);
  })(rootNodeIdx);
  return found;
}

/**
 * Build a modular race GLB: union of all preset subgraphs (all mesh variants).
 * Each preset keeps its own Bip001 bind pose — runtime toggles visibility by mesh name
 * (same as FBX modular pipeline). Single shared body atlas.
 */
export function extractModularGlb(buf, presetRootIdxs, assetName = "Modular") {
  const { json, bin } = parseGLB(buf);
  const closure = closureForRoots(json, presetRootIdxs);
  const firstImage = [...closure.imageSet][0] ?? null;
  const firstMaterial = [...closure.materialSet][0] ?? null;
  return buildRemappedGlb(json, bin, closure, presetRootIdxs, {
    assetName,
    singleImageIdx: firstImage,
    singleMaterialIdx: firstMaterial,
  });
}

export { parseGLB };