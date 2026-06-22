/**
 * assetConfig.js
 * Single source of truth for asset base URLs.
 *
 * In production (Vercel / any non-localhost host):
 *   Assets are served from Cloudflare R2 via assets.grudge-studio.com/arena/
 *
 * In local dev (localhost / 127.0.0.1):
 *   Assets are served from /public/ (Vite static serve)
 *
 * Usage:
 *   import { assetUrl, charUrl, animUrl, audioUrl } from './assetConfig.js';
 *   const src = charUrl('barbarian/BRB_Characters.glb');
 *   // prod → https://assets.grudge-studio.com/arena/assets/characters/barbarian/BRB_Characters.glb
 *   // dev  → /assets/characters/barbarian/BRB_Characters.glb
 */

const IS_DEV =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

// R2 direct URL (for server-side reference only — never used in the browser
// because cross-origin fetch from vercel.app is blocked by CORS).
export const R2_BASE = "https://assets.grudge-studio.com/arena";
export const LOCAL_BASE = ""; // Vite serves /public as root

// In production, all asset fetches go through the Vercel /cdn/* proxy,
// which rewrites to R2 server-side — no browser CORS issue.
export const CDN_PROXY = "/cdn";

/** Resolved base — use this for all assets */
export const ASSET_BASE = IS_DEV ? LOCAL_BASE : CDN_PROXY;

/**
 * Build a full URL for any public/ asset.
 * @param {string} path  - relative to public/, e.g. "assets/characters/barbarian/BRB_Characters.glb"
 */
export function assetUrl(path) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return IS_DEV ? `/${p}` : `${CDN_PROXY}/${p}`;
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
