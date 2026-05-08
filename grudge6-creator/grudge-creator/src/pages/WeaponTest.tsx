/**
 * WeaponTest — Interactive test page for WeaponAnimController
 *
 * Loads a Toon RTS character GLB, lets you switch weapons and
 * trigger attack combos, block, cast, draw/sheath in real-time.
 * Open browser console to see clip loading + retargeting logs.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelLoader, type RaceId, RACE_IDS } from '../game/ModelLoader';
import { ToonCharacter } from '../game/ToonCharacter';
import type { WeaponType } from '../game/WeaponAnimController';

const WEAPON_TYPES: WeaponType[] = [
  'sword_shield', 'great_sword', 'magic_staff',
  'axe_1h', 'hammer_2h', 'dagger', 'spear', 'staff', 'bow', 'unarmed',
];

export default function WeaponTest() {
  const containerRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<ToonCharacter | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading models...');
  const [currentRace, setCurrentRace] = useState<RaceId>('human');
  const [currentWeapon, setCurrentWeapon] = useState<WeaponType | null>(null);
  const [comboLog, setComboLog] = useState<string[]>([]);

  const log = (msg: string) => {
    console.log(`[WeaponTest] ${msg}`);
    setComboLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 20));
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.add(new THREE.HemisphereLight(0xb0c4de, 0x2a2a3e, 0.8));
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xfff5e6, 2.0);
    key.position.set(5, 10, 6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    scene.add(new THREE.PointLight(0x6ee7b7, 0.8, 15).translateTo?.(0, 3, -4) ?? new THREE.PointLight(0x6ee7b7, 0.8, 15));

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);

    // Camera
    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.8, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    controls.update();

    const clock = new THREE.Clock();

    // Load models
    (async () => {
      setStatus('Loading race models + animations...');
      await modelLoader.loadAll('');

      const errors = modelLoader.assetsRef.loadErrors;
      if (errors.length > 0) {
        log(`Load warnings: ${errors.join(', ')}`);
      }

      spawnCharacter('human');
      setLoading(false);
      setStatus('Ready — pick a weapon and attack!');
    })();

    function spawnCharacter(race: RaceId) {
      // Remove old
      if (charRef.current) {
        scene.remove(charRef.current.group);
      }

      const loaded = modelLoader.cloneCharacter(race);
      if (!loaded) {
        log(`Failed to clone ${race}`);
        return;
      }

      const char = new ToonCharacter(loaded);
      char.setBasePath('');
      char.group.position.set(0, 0, 0);
      scene.add(char.group);
      charRef.current = char;
      log(`Spawned ${race} character`);
    }

    // Expose for race switching
    (window as any).__weaponTest_spawnRace = (race: RaceId) => {
      spawnCharacter(race);
      setCurrentRace(race);
    };

    // Render loop
    let running = true;
    function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      const dt = clock.getDelta();
      charRef.current?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Weapon switch
  const handleSetWeapon = async (type: WeaponType) => {
    const char = charRef.current;
    if (!char) return;
    log(`Setting weapon: ${type}...`);
    const ok = await char.setWeaponType(type);
    setCurrentWeapon(type);
    log(ok ? `✅ ${type} loaded — clips: ${char.weaponType}` : `⚠️ ${type} — no pack found, using fallback`);
  };

  const handleAttack = () => {
    const clip = charRef.current?.weaponAttack();
    log(`Attack → ${clip || 'fallback'}`);
  };

  const handleHeavy = () => {
    const clip = charRef.current?.weaponAttackHeavy();
    log(`Heavy → ${clip || 'fallback'}`);
  };

  const handleCast = (area = false) => {
    const clip = charRef.current?.weaponCast(area);
    log(`Cast${area ? ' (area)' : ''} → ${clip || 'fallback'}`);
  };

  const handleBlock = (active: boolean) => {
    charRef.current?.weaponBlock(active);
    log(`Block: ${active ? 'ON' : 'OFF'}`);
  };

  const handleAnim = (name: string) => {
    charRef.current?.playAnimation(name);
    log(`Anim: ${name}`);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0e1a', color: '#e2e8f0', fontFamily: 'sans-serif' }}>
      {/* 3D Viewport */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.8)', zIndex: 10 }}>
            <p style={{ color: '#6ee7b7' }}>{status}</p>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div style={{ width: 320, padding: 16, overflow: 'auto', borderLeft: '1px solid #1e293b', fontSize: 13 }}>
        <h2 style={{ color: '#6ee7b7', fontSize: 16, marginBottom: 12 }}>Weapon Test</h2>
        <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 12 }}>{status}</p>

        {/* Race selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>Race</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {RACE_IDS.map(r => (
              <button key={r} onClick={() => (window as any).__weaponTest_spawnRace(r)}
                style={{ padding: '4px 10px', border: `1px solid ${currentRace === r ? '#6ee7b7' : '#1e293b'}`, borderRadius: 4, background: currentRace === r ? 'rgba(110,231,183,.15)' : 'rgba(0,0,0,.3)', color: currentRace === r ? '#6ee7b7' : '#e2e8f0', cursor: 'pointer', fontSize: 11 }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Weapon selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>Weapon Type</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {WEAPON_TYPES.map(w => (
              <button key={w} onClick={() => handleSetWeapon(w)}
                style={{ padding: '4px 8px', border: `1px solid ${currentWeapon === w ? '#6ee7b7' : '#1e293b'}`, borderRadius: 4, background: currentWeapon === w ? 'rgba(110,231,183,.15)' : 'rgba(0,0,0,.3)', color: currentWeapon === w ? '#6ee7b7' : '#e2e8f0', cursor: 'pointer', fontSize: 10 }}>
                {w.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>Combat Actions</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            <button onClick={handleAttack} style={btnStyle('#ef4444')}>⚔️ Attack</button>
            <button onClick={handleHeavy} style={btnStyle('#dc2626')}>🔥 Heavy</button>
            <button onMouseDown={() => handleBlock(true)} onMouseUp={() => handleBlock(false)} style={btnStyle('#3b82f6')}>🛡️ Block (hold)</button>
            <button onClick={() => handleCast(false)} style={btnStyle('#8b5cf6')}>✨ Cast</button>
            <button onClick={() => handleCast(true)} style={btnStyle('#7c3aed')}>💫 Cast Area</button>
            <button onClick={() => charRef.current?.weaponDraw()} style={btnStyle('#64748b')}>🗡 Draw</button>
            <button onClick={() => charRef.current?.weaponSheath()} style={btnStyle('#64748b')}>🔒 Sheath</button>
            <button onClick={() => charRef.current?.weaponPowerUp()} style={btnStyle('#eab308')}>⚡ Power Up</button>
          </div>
        </div>

        {/* Base animations */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>Base Anims</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {['idle', 'walk', 'run', 'attack', 'dodge', 'hit', 'death'].map(a => (
              <button key={a} onClick={() => handleAnim(a)} style={btnStyle('#475569')}>{a}</button>
            ))}
          </div>
        </div>

        {/* Log */}
        <div style={{ marginTop: 8 }}>
          <label style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>Log</label>
          <div style={{ marginTop: 4, maxHeight: 200, overflow: 'auto', background: 'rgba(0,0,0,.4)', borderRadius: 6, padding: 8, fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>
            {comboLog.map((l, i) => <div key={i}>{l}</div>)}
            {comboLog.length === 0 && <div>Click a weapon, then attack...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '5px 10px', border: `1px solid ${color}40`, borderRadius: 4,
    background: `${color}20`, color, cursor: 'pointer', fontSize: 11, fontWeight: 600,
  };
}
