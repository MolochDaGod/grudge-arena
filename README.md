# Grudge Arena

3D PvP combat arena built on [Grudge Studio](https://grudge-studio.com). WoW-style 3v3 team combat with 6 playable races, 5 weapon classes, GLB character models, a shared 24-clip animation library, and an FSM-driven combat AI.

**Live (custom domain):** [grudge-arena.grudge-studio.com](https://grudge-arena.grudge-studio.com)
**Live (alias):** [grudge-arena.vercel.app](https://grudge-arena.vercel.app)

## Gameplay

- **3v3 Team Arena** — Your team (3 units) vs enemy team (3 units), arena-style.
- **6 Races** — Human, Barbarian, Elf, Dwarf, Orc, Undead — Synty/GLB models with shared 24-joint skeleton.
- **5 Weapon Classes** — Greatsword, Bow, Sabres, Scythe, Runeblade. Each with its own ability set.
- **5 Skills Per Weapon** — Q/E/R/F/P abilities mapped to keys 1–5.
- **Countdown → Fight → Victory** — 5s countdown, 5-min match timer, HP-based tiebreaker.
- **Tab Targeting** — Cycle enemies/allies with visual ring indicators.
- **WoW-style Inventory** — 40-slot grid bound to ECS `Inventory` component, paper-doll equipment, master catalog of 2,198 items.

## Controls

| Input | Action |
|-------|--------|
| WASD | Move |
| Shift | Sprint |
| RMB | Normal attack |
| LMB | Select target |
| 1–5 | Weapon skills |
| E, R, F | Alt keys for skills 3, 4, 5 |
| Ctrl | Roll forward · Alt: Dodge backward |
| Scroll | Camera zoom (3–15 units) |
| Tab / Shift+Tab | Cycle enemy / ally targets |
| F1 / F2 / F3 | Select self / ally 1 / ally 2 |
| Esc | Deselect target |
| I / C / K | Toggle Inventory / Character / Skills panels |

## Architecture

```
index.html              — Lobby (auth, builder), in-game HUD, inline lobby script
game.js                 — Engine entry: scene, render loop, dynamic system imports
src/
  arena.css             — All UI styling (lobby + HUD + panels)
  lobby.js              — Extracted lobby logic (auth, build storage, queue)
  arenaMatch.js         — Match phases (setup → countdown → combat → victory)
  arenaAI.js            — FSM-driven AI (idle → engage → approach → attack → retreat → dead)
  targetSystem.js       — Tab/click targeting, target/team frames
  modelLoader.js        — GLTFLoader, race rigs, AnimationController, weapon attachment
  inventorySystem.js    — Master-catalog driven inventory with 3-tier persistence
  inventoryUI.js        — Reactive 40-slot grid + paper-doll
  itemRegistry.js       — Resolves items into { instance, catalog, stats, view }
  objectstore.js        — Cloudflare R2/D1 client (master-items.json, icons)
  EquipmentManager.js   — Equip/unequip + stat aggregation
  HeroRegistry.js       — Hero presets + race definitions
  engine/
    ECS.js              — World, components, queries
    ArenaController.js  — Bridges input + meshes + CharacterFSM
    CharacterFSM.js     — XState v5 state machine (idle/run/attack/cast/dead)
    OrbitCamera.js      — Over-shoulder third-person + scroll zoom
    CollisionSystem.js  — Mesh-raycast hit detection
    CombatSystem.js     — Damage application, threat, cooldowns
    GameTimer.js        — Match clock + phase transitions
    ParticleSystem.js   — Pooled GPU particles
    ShaderLibrary.js    — Custom materials (rim, dissolve, etc.)
    SpriteSystem.js     — 2D effect sprites
    WeaponDefinitions.js— Per-weapon stats, ranges, ability metadata
    RaceConfig.js       — Race scale, attack speed, default weapons
public/
  models/               — Race GLBs + animation library
    barbarian.glb       — ~360 KB
    dwarf.glb           — ~360 KB
    elf.glb             — ~430 KB
    human.glb           — ~250 KB
    orc.glb             — ~340 KB
    undead.glb          — ~340 KB
    animation-library.glb — 4.8 MB · 24 canonical clips, bone-remapped to shared skeleton
  anim-test.html        — Animation diagnostic (launchable from lobby top-left)
  audio/sfx/            — Weapon SFX (bow, sword, sabres, scythe, runeblade, UI)
scripts/
  build-anim-library.mjs   — Merges Mixamo/FBX clips into animation-library.glb
  build-character-library.mjs — GLB rig pre-processing
  sync-assets-r2.mjs    — Uploads textures/models to Cloudflare R2
  deploy.mjs            — Vercel deploy + R2 sync orchestration
archive/
  overlay-draft.html    — Reference UI mockup (not built)
```

## Tech Stack

- **Three.js 0.160** — WebGL rendering, GLTFLoader, AnimationMixer, SkeletonHelper.
- **XState 5** — Character FSM (deterministic state transitions).
- **Vite 6** — Dev server + production build, dynamic-import code splitting.
- **Vercel** — Static hosting + API rewrites.
- **Socket.IO** — Real-time matchmaking (`ws.grudge-studio.com`).
- **Cloudflare R2 + D1 + Workers** — Master item catalog, icon CDN, persistence.
- **Puter SDK** — Identity (guest + Grudge ID auth).

## Rendering Pipeline

1. **GLB race model** loads with 0.01 root scale (centimeter→meter), per-race multiplier on top.
2. **SkinnedMesh clone** with manual skeleton rebinding (Three's clone breaks bindings).
3. **Shared `animation-library.glb`** retargeted onto each race skeleton (24 clips: idle/walk/run/attack variants/cast/death...).
4. **Bone-name remapping** strips `mixamorig:` and aligns to the canonical skeleton in `build-anim-library.mjs`.
5. **Procedural weapon meshes** attached to `RightHand` / `LeftHand` bones via `modelLoader.attachWeaponToBone()`.
6. **AnimationController** drives `mixer.clipAction()` with `fadeToAction()` crossfade.
7. **OrbitCamera** — over-shoulder, scroll-zoomed (3–15 units).

## Diagnostic Tools

### Animation Test (`/anim-test.html`)

Reachable from the **🎬 Animation Test** button in the top-left of the character builder. Loads the currently selected race + weapon as URL params (`?race=elf&weapon=bow`) and provides:

- Live race switcher (cycles through all 6 GLBs in-place).
- Clip dropdown + Prev / Next / Auto-cycle controls for the 24 library clips.
- OrbitControls camera for skeleton inspection.
- Per-load report: scale, bone count, embedded clip names, idle-clip bone bind rate.

The same launcher is also surfaced inside the in-game HUD (`.hud-top-left`) for mid-match retesting.

## Authentication

Three login methods, all routed through [id.grudge-studio.com](https://id.grudge-studio.com):

- **Phantom Wallet** — Solana wallet connect → `/api/auth/wallet`.
- **Grudge ID** — Puter SDK identity.
- **Guest** — Device-based account via Puter.

Cross-app SSO with [grudgewarlords.com](https://grudgewarlords.com) using shared localStorage keys (`grudge_auth_token`, `grudge_session_token`, `grudge_id`).

## Item Catalog

The arena consumes the canonical Master Items catalog (2,198 items) from `assets.grudge-studio.com/v1/game-data/master-items`. `src/objectstore.js` indexes by uuid / baseUuid / type / setName / tier. `src/itemRegistry.js` returns `{ instance, catalog, stats, view }` to the UI. Persistence is a 3-tier model: in-memory ECS → `localStorage` → R2/Worker.

## Asset Loading

`src/assetConfig.js` is the single source of truth for asset URLs. It detects `localhost`/`127.0.0.1` and switches base:

- **Dev** → `/` (Vite serves `/public` as root)
- **Prod** → `https://assets.grudge-studio.com/arena/` (Cloudflare R2)

Helpers: `assetUrl(path)`, `charUrl(path)`, `animUrl(path)`, `audioUrl(path)`, `modelUrl(path)`, `mapUrl(path)`. **Always import these** rather than hard-coding paths — Rollup will tree-shake a missing import in prod and hit a `ReferenceError` at runtime.

### Race model fallback chain

`modelLoader.js#raceModelPaths()` and `HeroRegistry.fallbackModel` both fall back to local `/models/${race}.glb` when R2 fails. The `public/models/` directory ships ~2 MB of low-poly race GLBs as a built-in safety net (Vercel serves them as static assets). Order:

1. Hero's pack-specific GLB via `charUrl()` → R2 in prod, `/assets/characters/...` in dev.
2. Race's primary character GLB via `charUrl()`.
3. `/models/${race}.glb` — local Vercel-static fallback (always succeeds in prod).

The renderer also waits for `#game-root` to be `display: block` and forces a layout reflow (`void root.offsetWidth`) **before** `arena.init()` so the WebGL drawing buffer is sized to the actual viewport — otherwise the canvas initializes at 0×0 and gets stretched, causing visible blur.

## Development

```bash
npm install
npm run dev             # Vite dev server on :5173
npm run build           # Production build → dist/
npm run preview         # Serve dist/ locally
npm run sync:assets:dry # Preview R2 asset sync
npm run sync:assets     # Upload textures/models to R2
npm run deploy          # Vercel preview deploy
npm run deploy:prod     # Vercel production deploy
```

## Deployment

Hosted on Vercel under team `grudgenexus`, project `grudge-arena`.

| Target | URL |
| --- | --- |
| Production | <https://grudge-arena.grudge-studio.com> |
| Vercel alias | <https://grudge-arena.vercel.app> |
| Inspect | <https://vercel.com/grudgenexus/grudge-arena> |

`vercel.json` controls build (`vite build` → `dist/`), `/api/*` rewrites to id/api/account/assets services, and cache headers for `/models/*` (1 day) and `/assets/animations/*` (immutable). The CI workflow (`.github/workflows/build.yml`) runs `npm ci && npm run build` on every push/PR and uploads `dist/` as an artifact, but production deploys are still triggered by `npm run deploy:prod` until a Vercel deploy hook is wired into the workflow.

## Created by

[Racalvin The Pirate King](https://grudge-studio.com) — Grudge Studio
