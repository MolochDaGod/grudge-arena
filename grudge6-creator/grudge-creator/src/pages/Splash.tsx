import { SplashScene } from '@/pages/splash/SplashScene';

const B = import.meta.env.BASE_URL.replace(/\/$/, '');
const ui = (name: string) => `${B}/ui/${name}`;

interface Props {
  onBegin: () => void;
  onQuickStart: () => void;
  onOpenBuilder: () => void;
  onOpenCharacterBuilder: () => void;
}

export function Splash({ onBegin, onQuickStart, onOpenBuilder, onOpenCharacterBuilder }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#02030a' }}>
      <SplashScene />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 100%)',
      }} />

      {/* Top brand line */}
      <div style={{
        position: 'absolute', top: 36, left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none', zIndex: 5,
      }}>
        <div className="font-decorative" style={{
          fontSize: 11, letterSpacing: '0.5em', color: '#7a6f62', textTransform: 'uppercase',
        }}>
          · A Forging of Champions ·
        </div>
      </div>

      {/* Title block */}
      <div style={{
        position: 'absolute', top: '14%', left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none', zIndex: 5,
      }}>
        <div className="font-decorative" style={{
          fontSize: 84, fontWeight: 900, letterSpacing: '0.18em', lineHeight: 1,
          background: 'linear-gradient(to bottom, #f2e6d0 0%, #bda871 40%, #7a6336 80%, #2a1e08 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.85))',
        }}>
          GRUDGE WARLORDS
        </div>
        <div style={{
          width: 280, height: 2, margin: '18px auto 10px',
          background: 'linear-gradient(to right, transparent, rgba(189,168,113,0.7), transparent)',
        }} />
        <div className="font-decorative" style={{
          fontSize: 14, letterSpacing: '0.45em', color: '#9a8970', textTransform: 'uppercase',
        }}>
          Character Forge
        </div>
      </div>

      {/* CTA buttons */}
      <div style={{
        position: 'absolute', bottom: '14%', left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, zIndex: 5,
      }}>
        <button onClick={onBegin} style={{
          position: 'relative', overflow: 'hidden', cursor: 'pointer',
          backgroundImage: `url('${ui('Button01.png')}')`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          padding: '18px 72px', border: '2px solid #6a5038', borderRadius: 3,
          boxShadow: '0 0 40px rgba(189,168,113,0.2), 0 10px 30px rgba(0,0,0,0.8)',
          transition: 'transform 0.15s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
          <span className="font-decorative" style={{
            position: 'relative', color: '#bda871', fontSize: 18, letterSpacing: '0.4em',
            textTransform: 'uppercase', textShadow: '0 2px 6px #000',
          }}>
            Begin the Forge
          </span>
        </button>

        <button onClick={onQuickStart} style={{
          padding: '10px 28px', color: '#7a6f62', fontFamily: "'Cinzel', serif",
          letterSpacing: '0.25em', textTransform: 'uppercase', fontSize: 11,
          background: 'none', border: '1px solid #2a2018', borderRadius: 3, cursor: 'pointer',
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#bda871'; (e.currentTarget as HTMLElement).style.borderColor = '#5a4838'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#7a6f62'; (e.currentTarget as HTMLElement).style.borderColor = '#2a2018'; }}>
          → Quick Start (Human Knight)
        </button>

        <button onClick={onOpenBuilder} style={{
          padding: '10px 28px', color: '#bda871', fontFamily: "'Cinzel', serif",
          letterSpacing: '0.25em', textTransform: 'uppercase', fontSize: 11,
          background: 'rgba(8,6,12,0.6)', border: '1px solid #6a5038', borderRadius: 3, cursor: 'pointer',
          transition: 'color 0.2s, border-color 0.2s, background 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(20,16,28,0.85)'; (e.currentTarget as HTMLElement).style.borderColor = '#bda871'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(8,6,12,0.6)'; (e.currentTarget as HTMLElement).style.borderColor = '#6a5038'; }}>
          ✦ Model Forge (Save OBJ / GLB / GLTF)
        </button>

        <button onClick={onOpenCharacterBuilder} style={{
          padding: '10px 28px', color: '#6ee7b7', fontFamily: "'Cinzel', serif",
          letterSpacing: '0.25em', textTransform: 'uppercase', fontSize: 11,
          background: 'rgba(8,12,20,0.6)', border: '1px solid #2a3150', borderRadius: 3, cursor: 'pointer',
          transition: 'color 0.2s, border-color 0.2s, background 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(20,26,43,0.85)'; (e.currentTarget as HTMLElement).style.borderColor = '#6ee7b7'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(8,12,20,0.6)'; (e.currentTarget as HTMLElement).style.borderColor = '#2a3150'; }}>
          ⚔ Ultimate Character Builder (Stats &amp; Class)
        </button>
      </div>

      {/* Footer hint */}
      <div style={{
        position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center',
        fontSize: 10, color: '#5a5048', letterSpacing: '0.3em', textTransform: 'uppercase',
        pointerEvents: 'none', zIndex: 5,
      }}>
        Click anywhere on the scene to summon the champions ·
      </div>
    </div>
  );
}
