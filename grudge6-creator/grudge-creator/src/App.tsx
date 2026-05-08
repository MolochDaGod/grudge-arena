import { useState } from 'react';
import { Splash } from '@/pages/Splash';
import { RaceClassSelect } from '@/pages/RaceClassSelect';
import { Playground } from '@/pages/Playground';
import { GrudaDemo } from '@/pages/GrudaDemo';
import { Builder } from '@/pages/Builder';
import { CharacterBuilder } from '@/pages/CharacterBuilder';
import WeaponTest from '@/pages/WeaponTest';
import { CharacterConfig, buildCharacter } from '@/game/CharacterConfig';

type Phase = 'splash' | 'select' | 'playground' | 'gruda' | 'builder' | 'character_builder' | 'weapon_test';

export default function App() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [character, setCharacter] = useState<CharacterConfig | null>(null);

  if (phase === 'gruda') {
    return <GrudaDemo onExit={() => setPhase('splash')} />;
  }

  if (phase === 'builder') {
    return <Builder onExit={() => setPhase('splash')} />;
  }

  if (phase === 'character_builder') {
    return <CharacterBuilder onExit={() => setPhase('splash')} />;
  }

  if (phase === 'weapon_test') {
    return <WeaponTest />;
  }

  if (phase === 'splash') {
    return (
      <>
        <Splash
          onBegin={() => setPhase('select')}
          onOpenBuilder={() => setPhase('builder')}
          onOpenCharacterBuilder={() => setPhase('character_builder')}
          onQuickStart={() => {
            const cfg = buildCharacter('human', 'knight');
            cfg.uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : `char_${Date.now()}`;
            setCharacter(cfg);
            setPhase('playground');
          }}
        />
        <button
          onClick={() => setPhase('gruda')}
          style={{
            position: 'fixed', bottom: 16, right: 16, zIndex: 50,
            background: 'rgba(20,28,44,0.9)', border: '1px solid #ffd84a',
            color: '#ffd84a', padding: '8px 14px', cursor: 'pointer',
            borderRadius: 4, fontFamily: 'system-ui, sans-serif', fontSize: 12,
            letterSpacing: 0.4, textTransform: 'uppercase',
          }}
        >.gruda demo →</button>
        <button
          onClick={() => setPhase('weapon_test')}
          style={{
            position: 'fixed', bottom: 16, right: 140, zIndex: 50,
            background: 'rgba(20,28,44,0.9)', border: '1px solid #ef4444',
            color: '#ef4444', padding: '8px 14px', cursor: 'pointer',
            borderRadius: 4, fontFamily: 'system-ui, sans-serif', fontSize: 12,
            letterSpacing: 0.4, textTransform: 'uppercase',
          }}
        >⚔️ weapon test</button>
      </>
    );
  }

  if (phase === 'select') {
    return (
      <RaceClassSelect
        onBack={() => setPhase('splash')}
        onSelect={(cfg) => { setCharacter(cfg); setPhase('playground'); }}
      />
    );
  }

  if (!character) {
    setPhase('splash');
    return null;
  }

  return (
    <Playground
      character={character}
      onExit={() => { setCharacter(null); setPhase('splash'); }}
    />
  );
}
