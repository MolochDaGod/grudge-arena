/**
 * Splash champions — race characters that emerge from the portal, walk to
 * formation, and idle facing the camera with mouse-tracked heads.
 *
 * Animation strategy
 * ──────────────────
 * The static race GLBs (`models/toon_rts/characters/<race>.glb`) ship with
 * Bip001 skeletons but ZERO animation clips. The asset pack provides clips
 * separately in `models/glb/anim_*.glb`. The two diverge in bone naming:
 *
 *   race GLB nodes:  "Bip001 Pelvis", "Bip001 L UpperArm" (spaces)
 *   anim clip tracks: "Bip001_Pelvis", "Bip001_L_UpperArm" (underscores)
 *
 * We normalise the race-GLB node names by replacing spaces with underscores
 * after load — then THREE.AnimationMixer matches tracks to nodes by name and
 * the rig comes alive without any retargeting.
 *
 * What we have / what we don't
 * ────────────────────────────
 * Available clips: idle, walk, attack, attack_heavy, death.
 * Missing: idle2, warcry, cast.  We use:
 *   • idle for the breathing pose,
 *   • walk for the march in,
 *   • attack_heavy as a stand-in for "cast" when the user clicks,
 *   • attack as an occasional "warcry / look around" idle break.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  classifyMesh, classifyHeads, unionGeometryBox, SlotKey,
} from '../character-preview/classifier';
import { attachReformShader, ReformHandle } from './reformShader';

const B = import.meta.env.BASE_URL.replace(/\/$/, '');

export type ClipName = 'idle' | 'walk' | 'attack' | 'attack_heavy' | 'death';

const CLIP_FILES: Record<ClipName, string> = {
  idle:         `${B}/models/glb/anim_idle.glb`,
  walk:         `${B}/models/glb/anim_walk.glb`,
  attack:       `${B}/models/glb/anim_attack.glb`,
  attack_heavy: `${B}/models/glb/anim_attack_heavy.glb`,
  death:        `${B}/models/glb/anim_death.glb`,
};

// Cache: each clip is loaded once, all champions share the same AnimationClip
// instance (the mixer applies them per-skeleton, no per-instance state in the
// clip itself).
const clipCache = new Map<ClipName, Promise<THREE.AnimationClip>>();
const loader = new GLTFLoader();

export async function loadAnimClip(name: ClipName): Promise<THREE.AnimationClip> {
  let p = clipCache.get(name);
  if (!p) {
    p = loader.loadAsync(CLIP_FILES[name]).then(g => {
      const clip = g.animations[0];
      if (!clip) throw new Error(`No animation in ${CLIP_FILES[name]}`);
      clip.name = name;
      return clip;
    });
    clipCache.set(name, p);
  }
  return p;
}

export async function preloadAllClips(): Promise<Record<ClipName, THREE.AnimationClip>> {
  const names: ClipName[] = ['idle', 'walk', 'attack', 'attack_heavy', 'death'];
  const clips = await Promise.all(names.map(loadAnimClip));
  return Object.fromEntries(names.map((n, i) => [n, clips[i]])) as Record<ClipName, THREE.AnimationClip>;
}

// ── Champion ─────────────────────────────────────────────────────────────────

export interface ChampionParams {
  raceId: string;            // 'human' | 'dwarf' | ...
  /** Final standing position in world space. */
  finalPos: THREE.Vector3;
  /** World position to walk OUT FROM (the portal mouth). */
  spawnPos: THREE.Vector3;
  /** When (in seconds since splash start) this champion enters the portal. */
  spawnTime: number;
  /** Facing yaw in radians once arrived (e.g. face the camera). */
  finalYaw: number;
  clips: Record<ClipName, THREE.AnimationClip>;
}

type Phase = 'pending' | 'emerging' | 'walking' | 'idle' | 'casting';

const WALK_SPEED = 1.6;        // world units per second
const EMERGE_DURATION = 2.6;   // sec — particles converge into the body
const CAST_DURATION = 1.5;     // sec — how long the cast plays before returning to idle

export class Champion {
  readonly group = new THREE.Group();
  private root: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<ClipName, THREE.AnimationAction>> = {};
  private headBone: THREE.Bone | null = null;
  private spineBone: THREE.Bone | null = null;
  private currentClip: ClipName | null = null;
  private phase: Phase = 'pending';
  private phaseT0 = 0;
  private nextWarcryAt = 0;
  private params: ChampionParams;
  // Per-material reform shader handles — driven by emerge progress so the
  // body assembles out of scattered particles. Replaces the old plain-opacity
  // fade, which looked like "ghost faded in" rather than "warriors warp in".
  private reformHandles: ReformHandle[] = [];
  // Tracked so we can clear them on dispose to avoid post-unmount fires.
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(params: ChampionParams) {
    this.params = params;
    this.group.position.copy(params.spawnPos);
    this.group.visible = false;
  }

  async load(): Promise<void> {
    const gltf = await loader.loadAsync(`${B}/models/toon_rts/characters/${this.params.raceId}.glb`);
    const root = gltf.scene;

    // Normalise bone names so anim clip tracks (underscored) bind to nodes.
    root.traverse(obj => { obj.name = obj.name.replace(/ /g, '_'); });

    // Apply loadout FIRST — this hides every unused variant (extra weapons,
    // stacked hoods, hair, beards, capes). The bounding box must only include
    // the meshes that will actually be visible, otherwise tall props like
    // polearms blow up the height and auto-scale shrinks the body to a dot.
    const visibleMats: THREE.Material[] = [];
    applyWarriorLoadout(root, visibleMats);
    // Wire every visible loadout material to the reform shader so the whole
    // silhouette warps in together (body + arms + legs + helmet + weapon).
    for (const mat of visibleMats) this.reformHandles.push(attachReformShader(mat));

    // Auto-scale + ground-anchor using only the body/legs/arms — not the
    // weapon. A two-handed sword pointing straight up doubles the model's
    // measured height and would crush the character to half-scale.
    root.updateMatrixWorld(true);
    const bodyBox = computeVisibleBoxExcludingSlots(root, ['weapon', 'shield']);
    const size = bodyBox.getSize(new THREE.Vector3());
    const targetH = 1.8;
    const scale = targetH / Math.max(size.y, 0.001);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);

    // Re-measure the FULL silhouette (including weapon) for ground anchoring,
    // so a downward-pointing axe head still rests on the ground rather than
    // clipping through it.
    const fullBox = new THREE.Box3().setFromObject(root);
    const c = fullBox.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -fullBox.min.y, -c.z);

    // Locate head + spine bones for mouse tracking.
    root.traverse(obj => {
      if ((obj as THREE.Bone).isBone) {
        if (obj.name === 'Bip001_Head')  this.headBone  = obj as THREE.Bone;
        if (obj.name === 'Bip001_Spine') this.spineBone = obj as THREE.Bone;
      }
    });

    this.root = root;
    this.group.add(root);

    // Create mixer + actions. Walk plays first (during emerge), then idle.
    this.mixer = new THREE.AnimationMixer(root);
    for (const [name, clip] of Object.entries(this.params.clips) as [ClipName, THREE.AnimationClip][]) {
      const a = this.mixer.clipAction(clip);
      a.setEffectiveWeight(0);
      a.play();
      this.actions[name] = a;
    }
    this.crossFadeTo('idle', 0.001);

    // Hide until spawn time arrives.
    this.group.visible = false;
  }

  /** Smoothly transition to a new clip. */
  private crossFadeTo(name: ClipName, fadeSec = 0.25) {
    const next = this.actions[name];
    if (!next) return;
    if (this.currentClip === name) return;
    // Bring the new action up to weight 1 over fadeSec, drive the rest down.
    for (const [k, a] of Object.entries(this.actions) as [ClipName, THREE.AnimationAction][]) {
      if (!a) continue;
      if (k === name) {
        a.reset();
        a.setEffectiveWeight(1);
        a.fadeIn(fadeSec);
      } else {
        a.fadeOut(fadeSec);
      }
    }
    this.currentClip = name;
  }

  /** Begin the spawn cycle: appear at portal, walk to final, settle into idle. */
  startEmerge(now: number) {
    this.phase = 'emerging';
    this.phaseT0 = now;
    this.group.visible = true;
    // Face along the walk direction.
    const walkDir = this.params.finalPos.clone().sub(this.params.spawnPos);
    walkDir.y = 0;
    this.group.rotation.y = Math.atan2(walkDir.x, walkDir.z);
    this.crossFadeTo('walk', 0.2);
    this.nextWarcryAt = now + 6 + Math.random() * 6;
  }

  /** External trigger — play the cast clip on top of the current state. */
  triggerCast(now: number) {
    if (this.phase !== 'idle') return;
    this.phase = 'casting';
    this.phaseT0 = now;
    this.crossFadeTo('attack_heavy', 0.15);
  }

  /** Per-frame update. mouseDir is a normalised XZ vector or null. */
  update(now: number, dt: number, mouseTarget: THREE.Vector3 | null) {
    if (this.phase === 'pending') {
      if (now >= this.params.spawnTime) this.startEmerge(now);
      return;
    }

    this.mixer?.update(dt);

    if (this.phase === 'emerging') {
      const u = Math.min(1, (now - this.phaseT0) / EMERGE_DURATION);
      // Drive the per-material reform uniform — particles converge as u→1.
      for (const h of this.reformHandles) h.setReform(u, now);
      // Slight forward step out of the portal during emerge.
      const walkVec = this.params.finalPos.clone().sub(this.params.spawnPos).setY(0).normalize();
      this.group.position.copy(this.params.spawnPos).addScaledVector(walkVec, u * 0.4);
      if (u >= 1) {
        this.phase = 'walking';
        this.phaseT0 = now;
      }
      return;
    }

    if (this.phase === 'walking') {
      // Lerp toward final at WALK_SPEED. Simple straight-line — no obstacles.
      const remaining = this.params.finalPos.clone().sub(this.group.position).setY(0);
      const dist = remaining.length();
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        this.group.position.copy(this.params.finalPos);
        this.phase = 'idle';
        this.phaseT0 = now;
        this.crossFadeTo('idle', 0.4);
        // Smoothly turn to the final facing over the next second.
      } else {
        remaining.normalize();
        this.group.position.addScaledVector(remaining, step);
        // Keep facing the walk direction.
        this.group.rotation.y = Math.atan2(remaining.x, remaining.z);
      }
      return;
    }

    if (this.phase === 'idle') {
      // Ease the body yaw toward the final facing.
      const target = this.params.finalYaw;
      const cur = this.group.rotation.y;
      let delta = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
      this.group.rotation.y = cur + delta * Math.min(1, dt * 3);

      // NOTE: head/spine mouse-tracking and the auto "warcry" idle break
      // both used to live here. They were composing rotations on top of the
      // mixer-set bone transforms each frame, and the `attack` clip used by
      // the warcry break has tracks that don't align cleanly with every
      // race's Bip001 export — the visible result was the heads / shoulders
      // periodically twisting into bad shapes. Removed entirely so the
      // champions just stand idle in their final geared pose.

      // Suppress unused-arg lint by referencing mouseTarget — kept in the
      // signature in case we want to re-introduce a SAFE head look later.
      void mouseTarget;
      return;
    }

    if (this.phase === 'casting') {
      if (now - this.phaseT0 >= CAST_DURATION) {
        this.phase = 'idle';
        this.phaseT0 = now;
        this.crossFadeTo('idle', 0.3);
      }
      return;
    }
  }

  dispose() {
    for (const tid of this.pendingTimeouts) clearTimeout(tid);
    this.pendingTimeouts = [];
    this.mixer?.stopAllAction();
    if (this.root) this.mixer?.uncacheRoot(this.root);
    this.group.traverse(obj => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mt of mats) (mt as THREE.Material | null)?.dispose();
      }
    });
  }
}

// ── Head look-at ─────────────────────────────────────────────────────────────

const _v = new THREE.Vector3();
const _localTarget = new THREE.Vector3();
const _yawQ = new THREE.Quaternion();
const _pitchQ = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _invQuat = new THREE.Quaternion();

/**
 * Apply a yaw + pitch DELTA on top of whatever the AnimationMixer just set
 * for the head bone. Compose-on-top means the idle clip's "head still looks
 * forward" pose is preserved as the rest pose — we just nudge it by a small
 * angle toward the world-space target.
 *
 * Why deltas instead of overwriting head.quaternion outright?
 *   The Bip001 head bone's local axis basis is rig-export-dependent (3ds Max
 *   biped bones have non-standard "down the bone" axes). Writing absolute
 *   Eulers risks snapping the head 90° around the wrong axis. Composing a
 *   small rotation around local Y (yaw) and local X (pitch) is rotation-
 *   axis-agnostic: even when local-Y isn't perfectly world-up, the visual
 *   result is "head wiggles toward mouse" rather than "head detaches".
 *
 * Clamps are conservative (±35° yaw, -20°/+25° pitch) for the same reason —
 * stays within the believable cone regardless of axis quirks.
 */
function applyHeadLook(
  head: THREE.Bone,
  spine: THREE.Bone | null,
  characterRoot: THREE.Object3D,
  worldTarget: THREE.Vector3,
) {
  head.getWorldPosition(_v);
  _localTarget.copy(worldTarget).sub(_v);
  // Into the character's local frame so yaw is meaningful regardless of
  // which way the character is facing.
  _invQuat.copy(characterRoot.quaternion).invert();
  _localTarget.applyQuaternion(_invQuat);

  // Character's "forward" in this asset is local +Z; yaw rotates around Y.
  let yaw   = Math.atan2(_localTarget.x, _localTarget.z);
  const horiz = Math.hypot(_localTarget.x, _localTarget.z);
  let pitch = -Math.atan2(_localTarget.y, horiz);

  // Conservative clamps — see docstring.
  yaw   = THREE.MathUtils.clamp(yaw,   -0.6,  0.6);  // ±34°
  pitch = THREE.MathUtils.clamp(pitch, -0.35, 0.45); // -20° to +26°

  // Compose on top of the mixer-set head pose. Since the mixer ran first
  // this frame, head.quaternion holds the idle-clip head rotation; we layer
  // our small yaw-then-pitch delta in head-local space.
  _yawQ.setFromAxisAngle(_yAxis, yaw);
  _pitchQ.setFromAxisAngle(_xAxis, pitch);
  head.quaternion.multiply(_yawQ).multiply(_pitchQ);

  // Spine gets a tiny fraction of the yaw for a subtle body lean.
  if (spine) {
    _yawQ.setFromAxisAngle(_yAxis, yaw * 0.18);
    spine.quaternion.multiply(_yawQ);
  }
}

// ── Bounding helpers ─────────────────────────────────────────────────────────

/**
 * Bounding box of every visible mesh under `root` whose classified slot is
 * NOT in `excludeSlots`. Unclassified meshes (props, fx) are included so
 * loose accessories still count toward the silhouette.
 */
function computeVisibleBoxExcludingSlots(
  root: THREE.Object3D,
  excludeSlots: SlotKey[],
): THREE.Box3 {
  const exclude = new Set(excludeSlots);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse(obj => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const c = classifyMesh(m.name);
    if (c && exclude.has(c.slot)) return;
    tmp.setFromObject(m);
    if (!tmp.isEmpty()) box.union(tmp);
  });
  return box;
}

// ── Warrior loadout ──────────────────────────────────────────────────────────

/**
 * Walk a race GLB and pick the heaviest-vertex variant per slot to dress the
 * champion in full armour + helmet + melee weapon + shield. Hides everything
 * else. Stores material refs in `fadeMats` for the emerge fade-in effect.
 */
function applyWarriorLoadout(root: THREE.Object3D, fadeMats: THREE.Material[]) {
  const slotVariants: Record<SlotKey, Map<string, { meshes: THREE.Mesh[]; verts: number }>> = {
    body: new Map(), head: new Map(), arms: new Map(), legs: new Map(),
    shoulderpads: new Map(), weapon: new Map(), shield: new Map(), xtra: new Map(),
  };

  root.traverse(obj => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const cloneMat = (mat: THREE.Material) => {
      const std = (mat as THREE.MeshStandardMaterial).clone();
      if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
      if (typeof std.metalness === 'number') std.metalness = 0.15;
      if (typeof std.roughness === 'number') std.roughness = 0.75;
      return std;
    };
    m.material = Array.isArray(m.material) ? m.material.map(cloneMat) : cloneMat(m.material);
    m.visible = false;

    // Bone names were normalised earlier (spaces → underscores). Re-classify
    // using the ORIGINAL pattern: classifier expects names like "Body_A".
    // The mesh naming convention from the asset is unchanged — just the bones
    // were renamed — so classifyMesh still works on m.name as-is.
    const c = classifyMesh(m.name);
    if (!c) { m.visible = true; return; }
    const entry = slotVariants[c.slot].get(c.variant) ?? { meshes: [], verts: 0 };
    entry.meshes.push(m);
    entry.verts += (m.geometry?.getAttribute?.('position')?.count ?? 0);
    slotVariants[c.slot].set(c.variant, entry);
  });

  const enable = (slot: SlotKey, variant: string | null) => {
    if (!variant) return;
    const e = slotVariants[slot].get(variant);
    if (!e) return;
    for (const mesh of e.meshes) {
      mesh.visible = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) if (mat) fadeMats.push(mat);
    }
  };

  const heaviest = (slot: SlotKey): string | null => {
    let best: { variant: string; verts: number } | null = null;
    for (const [variant, e] of slotVariants[slot]) {
      if (!best || e.verts > best.verts) best = { variant, verts: e.verts };
    }
    return best?.variant ?? null;
  };

  enable('body',         heaviest('body'));
  enable('legs',         heaviest('legs'));
  enable('arms',         heaviest('arms'));
  enable('shoulderpads', heaviest('shoulderpads'));

  const headBoxes = [...slotVariants.head.entries()].map(([variant, e]) =>
    ({ variant, box: unionGeometryBox(e.meshes) }));
  const subcat = classifyHeads(headBoxes);
  let headPick: string | null = null;
  for (const [variant, cat] of subcat) if (cat === 'helmet') { headPick = variant; break; }
  if (!headPick) headPick = heaviest('head');
  enable('head', headPick);
  for (const [variant, cat] of subcat) if (cat === 'beard') { enable('head', variant); break; }

  const meleeRe = /sword|axe|hammer|mace|pick|spear/i;
  let weaponPick: { variant: string; verts: number } | null = null;
  for (const [variant, e] of slotVariants.weapon) {
    if (!meleeRe.test(variant)) continue;
    if (!weaponPick || e.verts > weaponPick.verts) weaponPick = { variant, verts: e.verts };
  }
  enable('weapon', weaponPick?.variant ?? heaviest('weapon'));
  enable('shield', heaviest('shield'));
}
