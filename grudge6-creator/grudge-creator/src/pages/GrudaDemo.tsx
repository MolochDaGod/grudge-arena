import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  loadGruda, LoadedGruda, assembleCharacter, buildColliderDebugMesh,
  liveColliderIds,
} from '@/game/gruda/GrudaLoader';
import { CharacterGruda, WeaponGruda } from '@/game/gruda/GrudaSchema';
import { modelLoader } from '@/game/ModelLoader';

/**
 * Gruda Demo — proof-of-life for the .gruda asset format.
 *
 * What you see
 * ────────────
 *   • A character loaded from `public/gruda/human_knight.gruda`
 *   • A longsword described by `public/gruda/longsword.gruda`, mounted to the
 *     `weaponMain` socket (right hand) declared on the character
 *   • Hurt colliders (red wireframes) attached to abstract bones the
 *     character.gruda declared
 *   • Hit colliders (yellow wireframes) carried by the weapon, going GREEN
 *     during the active damage window of the current animation
 *   • A scrubber that lets you walk through the attack_light clip's time so
 *     you can WATCH the damage window open and close
 *   • A live validation report showing the manifests' rule check results
 */

const CHAR_URL = `${import.meta.env.BASE_URL}gruda/human_knight.gruda`;
const WEAPON_URL = `${import.meta.env.BASE_URL}gruda/longsword.gruda`;

function makeProceduralLongsword(): THREE.Group {
  // Procedural placeholder for the demo — same dimensions as the .gruda.
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, metalness: 0.85, roughness: 0.3 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.9, roughness: 0.3 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.014), steel);
  blade.position.y = 0.18 + 0.41; g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 8), steel);
  tip.position.y = 0.18 + 0.82 + 0.05; g.add(tip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.04), gold);
  guard.position.y = 0.165; g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 12), leather);
  grip.position.y = 0.085; g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), gold);
  pommel.position.y = 0.012; g.add(pommel);
  return g;
}

interface DemoState {
  ready: boolean;
  charManifest: CharacterGruda | null;
  weaponManifest: WeaponGruda | null;
  charErrors: string[]; charWarnings: string[];
  weaponErrors: string[]; weaponWarnings: string[];
}

export function GrudaDemo({ onExit }: { onExit: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<DemoState>({
    ready: false, charManifest: null, weaponManifest: null,
    charErrors: [], charWarnings: [], weaponErrors: [], weaponWarnings: [],
  });
  const scrubRef = useRef(0.4); // current scrub time in attack_light clip
  const [scrub, setScrub] = useState(0.4);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e16);
    scene.fog = new THREE.FogExp2(0x0a0e16, 0.04);

    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(2.6, 1.6, 3.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0x223044, 0.6));
    const key = new THREE.DirectionalLight(0xffe8c8, 1.1);
    key.position.set(3, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x4a78ff, 0.6);
    rim.position.set(-4, 3, -3); scene.add(rim);

    // Floor grid
    const grid = new THREE.GridHelper(20, 20, 0x334458, 0x1a2330);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);

    let mixer: THREE.AnimationMixer | null = null;
    let attackAction: THREE.AnimationAction | null = null;
    let hitDebug: Array<{ id: string; mesh: THREE.Object3D; mat: THREE.MeshBasicMaterial }> = [];
    let liveSet = new Set<string>();
    let raf = 0;

    (async () => {
      const charLoaded = await loadGruda(CHAR_URL);
      const weaponLoaded = await loadGruda(WEAPON_URL);
      if (disposed) return;
      const charManifest = charLoaded.manifest as CharacterGruda;
      const weaponManifest = weaponLoaded.manifest as WeaponGruda;

      setState({
        ready: true,
        charManifest, weaponManifest,
        charErrors: charLoaded.checks.errors,
        charWarnings: charLoaded.checks.warnings,
        weaponErrors: weaponLoaded.checks.errors,
        weaponWarnings: weaponLoaded.checks.warnings,
      });

      // Use existing modelLoader to load anims (so we don't duplicate that work).
      await modelLoader.loadAll();
      if (disposed) return;

      // Override weapon's instantiate to use our procedural mesh
      // (the demo doesn't ship a real longsword.glb).
      const weaponLoadedProc: LoadedGruda = {
        ...weaponLoaded,
        instantiate: async () => makeProceduralLongsword(),
      };

      const assembled = await assembleCharacter(charLoaded, [weaponLoadedProc]);
      if (disposed) return;
      scene.add(assembled.root);

      // Set up animation mixer with the attack_light clip (re-using ModelLoader's assets)
      const attackClip = modelLoader.assets.anims.attack;
      if (attackClip) {
        mixer = new THREE.AnimationMixer(assembled.body);
        attackAction = mixer.clipAction(attackClip);
        attackAction.play();
        attackAction.paused = true;
        attackAction.time = scrubRef.current;
      }

      // Build hurtbox debug meshes (red), parented to the resolved bone
      for (const hb of charManifest.hurtboxes) {
        if (!hb.bone) continue;
        const bone = assembled.bonesByAbstract.get(hb.bone);
        if (!bone) continue;
        const dbg = buildColliderDebugMesh(hb, 0xff3344);
        bone.add(dbg);
      }

      // Build hit collider debug meshes (yellow → green when live), parented to weapon root
      const weaponRoot = assembled.attachments[0]?.mesh;
      if (weaponRoot) {
        for (const hc of weaponManifest.hitColliders) {
          const mesh = buildColliderDebugMesh(hc, 0xffd84a) as THREE.Mesh;
          weaponRoot.add(mesh);
          hitDebug.push({ id: hc.id, mesh, mat: mesh.material as THREE.MeshBasicMaterial });
        }
      }
    })().catch(err => console.error('[GrudaDemo] init failed:', err));

    const clock = new THREE.Clock();
    const animate = () => {
      const _dt = clock.getDelta();
      controls.update();
      if (mixer && attackAction) {
        // Sync animation to scrub slider value (seconds)
        attackAction.time = scrubRef.current;
        mixer.update(0); // force apply
      }
      // Update which hit colliders are live based on scrub
      if (state.weaponManifest) {
        liveSet = liveColliderIds(state.weaponManifest, 'attack_light', scrubRef.current);
        for (const d of hitDebug) {
          const live = liveSet.has(d.id);
          d.mat.color.setHex(live ? 0x4aff88 : 0xffd84a);
          d.mat.opacity = live ? 1.0 : 0.55;
        }
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#02030a', color: '#cfd8e3', fontFamily: 'system-ui, sans-serif' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16, display: 'flex',
        justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10,
        pointerEvents: 'none',
      }}>
        <div style={{ pointerEvents: 'auto' }}>
          <button
            onClick={onExit}
            style={{
              background: 'rgba(20,28,44,0.8)', border: '1px solid #334458',
              color: '#cfd8e3', padding: '8px 14px', cursor: 'pointer', borderRadius: 4,
            }}
          >← Back</button>
        </div>
        <div style={{
          background: 'rgba(8,12,20,0.85)', border: '1px solid #334458',
          padding: '12px 16px', borderRadius: 6, maxWidth: 460, fontSize: 12, lineHeight: 1.5,
          pointerEvents: 'auto',
        }}>
          <div style={{ fontWeight: 700, color: '#ffd84a', marginBottom: 6 }}>.gruda demo</div>
          <div>Character: <code>{state.charManifest?.id ?? '…'}</code></div>
          <div>Weapon: <code>{state.weaponManifest?.id ?? '…'}</code> → socket <code>{state.weaponManifest?.attach.socket}</code></div>
          <div style={{ marginTop: 6, color: '#7acfff' }}>Hurtboxes: {state.charManifest?.hurtboxes.length} (red)</div>
          <div style={{ color: '#7acfff' }}>Hit colliders: {state.weaponManifest?.hitColliders.length} (yellow → green when live)</div>
        </div>
      </div>

      {/* Scrubber */}
      <div style={{
        position: 'absolute', bottom: 80, left: 16, right: 16, zIndex: 10,
        background: 'rgba(8,12,20,0.85)', border: '1px solid #334458',
        padding: '14px 18px', borderRadius: 6, fontSize: 13,
      }}>
        <div style={{ marginBottom: 6, color: '#ffd84a' }}>
          Scrub <code>attack_light</code> clip — watch the hit window light up
        </div>
        <input
          type="range" min={0} max={1.2} step={0.01} value={scrub}
          onChange={e => { const v = parseFloat(e.target.value); setScrub(v); scrubRef.current = v; }}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: '#8a98ad', fontSize: 11 }}>
          <span>0.0s</span>
          <span>t = {scrub.toFixed(2)}s {state.weaponManifest && liveColliderIds(state.weaponManifest, 'attack_light', scrub).size > 0 && <strong style={{ color: '#4aff88' }}>● HIT WINDOW LIVE</strong>}</span>
          <span>1.2s</span>
        </div>
      </div>

      {/* Validation panel */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 10,
        background: 'rgba(8,12,20,0.85)', border: '1px solid #334458',
        padding: '8px 14px', borderRadius: 6, fontSize: 11, color: '#8a98ad',
      }}>
        {state.ready ? (
          <>
            <strong style={{ color: state.charErrors.length ? '#ff6b6b' : '#4aff88' }}>
              character validation: {state.charErrors.length === 0 ? 'PASS' : `${state.charErrors.length} errors`}
            </strong>
            {state.charWarnings.length > 0 && <span style={{ color: '#ffd84a', marginLeft: 8 }}>{state.charWarnings.length} warnings</span>}
            <span style={{ marginLeft: 18 }}>·</span>
            <strong style={{ color: state.weaponErrors.length ? '#ff6b6b' : '#4aff88', marginLeft: 12 }}>
              weapon validation: {state.weaponErrors.length === 0 ? 'PASS' : `${state.weaponErrors.length} errors`}
            </strong>
            {[...state.charErrors, ...state.weaponErrors].slice(0, 3).map((e, i) =>
              <div key={i} style={{ color: '#ff8888', marginTop: 4 }}>• {e}</div>
            )}
          </>
        ) : 'loading manifests…'}
      </div>
    </div>
  );
}
