/**
 * Astral starfield + nebula for the splash background.
 *
 * Pure procedural — three layers of additive points (close large, mid, deep),
 * one rotating nebula sprite, and a constellation overlay of brighter "named"
 * stars that twinkle. Designed to sit behind the portal at the centre of the
 * scene and convey the feel of staring into the void between worlds.
 */
import * as THREE from 'three';

export interface Starfield {
  group: THREE.Group;
  /** Call every frame with elapsed time + dt to drive twinkle/rotation. */
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

interface StarLayerConfig {
  count: number;
  radius: number;
  size: number;
  color: number;
  opacity: number;
  spinSpeed: number;
}

export function createStarfield(): Starfield {
  const group = new THREE.Group();
  const layers: Array<{ points: THREE.Points; cfg: StarLayerConfig }> = [];

  // Three depth-layers of stars on concentric spherical shells. Each is its
  // own Points object so we can spin them at different rates for parallax.
  const LAYERS: StarLayerConfig[] = [
    { count: 1200, radius:  90, size: 0.55, color: 0xb0c8ff, opacity: 0.95, spinSpeed:  0.012 },
    { count: 1800, radius: 150, size: 0.40, color: 0xa6b4ff, opacity: 0.75, spinSpeed:  0.007 },
    { count: 2200, radius: 220, size: 0.30, color: 0x8090d0, opacity: 0.55, spinSpeed: -0.004 },
  ];

  const sharedSprite = makeStarSprite();

  for (const cfg of LAYERS) {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(cfg.count * 3);
    for (let i = 0; i < cfg.count; i++) {
      // Fibonacci sphere sampling — even distribution, no clumping at poles.
      const idx = i + 0.5;
      const phi = Math.acos(1 - 2 * idx / cfg.count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * idx;
      pos[i * 3 + 0] = cfg.radius * Math.cos(theta) * Math.sin(phi);
      pos[i * 3 + 1] = cfg.radius * Math.sin(theta) * Math.sin(phi);
      pos[i * 3 + 2] = cfg.radius * Math.cos(phi);
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: cfg.color, size: cfg.size, transparent: true, opacity: cfg.opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      map: sharedSprite,
    });
    const points = new THREE.Points(geom, mat);
    group.add(points);
    layers.push({ points, cfg });
  }

  // Bright "named" stars — fewer, larger, twinkle independently.
  const NAMED = 24;
  const constellationGeom = new THREE.BufferGeometry();
  const constPos = new Float32Array(NAMED * 3);
  const twinkleSeed = new Float32Array(NAMED);
  for (let i = 0; i < NAMED; i++) {
    // Bias to upper hemisphere so they're visible above the portal.
    const u = Math.random();
    const v = Math.random() * 0.7 + 0.15;
    const phi = Math.acos(1 - 2 * u);
    const theta = 2 * Math.PI * v;
    const r = 70;
    constPos[i * 3 + 0] = r * Math.cos(theta) * Math.sin(phi);
    constPos[i * 3 + 1] = Math.abs(r * Math.sin(theta) * Math.sin(phi));
    constPos[i * 3 + 2] = r * Math.cos(phi);
    twinkleSeed[i] = Math.random() * Math.PI * 2;
  }
  constellationGeom.setAttribute('position', new THREE.BufferAttribute(constPos, 3));
  const constellationMat = new THREE.PointsMaterial({
    color: 0xffe9b0, size: 1.6, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    map: sharedSprite,
  });
  const constellation = new THREE.Points(constellationGeom, constellationMat);
  group.add(constellation);

  // Nebula clouds — three large soft sprites tinted in cool/warm tones, very
  // low opacity, slowly counter-rotating to suggest depth without distracting
  // from the portal in foreground.
  const nebulaSprites: THREE.Sprite[] = [];
  const nebulaTextures: THREE.Texture[] = [];
  const NEBULAS = [
    { tint: 0x5a3c8a, opacity: 0.18, scale: 110, x:  -28, y:  18, z: -55, spin:  0.012 },
    { tint: 0x2c5a8a, opacity: 0.14, scale:  95, x:   34, y:  22, z: -45, spin: -0.008 },
    { tint: 0x804020, opacity: 0.10, scale:  80, x:    4, y: -10, z: -65, spin:  0.005 },
  ];
  const nebulaSpins: number[] = [];
  for (const n of NEBULAS) {
    const tex = makeNebulaTexture();
    nebulaTextures.push(tex);
    const mat = new THREE.SpriteMaterial({
      map: tex, color: n.tint, transparent: true, opacity: n.opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(n.scale);
    sp.position.set(n.x, n.y, n.z);
    group.add(sp);
    nebulaSprites.push(sp);
    nebulaSpins.push(n.spin);
  }

  return {
    group,
    update(t, _dt) {
      // Each star layer drifts independently (parallax).
      for (const { points, cfg } of layers) {
        points.rotation.y = t * cfg.spinSpeed;
        points.rotation.x = t * cfg.spinSpeed * 0.4;
      }
      // Bright stars twinkle individually via a sin wave on size.
      const baseSize = 1.6;
      constellationMat.size = baseSize + 0.7 * Math.sin(t * 1.8);
      // Nebulas slowly rotate.
      for (let i = 0; i < nebulaSprites.length; i++) {
        nebulaSprites[i].material.rotation = t * nebulaSpins[i];
      }
    },
    dispose() {
      for (const { points } of layers) {
        points.geometry.dispose();
        (points.material as THREE.PointsMaterial).dispose();
      }
      constellation.geometry.dispose();
      constellationMat.dispose();
      sharedSprite.dispose();
      for (const sp of nebulaSprites) sp.material.dispose();
      for (const tex of nebulaTextures) tex.dispose();
    },
  };
}

// ── Texture factories ────────────────────────────────────────────────────────

function makeStarSprite(): THREE.Texture {
  // Round soft-edged dot for additive points.
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNebulaTexture(): THREE.Texture {
  // Soft-edge cloud-like puff via layered radial gradients with random offsets.
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  // 6-8 overlapping soft blobs of varying alpha.
  for (let i = 0; i < 7; i++) {
    const cx = size / 2 + (Math.random() - 0.5) * size * 0.4;
    const cy = size / 2 + (Math.random() - 0.5) * size * 0.4;
    const r  = size * (0.18 + Math.random() * 0.25);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${0.25 + Math.random() * 0.25})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
