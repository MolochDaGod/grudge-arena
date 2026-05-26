/**
 * WeaponAnimController — Weapon Skills Animator for Grudge Warlords
 *
 * Ported from the Unity uMMORPG weapon animator override controller system.
 * Maps each of the 17 Grudge weapon types to a set of animation clips,
 * loads them as Mixamo-retargeted FBX on demand, and exposes a state
 * machine that plugs into AnimationSystem for weapon-specific:
 *   - idle, walk, run (weapon-held locomotion)
 *   - attack chain (combo 1 → 2 → 3, resets on timeout)
 *   - block / block_idle
 *   - cast (magic weapon skills)
 *   - draw / sheath transitions
 *   - death (weapon-specific fall)
 *
 * Usage:
 *   const wac = new WeaponAnimController(animSystem, basePath);
 *   await wac.setWeapon('sword_shield');  // loads + registers clips
 *   wac.attack();                          // plays combo chain
 *   wac.block(true);                       // hold block
 */

import * as THREE from 'three';
import { AnimationSystem } from './AnimationSystem';
import { MixamoRetargeter } from './MixamoRetargeter';

// ── Weapon type IDs (matches ObjectStore weapon categories) ─────────────────

export type WeaponType =
  | 'sword_shield' | 'great_sword' | 'axe_1h' | 'axe_2h'
  | 'hammer_1h' | 'hammer_2h' | 'dagger' | 'spear'
  | 'staff' | 'magic_staff' | 'wand' | 'tome'
  | 'bow' | 'crossbow' | 'gun'
  | 'mace' | 'unarmed';

// ── Clip name conventions per weapon ────────────────────────────────────────

export type WeaponClipName =
  | 'w_idle' | 'w_walk' | 'w_run'
  | 'w_attack_1' | 'w_attack_2' | 'w_attack_3' | 'w_attack_heavy'
  | 'w_block' | 'w_block_idle'
  | 'w_cast' | 'w_cast_area'
  | 'w_draw' | 'w_sheath'
  | 'w_death' | 'w_power_up'
  | 'w_slash_1' | 'w_slash_2';

// ── FBX pack definitions — maps weapon type → files → clip names ────────────

interface WeaponPackDef {
  folder: string;
  files: Array<{ file: string; clip: WeaponClipName }>;
}

const WEAPON_PACKS: Partial<Record<WeaponType, WeaponPackDef>> = {
  sword_shield: {
    folder: 'weapons/sword_shield',
    files: [
      { file: 'Sword And Shield Attack.fbx',     clip: 'w_attack_1' },
      { file: 'Sword And Shield Attack (1).fbx', clip: 'w_attack_2' },
      { file: 'Sword And Shield Attack (2).fbx', clip: 'w_attack_3' },
      { file: 'Sword And Shield Slash.fbx',      clip: 'w_slash_1' },
      { file: 'Sword And Shield Slash (1).fbx',  clip: 'w_slash_2' },
      { file: 'Sword And Shield Casting.fbx',    clip: 'w_cast' },
      { file: 'Sword And Shield Power Up.fbx',   clip: 'w_power_up' },
    ],
  },
  great_sword: {
    folder: 'weapons/great_sword',
    files: [
      { file: 'Great Sword Slash.fbx',           clip: 'w_attack_1' },
      { file: 'Great Sword Slash (1).fbx',       clip: 'w_attack_2' },
      { file: '2H - Great Sword Slash.fbx',      clip: 'w_attack_heavy' },
      { file: '2H - Great Sword Idle.fbx',       clip: 'w_idle' },
      { file: '2H - Great Sword Idle 2.fbx',     clip: 'w_block_idle' },
      { file: '2H - Great Sword Run.fbx',        clip: 'w_run' },
    ],
  },
  magic_staff: {
    folder: 'weapons/magic',
    files: [
      { file: 'Standing 1H Cast Spell 01.fbx',        clip: 'w_cast' },
      { file: 'Standing 2H Cast Spell 01.fbx',        clip: 'w_cast_area' },
      { file: 'Standing 2H Magic Attack 01.fbx',      clip: 'w_attack_1' },
      { file: 'Standing 2H Magic Attack 03.fbx',      clip: 'w_attack_2' },
      { file: 'Standing 2H Magic Attack 04.fbx',      clip: 'w_attack_3' },
      { file: 'Standing 2H Magic Area Attack 01.fbx', clip: 'w_attack_heavy' },
      { file: 'Standing 2H Magic Area Attack 02.fbx', clip: 'w_power_up' },
      { file: 'Spell Casting.fbx',                    clip: 'w_draw' },
    ],
  },
};

// Aliases — weapons that share animation packs
const WEAPON_ALIASES: Partial<Record<WeaponType, WeaponType>> = {
  axe_1h: 'sword_shield',
  mace: 'sword_shield',
  hammer_1h: 'sword_shield',
  dagger: 'sword_shield',
  axe_2h: 'great_sword',
  hammer_2h: 'great_sword',
  spear: 'great_sword',
  staff: 'magic_staff',
  wand: 'magic_staff',
  tome: 'magic_staff',
};

// ── Combo chain config ──────────────────────────────────────────────────────

const COMBO_TIMEOUT_MS = 800; // ms between attacks before combo resets
const MAX_COMBO = 3;

// ── Controller ──────────────────────────────────────────────────────────────

export class WeaponAnimController {
  private anim: AnimationSystem;
  private basePath: string;
  private currentWeapon: WeaponType | null = null;
  private loadedPacks = new Map<WeaponType, Record<string, THREE.AnimationClip>>();
  private comboIndex = 0;
  private lastAttackTime = 0;
  private _blocking = false;

  constructor(animSystem: AnimationSystem, basePath = '') {
    this.anim = animSystem;
    this.basePath = basePath;
  }

  /** Currently equipped weapon type */
  get weapon(): WeaponType | null { return this.currentWeapon; }
  get isBlocking(): boolean { return this._blocking; }

  /**
   * Switch weapon — loads the FBX animation pack if not cached,
   * retargets to Bip001, registers clips with AnimationSystem.
   */
  async setWeapon(type: WeaponType): Promise<boolean> {
    const resolved = WEAPON_ALIASES[type] ?? type;

    // Already loaded?
    if (this.loadedPacks.has(resolved)) {
      this.currentWeapon = type;
      this._registerClips(resolved);
      return true;
    }

    const pack = WEAPON_PACKS[resolved];
    if (!pack) {
      console.warn(`[WeaponAnim] No pack defined for weapon: ${resolved}`);
      this.currentWeapon = type;
      return false;
    }

    // Load all FBX files in parallel, retarget to Bip001
    const clips: Record<string, THREE.AnimationClip> = {};
    const results = await Promise.allSettled(
      pack.files.map(async ({ file, clip }) => {
        const url = `${this.basePath}/models/${pack.folder}/${encodeURIComponent(file)}`;
        try {
          const loaded = await MixamoRetargeter.loadFBXClips(
            url, { '*': clip }, 'bip001',
          );
          if (loaded[clip]) clips[clip] = loaded[clip];
        } catch (err) {
          console.warn(`[WeaponAnim] Failed to load ${file}:`, (err as Error).message);
        }
      }),
    );

    const loadedCount = Object.keys(clips).length;
    console.log(`[WeaponAnim] ${resolved}: loaded ${loadedCount}/${pack.files.length} clips`);

    this.loadedPacks.set(resolved, clips);
    this.currentWeapon = type;
    this._registerClips(resolved);
    return loadedCount > 0;
  }

  /** Register weapon clips with the AnimationSystem */
  private _registerClips(resolved: WeaponType) {
    const clips = this.loadedPacks.get(resolved);
    if (!clips) return;

    const ONE_SHOT: WeaponClipName[] = [
      'w_attack_1', 'w_attack_2', 'w_attack_3', 'w_attack_heavy',
      'w_cast', 'w_cast_area', 'w_draw', 'w_sheath',
      'w_death', 'w_power_up', 'w_slash_1', 'w_slash_2',
    ];

    for (const [name, clip] of Object.entries(clips)) {
      const isOneShot = ONE_SHOT.includes(name as WeaponClipName);
      this.anim.register(name, clip, { loop: !isOneShot });
    }
  }

  /**
   * Trigger an attack — advances the combo chain.
   * Call this on left-click / attack input.
   * Returns the clip name that was played.
   */
  attack(): WeaponClipName | null {
    const now = Date.now();

    // Reset combo if too much time passed
    if (now - this.lastAttackTime > COMBO_TIMEOUT_MS) {
      this.comboIndex = 0;
    }

    this.comboIndex++;
    if (this.comboIndex > MAX_COMBO) this.comboIndex = 1;
    this.lastAttackTime = now;

    // Try weapon-specific attack first, then fall back
    const clipName = `w_attack_${this.comboIndex}` as WeaponClipName;
    if (this.anim.has(clipName)) {
      this.anim.to(clipName, 0.06);
      return clipName;
    }

    // Fallback: try w_slash variants
    const slashName = `w_slash_${this.comboIndex}` as WeaponClipName;
    if (this.anim.has(slashName)) {
      this.anim.to(slashName, 0.06);
      return slashName;
    }

    // Last resort: use generic attack from base FSM
    if (this.anim.has('attack')) {
      this.anim.to('attack', 0.06);
      return 'w_attack_1';
    }

    return null;
  }

  /** Heavy attack (hold attack input) */
  attackHeavy(): WeaponClipName | null {
    if (this.anim.has('w_attack_heavy')) {
      this.anim.to('w_attack_heavy', 0.08);
      return 'w_attack_heavy';
    }
    if (this.anim.has('attack_heavy')) {
      this.anim.to('attack_heavy', 0.08);
      return 'w_attack_heavy';
    }
    return null;
  }

  /** Start/stop blocking */
  block(active: boolean) {
    this._blocking = active;
    if (active) {
      const clip = this.anim.has('w_block') ? 'w_block' : 'w_block_idle';
      if (this.anim.has(clip)) this.anim.to(clip, 0.1);
    } else {
      // Return to weapon idle or base idle
      const idle = this.anim.has('w_idle') ? 'w_idle' : 'idle';
      this.anim.to(idle, 0.15);
    }
  }

  /** Cast a spell (magic weapons) */
  cast(area = false): WeaponClipName | null {
    const clip = area ? 'w_cast_area' : 'w_cast';
    if (this.anim.has(clip)) {
      this.anim.to(clip, 0.06);
      return clip;
    }
    return this.attack(); // fallback to attack combo
  }

  /** Draw weapon */
  draw() {
    if (this.anim.has('w_draw')) this.anim.to('w_draw', 0.15);
  }

  /** Sheath weapon */
  sheath() {
    if (this.anim.has('w_sheath')) this.anim.to('w_sheath', 0.15);
  }

  /** Power-up animation (e.g. buff activation) */
  powerUp() {
    if (this.anim.has('w_power_up')) this.anim.to('w_power_up', 0.1);
  }

  /** Weapon-specific idle (falls back to base idle) */
  idle() {
    const clip = this.anim.has('w_idle') ? 'w_idle' : 'idle';
    this.anim.to(clip, 0.2);
  }

  /** Weapon-specific run (falls back to base run) */
  run() {
    const clip = this.anim.has('w_run') ? 'w_run' : this.anim.has('run') ? 'run' : 'walk';
    this.anim.toSync(clip, 0.2);
  }

  /** Reset combo chain */
  resetCombo() {
    this.comboIndex = 0;
  }

  /** Check if the current attack animation has finished */
  isAttackFinished(): boolean {
    const clip = `w_attack_${this.comboIndex}` as WeaponClipName;
    return this.anim.isFinished(clip) && this.anim.isFinished('w_slash_1');
  }

  /** Get all loaded clip names for the current weapon */
  getLoadedClips(): string[] {
    const resolved = this.currentWeapon ? (WEAPON_ALIASES[this.currentWeapon] ?? this.currentWeapon) : null;
    if (!resolved) return [];
    const clips = this.loadedPacks.get(resolved);
    return clips ? Object.keys(clips) : [];
  }
}
