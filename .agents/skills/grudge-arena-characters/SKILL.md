---
name: grudge-arena-characters
description: Deploy textured Grudge6/Bip001 characters to grudge-arena — CDN GLB meshes, race atlas textures, baked rotation-only Bip001 clips, anim-test showcase, and Danger Room runtime. Use when characters are yellow/untextured, animations explode, anim-test.html fails, or adding/syncing race assets to production.
---

# Grudge Arena — Textured Character Deploy

## The one pipeline that works (prod)

```
CDN race GLB  →  race atlas PNG  →  baked Bip001 JSON clips  →  AnimationDirector
     ↓                  ↓                      ↓
/cdn/assets/characters/{race}/*_Characters.glb
/cdn/assets/characters/{race}/textures/Map__*.png
/api/assets/anims/baked/{category}/{name}.json
```

**Runtime entry:** `createBakedGrudge6Unit(race, weapon)` in `src/modelLoader.js`
**Showcase:** `https://grudge-arena.grudge-studio.com/anim-test.html?race=human&weapon=greatsword&pipeline=baked`

Do **not** use `/models/{race}.glb` fallback GLBs for showcase — they are untextured 2 MB safety nets.

## Quick deploy checklist

```bash
cd grudge-arena

# 1. Bake/sync character GLBs + textures to R2 (when art changed)
node scripts/build-character-library.mjs   # extracts atlases, writes characterManifest.json
npm run sync:assets                        # public/assets → R2 arena bucket

# 2. Baked animations live on grudge6 R2 (shared with character-viewer)
#    Paths: /api/assets/anims/baked/**/*.json
#    Bake in grudge-character-animator: node artifacts/character-viewer/tools/bake-anims.mjs

# 3. Build + deploy app
npm test && npm run build && npm run deploy:prod
```

## Validate before calling it done

1. Open `/anim-test.html?race=human&pipeline=baked`
2. Log panel must show: `materials: N/N textured` (N > 40 for D1 races)
3. Character visible, grounded, idle anim smooth (not exploded yellow shards)
4. Gait slider: idle → walk → run → sprint blends smoothly
5. `npm run` smoke: `node scripts/smoke-arena.mjs` (arena flow)

## Two pipelines (know which is active)

| Pipeline | Loader | Anim source | When |
|----------|--------|-------------|------|
| **Baked (prod)** | `createBakedGrudge6Unit` | `/api/assets/anims/baked/*.json` rotation-only | Danger Room default |
| **Legacy** | `createAnimatedUnit` | Mixamo GLB packs + animation-library | Fallback if baked fails |

Danger Room tries baked first (`game.js` → `createBakedGrudge6Unit`), then legacy.

## Texture rules (Synty D1)

- Materials are `MeshBasicMaterial` (unlit) — set `toneMapped = false`
- Atlas via canvas `DataTexture`, `flipY = true`, `SRGBColorSpace` — see `loadAtlasTexture()` in `modelLoader.js`
- Apply atlas **twice**: before equipment + after `EquipmentManager.applyLoadout()`
- Prod URLs must use `charUrl()` → `/cdn/assets/characters/...` (not bare `/assets/...`)

## Scale / grounding

- Measure height from **body skinned meshes only** (`isBodyMeasureMesh`) — ignore `weapon_*` variants
- Ground using body bbox only — hidden weapon meshes must not lift character
- Orc/undead partial bbox → default 1.75 m target

## Bone names (CDN GLBs)

GLTFLoader sanitizes to **underscores**: `Bip001_Pelvis`, `Bip001_L_Hand`
Baked JSON clips use the same names. Do not remap to spaced names.

## anim-test.html (Vite page)

- Source: `anim-test.html` + `src/animTest/main.js` (not `public/`)
- Imports `createBakedGrudge6Unit` / `createAnimatedUnit` from bundled `modelLoader.js`
- URL params: `?race=human&weapon=greatsword&pipeline=baked|legacy`

## Related skills (grudge-character-animator repo)

- `grudge-asset-pipeline` — bake Mixamo → Bip001 JSON, TGA→WebP, manifests
- `grudge-characters` — skeleton families, bone map
- `grudge-animation` — AnimationDirector, rotation-only clips

## Common failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| Solid yellow | Atlas not applied or toneMapped on unlit mat | Hard refresh; check CDN 200 on Map__*.png |
| Yellow spike / exploded mesh | Mixamo remap on A-pose (legacy pipeline) | Use `pipeline=baked` |
| Character floating | Grounding used full scene bbox | body-only grounding in normalizeCharacterScale |
| anim-test 404 / old page | Stale `public/anim-test.html` | Use root Vite `anim-test.html` |
| baked load fails | Missing JSON on R2 | Verify `/api/assets/anims/baked/locomotion/walking.json` |