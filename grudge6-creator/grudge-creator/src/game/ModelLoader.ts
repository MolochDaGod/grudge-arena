import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MixamoRetargeter } from './MixamoRetargeter';

export interface LoadedCharacter {
  scene: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Record<string, THREE.AnimationClip>;
  skeleton: THREE.Skeleton | null;
}

export interface AnimClips {
  idle:           THREE.AnimationClip | null;
  walk:           THREE.AnimationClip | null;
  attack:         THREE.AnimationClip | null;
  attack_heavy:   THREE.AnimationClip | null;
  death:          THREE.AnimationClip | null;
  // Mixamo-sourced additions (Action Adventure pack)
  run:            THREE.AnimationClip | null;
  dodge:          THREE.AnimationClip | null;
  hit:            THREE.AnimationClip | null;
  jump:           THREE.AnimationClip | null;
  fall:           THREE.AnimationClip | null;
  // Standing motion / weapon-specific additions
  walk_back:      THREE.AnimationClip | null;
  run_back:       THREE.AnimationClip | null;
  turn_left:      THREE.AnimationClip | null;
  turn_right:     THREE.AnimationClip | null;
  react_small:    THREE.AnimationClip | null;
  react_large:    THREE.AnimationClip | null;
  death_backward: THREE.AnimationClip | null;
  magic_1h_attack: THREE.AnimationClip | null;
  magic_2h_area:   THREE.AnimationClip | null;
  // Strafe locomotion (A/D side-step + walking variants)
  strafe_left:       THREE.AnimationClip | null;
  strafe_right:      THREE.AnimationClip | null;
  strafe_walk_left:  THREE.AnimationClip | null;
  strafe_walk_right: THREE.AnimationClip | null;
}

// All in-game-loadable race IDs. The 6 textured Synty Toon RTS GLBs.
export const RACE_IDS = ['human', 'dwarf', 'orc', 'undead', 'elf', 'barbarian'] as const;
export type RaceId = typeof RACE_IDS[number];

// Legacy codename → race ID alias. Lets enemy faction codenames (wk/ud/orc/brb)
// keep working while the loader internally resolves to the textured race files.
const RACE_ALIAS: Record<string, RaceId> = {
  wk:    'human',
  ud:    'undead',
  brb:   'dwarf',
  orc:   'orc',
  beast: 'orc',
  human: 'human', dwarf: 'dwarf', undead: 'undead',
  elf: 'elf', barbarian: 'barbarian',
  // Back-compat aliases for any old saves / configs
  high_elf: 'elf', demon: 'barbarian',
};

export type ModelKey = RaceId | 'wk' | 'ud' | 'brb' | 'beast' | 'eternal_knight';

interface ModelAssets {
  characters: Partial<Record<RaceId, THREE.Group>>;
  boss_nightmare_scene: THREE.Group | null;
  boss_nightmare_anims: THREE.AnimationClip[];
  boss_guardian_scene:  THREE.Group | null;
  boss_guardian_anims:  THREE.AnimationClip[];
  eternalknight: THREE.Group | null;
  eternalknightAnims: THREE.AnimationClip[];
  portalgate: THREE.Group | null;
  portalgateMixer: THREE.AnimationMixer | null;
  portalGateAnims: THREE.AnimationClip[];
  anims: AnimClips;
  loaded: boolean;
  loadErrors: string[];
}

// Per-race tint applied multiplicatively over the GLB texture atlas so different
// races still read distinct under the same shared Toon RTS atlas.
const TOON_COLORS: Record<RaceId, { body: number; head: number; detail: number }> = {
  human:    { body: 0xc8b89a, head: 0xf0d0b0, detail: 0xc8a050 },
  dwarf:    { body: 0xb88560, head: 0xe0a080, detail: 0x704020 },
  orc:      { body: 0x6a8a3a, head: 0x4a7830, detail: 0x8a5020 },
  undead:   { body: 0x9a88c8, head: 0xc8b898, detail: 0x886644 },
  elf:       { body: 0x9ad0e0, head: 0xf0d8b8, detail: 0xa8c8e0 },
  barbarian: { body: 0xc83838, head: 0xe05a3a, detail: 0x602010 },
};

function resolveRace(key: string): RaceId {
  return RACE_ALIAS[key] ?? 'human';
}

// Playback speed per animation state for single-clip GLTF characters
const SINGLE_CLIP_SPEEDS: Record<string, number> = {
  idle: 0.5, walk: 1.4, attack: 2.8, death: 0.35, dodge: 2.2,
};

// ── Mixamo Action Adventure Pack — FBX file → game clip name map ──────────────
// Files live in public/models/mixamo/ and are served by Vite.
const MIXAMO_PACK: Array<{ file: string; name: keyof AnimClips }> = [
  { file: 'idle.fbx',              name: 'idle'  },
  { file: 'walking.fbx',           name: 'walk'  },
  { file: 'running.fbx',           name: 'run'   },
  { file: 'falling to roll.fbx',   name: 'dodge' },
  { file: 'hard landing.fbx',      name: 'hit'   },
  { file: 'jumping up.fbx',        name: 'jump'  },
  { file: 'falling idle.fbx',      name: 'fall'  },
  // Standing motion + weapon-specific additions
  { file: 'walk_back.fbx',         name: 'walk_back'       },
  { file: 'run_back.fbx',          name: 'run_back'        },
  { file: 'turn_left.fbx',         name: 'turn_left'       },
  { file: 'turn_right.fbx',        name: 'turn_right'      },
  { file: 'react_small.fbx',       name: 'react_small'     },
  { file: 'react_large.fbx',       name: 'react_large'     },
  { file: 'death_backward.fbx',    name: 'death_backward'  },
  { file: 'magic_1h_attack.fbx',   name: 'magic_1h_attack' },
  { file: 'magic_2h_area.fbx',     name: 'magic_2h_area'   },
  { file: 'strafe_left.fbx',        name: 'strafe_left'        },
  { file: 'strafe_right.fbx',       name: 'strafe_right'       },
  { file: 'strafe_walk_left.fbx',   name: 'strafe_walk_left'   },
  { file: 'strafe_walk_right.fbx',  name: 'strafe_walk_right'  },
];

class ModelLoaderSingleton {
  private gltfLoader = new GLTFLoader();
  public assets: ModelAssets = {
    characters: {},
    boss_nightmare_scene: null, boss_nightmare_anims: [],
    boss_guardian_scene: null,  boss_guardian_anims: [],
    eternalknight: null, eternalknightAnims: [],
    portalgate: null, portalgateMixer: null, portalGateAnims: [],
    anims: {
      idle: null, walk: null, attack: null, attack_heavy: null, death: null,
      run: null, dodge: null, hit: null, jump: null, fall: null,
      walk_back: null, run_back: null, turn_left: null, turn_right: null,
      react_small: null, react_large: null, death_backward: null,
      magic_1h_attack: null, magic_2h_area: null,
      strafe_left: null, strafe_right: null,
      strafe_walk_left: null, strafe_walk_right: null,
    },
    loaded: false,
    loadErrors: [],
  };

  /** Public access for callers that want to surface load errors in the UI. */
  get assetsRef(): ModelAssets { return this.assets; }

  /** Try to load a GLTF/GLB url, retrying once on failure. Records the URL in
   *  loadErrors if both attempts fail and returns null. */
  private async loadGltfWithRetry(url: string, label: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await this.gltfLoader.loadAsync(url);
        return r;
      } catch (err) {
        if (attempt === 0) {
          console.warn(`[ModelLoader] ${label} attempt 1 failed, retrying:`, (err as Error)?.message ?? err);
          await new Promise(r => setTimeout(r, 200));
        } else {
          console.error(`[ModelLoader] ${label} failed after retry:`, (err as Error)?.message ?? err);
          this.assets.loadErrors.push(label);
        }
      }
    }
    return null;
  }
  private loadPromise: Promise<ModelAssets> | null = null;

  async loadAll(basePath = ''): Promise<ModelAssets> {
    if (this.assets.loaded) return this.assets;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this._doLoad(basePath);
    return this.loadPromise;
  }

  private async _doLoad(basePath: string): Promise<ModelAssets> {
    const b = basePath || '';

    // Race characters: load 6 TEXTURED FBX2glTF GLBs from toon_rts/characters
    // (the previous wk/ud/orc/brb GLBs in /glb/ were exported by THREE.GLTFExporter
    //  with zero textures — these are the texture-bearing source files).
    const raceLoads = await Promise.all(RACE_IDS.map(r =>
      this.loadGltfWithRetry(`${b}/models/toon_rts/characters/${r}.glb`, `race:${r}`)
    ));
    RACE_IDS.forEach((race, i) => {
      const g = raceLoads[i];
      if (g) this.assets.characters[race] = g.scene;
    });

    const [glbAnims, mixamoAnims, knightGltf, portalGltf, nightmareGltf, guardianGltf] =
      await Promise.allSettled([
        this.loadGLBAnims(b),
        this.loadMixamoPack(b),
        this.gltfLoader.loadAsync(`${b}/models/gltf/eternal_knight/scene.gltf`),
        this.gltfLoader.loadAsync(`${b}/models/gltf/portal_gate/scene.gltf`),
        this.gltfLoader.loadAsync(`${b}/models/bosses/boss_nightmare/scene.gltf`),
        this.gltfLoader.loadAsync(`${b}/models/bosses/boss_guardian/scene.gltf`),
      ]);

    // Merge GLB clips (attack, death) + Mixamo clips (idle, walk, run, dodge, hit, jump, fall)
    const glb_a = glbAnims.status  === 'fulfilled' ? glbAnims.value  : null;
    const mxa   = mixamoAnims.status === 'fulfilled' ? mixamoAnims.value : null;

    this.assets.anims = {
      // ── Native Bip001 GLBs win for every state they cover ────────────────
      // The toon_rts character GLBs have a Bip001 Pelvis with a 90° rest-pose
      // rotation (3ds Max Z-up → glTF Y-up fixup baked into the bind matrix).
      // The Mixamo retargeter only renames track names — it doesn't recompose
      // bone orientations through differing rest poses — so a Mixamo Hips
      // quaternion pasted straight onto Bip001_Pelvis flops the character
      // sideways.  The anim_*.glb files were authored against THIS skeleton
      // (same bone names, same bind pose, same Bone_bag/Bone_wood weapon
      // attach points), so they play perfectly with no retargeting.
      // Mixamo clips are kept ONLY as fallback for states the native GLBs
      // don't cover (run, dodge, hit, jump, …).
      idle:            glb_a?.idle          ?? mxa?.idle          ?? null,
      walk:            glb_a?.walk          ?? mxa?.walk          ?? null,
      attack:          glb_a?.attack                              ?? null,
      attack_heavy:    glb_a?.attack_heavy                        ?? null,
      death:           glb_a?.death                               ?? null,
      // Mixamo-only additions (not in existing GLB anim library)
      run:             mxa?.run             ?? null,
      dodge:           mxa?.dodge           ?? null,
      hit:             mxa?.hit             ?? null,
      jump:            mxa?.jump            ?? null,
      fall:            mxa?.fall            ?? null,
      // Standing motion + weapon-specific
      walk_back:       mxa?.walk_back       ?? null,
      run_back:        mxa?.run_back        ?? null,
      turn_left:       mxa?.turn_left       ?? null,
      turn_right:      mxa?.turn_right      ?? null,
      react_small:     mxa?.react_small     ?? null,
      react_large:     mxa?.react_large     ?? null,
      death_backward:  mxa?.death_backward  ?? null,
      magic_1h_attack: mxa?.magic_1h_attack ?? null,
      magic_2h_area:   mxa?.magic_2h_area   ?? null,
      strafe_left:        mxa?.strafe_left        ?? null,
      strafe_right:       mxa?.strafe_right       ?? null,
      strafe_walk_left:   mxa?.strafe_walk_left   ?? null,
      strafe_walk_right:  mxa?.strafe_walk_right  ?? null,
    };

    // Eternal Knight — keep original PBR materials
    if (knightGltf.status === 'fulfilled') {
      const gltf = knightGltf.value;
      this.assets.eternalknight = gltf.scene;
      this.assets.eternalknightAnims = gltf.animations;
      console.log(`[ModelLoader] Eternal Knight loaded, animations: ${gltf.animations.map(a => a.name).join(', ')}`);
    }

    // Portal Gate — keep emissive materials, store animations separately
    if (portalGltf.status === 'fulfilled') {
      const gltf = portalGltf.value;
      this.assets.portalgate = gltf.scene;
      this.assets.portalGateAnims = gltf.animations;
      console.log(`[ModelLoader] Portal Gate loaded, animations: ${gltf.animations.map(a => a.name).join(', ')}`);
    }

    // Boss Nightmare (665 KB) — spectral shadow boss with 7 animations
    if (nightmareGltf.status === 'fulfilled') {
      const gltf = nightmareGltf.value;
      this.assets.boss_nightmare_scene = gltf.scene;
      this.assets.boss_nightmare_anims = gltf.animations;
      console.log(`[ModelLoader] Boss Nightmare loaded, animations: ${gltf.animations.map(a => a.name).join(', ')}`);
    } else {
      console.warn('[ModelLoader] Boss Nightmare failed to load:', (nightmareGltf as PromiseRejectedResult).reason);
    }

    // Boss Guardian (14 MB) — ancient stone colossus with entrance animation
    if (guardianGltf.status === 'fulfilled') {
      const gltf = guardianGltf.value;
      this.assets.boss_guardian_scene = gltf.scene;
      this.assets.boss_guardian_anims = gltf.animations;
      console.log(`[ModelLoader] Boss Guardian loaded, animations: ${gltf.animations.map(a => a.name).join(', ')}`);
    } else {
      console.warn('[ModelLoader] Boss Guardian failed to load:', (guardianGltf as PromiseRejectedResult).reason);
    }

    this.assets.loaded = true;
    const a = this.assets.anims;
    const c = this.assets.characters;
    console.log('[ModelLoader] All assets loaded:', {
      human: !!c.human, dwarf: !!c.dwarf, orc: !!c.orc,
      undead: !!c.undead, elf: !!c.elf, barbarian: !!c.barbarian,
      knight: !!this.assets.eternalknight, portal: !!this.assets.portalgate,
      idle: !!a.idle, walk: !!a.walk, run: !!a.run,
      attack: !!a.attack, death: !!a.death,
      dodge: !!a.dodge, hit: !!a.hit, jump: !!a.jump, fall: !!a.fall,
      walk_back: !!a.walk_back, run_back: !!a.run_back,
      turn_left: !!a.turn_left, turn_right: !!a.turn_right,
      react_small: !!a.react_small, react_large: !!a.react_large,
      death_backward: !!a.death_backward,
      magic_1h_attack: !!a.magic_1h_attack, magic_2h_area: !!a.magic_2h_area,
      strafe_left: !!a.strafe_left, strafe_right: !!a.strafe_right,
      strafe_walk_left: !!a.strafe_walk_left, strafe_walk_right: !!a.strafe_walk_right,
    });
    return this.assets;
  }

  /** Load existing baked GLB animations (attack, death, walk, idle fallback). */
  private async loadGLBAnims(base: string): Promise<Partial<AnimClips>> {
    const glb = `${base}/models/glb`;
    const [idleR, walkR, attackR, attackHeavyR, deathR] = await Promise.allSettled([
      this.gltfLoader.loadAsync(`${glb}/anim_idle.glb`),
      this.gltfLoader.loadAsync(`${glb}/anim_walk.glb`),
      this.gltfLoader.loadAsync(`${glb}/anim_attack.glb`),
      this.gltfLoader.loadAsync(`${glb}/anim_attack_heavy.glb`),
      this.gltfLoader.loadAsync(`${glb}/anim_death.glb`),
    ]);
    return {
      idle:         this.firstClip(idleR,        'idle'),
      walk:         this.firstClip(walkR,        'walk'),
      attack:       this.firstClip(attackR,      'attack'),
      attack_heavy: this.firstClip(attackHeavyR, 'attack_heavy'),
      death:        this.firstClip(deathR,       'death'),
    };
  }

  /**
   * Load Mixamo Action Adventure Pack FBX files and retarget them to Bip001.
   * Each file is one animation — loaded in parallel via Promise.allSettled so
   * partial failures don't block the rest.
   */
  private async loadMixamoPack(base: string): Promise<Partial<AnimClips>> {
    const mixamoBase = `${base}/models/mixamo`;

    const results = await Promise.allSettled(
      MIXAMO_PACK.map(async ({ file, name }) => {
        const url = `${mixamoBase}/${encodeURIComponent(file)}`;
        const clips = await MixamoRetargeter.loadFBXClips(url, { '*': name }, 'bip001');
        return { name, clip: clips[name] ?? null };
      }),
    );

    const anims: Partial<AnimClips> = {};
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.clip) {
        anims[r.value.name] = r.value.clip;
      } else if (r.status === 'rejected') {
        console.warn('[ModelLoader] Mixamo FBX load failed:', r.reason?.message ?? r.reason);
      }
    }

    const loaded = Object.entries(anims)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
    console.log(`[ModelLoader] Mixamo pack loaded: [${loaded.join(', ')}]`);
    return anims;
  }

  /**
   * Public on-demand loader for the Synty Locomotion Pack — the 8 humanoid
   * locomotion FBX clips in `public/models/synty/`. Retargets the Synty source
   * skeleton onto Bip001 so the resulting clips bind to all 6 Toon RTS races.
   *
   * NOT auto-loaded by `loadAll()` to avoid bloating the cold-start path; call
   * this from any consumer that wants the extra clips (Splash, Builder, etc.).
   * Returns an object keyed by `synty_<state>` so the names don't collide with
   * the existing `idle`/`walk`/`attack`/`death`/`attack_heavy` AnimClips.
   */
  async loadSyntyPack(base = ''): Promise<Record<string, THREE.AnimationClip>> {
    const syntyBase = `${base}/models/synty`;
    const files: Array<{ url: string; name: string }> = [
      { url: `${syntyBase}/idle.fbx`,      name: 'synty_idle'      },
      { url: `${syntyBase}/walk.fbx`,      name: 'synty_walk'      },
      { url: `${syntyBase}/walk_land.fbx`, name: 'synty_walk_land' },
      { url: `${syntyBase}/run.fbx`,       name: 'synty_run'       },
      { url: `${syntyBase}/run_land.fbx`,  name: 'synty_run_land'  },
      { url: `${syntyBase}/run_back.fbx`,  name: 'synty_run_back'  },
      { url: `${syntyBase}/jump.fbx`,      name: 'synty_jump'      },
      { url: `${syntyBase}/in_air.fbx`,    name: 'synty_in_air'    },
    ];
    return MixamoRetargeter.loadSyntyFBXBatch(files, 'bip001');
  }

  private firstClip(
    res: PromiseSettledResult<{ animations: THREE.AnimationClip[] }>,
    name: string,
  ): THREE.AnimationClip | null {
    if (res.status !== 'fulfilled') return null;
    const clips = res.value.animations;
    if (!clips?.length) return null;
    const clip = clips[0].clone();
    clip.name = name;
    return clip;
  }

  /** Clone and prepare a character from assets. Returns null if not loaded. */
  cloneCharacter(type: ModelKey): LoadedCharacter | null {
    // ── Eternal Knight — GLTF with PBR textures + single-clip animation ──
    if (type === 'eternal_knight') {
      if (!this.assets.eternalknight) return null;
      const scene = cloneSkinned(this.assets.eternalknight) as THREE.Group;
      scene.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
          (obj as THREE.SkinnedMesh).normalizeSkinWeights();
        }
      });
      const mixer = new THREE.AnimationMixer(scene);
      const clips: Record<string, THREE.AnimationClip> = {};
      const base = this.assets.eternalknightAnims[0];
      if (base) {
        for (const state of ['idle', 'walk', 'attack', 'death', 'dodge'] as const) {
          const cloned = base.clone();
          cloned.name = state;
          clips[state] = cloned;
        }
      }
      let skeleton: THREE.Skeleton | null = null;
      scene.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
          skeleton = (obj as THREE.SkinnedMesh).skeleton;
        }
      });
      return { scene, mixer, clips, skeleton };
    }

    // ── Toon RTS characters (textured skeleton+mesh, per-race tint) ──
    const race: RaceId = resolveRace(type);
    const sourceGroup = this.assets.characters[race];
    if (!sourceGroup) return null;

    const scene = cloneSkinned(sourceGroup) as THREE.Group;
    // FBX2glTF preserves Bip001 bone names with SPACES (e.g. "Bip001 Pelvis"),
    // but our Mixamo-retargeted clips bind to the UNDERSCORE form (Bip001_Pelvis).
    // Normalize on every clone so animation tracks resolve.
    scene.traverse(obj => { obj.name = obj.name.replace(/ /g, '_'); });
    // Re-apply SkinnedMesh bind poses + preserve the original textured materials
    // (cloned per-instance so each character can flash emissive independently for
    // the phase-in shader, without affecting other clones).
    const tint = TOON_COLORS[race];
    scene.traverse(obj => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        (mesh as THREE.SkinnedMesh).normalizeSkinWeights();
      }
      mesh.material = cloneMaterialPreservingTextures(mesh.material, tint);
    });

    const mixer = new THREE.AnimationMixer(scene);
    const { anims } = this.assets;

    // Find this clone's actual skeleton so we can prune animation tracks that
    // reference bones the GLB doesn't have (Bip001_*_Finger1/11/12 etc).
    let skeleton: THREE.Skeleton | null = null;
    scene.traverse(obj => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
        skeleton = (obj as THREE.SkinnedMesh).skeleton;
      }
    });
    const boneNames = new Set<string>(
      skeleton ? (skeleton as THREE.Skeleton).bones.map(b => b.name) : [],
    );

    // Build clip map from all available animations.  Each clip is cloned
    // per-instance and pruned against this skeleton's bones so animation
    // bindings actually resolve at runtime.
    const clips: Record<string, THREE.AnimationClip> = {};
    const animKeys: Array<keyof AnimClips> = [
      'idle', 'walk', 'run', 'attack', 'attack_heavy', 'death', 'dodge', 'hit', 'jump', 'fall',
      'walk_back', 'run_back', 'turn_left', 'turn_right',
      'react_small', 'react_large', 'death_backward',
      'magic_1h_attack', 'magic_2h_area',
      'strafe_left', 'strafe_right', 'strafe_walk_left', 'strafe_walk_right',
    ];
    for (const key of animKeys) {
      const src = anims[key];
      if (!src) continue;
      clips[key] = pruneClipToSkeleton(src.clone(), boneNames);
    }

    return { scene, mixer, clips, skeleton };
  }

  /**
   * Clone a boss character from its dedicated GLTF asset.
   * Maps model-specific animation names → standard engine state names.
   */
  cloneBossCharacter(type: 'nightmare_herald' | 'rock_guardian'): LoadedCharacter | null {
    if (type === 'nightmare_herald') {
      const src = this.assets.boss_nightmare_scene;
      if (!src) return null;
      const scene = cloneSkinned(src) as THREE.Group;
      scene.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
          (obj as THREE.SkinnedMesh).normalizeSkinWeights();
          const mesh = obj as THREE.SkinnedMesh;
          mesh.castShadow = true;
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(m => (m as THREE.MeshStandardMaterial).clone());
          } else {
            mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
          }
        }
      });
      const mixer = new THREE.AnimationMixer(scene);
      const rawAnims = this.assets.boss_nightmare_anims;
      // Map GLTF animation names → engine state names
      const nameMap: Record<string, string> = {
        'Idle':      'idle',
        'Caminando': 'walk',
        'Ataque':    'attack',
        'Ataque2':   'attack_heavy',
        'Poder':     'hit',
        'Victoria':  'death',
      };
      const clips: Record<string, THREE.AnimationClip> = {};
      for (const raw of rawAnims) {
        const mapped = nameMap[raw.name];
        if (mapped) {
          const c = raw.clone();
          c.name = mapped;
          clips[mapped] = c;
        }
      }
      // Fill missing states with best fallback
      if (!clips['walk'])         clips['walk']         = clips['idle']  ?? rawAnims[0]?.clone();
      if (!clips['attack_heavy']) clips['attack_heavy'] = clips['attack'] ?? rawAnims[0]?.clone();
      if (!clips['death'])        clips['death']        = rawAnims[0]?.clone();
      let skeleton: THREE.Skeleton | null = null;
      scene.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton)
          skeleton = (obj as THREE.SkinnedMesh).skeleton;
      });
      return { scene, mixer, clips, skeleton };
    }

    if (type === 'rock_guardian') {
      const src = this.assets.boss_guardian_scene;
      if (!src) return null;
      const scene = cloneSkinned(src) as THREE.Group;
      scene.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
          (obj as THREE.SkinnedMesh).normalizeSkinWeights();
          (obj as THREE.Mesh).castShadow = true;
        }
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).castShadow = true;
          (obj as THREE.Mesh).receiveShadow = true;
        }
      });
      const mixer = new THREE.AnimationMixer(scene);
      // Single animation (Entrance Animation) — reused for all states
      const clips: Record<string, THREE.AnimationClip> = {};
      const rawAnims = this.assets.boss_guardian_anims;
      if (rawAnims.length > 0) {
        const base = rawAnims[0];
        for (const state of ['idle', 'walk', 'attack', 'attack_heavy', 'death', 'hit'] as const) {
          const c = base.clone();
          c.name = state;
          clips[state] = c;
        }
      }
      let skeleton: THREE.Skeleton | null = null;
      scene.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton)
          skeleton = (obj as THREE.SkinnedMesh).skeleton;
      });
      return { scene, mixer, clips, skeleton };
    }

    return null;
  }

  /** Get a clone of the portal gate scene + its active mixer (for update loop). */
  clonePortalGate(): { scene: THREE.Group; mixer: THREE.AnimationMixer } | null {
    if (!this.assets.portalgate) return null;
    const scene = this.assets.portalgate.clone(true);
    scene.traverse(obj => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = false;
        m.receiveShadow = false;
        const mat = Array.isArray(m.material) ? m.material : [m.material];
        mat.forEach(mt => {
          const pbr = mt as THREE.MeshStandardMaterial;
          if (pbr.emissive) {
            pbr.emissiveIntensity = 2.5;
            pbr.toneMapped = false;
          }
        });
      }
    });
    const mixer = new THREE.AnimationMixer(scene);
    const portalAnims = this.assets.portalGateAnims;
    if (portalAnims.length > 0) {
      const a = mixer.clipAction(portalAnims[0]);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
    }
    return { scene, mixer };
  }

  /** Per-state playback speed for single-clip GLTF characters */
  static getSingleClipSpeed(state: string): number {
    return SINGLE_CLIP_SPEEDS[state] ?? 1.0;
  }

  get isLoaded() { return this.assets.loaded; }
  get hasEternalKnight() { return !!this.assets.eternalknight; }
  get hasPortalGate() { return !!this.assets.portalgate; }
  get hasBossNightmare() { return !!this.assets.boss_nightmare_scene; }
  get hasBossGuardian()  { return !!this.assets.boss_guardian_scene; }
}

/**
 * Drop animation tracks whose target bone isn't present in the given
 * skeleton.  This silences the THREE.PropertyBinding warnings when
 * Mixamo-retargeted clips reference fingers / nub bones that the GLB
 * skeleton doesn't have, and removes wasted runtime work.
 *
 * Track names look like "Bip001_L_Finger1.quaternion" — we only check the
 * bone-name portion (everything before the last dot).
 */
function pruneClipToSkeleton(
  clip: THREE.AnimationClip,
  boneNames: Set<string>,
): THREE.AnimationClip {
  if (boneNames.size === 0) return clip;
  clip.tracks = clip.tracks.filter(t => {
    const dot = t.name.lastIndexOf('.');
    const bone = dot >= 0 ? t.name.slice(0, dot) : t.name;
    return boneNames.has(bone);
  });
  return clip;
}

/**
 * Clone a mesh's material(s) per-instance and preserve all baked textures
 * (map, normalMap, roughnessMap, etc).  A subtle multiplicative tint is
 * applied to the diffuse colour so different character types still read as
 * visually distinct (e.g. red player vs grey enemy) without flattening the
 * underlying texture detail.
 *
 * Per-instance cloning is required so the phase-in shader's emissive flash
 * on one character doesn't leak into every other character that shares the
 * same source GLB.
 */
function cloneMaterialPreservingTextures(
  material: THREE.Material | THREE.Material[],
  tint: { body: number; head: number; detail: number },
): THREE.Material | THREE.Material[] {
  const clone = (m: THREE.Material): THREE.Material => {
    const c = m.clone();
    // Subtle tint blend — keep texture detail, just bias the colour.
    const std = c as THREE.MeshStandardMaterial;
    if (std.color && std.map) {
      std.color.lerp(new THREE.Color(tint.body), 0.25);
    } else if (std.color) {
      std.color.set(tint.body);
    }
    return c;
  };
  return Array.isArray(material) ? material.map(clone) : clone(material);
}

export const modelLoader = new ModelLoaderSingleton();
