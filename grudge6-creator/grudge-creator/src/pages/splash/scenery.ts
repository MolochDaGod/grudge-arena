/**
 * Distant scenic backdrop — silhouette mountain ranges + foreground rocks.
 * Procedural, no textures. Designed to read against the dark void without
 * stealing focus from the portal/relic.
 *
 * Composition
 *   • Two parallax mountain rings (back: large/dark, mid: smaller/lighter)
 *     built from low-poly cones placed on an arc behind the portal.
 *   • A sparse scatter of jagged foreground rocks on either side, sitting
 *     just inside the camera framing, to add depth between the champions
 *     and the distant ranges.
 */
import * as THREE from 'three';

export interface Scenery {
  group: THREE.Group;
  dispose: () => void;
}

export function createScenery(): Scenery {
  const group = new THREE.Group();
  const disposers: Array<() => void> = [];

  // ── Distant mountain ring (large, dark) ────────────────────────────────
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x14161e, roughness: 1.0, metalness: 0.0, flatShading: true,
  });
  disposers.push(() => backMat.dispose());

  const backCount = 16;
  const backRadius = 70;
  for (let i = 0; i < backCount; i++) {
    // Spread across a 220° arc behind the portal (skip the camera-facing
    // wedge so mountains don't poke into the foreground).
    const a = -Math.PI * 1.1 + (i / (backCount - 1)) * Math.PI * 2.2;
    const r = backRadius + (Math.random() - 0.5) * 12;
    const h = 18 + Math.random() * 14;
    const w = 14 + Math.random() * 6;
    const g = new THREE.ConeGeometry(w, h, 5 + Math.floor(Math.random() * 3));
    disposers.push(() => g.dispose());
    const m = new THREE.Mesh(g, backMat);
    m.position.set(Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    group.add(m);
  }

  // ── Mid mountain ring (smaller, lighter) ───────────────────────────────
  const midMat = new THREE.MeshStandardMaterial({
    color: 0x1d212c, roughness: 1.0, metalness: 0.0, flatShading: true,
  });
  disposers.push(() => midMat.dispose());

  const midCount = 12;
  const midRadius = 38;
  for (let i = 0; i < midCount; i++) {
    const a = -Math.PI * 1.1 + (i / (midCount - 1)) * Math.PI * 2.2;
    const r = midRadius + (Math.random() - 0.5) * 8;
    const h = 8 + Math.random() * 6;
    const w = 6 + Math.random() * 3;
    const g = new THREE.ConeGeometry(w, h, 4 + Math.floor(Math.random() * 3));
    disposers.push(() => g.dispose());
    const m = new THREE.Mesh(g, midMat);
    m.position.set(Math.sin(a) * r, h / 2 - 1, Math.cos(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    group.add(m);
  }

  // ── Foreground jagged rocks ────────────────────────────────────────────
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x2a2820, roughness: 0.95, metalness: 0.05, flatShading: true,
  });
  disposers.push(() => rockMat.dispose());

  const rockSpots: Array<[number, number]> = [
    [-9.5, 1.2], [-8.5, -1.5], [-7.0, 3.0], [-10.5, -3.0],
    [ 9.5, 1.2], [ 8.5, -1.5], [ 7.0, 3.0], [ 10.5, -3.0],
    [-6.0, -5.0], [ 6.0, -5.0],
  ];
  for (const [x, z] of rockSpots) {
    const h = 0.6 + Math.random() * 1.0;
    const r = 0.4 + Math.random() * 0.6;
    const g = new THREE.DodecahedronGeometry(r, 0);
    disposers.push(() => g.dispose());
    const m = new THREE.Mesh(g, rockMat);
    m.position.set(x + (Math.random() - 0.5) * 0.6, h * 0.4, z + (Math.random() - 0.5) * 0.6);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    m.scale.set(1, h, 1);
    group.add(m);
  }

  return {
    group,
    dispose() { for (const d of disposers) d(); },
  };
}

// ── Torch ─────────────────────────────────────────────────────────────────

export interface Torch {
  group: THREE.Group;
  update: (t: number) => void;
  dispose: () => void;
}

/**
 * Tall stone torch with a flickering flame + warm point light.
 * The flame is a billboard sprite so it always faces camera; the light
 * intensity wobbles asynchronously per torch (pass a unique `seed`).
 */
export function createTorch(seed: number): Torch {
  const group = new THREE.Group();
  const disposers: Array<() => void> = [];

  // Stone post
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x3a3530, roughness: 0.9, metalness: 0.05,
  });
  disposers.push(() => postMat.dispose());
  const postGeom = new THREE.CylinderGeometry(0.14, 0.18, 2.2, 8);
  disposers.push(() => postGeom.dispose());
  const post = new THREE.Mesh(postGeom, postMat);
  post.position.y = 1.1;
  group.add(post);

  // Stone base
  const baseGeom = new THREE.CylinderGeometry(0.32, 0.42, 0.25, 12);
  disposers.push(() => baseGeom.dispose());
  const base = new THREE.Mesh(baseGeom, postMat);
  base.position.y = 0.125;
  group.add(base);

  // Iron basket
  const basketMat = new THREE.MeshStandardMaterial({
    color: 0x1a1612, roughness: 0.6, metalness: 0.6,
  });
  disposers.push(() => basketMat.dispose());
  const basketGeom = new THREE.CylinderGeometry(0.32, 0.22, 0.32, 12, 1, true);
  disposers.push(() => basketGeom.dispose());
  const basket = new THREE.Mesh(basketGeom, basketMat);
  basket.position.y = 2.35;
  group.add(basket);

  // Glowing coal mass inside basket
  const coalMat = new THREE.MeshBasicMaterial({ color: 0xff7733 });
  disposers.push(() => coalMat.dispose());
  const coalGeom = new THREE.SphereGeometry(0.22, 12, 8);
  disposers.push(() => coalGeom.dispose());
  const coal = new THREE.Mesh(coalGeom, coalMat);
  coal.position.y = 2.4;
  coal.scale.y = 0.6;
  group.add(coal);

  // Flame sprite
  const flameTex = makeFlameTexture();
  disposers.push(() => flameTex.dispose());
  const flameMat = new THREE.SpriteMaterial({
    map: flameTex, color: 0xffaa44, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95,
  });
  disposers.push(() => flameMat.dispose());
  const flame = new THREE.Sprite(flameMat);
  flame.scale.set(0.85, 1.4, 1);
  flame.position.y = 2.95;
  group.add(flame);

  // Halo
  const haloTex = makeRadialGradient('#ffaa44', '#cc4422', '#00000000');
  disposers.push(() => haloTex.dispose());
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  disposers.push(() => haloMat.dispose());
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(2.4, 2.4, 1);
  halo.position.y = 2.6;
  group.add(halo);

  // Flickering point light
  const light = new THREE.PointLight(0xffa050, 1.8, 9, 1.4);
  light.position.y = 2.6;
  group.add(light);

  return {
    group,
    update(t) {
      const f = t * 4 + seed;
      const flick = 0.7 + 0.18 * Math.sin(f * 5.1) + 0.12 * Math.sin(f * 11.3);
      light.intensity = 1.4 + 1.2 * flick;
      flame.scale.set(0.78 + 0.12 * Math.sin(f * 7), 1.3 + 0.18 * Math.sin(f * 6.3), 1);
      flameMat.opacity = 0.85 + 0.12 * Math.sin(f * 9);
      haloMat.opacity = 0.30 + 0.18 * flick;
    },
    dispose() { for (const d of disposers) d(); },
  };
}

// ── Texture factories ─────────────────────────────────────────────────────

function makeFlameTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size * 0.62, 2, size / 2, size * 0.62, size * 0.55);
  g.addColorStop(0, 'rgba(255,255,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,100,0.85)');
  g.addColorStop(0.6, 'rgba(255,90,40,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRadialGradient(c0: string, c1: string, c2: string): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, c0); g.addColorStop(0.45, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
