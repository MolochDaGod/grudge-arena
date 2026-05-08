/**
 * Standalone Grudge Model Maker.
 *
 * Mirrors the look-and-feel of the RaceClassSelect "Loadout Forge" step but
 * drops every game-progression concern (no class, no stats, no skill bar,
 * no "Enter the Rift"). Pure character builder + three save buttons.
 *
 * Key design choices:
 *   • Race switcher is INSIDE the page (top tab strip), so the user never
 *     has to leave to try another bloodline.
 *   • CharacterPreviewScene hands its live, currently-visible scene root up
 *     via `onSceneReady`. Exporters operate on THAT, so what you see is
 *     literally what gets saved (hidden loadout slots are stripped because
 *     GLTFExporter respects `onlyVisible: true`, and OBJExporter only walks
 *     visible meshes).
 *   • Filename is `{race}_{loadoutHash}.{ext}` so the user can't accidentally
 *     overwrite a previous variant — every distinct loadout produces a
 *     distinct filename.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RACES } from '../game/CharacterConfig';
import { CharacterPreviewScene } from './character-preview/CharacterPreviewScene';
import { exportOBJ, exportGLB, exportGLTF } from '../lib/exporters';

const B = import.meta.env.BASE_URL.replace(/\/$/, '');
const ui = (name: string) => `${B}/ui/${name}`;

interface Props {
  onExit: () => void;
}

type ExportState = 'idle' | 'busy' | 'done' | 'error';

export function Builder({ onExit }: Props) {
  const [raceId, setRaceId] = useState<string>(RACES[0].id);
  const race = useMemo(() => RACES.find(r => r.id === raceId) ?? RACES[0], [raceId]);

  // Live scene root for the current race — refreshed every time the
  // CharacterPreviewScene re-mounts (which happens on raceId change).
  // CRITICAL: this MUST be cleared on race switch, otherwise an export fired
  // mid-swap would parse a freshly-disposed scene (CharacterPreviewScene's
  // cleanup disposes geometry / materials / textures synchronously) and
  // either crash or write a corrupt file.
  const sceneRootRef = useRef<THREE.Object3D | null>(null);
  const sceneReadyForRaceRef = useRef<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  // Current loadout selection from the previewer — used purely for the
  // filename hash so each variant exports under its own name.
  const loadoutRef = useRef<Record<string, string[]>>({});

  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportMsg,   setExportMsg]   = useState<string>('');

  const onSceneReady = useCallback((root: THREE.Object3D, readyRaceId: string) => {
    sceneRootRef.current = root;
    sceneReadyForRaceRef.current = readyRaceId;
    setSceneReady(true);
  }, []);

  const onSelectionChange = useCallback((loadout: Record<string, string[]>) => {
    loadoutRef.current = loadout;
  }, []);

  // Race switch invalidates the live root immediately — the previewer's
  // cleanup runs synchronously when it re-mounts, so by the time the new
  // GLB finishes loading, the OLD root is already disposed. Drop the ref
  // here so any export attempted between the click and the load completion
  // fails fast with a clear message instead of producing a broken file.
  const switchRace = (id: string) => {
    if (id === raceId) return;
    sceneRootRef.current = null;
    sceneReadyForRaceRef.current = null;
    setSceneReady(false);
    setRaceId(id);
  };

  // Compact, deterministic hash of the current loadout for the filename.
  // Format: `body=A;arms=B;head=A,D` → first 8 chars of a simple FNV-1a hex.
  const loadoutHash = (loadout: Record<string, string[]>): string => {
    const parts: string[] = [];
    for (const k of Object.keys(loadout).sort()) {
      const v = loadout[k];
      if (v && v.length) parts.push(`${k}=${[...v].sort().join(',')}`);
    }
    const s = parts.join(';');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0').slice(0, 8);
  };

  const runExport = async (kind: 'obj' | 'glb' | 'gltf') => {
    const root = sceneRootRef.current;
    // Hard-gate: scene must be loaded AND for the race the user is currently
    // viewing. Without this check a mid-swap export would parse a disposed
    // scene graph (geometry/materials freed) and crash or output garbage.
    if (!root || !sceneReady || sceneReadyForRaceRef.current !== raceId) {
      setExportState('error');
      setExportMsg('Model still loading — try again in a moment.');
      return;
    }
    setExportState('busy');
    setExportMsg(`Saving ${kind.toUpperCase()}…`);
    try {
      const name = `grudge_${raceId}_${loadoutHash(loadoutRef.current)}`;
      if (kind === 'obj')  await exportOBJ(root, name);
      if (kind === 'glb')  await exportGLB(root, name);
      if (kind === 'gltf') await exportGLTF(root, name);
      setExportState('done');
      setExportMsg(`Saved ${name}.${kind}`);
    } catch (err) {
      setExportState('error');
      setExportMsg(`Export failed: ${(err as Error)?.message ?? String(err)}`);
      console.error('[Builder] export failed', err);
    }
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden',
      fontFamily: "'Cinzel', serif", color: '#c8b89a',
      background: 'linear-gradient(to bottom, #050714 0%, #0a0812 40%, #1a100c 80%, #050302 100%)',
    }}>
      {/* Decorative overlays */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.18, backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '4px 4px', mixBlendMode: 'overlay', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${ui('BigPanel.jpg')}')`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.06, pointerEvents: 'none' }} />

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 5, padding: '20px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="font-decorative" style={{ fontSize: 11, letterSpacing: '0.5em', color: '#7a6f62', textTransform: 'uppercase' }}>
          ✦ Grudge Model Forge
        </div>
        <button onClick={onExit} style={{ background: 'none', border: '1px solid #2a2018', padding: '8px 18px', color: '#7a6f62', fontFamily: 'inherit', letterSpacing: '0.25em', textTransform: 'uppercase', fontSize: 11, cursor: 'pointer', borderRadius: 3 }}>← Title</button>
      </div>

      {/* Race tab strip */}
      <div style={{ position: 'relative', zIndex: 5, display: 'flex', justifyContent: 'center', gap: 6, padding: '0 36px 12px' }}>
        {RACES.map(r => {
          const active = r.id === raceId;
          return (
            <button
              key={r.id}
              onClick={() => switchRace(r.id)}
              disabled={exportState === 'busy'}
              style={{
                padding: '8px 18px', cursor: 'pointer',
                background: active ? `linear-gradient(180deg, ${r.accentColor}33 0%, rgba(8,6,12,0.85) 100%)` : 'rgba(8,6,12,0.6)',
                border: `1px solid ${active ? r.accentColor : '#2a2018'}`,
                borderRadius: 3,
                color: active ? r.accentColor : '#7a6f62',
                fontFamily: 'inherit', fontSize: 12, letterSpacing: '0.25em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
            >
              {r.name}
            </button>
          );
        })}
      </div>

      {/* Title */}
      <div style={{ position: 'relative', zIndex: 5, textAlign: 'center', marginTop: 4, marginBottom: 20 }}>
        <div className="font-decorative" style={{
          fontSize: 44, fontWeight: 900, letterSpacing: '0.15em',
          background: `linear-gradient(to bottom, #f2e6d0 0%, ${race.accentColor} 50%, #3a2a12 100%)`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.7))',
        }}>
          {race.name.toUpperCase()} · LOADOUT FORGE
        </div>
        <div style={{ width: 200, height: 2, background: `linear-gradient(to right, transparent, ${race.accentColor}aa, transparent)`, margin: '10px auto 0' }} />
        <div style={{ marginTop: 8, fontSize: 11, color: '#a8956d', letterSpacing: '0.04em' }}>{race.description}</div>
      </div>

      {/* Builder body — previewer on the left, save panel on the right */}
      <div style={{ position: 'relative', zIndex: 5, display: 'flex', justifyContent: 'center', gap: 28, padding: '0 36px', alignItems: 'flex-start' }}>
        <CharacterPreviewScene
          raceId={race.id}
          tint={race.color}
          width={420}
          height={580}
          onSceneReady={onSceneReady}
          onSelectionChange={onSelectionChange}
        />

        <SavePanel
          raceName={race.name}
          accentColor={race.accentColor}
          state={exportState}
          msg={exportMsg}
          onObj={() => runExport('obj')}
          onGlb={() => runExport('glb')}
          onGltf={() => runExport('gltf')}
        />
      </div>
    </div>
  );
}

// ── Save panel ────────────────────────────────────────────────────────────────

function SavePanel({
  raceName, accentColor, state, msg, onObj, onGlb, onGltf,
}: {
  raceName: string;
  accentColor: string;
  state: ExportState;
  msg: string;
  onObj:  () => void;
  onGlb:  () => void;
  onGltf: () => void;
}) {
  const busy = state === 'busy';
  return (
    <div style={{
      width: 360, padding: '22px 24px',
      background: 'rgba(8,6,12,0.85)',
      border: `2px solid ${accentColor}66`, borderRadius: 4,
      boxShadow: `0 0 36px ${accentColor}22, 0 12px 28px rgba(0,0,0,0.6)`,
    }}>
      <div className="font-decorative" style={{ fontSize: 14, color: '#bda871', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 4 }}>
        Save Model
      </div>
      <div style={{ fontSize: 10, color: '#7a6f62', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16 }}>
        Variants of <span style={{ color: accentColor }}>{raceName}</span>
      </div>

      <SaveButton
        accent={accentColor}
        disabled={busy}
        onClick={onObj}
        label="Save OBJ"
        sub="Geometry only · T-pose · Mixamo auto-rigger ready"
      />
      <SaveButton
        accent={accentColor}
        disabled={busy}
        onClick={onGlb}
        label="Save GLB (rigged)"
        sub="Game-ready binary · skeleton + materials packed in"
      />
      <SaveButton
        accent={accentColor}
        disabled={busy}
        onClick={onGltf}
        label="Save GLTF"
        sub="Single .gltf · embedded base64 buffers · editor-friendly"
      />

      {/* Status */}
      <div style={{
        marginTop: 14, padding: '10px 12px', borderRadius: 3,
        background: state === 'error' ? 'rgba(140,30,30,0.25)' : 'rgba(0,0,0,0.45)',
        border: `1px solid ${
          state === 'error' ? '#aa3333' :
          state === 'done'  ? '#88aa66' :
          state === 'busy'  ? accentColor : '#2a2018'
        }`,
        fontSize: 11, lineHeight: 1.5,
        color: state === 'error' ? '#dd9999' : state === 'done' ? '#a8c896' : '#a8956d',
        minHeight: 36,
      }}>
        {msg || (
          <span style={{ color: '#5a5048', letterSpacing: '0.04em' }}>
            Customise the loadout on the left, then choose a save format. Each
            file is named <code style={{ color: '#bda871' }}>grudge_{`{race}_{loadoutHash}`}</code>
            so you can dump every variant side-by-side without overwriting.
          </span>
        )}
      </div>
    </div>
  );
}

function SaveButton({
  accent, disabled, onClick, label, sub,
}: {
  accent: string;
  disabled: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '12px 14px', marginBottom: 10,
        background: disabled ? 'rgba(20,16,28,0.45)' : 'rgba(20,16,28,0.85)',
        border: `1px solid ${disabled ? '#2a2018' : accent + '88'}`,
        borderRadius: 3, color: '#c8b89a', fontFamily: 'inherit',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'transform 0.12s, border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      <div className="font-decorative" style={{ fontSize: 14, color: accent, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 10, color: '#8a8070', letterSpacing: '0.04em', marginTop: 3 }}>{sub}</div>
    </button>
  );
}
