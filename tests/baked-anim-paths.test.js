/**
 * Baked clip catalog paths must match files on assets.grudge-studio.com/anims/baked/.
 * Regenerate when BAKED_DIR_RELS / PACK_COMBAT_EXTRAS change.
 */
import { describe, it, expect } from 'vitest';
import {
  ANIM_PACK_CLIPS,
  BAKED_DIR_RELS,
  PACK_COMBAT_EXTRAS,
  BAKED_COMBAT_EXTRAS,
  SPRINT_CLIP,
  bakedClipUrl,
} from '../src/bakedAnimLoader.js';

const CDN = 'https://assets.grudge-studio.com';

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

describe('baked anim CDN paths', () => {
  const rels = collectRels();

  it('catalog lists unique clip paths', () => {
    expect(rels.length).toBe(new Set(rels).size);
    expect(rels.length).toBeGreaterThan(20);
  });

  it.each(rels.map((r) => [r, bakedClipUrl(r)]))(
    '%s is on CDN',
    async (_rel, url) => {
      expect(url.startsWith('/api/assets/anims/baked/')).toBe(true);
      const cdnUrl = url.replace('/api/assets/', `${CDN}/`);
      const res = await fetch(cdnUrl, { method: 'HEAD' });
      expect(res.status, `missing ${cdnUrl}`).toBe(200);
    },
    30_000,
  );
});