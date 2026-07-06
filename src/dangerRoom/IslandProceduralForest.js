/**
 * Simplified procedural instanced forest — port of forestoutline.html for island fill.
 */

import * as THREE from "three";
import { islandHeight, islandEdgeFactor } from "./IslandTerrain.js";

const CONFIG = {
  TREE_COUNT: 130,
  FOREST_RADIUS: 34,
  CLEAR_RADIUS: 9,
  TRUNK_LENGTH_MIN: 3.2,
  TRUNK_LENGTH_MAX: 5.5,
  TRUNK_RADIUS_MIN: 0.14,
  TRUNK_RADIUS_MAX: 0.28,
  BRANCH_LEVELS: 4,
  BRANCH_ANGLE: 0.52,
  BRANCH_ANGLE_VARIANCE: 0.22,
  LENGTH_FALLOFF: 0.68,
  RADIUS_FALLOFF: 0.55,
  BRANCHES_PER_NODE: 3,
  TWIST: 0.45,
  LEAF_SIZE: 0.65,
  LEAF_DENSITY: 3,
  LEAF_SPREAD: 0.7,
  BARK_SEGMENTS: 6,
};

function createLeafTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#4a8a42";
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.05);
  ctx.bezierCurveTo(size * 0.8, size * 0.2, size * 0.82, size * 0.7, size * 0.5, size * 0.95);
  ctx.bezierCurveTo(size * 0.18, size * 0.7, size * 0.2, size * 0.2, size * 0.5, size * 0.05);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class ProceduralForest {
  constructor() {
    this.group = new THREE.Group();
    this.branchMatrices = [];
    this.leafMatrices = [];
    this.leafColors = [];
    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._color = new THREE.Color();
    this._leafGeo = new THREE.PlaneGeometry(1, 1);
    this._leafBottomY = -0.5;
  }

  _mulberry32(seed) {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  generate() {
    const treeTypes = [
      { levels: 4, branchAngle: 0.5, lengthFalloff: 0.7, radiusFalloff: 0.55, branches: 3 },
      { levels: 3, branchAngle: 0.58, lengthFalloff: 0.72, radiusFalloff: 0.58, branches: 3 },
      { levels: 4, branchAngle: 0.45, lengthFalloff: 0.66, radiusFalloff: 0.52, branches: 2 },
    ];

    for (let i = 0; i < CONFIG.TREE_COUNT; i++) {
      const rand = this._mulberry32(i * 54321 + 11111);
      const r = CONFIG.CLEAR_RADIUS + Math.sqrt(rand()) * CONFIG.FOREST_RADIUS;
      const theta = rand() * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const y = islandHeight(x, z);
      if (y < 0.3 || islandEdgeFactor(x, z) > 0.65) continue;
      if (Math.hypot(x - 10, z + 6) < 10) continue;

      const treeType = treeTypes[Math.floor(rand() * treeTypes.length)];
      const treeScale = 0.55 + rand() * 0.75;
      const trunkLength =
        (CONFIG.TRUNK_LENGTH_MIN + rand() * (CONFIG.TRUNK_LENGTH_MAX - CONFIG.TRUNK_LENGTH_MIN)) * treeScale;
      const trunkRadius =
        (CONFIG.TRUNK_RADIUS_MIN + rand() * (CONFIG.TRUNK_RADIUS_MAX - CONFIG.TRUNK_RADIUS_MIN)) * treeScale;
      const leafHue = 0.28 + rand() * 0.08;
      const leafLightness = 0.36 + rand() * 0.12;

      this._generateTree(
        x, y, z, rand() * Math.PI * 2, treeScale, leafHue, leafLightness,
        trunkLength, trunkRadius, treeType, rand,
      );
    }

    this._buildMeshes();
    return this.group;
  }

  _generateTree(x, baseY, z, rotation, scale, leafHue, leafLightness, trunkLength, trunkRadius, treeType, rand) {
    const origin = new THREE.Vector3(x, baseY, z);
    const direction = new THREE.Vector3(0, 1, 0);
    direction.x += (rand() - 0.5) * 0.1;
    direction.z += (rand() - 0.5) * 0.1;
    direction.normalize();
    this._branch(origin, direction, trunkLength, trunkRadius, 0, rotation, scale, leafHue, leafLightness, treeType, rand);
  }

  _branch(start, direction, length, radius, level, treeRotation, treeScale, leafHue, leafLightness, treeType, rand) {
    if (level > treeType.levels || radius < 0.01) return;
    const end = start.clone().addScaledVector(direction, length);
    const mid = start.clone().lerp(end, 0.5);
    this._quat.setFromUnitVectors(this._up, direction.clone().normalize());
    const topRadius = radius * treeType.radiusFalloff;
    const avgRadius = (radius + topRadius) * 0.5;
    this._scale.set(avgRadius, length, avgRadius);
    this._matrix.compose(mid, this._quat, this._scale);
    this.branchMatrices.push(this._matrix.clone());

    if (level >= treeType.levels - 1) {
      this._addLeaves(end, direction, treeScale, leafHue, leafLightness, topRadius, rand);
    }

    if (level < treeType.levels) {
      const numChildren = level === 0
        ? treeType.branches + Math.floor(rand() * 2)
        : Math.max(1, treeType.branches - Math.floor(level * 0.3));
      for (let i = 0; i < numChildren; i++) {
        const twistAngle = (i / numChildren) * Math.PI * 2 + rand() * CONFIG.TWIST + treeRotation;
        const bendAngle = treeType.branchAngle + (rand() - 0.5) * CONFIG.BRANCH_ANGLE_VARIANCE * 2;
        const perp = new THREE.Vector3(1, 0, 0);
        if (Math.abs(direction.y) > 0.9) perp.set(0, 0, 1);
        perp.crossVectors(this._up, direction).normalize();
        const childDir = direction.clone();
        childDir.applyAxisAngle(perp, bendAngle);
        childDir.applyAxisAngle(direction, twistAngle);
        childDir.normalize();
        const childStart = start.clone().lerp(end, 0.42 + rand() * 0.45);
        this._branch(
          childStart, childDir,
          length * treeType.lengthFalloff * (0.82 + rand() * 0.35),
          radius * treeType.radiusFalloff,
          level + 1, treeRotation, treeScale, leafHue, leafLightness, treeType, rand,
        );
      }
    }
  }

  _addLeaves(branchEnd, branchDir, treeScale, leafHue, leafLightness, topRadius, rand) {
    const count = CONFIG.LEAF_DENSITY + Math.floor(rand() * 2);
    const size = CONFIG.LEAF_SIZE * treeScale;
    const spread = CONFIG.LEAF_SPREAD * treeScale;
    const perp1 = new THREE.Vector3(1, 0, 0);
    if (Math.abs(branchDir.y) > 0.9) perp1.set(0, 0, 1);
    perp1.crossVectors(branchDir, perp1).normalize();
    const perp2 = new THREE.Vector3().crossVectors(branchDir, perp1).normalize();

    for (let i = 0; i < count; i++) {
      const aroundAngle = rand() * Math.PI * 2;
      const outward = new THREE.Vector3()
        .addScaledVector(perp1, Math.cos(aroundAngle))
        .addScaledVector(perp2, Math.sin(aroundAngle))
        .normalize();
      const attachPoint = branchEnd.clone().addScaledVector(outward, topRadius);
      const stemDir = outward.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.25, 0)).normalize();
      const leafRight = new THREE.Vector3().crossVectors(stemDir, outward).normalize();
      const leafNormal = new THREE.Vector3().crossVectors(leafRight, stemDir).normalize();
      const rotMatrix = new THREE.Matrix4().makeBasis(leafRight, stemDir, leafNormal);
      const leafQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
      const leafScale = size * (0.55 + rand() * 0.45);
      const localBottom = new THREE.Vector3(0, this._leafBottomY, 0).applyQuaternion(leafQuat);
      const leafPos = attachPoint.clone().sub(localBottom.clone().multiplyScalar(leafScale));
      this._scale.set(leafScale, leafScale, leafScale);
      this._matrix.compose(leafPos, leafQuat, this._scale);
      this.leafMatrices.push(this._matrix.clone());
      this._color.setHSL(leafHue + (rand() - 0.5) * 0.04, 0.5 + rand() * 0.12, leafLightness + (rand() - 0.5) * 0.06);
      this.leafColors.push(this._color.r, this._color.g, this._color.b);
    }
  }

  _buildMeshes() {
    if (this.branchMatrices.length) {
      const barkGeo = new THREE.CylinderGeometry(1, 1, 1, CONFIG.BARK_SEGMENTS, 1);
      const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.92 });
      const bark = new THREE.InstancedMesh(barkGeo, barkMat, this.branchMatrices.length);
      bark.castShadow = true;
      bark.receiveShadow = true;
      for (let i = 0; i < this.branchMatrices.length; i++) bark.setMatrixAt(i, this.branchMatrices[i]);
      bark.instanceMatrix.needsUpdate = true;
      this.group.add(bark);
    }

    if (this.leafMatrices.length) {
      const leafTex = createLeafTexture();
      const leafGeo = this._leafGeo.clone();
      const leafMat = new THREE.MeshStandardMaterial({
        map: leafTex,
        transparent: true,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.85,
      });
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, this.leafMatrices.length);
      leaves.castShadow = false;
      const color = new THREE.Color();
      for (let i = 0; i < this.leafMatrices.length; i++) {
        leaves.setMatrixAt(i, this.leafMatrices[i]);
        color.setRGB(this.leafColors[i * 3], this.leafColors[i * 3 + 1], this.leafColors[i * 3 + 2]);
        leaves.setColorAt(i, color);
      }
      leaves.instanceMatrix.needsUpdate = true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      leafMat.vertexColors = true;
      this.group.add(leaves);
    }
  }
}

/**
 * @param {THREE.Group} root
 * @returns {{ group: THREE.Group }}
 */
export function buildProceduralForest(root) {
  const forest = new ProceduralForest();
  const group = forest.generate();
  group.name = "island-procedural-forest";
  root.add(group);
  return { group };
}