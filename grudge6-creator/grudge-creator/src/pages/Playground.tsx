import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import { modelLoader as ModelLoader } from '@/game/ModelLoader';
import { ToonCharacter } from '@/game/ToonCharacter';
import { CharacterConfig } from '@/game/CharacterConfig';

const B = import.meta.env.BASE_URL.replace(/\/$/, '');
const ui = (name: string) => `${B}/ui/${name}`;

interface Props {
  character: CharacterConfig;
  onExit: () => void;
}

type Anim = 'idle' | 'walk' | 'run' | 'attack' | 'attack_heavy' | 'dodge' | 'death';

export function Playground({ character, onExit }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const charRef  = useRef<ToonCharacter | null>(null);
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [currentAnim, setCurrentAnim] = useState<Anim>('idle');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x06070d, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Scene + camera ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06070d, 0.024);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(3.4, 2.6, 4.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;
    controls.minDistance = 2.0;
    controls.maxDistance = 12.0;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();

    // ── Lighting ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x303848, 0.55));
    const key = new THREE.DirectionalLight(0xffe6c8, 1.6);
    key.position.set(6, 10, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 30;
    const camS = 8;
    key.shadow.camera.left = -camS; key.shadow.camera.right = camS;
    key.shadow.camera.top  =  camS; key.shadow.camera.bottom = -camS;
    scene.add(key);
    const rim = new THREE.DirectionalLight(character.accentColor ? new THREE.Color(character.accentColor).getHex() : 0x6080ff, 0.6);
    rim.position.set(-4, 4, -6);
    scene.add(rim);

    // ── Cannon physics world (for terrain collision; future-proof for props) ──
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.NaiveBroadphase();

    // ── Terrain: heightfield with gentle hills ───────────────────────────────
    const TER_SIZE = 30;
    const TER_SEG  = 60;
    const terGeo = new THREE.PlaneGeometry(TER_SIZE, TER_SIZE, TER_SEG, TER_SEG);
    terGeo.rotateX(-Math.PI / 2);
    const pos = terGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.hypot(x, z);
      // Flat near origin (so character stands cleanly), gentle hills outside
      const flat = Math.max(0, 1 - d / 4.5);
      const h = (1 - flat) * (
        Math.sin(x * 0.3) * 0.35 +
        Math.cos(z * 0.27) * 0.4 +
        Math.sin((x + z) * 0.18) * 0.25
      );
      pos.setY(i, h);
    }
    terGeo.computeVertexNormals();
    const terMat = new THREE.MeshStandardMaterial({
      color: 0x2a2418, roughness: 1, metalness: 0,
      flatShading: false,
    });
    const terrain = new THREE.Mesh(terGeo, terMat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Cannon ground plane (flat under the character — terrain bumps are visual)
    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);

    // ── Decorative props: brazier ring + stone runes ─────────────────────────
    const auxRafHandles: number[] = [];
    addPlatform(scene);
    addBraziers(scene, character.accentColor, auxRafHandles);
    addRuneRing(scene, character.accentColor);

    // ── Load character ───────────────────────────────────────────────────────
    let toonChar: ToonCharacter | null = null;
    let mixerClock = new THREE.Clock();

    (async () => {
      try {
        const assets = await ModelLoader.loadAll(B);
        if (disposed) return;
        const errs = ModelLoader.assetsRef.loadErrors.slice();
        if (errs.length > 0) setLoadErrors(errs);

        const loaded = ModelLoader.cloneCharacter(character.modelKey as any);
        if (!loaded) {
          setErrorMsg(`Failed to load ${character.modelKey} model`);
          return;
        }
        toonChar = new ToonCharacter(loaded, character.color);
        if (character.loadout) toonChar.applyLoadout(character.loadout);
        toonChar.setWeaponMode(character.startRanged ? 'ranged' : 'melee');
        toonChar.group.castShadow = true;
        toonChar.group.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
        });
        scene.add(toonChar.group);
        charRef.current = toonChar;
        toonChar.playAnimation('idle', true);
        setReady(true);
        // Touch animations to surface availability
        void assets;
      } catch (err) {
        console.error('[Playground] character load failed:', err);
        setErrorMsg((err as Error)?.message ?? 'Unknown error');
      }
    })();

    // ── Render loop ──────────────────────────────────────────────────────────
    let raf = 0;
    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, mixerClock.getDelta());
      world.step(1 / 60, dt, 3);
      controls.update();
      if (toonChar) toonChar.update(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // ── Resize ───────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      auxRafHandles.forEach(h => cancelAnimationFrame(h));
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      scene.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : (m.material ? [m.material] : []);
        mats.forEach(mat => mat.dispose?.());
      });
    };
  }, [character.modelKey, character.color, character.accentColor, character.startRanged, character.loadout]);

  const playAnim = (a: Anim) => {
    if (!charRef.current) return;
    setCurrentAnim(a);
    charRef.current.playAnimation(a, true);
    // For one-shots, drop back to idle when finished
    if (a !== 'idle' && a !== 'walk' && a !== 'run') {
      const check = () => {
        if (!charRef.current) return;
        if (charRef.current.isFinished(a)) {
          charRef.current.playAnimation('idle');
          setCurrentAnim('idle');
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06070d' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5,
        pointerEvents: 'none',
      }}>
        <button onClick={onExit} style={{
          pointerEvents: 'auto',
          background: 'rgba(8,6,12,0.75)', border: '1px solid #2a2018',
          padding: '10px 22px', color: '#bda871', fontFamily: "'Cinzel', serif",
          letterSpacing: '0.3em', textTransform: 'uppercase', fontSize: 11,
          cursor: 'pointer', borderRadius: 3,
        }}>← Forge Anew</button>

        <div style={{
          background: 'rgba(8,6,12,0.75)',
          border: `1px solid ${character.accentColor}66`,
          padding: '10px 22px', borderRadius: 3,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
        }}>
          <div className="font-decorative" style={{
            fontSize: 18, color: character.accentColor, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>{character.name}</div>
          <div style={{ fontSize: 9, color: '#7a6f62', letterSpacing: '0.35em', textTransform: 'uppercase' }}>
            {character.subtitle}
          </div>
        </div>
      </div>

      {/* Loading veil */}
      {!ready && !errorMsg && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(2,3,8,0.75)', zIndex: 6,
        }}>
          <div className="font-decorative" style={{ color: '#bda871', letterSpacing: '0.4em', fontSize: 14 }}>
            Forging vessel…
          </div>
        </div>
      )}

      {/* Error toast */}
      {errorMsg && (
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 22px', background: 'rgba(40,10,10,0.9)',
          border: '1px solid #883333', borderRadius: 3, zIndex: 6,
          color: '#e08866', fontFamily: 'inherit', fontSize: 12, letterSpacing: '0.15em',
        }}>
          ⚠ {errorMsg}
        </div>
      )}

      {/* Non-blocking warnings for partial asset failures */}
      {loadErrors.length > 0 && (
        <div style={{
          position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 18px', background: 'rgba(40,28,8,0.9)',
          border: '1px solid #6a4818', borderRadius: 3, zIndex: 6,
          color: '#d8a868', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.18em',
          textTransform: 'uppercase',
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <span>⚠ Some assets unavailable: {loadErrors.slice(0, 3).join(', ')}{loadErrors.length > 3 ? ` (+${loadErrors.length - 3})` : ''}</span>
          <button onClick={() => setLoadErrors([])} style={{
            background: 'none', border: '1px solid #6a3a1a', color: '#e0a060',
            padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10,
          }}>×</button>
        </div>
      )}

      {/* Anim picker */}
      {ready && (
        <div style={{
          position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, zIndex: 5,
          background: 'rgba(8,6,12,0.85)', border: '1px solid #2a2018',
          padding: '10px 14px', borderRadius: 3,
        }}>
          {(['idle', 'walk', 'run', 'attack', 'attack_heavy', 'dodge', 'death'] as Anim[]).map(a => (
            <button key={a} onClick={() => playAnim(a)} style={{
              padding: '8px 14px',
              background: currentAnim === a ? `${character.accentColor}33` : 'rgba(0,0,0,0.4)',
              border: `1px solid ${currentAnim === a ? character.accentColor : '#3a3028'}`,
              color: currentAnim === a ? character.accentColor : '#a8956d',
              fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: '0.2em',
              textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
              transition: 'all 0.15s',
            }}>{a.replace('_', ' ')}</button>
          ))}
        </div>
      )}

      {/* Camera hint */}
      <div style={{
        position: 'absolute', bottom: 6, right: 14, zIndex: 5,
        fontSize: 9, color: '#5a5048', letterSpacing: '0.3em', textTransform: 'uppercase',
        pointerEvents: 'none',
      }}>
        drag · orbit · scroll · zoom
      </div>
    </div>
  );
}

// ── Decorative scene props ─────────────────────────────────────────────────────

function addPlatform(scene: THREE.Scene) {
  // Round stone dais under the character
  const platGeo = new THREE.CylinderGeometry(2.4, 2.6, 0.12, 48);
  const platMat = new THREE.MeshStandardMaterial({ color: 0x3a342a, roughness: 0.92, metalness: 0.0 });
  const plat = new THREE.Mesh(platGeo, platMat);
  plat.position.y = 0.06;
  plat.receiveShadow = true;
  plat.castShadow = false;
  scene.add(plat);

  // Inner ring inset
  const innerGeo = new THREE.RingGeometry(1.6, 1.85, 48);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22, side: THREE.DoubleSide });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.121;
  scene.add(inner);
}

function addBraziers(scene: THREE.Scene, accentColor: string, rafHandles: number[]) {
  const positions: [number, number][] = [
    [-3.0, -3.0], [3.0, -3.0], [-3.0, 3.0], [3.0, 3.0],
  ];
  const accent = new THREE.Color(accentColor || '#cc8844');
  positions.forEach(([x, z]) => {
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.18, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x202028, roughness: 0.9, metalness: 0.3 }),
    );
    stand.position.set(x, 0.7, z);
    stand.castShadow = true;
    scene.add(stand);

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.20, 0.18, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.95, metalness: 0.4 }),
    );
    bowl.position.set(x, 1.45, z);
    bowl.castShadow = true;
    scene.add(bowl);

    // Flame core (animated emissive sphere)
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85 }),
    );
    flame.position.set(x, 1.65, z);
    scene.add(flame);

    // Point light
    const pl = new THREE.PointLight(accent, 1.4, 7, 1.6);
    pl.position.set(x, 1.7, z);
    scene.add(pl);

    // Subtle flicker
    const t0 = Math.random() * 6;
    const orig = pl.intensity;
    const tickFlicker = () => {
      const t = performance.now() * 0.003 + t0;
      pl.intensity = orig * (0.85 + Math.sin(t * 5) * 0.08 + Math.sin(t * 11) * 0.06);
      flame.scale.setScalar(0.95 + Math.sin(t * 7) * 0.05);
      rafHandles.push(requestAnimationFrame(tickFlicker));
    };
    rafHandles.push(requestAnimationFrame(tickFlicker));
  });
}

function addRuneRing(scene: THREE.Scene, accentColor: string) {
  // Glowing rune circle on the platform
  const accent = new THREE.Color(accentColor || '#bda871');
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.05, 2.18, 96),
    new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.13;
  scene.add(ring);

  // Eight rune nodes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: accent }),
    );
    node.position.set(Math.cos(a) * 2.12, 0.16, Math.sin(a) * 2.12);
    scene.add(node);
  }
}
