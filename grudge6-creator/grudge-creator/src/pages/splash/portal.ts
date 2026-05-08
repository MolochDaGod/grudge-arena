/**
 * Sci-fi portal gate.
 *
 * Loads `models/gltf/portal_gate/scene.gltf` and aggressively trims the prop —
 * the source asset ships with desert/winter terrain rings + grass that we
 * don't want around the splash; we keep only the portal frame and centre.
 *
 * The Center mesh is overridden with a custom emissive material driven each
 * frame for the swirling event-horizon look. A point light pulses with it so
 * the champions emerging are warm-lit by the gate.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const B = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface Portal {
  group: THREE.Group;
  /** World position where champions should spawn — front face of the portal. */
  spawnPoint: THREE.Vector3;
  /** Forward direction the portal faces (unit vector pointing AWAY from gate). */
  forward: THREE.Vector3;
  light: THREE.PointLight;
  /** Drive shimmer + light pulse + slow spin. */
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

export async function loadPortal(): Promise<Portal> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${B}/models/gltf/portal_gate/scene.gltf`);
  const root = gltf.scene;

  // Source units are centimetres + the asset includes terrain. First scale to
  // a sane size, then split materials: keep `Portal` + `Center`, drop the rest.
  // Auto-scale based on bbox so the *gate alone* ends up ~6m tall.
  const portalMeshes: THREE.Mesh[] = [];
  const centerMeshes: THREE.Mesh[] = [];
  const trash: THREE.Object3D[] = [];

  root.traverse(obj => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const matName = (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? '';
    if (/^Portal/i.test(matName)) portalMeshes.push(m);
    else if (/^Center/i.test(matName)) centerMeshes.push(m);
    else trash.push(m);
  });

  // Hide / remove non-essential terrain meshes — keeps draw calls down too.
  for (const t of trash) t.visible = false;

  // Compute the bbox of just the portal-frame meshes to size correctly.
  const frameBox = new THREE.Box3();
  for (const m of portalMeshes) frameBox.expandByObject(m);
  const frameHeight = Math.max(0.001, frameBox.max.y - frameBox.min.y);
  const targetHeight = 6.0;
  const scale = targetHeight / frameHeight;
  root.scale.setScalar(scale);

  // Re-bbox after scale, recentre at origin (X), feet on ground (Y), face +Z.
  const box2 = new THREE.Box3();
  for (const m of portalMeshes) box2.expandByObject(m);
  // We can't translate the meshes individually after parent scale — translate
  // the whole root so the portal frame's base sits at y=0.
  root.position.x = -((box2.min.x + box2.max.x) * 0.5);
  root.position.y = -box2.min.y;
  root.position.z = -((box2.min.z + box2.max.z) * 0.5);

  // The asset's "front" axis after Y-up GLTF conversion is +Z facing the
  // camera by default, which is what we want. No extra rotation needed.

  // Override the Center material with a glowing event-horizon swirl. We use
  // an additive shader-driven texture rather than a real shader for portability.
  const swirlTex = makeSwirlTexture();
  const centerMat = new THREE.MeshBasicMaterial({
    map: swirlTex, color: 0xa8e0ff, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (const m of centerMeshes) {
    if (Array.isArray(m.material)) for (const mat of m.material) (mat as THREE.Material).dispose();
    else (m.material as THREE.Material).dispose();
    m.material = centerMat;
  }

  // Make the portal frame itself emissive-glowing so it reads as energised.
  for (const m of portalMeshes) {
    const wrap = (mat: THREE.Material) => {
      const std = mat as THREE.MeshStandardMaterial;
      // Standard material — boost emissive without losing diffuse texture.
      std.emissive = new THREE.Color(0x4a8ad0);
      std.emissiveIntensity = 0.4;
      std.roughness = 0.4;
      std.metalness = 0.6;
      std.needsUpdate = true;
      return std;
    };
    if (Array.isArray(m.material)) m.material = m.material.map(wrap);
    else m.material = wrap(m.material);
  }

  const group = new THREE.Group();
  group.add(root);

  // A bright point light inside the portal mouth — washes the champions in
  // pale-blue glow as they emerge.
  const light = new THREE.PointLight(0x66c4ff, 4.5, 14, 1.4);
  light.position.set(0, targetHeight * 0.45, 0.1);
  group.add(light);

  // Soft halo billboard behind the portal so the void glow bleeds outward.
  const haloTex = makeRadialGradient('#88c8ff', '#3050a0', '#000000');
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(targetHeight * 1.3, targetHeight * 1.6, 1);
  halo.position.set(0, targetHeight * 0.5, -0.2);
  group.add(halo);

  const spawnPoint = new THREE.Vector3(0, 0, 0.5);
  const forward = new THREE.Vector3(0, 0, 1);

  return {
    group,
    spawnPoint,
    forward,
    light,
    update(t, _dt) {
      // Swirl: slowly rotate the texture (acts on UVs via map.rotation).
      swirlTex.rotation = t * 0.6;
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.4);
      centerMat.opacity = 0.85 + 0.15 * Math.sin(t * 2.2);
      light.intensity = 3.6 + 1.6 * pulse;
      haloMat.opacity = 0.45 + 0.20 * pulse;
    },
    dispose() {
      group.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mt of mats) (mt as THREE.Material | null)?.dispose();
        }
        const sp = obj as THREE.Sprite;
        if (sp.isSprite) {
          sp.material.map?.dispose();
          sp.material.dispose();
        }
      });
      swirlTex.dispose();
      haloTex.dispose();
    },
  };
}

// ── Texture factories ────────────────────────────────────────────────────────

function makeSwirlTexture(): THREE.CanvasTexture {
  // Spiral swirl — concentric arcs that read as motion when the texture is
  // rotated each frame.
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  // Background dark void
  const bg = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  bg.addColorStop(0, 'rgba(180,220,255,1)');
  bg.addColorStop(0.45, 'rgba(60,120,200,0.6)');
  bg.addColorStop(0.85, 'rgba(10,20,60,0.5)');
  bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  // Spiral arms
  ctx.translate(size / 2, size / 2);
  for (let arm = 0; arm < 5; arm++) {
    ctx.save();
    ctx.rotate((arm / 5) * Math.PI * 2);
    ctx.strokeStyle = `rgba(180,220,255,${0.3 + Math.random() * 0.2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let r = 4; r < size / 2; r += 2) {
      const a = (r / 6);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (r === 4) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.center.set(0.5, 0.5);
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
