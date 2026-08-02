/**
 * Island harvest loop — tool equip, auto-aim, swing hits, chunk depletion, rewards.
 */

import * as THREE from "three";
import { spawnIslandHarvestables, pulseHarvestGlow } from "./HarvestNodes.js";
import { spawnHarvestChunks, updateHarvestChunks, clearHarvestChunks } from "./HarvestChunks.js";
import {
  HARVEST_TOOLS,
  HARVEST_REWARDS,
  SWING_REACH,
  SWING_CONE_DOT,
  SWING_THROTTLE_MS,
  HIT_DELAY_MS,
  FACE_LERP,
  randomInt,
} from "./HarvestDefinitions.js";
import {
  setupHarvestRadialInput,
  teardownHarvestRadialInput,
  isHarvestRadialOpen,
} from "./harvestToolRadial.js";
import { lerpAngle } from "../engine/tpsMath.js";
import { isCombatSandboxUi, getDangerRoomState } from "./dangerRoomStore.js";
import {
  registerFocusTarget,
  unregisterFocusTarget,
  getLockedFocusTarget,
} from "./FocusTargetRegistry.js";

/** @typedef {object} HarvestNodeState */

let toastRoot = null;

function ensureToastRoot() {
  if (toastRoot) return toastRoot;
  toastRoot = document.createElement("div");
  toastRoot.id = "harvest-toast-root";
  toastRoot.className = "harvest-toast-root";
  document.body.appendChild(toastRoot);
  return toastRoot;
}

function showHarvestToast(icon, label, qty) {
  const root = ensureToastRoot();
  const el = document.createElement("div");
  el.className = "harvest-toast";
  el.textContent = `+${qty} ${icon} ${label}`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("harvest-toast-show"));
  setTimeout(() => {
    el.classList.remove("harvest-toast-show");
    setTimeout(() => el.remove(), 320);
  }, 1400);
}

function equipHarvestTool(equipment, tool) {
  if (!equipment || !tool) return;
  equipment.applyDefaultArmor();
  for (const slot of ["sword", "axe", "hammer", "spear", "dagger", "bow", "staff", "shield", "quiver", "bag", "wood"]) {
    equipment.unequip(slot);
  }
  equipment.equip(tool.equipSlot, tool.variant);
}

const _fwd = new THREE.Vector3();
const _toNode = new THREE.Vector3();

export class HarvestSystem {
  /** @param {import('../../game.js').GrudgeArena} arena */
  constructor(arena) {
    this.arena = arena;
    this.nodes = [];
    this.root = null;
    this.activeToolId = null;
    this.lastSwingAt = 0;
    this.pendingHit = null;
    this.stash = { wood: 0, stone: 0, ore: 0 };
    this._time = 0;
    this._stashEl = null;
  }

  get activeTool() {
    return HARVEST_TOOLS.find((t) => t.id === this.activeToolId) ?? null;
  }

  isActive() {
    return !!this.activeToolId;
  }

  mount() {
    if (this.root) return;
    this.root = new THREE.Group();
    this.root.name = "harvest-nodes";
    this.arena.scene.add(this.root);
    this.nodes = spawnIslandHarvestables(this.root);
    for (const n of this.nodes) {
      this._registerObstacle(n.group);
      registerFocusTarget({
        id: n.id,
        kind: "harvestable",
        label: `${n.type} node`,
        getWorld: (out) => out.set(n.group.position.x, n.group.position.y, n.group.position.z),
        alive: () => !n.depleted && !n.felling,
      });
    }
    this._ensureStashHud();
    setupHarvestRadialInput((toolId) => this.selectTool(toolId));
  }

  teardown() {
    teardownHarvestRadialInput();
    clearHarvestChunks();
    if (this.root) {
      this.arena.scene.remove(this.root);
      this.root = null;
    }
    for (const n of this.nodes) unregisterFocusTarget(n.id);
    this.nodes = [];
    this.activeToolId = null;
    this.pendingHit = null;
    this._stashEl?.remove();
    this._stashEl = null;
  }

  _registerObstacle(group) {
    if (!group) return;
    if (!this.arena._obstacleMeshes) this.arena._obstacleMeshes = [];
    if (!this.arena._obstacleMeshes.includes(group)) {
      this.arena._obstacleMeshes.push(group);
    }
    this.arena.terrainSystem?.registerObstacle?.(group, { harvest: true });
    this.arena.orbitCamera?.setCollisionMeshes?.(this.arena._obstacleMeshes);
  }

  _unregisterObstacle(group) {
    if (!group) return;
    const idx = this.arena._obstacleMeshes?.indexOf(group);
    if (idx >= 0) this.arena._obstacleMeshes.splice(idx, 1);
    this.arena.terrainSystem?.unregisterObstacle?.(group);
    this.arena.orbitCamera?.setCollisionMeshes?.(this.arena._obstacleMeshes ?? []);
  }

  clearTool() {
    this.activeToolId = null;
    this._updateStashHud();
  }

  selectTool(toolId) {
    const tool = HARVEST_TOOLS.find((t) => t.id === toolId);
    if (!tool) return;
    this.activeToolId = toolId;
    const eq = this.arena.playerUnit?.equipment;
    equipHarvestTool(eq, tool);
    this._updateStashHud();
    this._faceBestNode(true);
  }

  _ensureStashHud() {
    if (this._stashEl) return;
    this._stashEl = document.createElement("div");
    this._stashEl.id = "harvest-stash-hud";
    this._stashEl.className = "harvest-stash-hud";
    document.body.appendChild(this._stashEl);
    this._updateStashHud();
  }

  _updateStashHud() {
    if (!this._stashEl) return;
    const tool = this.activeTool;
    const toolLabel = tool ? tool.label : "Hold R — tools";
    this._stashEl.innerHTML = `
      <span class="harvest-stash-title">⛏ ${toolLabel}</span>
      <span>🪵 ${this.stash.wood}</span>
      <span>🪨 ${this.stash.stone}</span>
      <span>⛏️ ${this.stash.ore}</span>
    `;
  }

  trySwing() {
    if (!this.activeTool || isHarvestRadialOpen()) return false;
    const now = performance.now();
    if (now - this.lastSwingAt < SWING_THROTTLE_MS) return false;

    const target = this._findBestTarget();
    if (!target) return false;

    this.lastSwingAt = now;
    const mesh = this.arena.playerUnit?.mesh;
    const ctrl = this.arena.playerUnit?.controller;
    if (mesh) this._faceNode(mesh, target, 1);
    ctrl?.playOnce?.(this.activeTool.anim ?? "attack1", 1.1 * (this.arena.dangerMode ? 1 : 1));

    const swingDir = _fwd.set(0, 0, -1).applyQuaternion(mesh.quaternion).normalize();
    const nodeRef = target;
    this.pendingHit = setTimeout(() => this._registerHit(nodeRef, swingDir.x, swingDir.z), HIT_DELAY_MS);
    return true;
  }

  _registerHit(node, dirX, dirZ) {
    this.pendingHit = null;
    if (!node || node.depleted || node.felling) return;
    const tool = this.activeTool;
    if (!tool || !tool.types.includes(node.type)) return;

    const player = this.arena.playerUnit?.mesh;
    if (!player) return;
    node.worldPos.set(node.group.position.x, node.group.position.y, node.group.position.z);
    const dist = player.position.distanceTo(node.worldPos);
    if (dist > SWING_REACH + 0.5) return;

    node.hp -= 1;
    const reward = HARVEST_REWARDS[node.type];
    const qty = randomInt(reward.perHit[0], reward.perHit[1]);
    this._grantReward(node.type, qty);

    const chunkColor = node.glowColor ?? 0xaaaaaa;
    const hitPos = node.worldPos.clone().add(new THREE.Vector3(0, 1.2, 0));
    spawnHarvestChunks(this.arena.scene, hitPos, chunkColor, node.hp <= 0 ? 10 : 5, 5);

    const scale = 0.78 + (node.hp / node.maxHp) * 0.22;
    node.group.scale.setScalar(scale);

    if (node.type === "wood" && node.hp <= 0) {
      node.felling = true;
      node.fellStart = performance.now();
      node.fellAxisX = -dirZ;
      node.fellAxisZ = dirX;
      const bonus = randomInt(reward.final[0], reward.final[1]);
      this._grantReward(node.type, bonus);
      return;
    }

    if (node.hp <= 0) {
      const bonus = randomInt(reward.final[0], reward.final[1]);
      this._grantReward(node.type, bonus);
      node.depleted = true;
      node.group.visible = false;
      unregisterFocusTarget(node.id);
      this._unregisterObstacle(node.group);
    }
  }

  _grantReward(type, qty) {
    this.stash[type] = (this.stash[type] || 0) + qty;
    const reward = HARVEST_REWARDS[type];
    showHarvestToast(reward.icon, reward.label, qty);
    const inv = this.arena.inventorySystem;
    if (inv?.addFromCatalog) {
      const inst = inv.addFromCatalog(reward.catalogId, { qty });
      if (inst) this.arena.inventoryUI?.update?.();
    }
    this._updateStashHud();
  }

  _findBestTarget() {
    const tool = this.activeTool;
    const player = this.arena.playerUnit?.mesh;
    if (!tool || !player) return null;

    const locked = getLockedFocusTarget();
    if (locked?.kind === "harvestable") {
      const node = this.nodes.find((n) => n.id === locked.id && !n.depleted && !n.felling);
      if (node && tool.types.includes(node.type)) return node;
    }

    _fwd.set(0, 0, -1).applyQuaternion(player.quaternion);
    let best = null;
    let bestScore = -Infinity;

    for (const node of this.nodes) {
      if (node.depleted || node.felling) continue;
      if (!tool.types.includes(node.type)) continue;
      node.worldPos.set(node.group.position.x, node.group.position.y, node.group.position.z);
      _toNode.subVectors(node.worldPos, player.position);
      _toNode.y = 0;
      const dist = _toNode.length();
      if (dist > SWING_REACH) continue;
      _toNode.normalize();
      const dot = _fwd.dot(_toNode);
      if (dot < SWING_CONE_DOT) continue;
      const score = dot * 2 - dist * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  _faceBestNode(snap = false, dt = 0.016) {
    const mesh = this.arena.playerUnit?.mesh;
    const target = this._findBestTarget();
    if (!mesh || !target) return;
    this._faceNode(mesh, target, snap ? 1 : Math.min(1, FACE_LERP * dt));
  }

  _faceNode(mesh, node, k) {
    node.worldPos.set(node.group.position.x, node.group.position.y, node.group.position.z);
    _toNode.subVectors(node.worldPos, mesh.position);
    _toNode.y = 0;
    if (_toNode.lengthSq() < 0.01) return;
    const yaw = Math.atan2(_toNode.x, _toNode.z);
    if (k >= 1) mesh.rotation.y = yaw;
    else mesh.rotation.y = lerpAngle(mesh.rotation.y, yaw, Math.min(1, k));
  }

  update(dt) {
    if (!this.root) return;
    this._time += dt;
    pulseHarvestGlow(this.nodes, this._time);

    for (const node of this.nodes) {
      if (!node.felling) continue;
      const t = (performance.now() - node.fellStart) / 1100;
      if (t >= 1) {
        node.felling = false;
        node.depleted = true;
        node.group.visible = false;
        unregisterFocusTarget(node.id);
        this._unregisterObstacle(node.group);
        continue;
      }
      const angle = t * (Math.PI / 2);
      node.group.rotation.set(0, node.group.rotation.y, 0);
      node.group.rotateOnWorldAxis(
        new THREE.Vector3(node.fellAxisX, 0, node.fellAxisZ).normalize(),
        angle,
      );
    }

    updateHarvestChunks(dt, this.arena.scene);

    if (this.activeTool) {
      this._faceBestNode(false, dt);
    }

    const ctrl = this.arena.playerController;
    if (ctrl?.tickKey?._LMB && this.activeTool) {
      this.trySwing();
    }
  }
}

/** @param {import('../../game.js').GrudgeArena} arena */
export function shouldMountHarvest(arena) {
  if (!isCombatSandboxUi()) return false;
  const preset = getDangerRoomState().presetId;
  return preset === "island" && arena.dangerMode;
}

/** @param {import('../../game.js').GrudgeArena} arena */
export function mountHarvestForArena(arena) {
  if (!shouldMountHarvest(arena)) return null;
  if (arena._harvest) return arena._harvest;
  arena._harvest = new HarvestSystem(arena);
  arena._harvest.mount();
  return arena._harvest;
}

/** @param {import('../../game.js').GrudgeArena} arena */
export function teardownHarvestForArena(arena) {
  arena._harvest?.teardown();
  arena._harvest = null;
}

/** @param {import('../../game.js').GrudgeArena} arena */
export function tickHarvestForArena(arena, dt) {
  arena._harvest?.update(dt);
}