# Grudge Arena

3D PvP combat arena built on [Grudge Studio](https://grudge-studio.com). WoW-style 3v3 team arena with 6 playable races, 5 weapon classes, GLB character models, weapon-specific Mixamo animations, and real-time combat AI.

**Live:** [grudge-arena.vercel.app](https://grudge-arena.vercel.app)

## Gameplay

- **3v3 Team Arena** — Your team (3 units) vs enemy team (3 units), WoW arena style
- **6 Races** — Human, Barbarian, Elf, Dwarf, Orc, Undead (GLB models with 24-joint Mixamo skeletons)
- **5 Weapon Classes** — Greatsword (Immortal), Bow (Viper), Sabres (Assassin), Scythe (Weaver), Runeblade
- **5 Skills Per Weapon** — Each weapon has unique Q/E/R/F/P abilities mapped to keys 1-5
- **Countdown → Fight → Victory** — 5-second countdown, 5-minute match timer, HP-based tiebreaker
- **Tab Targeting** — WoW-style target cycling with visual ring indicators

## Controls

| Input | Action |
|-------|--------|
| WASD | Move |
| Shift | Sprint |
| RMB | Normal attack |
| LMB | Select target (click on units) |
| 1-5 | Weapon skills |
| E, R, F | Alt keys for skills 3, 4, 5 |
| Ctrl | Roll forward |
| Alt | Dodge backward |
| Scroll | Zoom camera in/out |
| Tab | Cycle enemy targets (nearest first) |
| Shift+Tab | Cycle ally targets |
| F1 / F2 / F3 | Select self / ally 1 / ally 2 |
| Escape | Deselect target |

## Architecture

```
index.html          — Lobby (auth, race select) + HUD (countdown, team frames, ability bar)
game.js             — ECS engine, weapons, shaders, particles, camera, arena init
src/
  modelLoader.js    — GLTFLoader, bone remapping, AnimationController, weapon mesh attachment
  arenaMatch.js     — Match phases (setup → countdown → combat → victory)
  targetSystem.js   — Tab/click targeting, visual rings, team/target frame HUD
  arenaAI.js        — State-driven AI (idle → engage → approach → attack → retreat → dead)
public/
  models/           — 6 race GLB models (22-31MB each, Mixamo-rigged)
  assets/animations/— 242 weapon animation GLBs (converted from Mixamo FBX via fbx2gltf)
    axe/            — 47 animations (idle, run, attacks, combos, block, taunt...)
    sword_shield/   — 51 animations (idle, run, slashes, blocks, casts, deaths...)
    longbow/        — 39 animations (idle, run, draw arrow, aim, dodge, dive...)
    magic/          — 56 animations (idle, run, 1H/2H magic attacks, casts, area attacks...)
    rifle/          — 49 animations (idle, run, aim, crouch, sprint, deaths...)
  audio/sfx/        — Weapon sound effects (bow, sword, sabres, scythe, runeblade, UI)
```

## Tech Stack

- **Three.js** — 3D rendering (WebGL), GLTFLoader for all models and animations
- **Vite** — Build tool, code-splits arena modules for lazy loading
- **Vercel** — Hosting with API rewrites to Grudge backend
- **Socket.IO** — Real-time PvP matchmaking (via ws.grudge-studio.com)

## Rendering Pipeline

1. **GLB race models** load with 0.01 root scale (centimeter units), race multiplier applied on top
2. **SkinnedMesh clone** with manual skeleton rebinding (Three.js clone breaks skin bindings)
3. **GLB weapon animations** (converted from Mixamo FBX) with `mixamorig:` prefix stripping for retargeting
4. **Position track scaling** (0.01) on animation clips to match model space
5. **Procedural weapon meshes** attached to `RightHand` bone (greatsword, bow, staff, sabres, shield on LeftHand)
6. **AnimationController** per unit with `fadeToAction()` crossfade blending
7. **ChaseCamera** — over-shoulder third-person, scroll zoom (3-15 units)

## Authentication

Three login methods, all routing through [id.grudge-studio.com](https://id.grudge-studio.com):

- **Phantom Wallet** — Solana wallet connect → `/api/auth/wallet`
- **Google OAuth** — Redirect through Grudge ID
- **Guest** — Device-based guest account via Puter SDK

Cross-app SSO with [grudgewarlords.com](https://grudgewarlords.com) using shared localStorage keys (`grudge_auth_token`, `grudge_session_token`, `grudge_id`).

## API Integration

Vercel rewrites proxy all API calls to the Grudge backend:

| Frontend Route | Backend |
|----------------|---------|
| `/api/auth/*` | id.grudge-studio.com |
| `/api/wallet/*` | api.grudge-studio.com |
| `/api/characters/*` | api.grudge-studio.com |
| `/api/nfts/*` | api.grudge-studio.com |
| `/api/game/*` | api.grudge-studio.com |
| `/api/assets/*` | assets.grudge-studio.com |

## Development

```bash
npm install
npm run dev        # Vite dev server on port 5173
npm run build      # Production build to dist/
npm run preview    # Preview production build
```

## Asset Pipeline

Animation files were batch-converted from Mixamo FBX to GLB:

```bash
# Convert all FBX to GLB (242 files, 69MB → 10.4MB)
npx fbx2gltf --input file.fbx --output file.glb --binary
```

All animations use GLTFLoader only — no FBXLoader in the bundle.

## Created by

[Racalvin The Pirate King](https://grudge-studio.com) — Grudge Studio
