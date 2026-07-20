/**
 * Baked clip catalog paths must resolve under /anims/baked/ (app deploy, not R2).
 * Core packs (idle/walk/run) must exist on disk under public/anims/baked/.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  ANIM_PACK_CLIPS,
  BAKED_DIR_RELS,
  PACK_COMBAT_EXTRAS,
  BAKED_COMBAT_EXTRAS,
  SPRINT_CLIP,
  bakedClipUrl,
} from '../src/bakedAnimLoader.js';

const BAKED_ROOT = resolve(process.cwd(), 'public/anims/baked');

function collectRels() {
  const rels = new Set([SPRINT_CLIP]);
  for (const pack of Object.values(ANIM_PACK_CLIPS)) {
    Object.values(pack).forEach((r) => rels.add(r));
  }
  for (const dirs of Object.values(BAKED_DIR_RELS)) {
    Object.values(dirs).forEach((r) => rels.add(r));
  }
  for (const extras of Object.values(PACK_COMBAT_EXTRAS)) {
    Object.values(extras).forEach((r) => rels.add(r));
  }
  Object.values(BAKED_COMBAT_EXTRAS).forEach((r) => rels.add(r));
  return [...rels];
}

function diskPath(rel) {
  return resolve(BAKED_ROOT, `${rel}.json`);
}

describe('baked anim paths', () => {
  const rels = collectRels();

  it('catalog lists unique clip paths', () => {
    expect(rels.length).toBe(new Set(rels).size);
    expect(rels.length).toBeGreaterThan(20);
  });

  it('bakedClipUrl uses deployed /anims/baked (not R2 /api/assets)', () => {
    const url = bakedClipUrl('magic/standing idle');
    expect(url.startsWith('/anims/baked/')).toBe(true);
    expect(url.includes('%20') || url.includes('standing')).toBe(true);
    expect(url.includes('/api/assets/')).toBe(false);
  });

  it('core pack loco clips exist on disk', () => {
    for (const [pack, clips] of Object.entries(ANIM_PACK_CLIPS)) {
      for (const [slot, rel] of Object.entries(clips)) {
        const p = diskPath(rel);
        expect(existsSync(p), `${pack}.${slot} missing: ${p}`).toBe(true);
      }
    }
  });
});