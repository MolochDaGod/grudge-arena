/**
 * Ancient relic — a towering rune-etched monolith that looms behind the
 * portal. Procedural; no external asset.
 *
 * Composition
 *   • Stepped stone plinth (3 tiers).
 *   • Tall tapered obelisk shaft with a slightly carved silhouette.
 *   • Capstone with a hovering rune crystal.
 *   • Glowing rune glyphs etched down each face (canvas texture, emissive).
 *   • A cool point light + a sprite halo so the relic stays readable against
 *     the dark void even when the portal pulse is between beats.
 *
 * Returns the assembled group plus an update(t) for the rune pulse + crystal
 * float, and a dispose() that frees every geometry / material / texture.
 */
import * as THREE from 'three';

export interface Relic {
  group: THREE.Group;
  update: (t: number) => void;
  dispose: () => void;
}

export function createRelic(): Relic {
  const group = new THREE.Group();
  const disposers: Array<() => void> = [];

  // ── Materials ───────────────────────────────────────────────────────────
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a52, roughness: 0.92, metalness: 0.05,
  });
  disposers.push(() => stoneMat.dispose());

  const runeTex = makeRuneTexture();
  disposers.push(() => runeTex.dispose());

  const obeliskMat = new THREE.MeshStandardMaterial({
    color: 0x36363c, roughness: 0.85, metalness: 0.1,
    emissive: new THREE.Color(0x4a8ad0),
    emissiveMap: runeTex,
    emissiveIntensity: 1.4,
  });
  disposers.push(() => obeliskMat.dispose());

  // ── Plinth (3 tiers) ────────────────────────────────────────────────────
  const tierSpecs: Array<[number, number, number]> = [
    [4.6, 0.6, 4.6],   // bottom
    [3.6, 0.5, 3.6],   // middle
    [2.8, 0.45, 2.8],  // top
  ];
  let baseY = 0;
  for (const [w, h, d] of tierSpecs) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, stoneMat);
    m.position.y = baseY + h / 2;
    group.add(m);
    disposers.push(() => g.dispose());
    baseY += h;
  }

  // ── Tapered obelisk shaft ───────────────────────────────────────────────
  // Slight square taper from 1.4 -> 0.9 over 9m. Use a custom box so we can
  // wrap the rune texture once across each of the 4 faces.
  const shaftHeight = 9.0;
  const shaftBottom = 1.4;
  const shaftTop = 0.9;
  const shaftGeom = makeTaperedBox(shaftBottom, shaftTop, shaftHeight);
  disposers.push(() => shaftGeom.dispose());
  const shaft = new THREE.Mesh(shaftGeom, obeliskMat);
  shaft.position.y = baseY + shaftHeight / 2;
  group.add(shaft);
  baseY += shaftHeight;

  // ── Capstone (pyramid) ──────────────────────────────────────────────────
  const capHeight = 1.0;
  const capGeom = new THREE.ConeGeometry(shaftTop * 0.78, capHeight, 4);
  capGeom.rotateY(Math.PI / 4);
  disposers.push(() => capGeom.dispose());
  const cap = new THREE.Mesh(capGeom, stoneMat);
  cap.position.y = baseY + capHeight / 2;
  group.add(cap);
  baseY += capHeight;

  // ── Hovering rune crystal ──────────────────────────────────────────────
  const crystalGeom = new THREE.OctahedronGeometry(0.36, 0);
  disposers.push(() => crystalGeom.dispose());
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xa8e0ff, emissive: new THREE.Color(0x66c4ff),
    emissiveIntensity: 2.4, roughness: 0.15, metalness: 0.3,
    transparent: true, opacity: 0.9,
  });
  disposers.push(() => crystalMat.dispose());
  const crystal = new THREE.Mesh(crystalGeom, crystalMat);
  const crystalY0 = baseY + 0.7;
  crystal.position.y = crystalY0;
  group.add(crystal);

  // ── Halo + key light around the relic ──────────────────────────────────
  const haloTex = makeRadialGradient('#88c8ff', '#3050a0', '#00000000');
  disposers.push(() => haloTex.dispose());
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  disposers.push(() => haloMat.dispose());
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(7, 8, 1);
  halo.position.y = baseY * 0.55;
  halo.position.z = -0.3;
  group.add(halo);

  const relicLight = new THREE.PointLight(0x66c4ff, 2.6, 18, 1.6);
  relicLight.position.set(0, baseY * 0.65, 1.2);
  group.add(relicLight);

  return {
    group,
    update(t) {
      // Pulse the rune glow + crystal hover/spin.
      const pulse = 0.6 + 0.4 * Math.sin(t * 0.9);
      obeliskMat.emissiveIntensity = 1.0 + 0.9 * pulse;
      crystalMat.emissiveIntensity = 1.8 + 1.2 * pulse;
      relicLight.intensity = 1.8 + 1.6 * pulse;
      haloMat.opacity = 0.40 + 0.25 * pulse;
      crystal.position.y = crystalY0 + Math.sin(t * 1.3) * 0.08;
      crystal.rotation.y = t * 0.7;
      crystal.rotation.x = t * 0.4;
    },
    dispose() {
      for (const d of disposers) d();
    },
  };
}

// ── Geometry helpers ──────────────────────────────────────────────────────

/**
 * Symmetric tapered box (square cross-section), bottom→top width transition
 * over `height`. UVs are laid out so each of the 4 side faces gets the full
 * 0..1 range — the rune texture wraps once per face.
 */
function makeTaperedBox(bottomW: number, topW: number, height: number): THREE.BufferGeometry {
  const hb = bottomW / 2, ht = topW / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];

  // Vertices: bottom 4, top 4
  const bottoms = [
    [-hb, 0, -hb], [ hb, 0, -hb], [ hb, 0,  hb], [-hb, 0,  hb],
  ];
  const tops = [
    [-ht, height, -ht], [ ht, height, -ht], [ ht, height,  ht], [-ht, height,  ht],
  ];

  // Build 4 side quads (each gets its own vertices for hard normals + clean UVs)
  // Side order: -Z, +X, +Z, -X
  const sideDefs: Array<[number, number, [number, number, number]]> = [
    [0, 1, [0, 0, -1]], // -Z
    [1, 2, [1, 0, 0]],  // +X
    [2, 3, [0, 0, 1]],  // +Z
    [3, 0, [-1, 0, 0]], // -X
  ];
  for (const [a, b, n] of sideDefs) {
    const v0 = bottoms[a], v1 = bottoms[b], v2 = tops[b], v3 = tops[a];
    const base = positions.length / 3;
    positions.push(...v0, ...v1, ...v2, ...v3);
    uvs.push(0, 0,  1, 0,  1, 1,  0, 1);
    for (let i = 0; i < 4; i++) normals.push(...n);
    indices.push(base, base + 1, base + 2,  base, base + 2, base + 3);
  }

  // Top cap
  {
    const base = positions.length / 3;
    for (const v of tops) positions.push(...v);
    uvs.push(0, 0,  1, 0,  1, 1,  0, 1);
    for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
    indices.push(base, base + 2, base + 1,  base, base + 3, base + 2);
  }
  // Bottom cap (skipped — relic sits on plinth)

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

// ── Texture factories ─────────────────────────────────────────────────────

/** Vertical column of glowing rune glyphs etched down the obelisk face. */
function makeRuneTexture(): THREE.CanvasTexture {
  const w = 128, h = 1024;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;

  // Black background — emissiveMap reads luminance: dark = unlit, bright = glow.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // 14 stacked rune glyphs down the centre.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const nGlyphs = 14;
  const gap = h / (nGlyphs + 1);
  const cellW = w * 0.55;
  for (let i = 0; i < nGlyphs; i++) {
    drawRune(ctx, w / 2, gap * (i + 1), cellW * 0.45);
  }

  // Soft glow halo behind glyphs (white to faded white) to feel etched-glowing.
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(120,180,255,0.18)';
  for (let i = 0; i < nGlyphs; i++) {
    ctx.beginPath();
    ctx.arc(w / 2, gap * (i + 1), cellW * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Random angular rune glyph composed of 3-5 strokes. */
function drawRune(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  // Use a deterministic-ish set of segment patterns picked by index.
  const patterns: Array<Array<[number, number, number, number]>> = [
    [[-1, -1, 1, -1], [0, -1, 0, 1], [-1, 1, 1, 1]],                    // I-frame
    [[-1, -1, 1, 1], [-1, 1, 1, -1]],                                   // X
    [[-1, -1, 0, 1], [0, 1, 1, -1], [-0.5, 0, 0.5, 0]],                 // triangle + bar
    [[-1, -1, -1, 1], [-1, 0, 1, 0], [1, -1, 1, 1]],                    // H
    [[-1, 1, 0, -1], [0, -1, 1, 1], [-1, 0, 1, 0]],                     // M
    [[-1, -1, 1, -1], [1, -1, -1, 1], [-1, 1, 1, 1]],                   // Z
    [[0, -1, 0, 1], [-1, 0, 1, 0], [-0.7, -0.7, 0.7, 0.7]],             // asterisk
    [[-1, -1, 1, -1], [-1, -1, -1, 1], [1, -1, 1, 1], [-1, 1, 1, 1]],   // square
  ];
  const p = patterns[Math.floor(Math.random() * patterns.length)];
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of p) {
    ctx.moveTo(cx + x0 * size, cy + y0 * size);
    ctx.lineTo(cx + x1 * size, cy + y1 * size);
  }
  ctx.stroke();
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
