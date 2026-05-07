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

export const R2_BASE = "https://assets.grudge-studio.com/arena";
export const LOCAL_BASE = ""; // Vite serves /public as root

/** Resolved base — use this for all assets */
export const ASSET_BASE = IS_DEV ? LOCAL_BASE : R2_BASE;

/**
 * Build a full URL for any public/ asset.
 * @param {string} path  - relative to public/, e.g. "assets/characters/barbarian/BRB_Characters.glb"
 */
export function assetUrl(path) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return IS_DEV ? `/${p}` : `${R2_BASE}/${p}`;
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

/** Shorthand for public/assets/maps/... */
export function mapUrl(path) {
  return assetUrl(`assets/maps/${path}`);
}
