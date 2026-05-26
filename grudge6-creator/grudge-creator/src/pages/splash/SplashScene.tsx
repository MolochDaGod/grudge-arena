import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createStarfield } from './stars';
import { loadPortal } from './portal';
import { Champion, preloadAllClips } from './champions';
import { createSkullAltar, SkullAltar } from './skullAltar';
import { createScenery, createTorch, Torch } from './scenery';

/**
 * Splash scene — astral void, sci-fi portal, six race champions emerging.
 *
 * Composition
 * ───────────
 *   • Astral starfield (3 parallax layers + nebulas + bright twinkle stars)
 *   • Sci-fi portal in the middle, ringed by emissive frame, swirling centre
 *   • Six champions spawn from the portal one every ~3 seconds, walk to their
 *     formation arc on the camera-side, then idle facing the camera with
 *     mouse-tracked heads.
 *   • Click anywhere over the splash → all champions cast (attack_heavy clip).
 *
 * Camera is locked to a fixed framing with subtle breathing — never modified
 * by user input.
 */

const LINEUP: Array<{ id: string; angleDeg: number; spawnDelay: number }> = [
  { id: 'human',    angleDeg: -55, spawnDelay:  0   },
  { id: 'dwarf',    angleDeg: -33, spawnDelay:  2.2 },
  { id: 'orc',      angleDeg: -11, spawnDelay:  4.4 },
  { id: 'elf',       angleDeg:  11, spawnDelay:  6.6 },
  { id: 'undead',    angleDeg:  33, spawnDelay:  8.8 },
  { id: 'barbarian', angleDeg:  55, spawnDelay: 11.0 },
];
const FINAL_RADIUS = 4.6;
// Push the portal back into negative Z so the formation arc, which fans
// from the portal toward +Z (camera), comfortably sits IN FRONT of the gate.
const PORTAL_Z = -3.0;
// Skull altar stands further back, towering over the portal.
const ALTAR_Z = -11.0;
// Torches flank the camera-facing edges of the formation.
const TORCH_OFFSET_X = 6.0;
const TORCH_Z = 2.5;

export function SplashScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    // ── Renderer / scene / camera ──────────────────────────────────────────
    // Guarded: some sandboxed/headless environments can't allocate a WebGL
    // context.  Rather than crash the whole splash route we render a static
    // dark fallback and bail.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, failIfMajorPerformanceCaveat: false });
    } catch (err) {
      console.warn('[SplashScene] WebGL unavailable — rendering static fallback.', err);
      const fallback = document.createElement('div');
      fallback.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%, #0a1024 0%, #02030a 70%);';
      container.appendChild(fallback);
      return () => { if (container.contains(fallback)) container.removeChild(fallback); };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x02030a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02030a, 0.028);

    const camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 400);
    camera.position.set(0, 4.2, 16);
    camera.lookAt(0, 3.4, PORTAL_Z + 2);

    // ── Lighting ───────────────────────────────────────────────────────────
    // Cooler, dimmer ambient so the altar's red eye reads as the only
    // warm-hot point in the scene.
    scene.add(new THREE.AmbientLight(0x14182a, 0.35));
    const key = new THREE.DirectionalLight(0xc89878, 0.55);
    key.position.set(6, 12, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x4a68b8, 0.65);
    rim.position.set(-8, 5, -10);
    scene.add(rim);

    // ── Ground ─────────────────────────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(80, 64),
      new THREE.MeshStandardMaterial({ color: 0x040308, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Faint glowing ring on the ground beneath the portal — anchors the eye.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.8, 96),
      new THREE.MeshBasicMaterial({
        color: 0x4a8ad0, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    // ── Stars ──────────────────────────────────────────────────────────────
    const stars = createStarfield();
    scene.add(stars.group);

    // ── Drifting embers (warm contrast against the cool void) ──────────────
    const emberCount = 220;
    const emberGeom = new THREE.BufferGeometry();
    const emberPos = new Float32Array(emberCount * 3);
    const emberVel = new Float32Array(emberCount * 3);
    const emberSeed = new Float32Array(emberCount);
    for (let i = 0; i < emberCount; i++) {
      emberPos[i * 3 + 0] = (Math.random() - 0.5) * 32;
      emberPos[i * 3 + 1] = Math.random() * 14;
      emberPos[i * 3 + 2] = (Math.random() - 0.5) * 18;
      emberVel[i * 3 + 0] = (Math.random() - 0.5) * 0.04;
      emberVel[i * 3 + 1] = 0.02 + Math.random() * 0.07;
      emberVel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
      emberSeed[i] = Math.random() * Math.PI * 2;
    }
    emberGeom.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    const emberMat = new THREE.PointsMaterial({
      color: 0xffaa44, size: 0.09, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const embers = new THREE.Points(emberGeom, emberMat);
    scene.add(embers);

    // ── Distant scenery (mountain rings + foreground rocks) ────────────────
    const scenery = createScenery();
    scene.add(scenery.group);

    // ── Skull Altar — towering ruin behind the portal (async GLTF) ─────────
    let skullAltar: SkullAltar | null = null;
    createSkullAltar()
      .then(altar => {
        if (disposed) { altar.dispose(); return; }
        altar.group.position.z = ALTAR_Z;
        scene.add(altar.group);
        skullAltar = altar;
      })
      .catch(err => console.warn('[SplashScene] skull altar failed to load:', err));

    // ── Torches flanking the formation ─────────────────────────────────────
    const torches: Torch[] = [
      createTorch(0.0),
      createTorch(2.7),
    ];
    torches[0].group.position.set(-TORCH_OFFSET_X, 0, TORCH_Z);
    torches[1].group.position.set( TORCH_OFFSET_X, 0, TORCH_Z);
    for (const t of torches) scene.add(t.group);

    // ── Portal + Champions (async) ─────────────────────────────────────────
    const champions: Champion[] = [];
    let portalDispose: (() => void) | null = null;
    let portalUpdate: ((t: number, dt: number) => void) | null = null;
    let portalSpawn = new THREE.Vector3(0, 0, PORTAL_Z + 0.5);

    (async () => {
      // Portal first — provides the spawn point for champions.
      const portal = await loadPortal();
      if (disposed) { portal.dispose(); return; }
      portal.group.position.z = PORTAL_Z;
      scene.add(portal.group);
      portalDispose = portal.dispose;
      portalUpdate  = portal.update;
      // Compose the portal's local spawn point with its world placement so
      // champions emerge from the gate mouth, not the world origin.
      portalSpawn = portal.spawnPoint.clone().add(portal.group.position);

      // Preload all anim clips once — every champion shares them.
      const clips = await preloadAllClips();
      if (disposed) return;

      // Build all six champions, then load them IN PARALLEL. Spawn cadence
      // (3s apart) is honoured by the per-champion `spawnTime` regardless of
      // how long any individual GLB takes to fetch.
      const constructed = LINEUP.map(entry => {
        const a = THREE.MathUtils.degToRad(entry.angleDeg);
        // Final positions fan FORWARD from the portal toward the camera.
        // sin(a) gives lateral spread, cos(a) gives forward distance.
        const finalPos = new THREE.Vector3(
          Math.sin(a) * FINAL_RADIUS,
          0,
          PORTAL_Z + Math.cos(a) * FINAL_RADIUS,
        );
        // Champions face the CAMERA after arrival — see Champion.startEmerge
        // notes for the GLB axis convention (+Z is the "front" of the model).
        const finalYaw = 0;
        return new Champion({
          raceId: entry.id,
          finalPos,
          spawnPos: portalSpawn.clone(),
          spawnTime: entry.spawnDelay,
          finalYaw,
          clips,
        });
      });
      await Promise.all(constructed.map(async ch => {
        try {
          await ch.load();
          if (disposed) { ch.dispose(); return; }
          scene.add(ch.group);
          champions.push(ch);
        } catch (err) {
          console.warn(`[SplashScene] failed to load ${ch}:`, err);
        }
      }));
    })();

    // ── Mouse tracking → world-space target on a vertical plane ───────────
    const mouseTarget = new THREE.Vector3(0, 1.5, 11);
    let mouseActive = false;
    const raycaster = new THREE.Raycaster();
    // Plane at z=11 — IN FRONT of the champions (who stand at z≈4.2 facing
    // the camera at z≈14). Intersecting mouse rays with this plane gives a
    // target the champions can plausibly look at without their head yaw
    // saturating at the clamp limits.
    const gazePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -11);
    const ndc = new THREE.Vector2();
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(gazePlane, hit)) {
        mouseTarget.copy(hit);
        mouseActive = true;
      }
    };
    const onPointerLeave = () => { mouseActive = false; };
    // Listen on the window so the splash receives events even though the
    // <div> is pointer-events: none (the in-game UI sits above it).
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);

    // ── Click → all champions cast ─────────────────────────────────────────
    const onPointerDown = () => {
      const t = clock.getElapsedTime();
      for (const ch of champions) ch.triggerCast(t);
    };
    window.addEventListener('pointerdown', onPointerDown);

    // ── Resize ─────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // ── Animate ────────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.066);
      const t  = clock.getElapsedTime();

      stars.update(t, dt);
      portalUpdate?.(t, dt);
      skullAltar?.update(t);
      for (const tor of torches) tor.update(t);

      // Embers drift up + sway, recycle.
      const eArr = emberGeom.attributes.position.array as Float32Array;
      for (let i = 0; i < emberCount; i++) {
        eArr[i * 3 + 0] += emberVel[i * 3 + 0] + Math.sin(t * 0.6 + emberSeed[i]) * 0.003;
        eArr[i * 3 + 1] += emberVel[i * 3 + 1] * dt * 30;
        eArr[i * 3 + 2] += emberVel[i * 3 + 2];
        if (eArr[i * 3 + 1] > 16) {
          eArr[i * 3 + 0] = (Math.random() - 0.5) * 32;
          eArr[i * 3 + 1] = -1;
          eArr[i * 3 + 2] = (Math.random() - 0.5) * 18;
        }
      }
      emberGeom.attributes.position.needsUpdate = true;

      // Pulse the ground ring alongside the portal.
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.15 * (0.5 + 0.5 * Math.sin(t * 1.4));

      // Update each champion (handles spawn / walk / idle / cast / look).
      const lookTarget = mouseActive ? mouseTarget : null;
      for (const ch of champions) ch.update(t, dt, lookTarget);

      // Subtle camera breathing — never tracks input.
      camera.position.x = Math.sin(t * 0.13) * 0.55;
      camera.position.y = 4.2 + Math.sin(t * 0.21) * 0.12;
      camera.lookAt(0, 3.4, PORTAL_Z + 2);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerdown', onPointerDown);
      stars.dispose();
      portalDispose?.();
      skullAltar?.dispose();
      scenery.dispose();
      for (const tor of torches) tor.dispose();
      for (const ch of champions) ch.dispose();
      // Drop everything else still in the scene (ground, ring, embers).
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      emberGeom.dispose();
      emberMat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
      aria-hidden
    />
  );
}
