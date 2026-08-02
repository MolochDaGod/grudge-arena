/**
 * assetConfig.js
 * Single source of truth for asset base URLs.
 *
 * Local / bundled (localhost, island combat sandbox Vercel project):
 *   Characters + island props ship in /public → /assets/...
 *
 * Production grudge-arena (Vercel / grudge-arena.grudge-studio.com):
 *   Character meshes + atlases via /cdn/* → R2 assets.grudge-studio.com/arena/
 *
 * Usage:
 *   import { assetUrl, charUrl, animUrl, audioUrl } from './assetConfig.js';
 *   const src = charUrl('barbarian/BRB_Characters.glb');
 *   // arena prod → /cdn/assets/characters/barbarian/BRB_Characters.glb
 *   // sandbox/dev → /assets/characters/barbarian/BRB_Characters.glb
 */

import { isCombatSandboxHost } from "./combatSandbox.js";

const IS_DEV =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

/** Self-contained deploys (sandbox) bundle characters like island props — no R2 hop. */
export function useBundledArenaAssets() {
  if (IS_DEV) return true;
  return isCombatSandboxHost();
}

// R2 direct URL (for server-side reference only — never used in the browser
// because cross-origin fetch from vercel.app is blocked by CORS).
export const R2_BASE = "https://assets.grudge-studio.com/arena";
export const LOCAL_BASE = ""; // Vite serves /public as root

// In production, all asset fetches go through the Vercel /cdn/* proxy,
// which rewrites to R2 server-side — no browser CORS issue.
export const CDN_PROXY = "/cdn";

/** Resolved base — use this for all assets */
export const ASSET_BASE = useBundledArenaAssets() ? LOCAL_BASE : CDN_PROXY;

/**
 * Build a full URL for any public/ asset.
 * @param {string} path  - relative to public/, e.g. "assets/characters/barbarian/BRB_Characters.glb"
 */
export function assetUrl(path) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return useBundledArenaAssets() ? `/${p}` : `${CDN_PROXY}/${p}`;
}

/** Shorthand for public/assets/characters/... */
export function charUrl(path) {
  return assetUrl(`assets/characters/${path}`);
}

/** Shorthand for public/assets/animations/... */
export function animUrl(path) {
  return assetUrl(`assets/animations/${path}`);
}

/** Shorthand for public/audio/... */
export function audioUrl(path) {
  return assetUrl(`audio/${path}`);
}

/** Shorthand for public/models/... */
export function modelUrl(path) {
  return assetUrl(`models/${path}`);
}

/**
 * Grudge6 assets live outside /arena/ on R2 — use /api/assets proxy in prod.
 * @param {string} path - e.g. 'models/grudge6/races/WK_Characters.fbx'
 */
export function grudge6AssetUrl(path) {
  const p = path.startsWith('/') ? path.slice(1) : path;
  return IS_DEV ? `/${p}` : `/api/assets/${p}`;
}

/** Shorthand for models/animationsweapons/... on R2 */
export function grudge6AnimUrl(packAndFile) {
  const p = packAndFile.startsWith('/') ? packAndFile.slice(1) : packAndFile;
  return grudge6AssetUrl(`models/animationsweapons/${p}`);
}

/** Shorthand for public/assets/maps/... */
export function mapUrl(path) {
  return assetUrl(`assets/maps/${path}`);
}

/**
 * Island sandbox props (forest_pack, village GLB/FBX/textures).
 * These ship with the combat-sandbox Vercel deployment — NOT on R2 /cdn.
 * @param {string} path - relative to assets/island/, e.g. "village/glb/SM_PROP_well.glb"
 */
export function islandAssetUrl(path) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  const rel = p.startsWith("assets/island/") ? p : `assets/island/${p}`;
  return `/${rel}`;
}

/**
 * Baked Bip001 JSON clips.
 *
 * Always serve from the app deploy (`/anims/baked/...`) — Vite copies public/anims.
 * Do NOT use `/api/assets/anims/baked` in prod: that rewrites to R2 root and 404s
 * on spaced filenames (magic/standing idle, sword and shield *, etc.), which hard-fails
 * Danger Room (staff/magic missing idle/run/sprint).
 *
 * @param {string} rel - e.g. 'locomotion/walking' or 'magic/standing idle' (no .json)
 */
export function bakedAnimUrl(rel) {
  const p = (rel.startsWith("/") ? rel.slice(1) : rel).replace(/\.json$/i, "");
  // Encode each segment so spaces / parentheses are valid URLs; keep path slashes
  const encoded = p
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/anims/baked/${encoded}.json`;
}

/**
 * Ordered fetch mirrors for a baked clip (first hit wins).
 * Deploy path first; underscore filename variants for bake-name drift.
 * @param {string} rel
 * @returns {string[]}
 */
export function bakedAnimUrlCandidates(rel) {
  const p = (rel.startsWith("/") ? rel.slice(1) : rel).replace(/\.json$/i, "");
  const segs = p.split("/").filter(Boolean);
  const encoded = segs.map((seg) => encodeURIComponent(seg)).join("/");
  const underscored = segs
    .map((seg) => encodeURIComponent(seg.replace(/\s+/g, "_")))
    .join("/");
  const urls = [`/anims/baked/${encoded}.json`];
  if (underscored !== encoded) {
    urls.push(`/anims/baked/${underscored}.json`);
  }
  // Arena R2 mirror (some deploys ship anims under /cdn/assets/animations)
  urls.push(`/cdn/assets/animations/baked/${encoded}.json`);
  return [...new Set(urls)];
}
