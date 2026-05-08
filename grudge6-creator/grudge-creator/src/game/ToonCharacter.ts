/**
 * ToonCharacter — Character rendering + animation controller.
 *
 * Uses:
 *  - AnimationSystem: Three.js skinning-blending cross-fade patterns
 *  - CharacterFSM:    Sketchbook-inspired state machine
 *
 * Supports:
 *  - GLTF skeletal models with separate animation clips
 *  - Single-clip GLTF (timeScale per state trick)
 *  - Procedural block fallback (no GLTF loaded)
 *  - Rifle mesh attachment via bone search or fixed offset
 *  - Phase blink visual (opacity/emissive dissolve)
 *  - Aim-blend procedural adjustment for rifle mode
 */
import * as THREE from 'three';
import { LoadedCharacter } from './ModelLoader';
import { AnimationSystem } from './AnimationSystem';
import { CharacterFSM, FSMStateName } from './CharacterFSM';
import { WeaponAnimController, type WeaponType } from './WeaponAnimController';
import type { CharacterLike } from './CharacterLike';
import {
  ALL_SLOTS,
  applyVisibility,
  buildVariantRefs,
  defaultSelection,
  emptySlots,
  loadoutSlotKeys,
  selectionFromLoadout,
  type SlotKey,
  type VariantRefs,
} from '../pages/character-preview/classifier';

// ── Animation per-state playback speeds for single-clip models ─────────────────
const SINGLE_CLIP_SPEEDS: Partial<Record<FSMStateName, number>> = {
  idle:          0.5,
  walk:          1.5,
  run:           2.2,
  attack:        3.0,
  attack_heavy:  2.2,
  shoot:         2.8,
  ranged_attack: 1.8,
  dodge:         2.6,
  hit:           4.0,
  death:         0.4,
  phase_out:     2.0,
  phase_in:      2.0,
  rifle_idle:    0.45,
};

// ── Bone name patterns for right-hand detection ───────────────────────────────
const RIGHT_HAND_PATTERNS = [
  'righthand', 'hand_r', 'r_hand', 'wrist_r', 'bip_r_hand',
  'hand.r', 'mixamorigright', 'r_wrist', 'rhand', 'handright',
  'attach_r', 'weapon_r', 'weapon_right',
];

function findRightHandBone(scene: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  scene.traverse(obj => {
    if (found) return;
    const n = obj.name.toLowerCase().replace(/[\s-]/g, '_');
    if (RIGHT_HAND_PATTERNS.some(pat => n.endsWith(pat) || n === pat || n.includes(pat))) {
      if (obj instanceof THREE.Bone || obj.type === 'Bone' || obj.name.toLowerCase().includes('bone')) {
        found = obj;
      }
    }
  });
  return found;
}

// ── Rifle mesh builder ────────────────────────────────────────────────────────
function buildRifleMesh(): THREE.Group {
  const g      = new THREE.Group();
  const metal  = new THREE.MeshStandardMaterial({ color: 0x222830, roughness: 0.6, metalness: 0.85 });
  const wood   = new THREE.MeshStandardMaterial({ color: 0x1a1408, roughness: 0.9, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.4, metalness: 0.9 });

  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx;
    m.castShadow = false; g.add(m);
  };
  mk(new THREE.BoxGeometry(0.08, 0.07, 0.44), metal);
  mk(new THREE.CylinderGeometry(0.018, 0.015, 0.55, 8), accent, 0, 0, 0.45, Math.PI / 2);
  mk(new THREE.BoxGeometry(0.065, 0.055, 0.28), wood, 0, -0.02, -0.26);
  mk(new THREE.BoxGeometry(0.045, 0.12, 0.055), wood, 0, -0.08, -0.08);
  mk(new THREE.BoxGeometry(0.055, 0.09, 0.07),  wood, 0, -0.06, 0.18);
  mk(new THREE.BoxGeometry(0.038, 0.14, 0.055), metal, 0, -0.10, 0.02);
  mk(new THREE.BoxGeometry(0.06, 0.015, 0.30), accent, 0, 0.042, 0);
  mk(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8), wood,   0, 0.065, 0.02, Math.PI / 2);
  mk(new THREE.CylinderGeometry(0.028, 0.022, 0.035, 6), accent, 0, 0,    0.73, Math.PI / 2);
  return g;
}

// ── ToonCharacter ─────────────────────────────────────────────────────────────
export class ToonCharacter implements CharacterLike {
  group: THREE.Group;

  private animSys:  AnimationSystem;
  private fsm:      CharacterFSM;
  private _loaded   = false;
  private _singleClip = false;

  private _weaponMode: 'melee' | 'ranged' = 'melee';
  private _rifle:       THREE.Group;
  private _rifleMount:  THREE.Group;

  private _phaseAlpha    = 1.0;
  private _phaseTarget   = 1.0;
  private _phaseEmissive = 0.0;

  private _aimBlend = 0.0;
  private _t        = 0;

  // ── Weapon animation controller (ported from Unity weapon override controllers)
  private _weaponAnim: WeaponAnimController | null = null;
  private _basePath = '';

  // ── Equipment part-visibility system ─────────────────────────────────────
  // Shares the previewer's classifier so the in-game character renders
  // byte-for-byte identical to the character creator. Stores meshes (never
  // parent Object3D Groups) so we can never accidentally hide a Group
  // containing user-chosen meshes.
  private _refs: Record<SlotKey, VariantRefs[]> = emptySlots(() => []);
  private _selection: Record<SlotKey, Set<string>> = emptySlots(() => new Set());

  constructor(loaded: LoadedCharacter | null, fallbackColor = 0x3a6ea5) {
    this.group = new THREE.Group();

    this._rifle      = buildRifleMesh();
    this._rifleMount = new THREE.Group();
    this._rifleMount.add(this._rifle);
    this._rifleMount.visible = false;

    const mixer    = loaded ? loaded.mixer : new THREE.AnimationMixer(this.group);
    this.animSys   = new AnimationSystem(mixer);

    if (loaded) {
      this._loaded = true;
      this._normaliseMesh(loaded.scene);
      this.group.add(loaded.scene);
      this._setupEquipment(loaded.scene);
      this._setupAnimations(loaded);
      this._attachRifle(loaded.scene);
    } else {
      const fallback = this._buildFallback(fallbackColor);
      this.group.add(fallback);
      this._rifleMount.position.set(0.28, 0.82, 0.25);
      this.group.add(this._rifleMount);
    }

    this.fsm = new CharacterFSM(this.animSys);
  }

  // ── Animation setup ────────────────────────────────────────────────────────

  private _setupAnimations(loaded: LoadedCharacter) {
    const clips = loaded.clips;
    const durations = Object.values(clips).map(c => c.duration);
    this._singleClip = durations.length > 0 && durations.every(d => Math.abs(d - durations[0]) < 0.05);

    for (const [name, clip] of Object.entries(clips)) {
      const speed    = this._singleClip ? (SINGLE_CLIP_SPEEDS[name as FSMStateName] ?? 1.0) : 1.0;
      const isOneShot = ['attack','attack_heavy','shoot','ranged_attack','dodge','hit','death','phase_out','phase_in'].includes(name);
      this.animSys.register(name, clip, { loop: !isOneShot, timeScale: speed });
    }

    this._synthesiseMissingClips(clips);

    if (this.animSys.has('idle')) this.animSys.play('idle');
  }

  private _synthesiseMissingClips(clips: Record<string, THREE.AnimationClip>) {
    const baseAttack = clips['attack'];
    const baseIdle   = clips['idle'];

    const defs: Array<[FSMStateName, THREE.AnimationClip | undefined, number]> = [
      ['ranged_attack', baseAttack, SINGLE_CLIP_SPEEDS.ranged_attack ?? 1.8],
      ['shoot',         baseAttack, SINGLE_CLIP_SPEEDS.shoot         ?? 2.8],
      ['phase_out',     baseAttack, SINGLE_CLIP_SPEEDS.phase_out     ?? 2.0],
      ['phase_in',      baseAttack, SINGLE_CLIP_SPEEDS.phase_in      ?? 2.0],
      ['attack_heavy',  baseAttack, SINGLE_CLIP_SPEEDS.attack_heavy  ?? 2.2],
      ['hit',           baseIdle,   SINGLE_CLIP_SPEEDS.hit           ?? 4.0],
      ['rifle_idle',    baseIdle,   SINGLE_CLIP_SPEEDS.rifle_idle    ?? 0.45],
    ];

    for (const [name, base, speed] of defs) {
      if (!this.animSys.has(name) && base) {
        const c = base.clone(); c.name = name;
        const isOneShot = name !== 'rifle_idle';
        this.animSys.register(name, c, { loop: !isOneShot, timeScale: this._singleClip ? speed : 1.0 });
      }
    }
  }

  private _attachRifle(scene: THREE.Object3D) {
    const handBone = findRightHandBone(scene);
    if (handBone) {
      handBone.add(this._rifleMount);
      this._rifleMount.position.set(0, 0, 0.18);
      this._rifleMount.rotation.set(-Math.PI / 2, 0, 0);
      this._rifle.scale.setScalar(1.8);
    } else {
      scene.add(this._rifleMount);
      this._rifleMount.position.set(0.22, 0.75, 0.25);
      this._rifle.scale.setScalar(1.0);
    }
  }

  // ── Equipment part-visibility ─────────────────────────────────────────────
  // Shares `classifier.ts` with the editor previewer so this class and the
  // CharacterPreviewScene compute defaults and apply loadouts identically.

  /**
   * Catalog every variant mesh in the loaded scene and apply the previewer's
   * default selection (bare-skin body/arms/legs, first-face head, no
   * shoulderpads/weapon/shield/xtra). The output matches what the previewer
   * shows on first mount for the same race GLB.
   */
  private _setupEquipment(scene: THREE.Object3D) {
    this._refs = buildVariantRefs(scene);
    this._selection = defaultSelection(this._refs);
    applyVisibility(this._refs, this._selection);
  }

  /**
   * Change the visible variant for a slot.
   * @param slot     Slot name: 'head' | 'body' | 'arms' | 'legs' | 'weapon' | 'shield' | etc.
   * @param variantIndex  0-based index into the sorted variants of that slot.
   */
  setEquipmentSlot(slot: string, variantIndex: number) {
    const key = (slot === 'extra' ? 'xtra' : slot) as SlotKey;
    const refs = this._refs[key];
    if (!refs || refs.length === 0) return;
    const idx = Math.max(0, Math.min(variantIndex, refs.length - 1));
    this._selection[key] = new Set([refs[idx].variant]);
    applyVisibility(this._refs, this._selection);
  }

  /** Returns how many variants exist per slot (useful for UI). */
  get equipmentSlots(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const slot of ALL_SLOTS) out[slot] = this._refs[slot].length;
    return out;
  }

  /**
   * Apply a player-picked loadout from `CharacterPreviewScene`.
   *
   * `loadout` keys = slot names (`body`, `head`, `arms`, `legs`,
   * `shoulderpads`, `weapon`, `shield`, `xtra` / `extra`); values =
   * variant *letters* (e.g. `['A']`, `['A','D','G']` for stacked
   * face + beard + helmet on the head slot). An empty array hides
   * the slot entirely; a missing key keeps the existing selection.
   */
  applyLoadout(loadout: Record<string, string[]>) {
    const incoming = selectionFromLoadout(loadout);
    const overrides = loadoutSlotKeys(loadout);
    for (const slot of ALL_SLOTS) {
      if (overrides.has(slot)) this._selection[slot] = incoming[slot];
    }
    applyVisibility(this._refs, this._selection);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setWeaponMode(mode: 'melee' | 'ranged') {
    this._weaponMode = mode;
    this._rifleMount.visible = mode === 'ranged';
  }

  // ── Weapon Skills Controller (Unity animator override port) ────────────────

  /** Set the base path for loading weapon animation FBX files */
  setBasePath(basePath: string) {
    this._basePath = basePath;
  }

  /**
   * Switch weapon type — loads the weapon-specific animation pack.
   * Mirrors Unity's Animator Override Controller switching.
   * Call this when the player equips a new weapon.
   */
  async setWeaponType(type: WeaponType): Promise<boolean> {
    if (!this._weaponAnim) {
      this._weaponAnim = new WeaponAnimController(this.animSys, this._basePath);
    }
    return this._weaponAnim.setWeapon(type);
  }

  /**
   * Weapon-specific attack with combo chain (1→2→3, resets on timeout).
   * Use this instead of playAnimation('attack') for weapon combat.
   */
  weaponAttack(): string | null {
    if (this._weaponAnim) {
      return this._weaponAnim.attack();
    }
    this.fsm.setState('attack');
    return 'attack';
  }

  /** Weapon-specific heavy attack */
  weaponAttackHeavy(): string | null {
    if (this._weaponAnim) {
      return this._weaponAnim.attackHeavy();
    }
    this.fsm.setState('attack_heavy');
    return 'attack_heavy';
  }

  /** Weapon-specific block (hold/release) */
  weaponBlock(active: boolean) {
    if (this._weaponAnim) {
      this._weaponAnim.block(active);
    }
  }

  /** Weapon-specific cast (magic weapons) */
  weaponCast(area = false): string | null {
    if (this._weaponAnim) {
      return this._weaponAnim.cast(area);
    }
    this.fsm.setState('attack');
    return 'attack';
  }

  /** Draw weapon animation */
  weaponDraw() { this._weaponAnim?.draw(); }

  /** Sheath weapon animation */
  weaponSheath() { this._weaponAnim?.sheath(); }

  /** Power-up / buff activation animation */
  weaponPowerUp() { this._weaponAnim?.powerUp(); }

  /** Get the currently equipped weapon type */
  get weaponType(): WeaponType | null { return this._weaponAnim?.weapon ?? null; }

  /** Check if weapon attack combo is finished (for input buffering) */
  isWeaponAttackFinished(): boolean {
    return this._weaponAnim?.isAttackFinished() ?? true;
  }

  startPhaseOut() {
    this._phaseTarget   = 0.12;
    this._phaseEmissive = 3.5;
    this.fsm.setState('phase_out');
  }

  startPhaseIn() {
    this._phaseTarget   = 1.0;
    this._phaseEmissive = 0.0;
    this.fsm.setState('phase_in');
  }

  playAnimation(name: string, force = false) {
    const n = name as FSMStateName;
    if (force) this.fsm.forceState(n);
    else       this.fsm.setState(n);
  }

  isFinished(name: string): boolean {
    return this.animSys.isFinished(name, 0.9);
  }

  get currentAnimation(): string  { return this.fsm.state; }
  get hasRealModel():     boolean  { return this._loaded;   }
  get isSingleClipGltf(): boolean  { return this._singleClip; }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt: number) {
    this.animSys.update(dt);
    this.fsm.update(dt);
    this._updatePhase(dt);
    if (!this._loaded) this._proceduralUpdate(dt);
  }

  private _updatePhase(dt: number) {
    this._phaseAlpha += (this._phaseTarget - this._phaseAlpha) * Math.min(1, dt * 8);
    if (Math.abs(this._phaseAlpha - this._phaseTarget) < 0.001) this._phaseAlpha = this._phaseTarget;

    const alpha   = this._phaseAlpha;
    const phasing = alpha < 0.98;

    this.group.traverse(obj => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mats = Array.isArray((obj as THREE.Mesh).material)
        ? (obj as THREE.Mesh).material as THREE.Material[]
        : [(obj as THREE.Mesh).material as THREE.Material];
      mats.forEach(m => {
        const ms = m as THREE.MeshToonMaterial | THREE.MeshStandardMaterial;
        ms.transparent = phasing;
        ms.opacity     = alpha;
        if ((ms as any).emissive) {
          (ms as any).emissive.setHex(phasing ? 0x6699ff : 0x000000);
          (ms as any).emissiveIntensity = phasing ? this._phaseEmissive * (1 - alpha) * 2.5 : 0;
        }
      });
    });
  }

  private _proceduralUpdate(dt: number) {
    this._t += dt;
    const t   = this._t;
    const aim = this._weaponMode === 'ranged' ? 1.0 : 0.0;
    this._aimBlend += (aim - this._aimBlend) * Math.min(1, dt * 6);
    const a   = this._aimBlend;
    const ch  = (this.group.children[0] as THREE.Group)?.children ?? [];
    const state = this.fsm.state;

    if (state === 'idle' || state === 'rifle_idle') {
      this.group.position.y = Math.sin(t * 2) * 0.004;
      if (ch[8])  (ch[8] as THREE.Object3D).rotation.x = -a * 1.1 + Math.sin(t * 2) * 0.015;
      if (ch[9])  (ch[9] as THREE.Object3D).rotation.x = -a * 0.5;
      if (ch[3])  (ch[3] as THREE.Object3D).rotation.x = -a * 0.7;
      if (ch[4])  (ch[4] as THREE.Object3D).rotation.x = -a * 0.3;
    } else if (state === 'walk' || state === 'run') {
      const spd  = state === 'run' ? 1.8 : 1.0;
      const walk = Math.sin(t * 8 * spd);
      this.group.position.y = Math.abs(walk) * 0.012;
      if (ch[5])  (ch[5] as THREE.Object3D).rotation.x  =  walk * 0.4;
      if (ch[6])  (ch[6] as THREE.Object3D).rotation.x  = -walk * 0.35;
      if (ch[10]) (ch[10] as THREE.Object3D).rotation.x = -walk * 0.4;
      if (ch[11]) (ch[11] as THREE.Object3D).rotation.x =  walk * 0.35;
      if (ch[3])  (ch[3] as THREE.Object3D).rotation.x  = -walk * 0.3 - a * 0.9;
      if (ch[8])  (ch[8] as THREE.Object3D).rotation.x  =  walk * 0.3 - a * 1.1;
    } else if (state === 'attack' || state === 'attack_heavy') {
      const s = Math.min(1, this.animSys.getNormalisedTime(state) * 3);
      if (ch[8]) (ch[8] as THREE.Object3D).rotation.x = -s * 1.8;
      if (ch[9]) (ch[9] as THREE.Object3D).rotation.x = -s * 1.2;
    }
  }

  private _normaliseMesh(scene: THREE.Object3D) {
    scene.traverse(obj => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        (obj as THREE.SkinnedMesh).normalizeSkinWeights();
        (obj as THREE.SkinnedMesh).castShadow = true;
      }
    });
    // Scale by HEIGHT (Y) only — using max(x,y,z) caused T-pose models with wide
    // arms or long weapons to be squashed because width/weapon-length dominated.
    // Target ~1.8u tall (Souls-style adult human).
    const box = new THREE.Box3().setFromObject(scene);
    const sz  = box.getSize(new THREE.Vector3());
    const TARGET_H = 1.8;
    // 100x reduction (per user request: "change the 1 to .01") — gameplay
    // character was rendering 100x too big in Playground because the source
    // GLB ships in cm units and the SkinnedMesh bbox here measures the unposed
    // rest skeleton, so TARGET_H / sz.y was returning ~1 instead of ~0.01.
    if (sz.y > 0.001) scene.scale.setScalar((TARGET_H / sz.y) * 0.01);
    const box2 = new THREE.Box3().setFromObject(scene);
    const c    = box2.getCenter(new THREE.Vector3());
    scene.position.x -= c.x;
    scene.position.z -= c.z;
    scene.position.y -= box2.min.y;
  }

  private _buildFallback(color: number): THREE.Group {
    const g    = new THREE.Group();
    const mat  = new THREE.MeshToonMaterial({ color });
    const dark = new THREE.MeshToonMaterial({ color: new THREE.Color(color).multiplyScalar(0.55).getHex() });
    const skin = new THREE.MeshToonMaterial({ color: 0xd4a070 });
    const box  = (w: number, h: number, d: number, px: number, py: number, pz: number, m = mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(px, py, pz); mesh.castShadow = true; g.add(mesh); return mesh;
    };
    box(0.32, 0.32, 0.32, 0,      1.60, 0,     skin);
    box(0.40, 0.44, 0.28, 0,      1.20, 0);
    box(0.36, 0.20, 0.26, 0,      0.90, 0);
    box(0.14, 0.30, 0.14, -0.28,  1.20, 0);
    box(0.12, 0.28, 0.12, -0.28,  0.90, 0);
    box(0.16, 0.34, 0.16, -0.10,  0.63, 0, dark);
    box(0.14, 0.30, 0.14, -0.10,  0.30, 0, dark);
    box(0.15, 0.10, 0.22, -0.10,  0.08, 0.04, dark);
    box(0.14, 0.30, 0.14,  0.28,  1.20, 0);
    box(0.12, 0.28, 0.12,  0.28,  0.90, 0);
    box(0.16, 0.34, 0.16,  0.10,  0.63, 0, dark);
    box(0.14, 0.30, 0.14,  0.10,  0.30, 0, dark);
    box(0.15, 0.10, 0.22,  0.10,  0.08, 0.04, dark);
    return g;
  }
}
