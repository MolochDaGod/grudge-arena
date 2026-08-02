# grudge-arena agent notes

## Product names

| Brand | Route / preset | Notes |
|-------|----------------|-------|
| **Teidland** | `/teidland` | Primary solo island experience (not ARPG "Danger Room") |
| **Haven Shore** | preset `island` / slug `haven_shore` | Open combat island (hills, shore, village) |

## Performance: no alloc in hot loops (haven_shore)

Object creation in JavaScript is expensive. **Do not** create math objects inside:

- `requestAnimationFrame` / game tick
- per-unit AI / locomotion / ground snap
- per-bone / per-vertex walks
- raycast result handling every frame

### Do this

```js
// Module or class scope — once
import { _v0, _v1 } from "./engine/mathScratch.js";
// or
const _tmp = new THREE.Vector3();

function update(unit) {
  _v0.subVectors(target.position, unit.mesh.position);
  _v0.y = 0;
  _v0.normalize();
  unit.mesh.position.addScaledVector(_v0, speed * dt);
}
```

### Not this

```js
function update(unit) {
  const dir = new THREE.Vector3().subVectors(a, b).normalize(); // GC every frame
  const chest = mesh.position.clone();
  const n = hit.face.normal.clone();
}
```

### Shared scratch module

`src/engine/mathScratch.js` exports `_v0`…`_v4`, `_q0`, `_box0`, etc.

- Scratch values are **invalid after the next reuse** — `.copy()` into an owned field if you must keep them.
- Prefer `obj.getWorldPosition(out)` with a preallocated `out`.
- Prefer `plantSolesOnY` / `GroundSampler.snapMesh` over ad-hoc `new Box3().setFromObject`.

### haven_shore frame contract

1. Mixer poses skeleton (no Vector3 allocs in clip code)
2. Sole plant / heightfield sample (reuse scratch)
3. Foot IK (class-owned temps already)
4. AI steer (reuse `mathScratch`)
5. Rapier sync (no clones)

When adding Haven Shore systems (boats, harvest, nav, props), follow the same rule from the first line of code.

## Three.js helpers catalog (r160)

Prefer engine wrappers over inventing new utilities:

| Module | Use for |
|--------|---------|
| `src/engine/mathScratch.js` | Shared `_v0`…, `_raycaster`, `raycastDown`, Spherical/Plane |
| `src/engine/threeHelpers.js` | `damp` / `dampVector3` / `dampYaw` / `lookAtFlat` / `moveToward` / `refreshSkinnedBounds` / loader cache |
| `src/engine/disposeHierarchy.js` | GPU teardown on preset swap / character unload |
| `src/engine/skinnedClone.js` | `cloneSkinned` via official **SkeletonUtils** (never `clone(true)` on rigs) |
| `src/engine/animHelpers.js` | `subclipSeconds`, `makeAdditive`, `configureOneShot`, `crossFadeTo` |
| `src/gltfLoader.js` | Meshopt + **THREE.Cache** + shared LoadingManager |

### Docs to keep open

- [MathUtils.damp](https://threejs.org/docs/#api/en/math/MathUtils.damp) — framerate-stable smoothing  
- [SkeletonUtils](https://threejs.org/docs/#examples/en/utils/SkeletonUtils) — skinned clone  
- [How to dispose of objects](https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects)  
- [AnimationUtils](https://threejs.org/docs/#api/en/animation/AnimationUtils) — subclip / additive  
- [Cache](https://threejs.org/docs/#api/en/loaders/Cache) — avoid re-fetching GLB/textures  
- [Raycaster](https://threejs.org/docs/#api/en/core/Raycaster) — reuse one instance  

### Still useful upstream (not vendored yet)

- `three/addons/utils/BufferGeometryUtils.js` — `mergeGeometries` for static Haven Shore props  
- `three/addons/utils/SceneUtils.js` — create multi-material objects  
- InstancedMesh for rock/tree scatter (prefer over hundreds of Mesh)

## Universal player control stack (all character play)

**One stack for every Warlords character session** — Teidland island, Haven Shore,
combat-sandbox, flat PvP `/arena`, queue matches, Combat Studio `/anim-test.html`.

| Layer | Module | Mode |
|-------|--------|------|
| Camera | `OrbitCamera` | `controlMode: "tps"` |
| Move / combat | `ArenaController` | `controlScheme: "tps"` |
| Soft / hard lock | `SoftLockSystem` | Tab cycle · MMB hard lock · aim magnet |
| Skills | `WeaponDefinitions` Q/E/R/F/P | hotbar 1–5 |
| Locomotion | baked Bip001 + `useBakedLoco` | gait from speed |
| Block / dodge / climb | CharacterFSM + ArenaController | V · Ctrl · Space |
| Wire-up | `src/engine/PlayerControlStack.js` | `createPlayerControlStack` + `tickPlayerAimSystems` |

Do **not** introduce a second camera/controller for "lobby play" or sectors —
call `createPlayerControlStack` / `setupPlayerPointerInput` / `tickPlayerAimSystems`.

## Combat Studio (`/anim-test.html`)

Playable production TPS studio (same stack as Teidland):

| Feature | Implementation |
|---------|----------------|
| Camera + controller | `PlayerControlStack` / `OrbitCamera` + `ArenaController` TPS |
| Soft/hard lock | `SoftLockSystem` (Tab / MMB) |
| Weapon skills | `WeaponDefinitions` ability bar 1–5 |
| Block / dodge / climb / swim | ArenaController + probes |
| Skill authoring (optional) | `skillPreview.js`, `weaponGizmo.js` when studio tools re-enabled |
| Import GLB | `weaponImport.js` → hand bone + custom meta |
| Warlord pack | `weaponAssetStore.js` → `weaponAssets.json` (attach + skillAnims + abilities) |

Pipeline for Warlord: Save pack → drop JSON into warlord content / arena `public/models/` · download custom GLBs next to it.

## Icons

| Source | Path |
|--------|------|
| **Authoring disk** | `OneDrive/.../MouseWithoutBorders/icons/icons/{weapons,armor,misc,potions,resources,entities}` |
| **Info hub** | https://info.grudge-studio.com/icons/… · browser: `/ICON_BROWSER.html` |
| **R2 CDN** | `https://assets.grudge-studio.com/game-assets/icons/…` |
| **Arena deploy** | `public/assets/icons/abilities/*` + curated `public/assets/icons/weapons/*` |

Runtime resolver: `src/iconCatalog.js` — `weaponIconUrl`, `abilityIconUrl`, multi-CDN `bindIconImg` fallback chain.
