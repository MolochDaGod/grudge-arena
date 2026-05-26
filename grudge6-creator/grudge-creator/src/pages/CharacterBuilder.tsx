/**
 * Ultimate Character Builder — faithful port of
 * `attached_assets/Grudge_Warlords_-_Ultimate_Character_Builder_*.html`.
 *
 * Three-panel stat allocation tool:
 *   • Left   — 8 attribute sliders (160 pt budget) + Randomize/Share/Reset.
 *   • Center — class/rank result card, radar chart, derived stat grid,
 *              statistical review (combat power + build rating + advice).
 *   • Right  — full per-attribute breakdown ("Learning Panel") with
 *              per-point gains for the current allocation.
 *
 * Standalone — no game-state dependencies. Mounts as its own phase from the
 * splash page (`onOpenCharacterBuilder`). The phase is reachable alongside
 * the existing 3D model export Builder, not in place of it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

// ── Design tokens (1:1 with the mockup's :root vars) ─────────────────────────
const T = {
  bg:        '#0b1020',
  card:      '#141a2b',
  text:      '#e8eaf6',
  muted:     '#a5b4d0',
  border:    '#2a3150',
  accent:    '#6ee7b7',
  danger:    '#ef4444',
  success:   '#10b981',
  purple:    '#a855f7',
  warlord:   '#f97316',
  diamond:   '#89f7fe',
  hero:      '#3b82f6',
  grey:      '#9ca3af',
  unclass:   '#4b5563',
  gold:      '#fbbf24',
};

const TOTAL_POINTS = 160;

// ── Attribute definitions (gains per single point spent) ─────────────────────
type AttrName =
  | 'Strength' | 'Intellect' | 'Vitality' | 'Dexterity'
  | 'Endurance' | 'Wisdom'   | 'Agility'  | 'Tactics';

interface Gain { label: string; value: number }
interface AttrDef {
  description:     string;
  fullDescription: string;
  gains:           Record<string, Gain>;
}

const ATTRIBUTES: Record<AttrName, AttrDef> = {
  Strength: {
    description: 'Physical might and weapon mastery.',
    fullDescription:
      'Increases raw damage output, physical defense, and health. Warriors and melee builds scale heavily with Strength. Each point grants diminishing returns on damage beyond 50 points.',
    gains: {
      health:           { label: 'Health',                  value: 5    },
      damage:           { label: 'Physical Damage',         value: 1.25 },
      defense:          { label: 'Physical Defense',        value: 4    },
      block:            { label: 'Block Chance',            value: 0.2  },
      drainHealth:      { label: 'Lifesteal',               value: 0.075 },
      stagger:          { label: 'Stagger on Hit',          value: 0.04 },
      mana:             { label: 'Mana Pool',               value: 1    },
      stamina:          { label: 'Stamina',                 value: 0.8  },
      accuracy:         { label: 'Attack Accuracy',         value: 0.08 },
      healthRegen:      { label: 'Health Regen/s',          value: 0.02 },
      damageReduction:  { label: 'Damage Reduction',        value: 0.02 },
    },
  },
  Intellect: {
    description: 'Arcane knowledge and spellcraft.',
    fullDescription:
      'Powers magical damage, mana regeneration, and ability cooldown reduction. Casters scale directly with Intellect. High Intellect reduces spell cast times by 0.2% per point. Countered heavily by Resistance.',
    gains: {
      mana:              { label: 'Mana Pool',               value: 9     },
      damage:            { label: 'Magical Damage',          value: 1.5   },
      defense:           { label: 'Magical Defense',         value: 2     },
      manaRegen:         { label: 'Mana Regen/s',            value: 0.04  },
      cooldownReduction: { label: 'Cooldown Reduction',      value: 0.075 },
      spellAccuracy:     { label: 'Spell Accuracy',          value: 0.15  },
      health:            { label: 'Health',                  value: 3     },
      stamina:           { label: 'Stamina',                 value: 0.4   },
      accuracy:          { label: 'Attack Accuracy',         value: 0.1   },
      abilityCost:       { label: 'Ability Cost Reduction',  value: 0.05  },
    },
  },
  Vitality: {
    description: 'Physical endurance and life force.',
    fullDescription:
      'Maximizes health pool and provides passive health regeneration. Vital for tanks and sustained damage builds. Very effective against burst damage, but weak to percentage-based damage abilities.',
    gains: {
      health:           { label: 'Health',                  value: 25   },
      defense:          { label: 'Physical Defense',        value: 1.5  },
      healthRegen:      { label: 'Health Regen/s',          value: 0.06 },
      damageReduction:  { label: 'Damage Reduction',        value: 0.04 },
      bleedResist:      { label: 'Bleed Resistance',        value: 0.15 },
      mana:             { label: 'Mana Pool',               value: 1.5  },
      stamina:          { label: 'Stamina',                 value: 1    },
      resistance:       { label: 'Magic Resistance',        value: 0.08 },
      armor:            { label: 'Armor Rating',            value: 0.2  },
    },
  },
  Dexterity: {
    description: 'Hand-eye coordination and finesse.',
    fullDescription:
      'Dominates critical chance, attack speed, and accuracy. Rogues and archers scale with Dexterity. Provides attack speed bonus (0.4% per point). Critical hits bypass 40% of block chance.',
    gains: {
      damage:         { label: 'Damage',                       value: 0.9   },
      criticalChance: { label: 'Critical Chance',              value: 0.3   },
      accuracy:       { label: 'Attack Accuracy',              value: 0.25  },
      attackSpeed:    { label: 'Attack Speed',                 value: 0.2   },
      evasion:        { label: 'Evasion Chance',               value: 0.125 },
      criticalDamage: { label: 'Critical Damage Multiplier',   value: 0.2   },
      defense:        { label: 'Physical Defense',             value: 1.2   },
      stamina:        { label: 'Stamina',                      value: 0.6   },
      movementSpeed:  { label: 'Movement Speed',               value: 0.08  },
      reflexTime:     { label: 'Reaction Time Bonus',          value: 0.03  },
      health:         { label: 'Health',                       value: 3     },
    },
  },
  Endurance: {
    description: 'Stamina reserves and physical resistance.',
    fullDescription:
      'Builds stamina for abilities and provides armor scaling. High Endurance enables higher block effectiveness and reduces crowd control duration. Synergizes with blocking playstyles.',
    gains: {
      stamina:            { label: 'Stamina',                  value: 6     },
      defense:            { label: 'Physical Defense',         value: 5     },
      blockEffect:        { label: 'Block Effectiveness',      value: 0.175 },
      ccResistance:       { label: 'CC Duration Reduction',    value: 0.1   },
      armor:              { label: 'Armor Rating',             value: 0.6   },
      defenseBreakResist: { label: 'Armor Break Resistance',   value: 0.125 },
      health:             { label: 'Health',                   value: 8     },
      mana:               { label: 'Mana Pool',                value: 1     },
      healthRegen:        { label: 'Health Regen/s',           value: 0.02  },
      block:              { label: 'Block Chance',             value: 0.12  },
    },
  },
  Wisdom: {
    description: 'Mental fortitude and magical resilience.',
    fullDescription:
      'Primary counter to magical damage. Scales resistance and provides magic immunity scaling. Each point provides 0.4% Cooldown Reduction Resistance (slows enemy cooldown reduction). Essential for magic-heavy environments.',
    gains: {
      mana:            { label: 'Mana Pool',                          value: 6     },
      defense:         { label: 'Magical Defense',                    value: 5.5   },
      resistance:      { label: 'Magic Resistance',                   value: 0.25  },
      cdrResist:       { label: 'CDR Resistance',                     value: 0.2   },
      statusEffect:    { label: 'Status Effect Duration Reduction',   value: 0.075 },
      spellblock:      { label: 'Spell Block Chance',                 value: 0.125 },
      health:          { label: 'Health',                             value: 4     },
      stamina:         { label: 'Stamina',                            value: 0.5   },
      damageReduction: { label: 'Damage Reduction',                   value: 0.03  },
      spellAccuracy:   { label: 'Spell Accuracy',                     value: 0.1   },
    },
  },
  Agility: {
    description: 'Speed, reflexes, and positioning.',
    fullDescription:
      'Increases movement speed, dodge chance, and evasion. Synergizes with high-risk playstyles. Each point grants 0.3% movement speed. Dodge provides invincibility frames (0.5s per dodge).',
    gains: {
      movementSpeed:   { label: 'Movement Speed',          value: 0.15  },
      evasion:         { label: 'Evasion Chance',          value: 0.225 },
      dodge:           { label: 'Dodge Cooldown Reduction', value: 0.15 },
      reflexTime:      { label: 'Reaction Time Bonus',     value: 0.04  },
      criticalEvasion: { label: 'Crit Evasion',            value: 0.25  },
      fallDamage:      { label: 'Fall Damage Reduction',   value: 0.2   },
      stamina:         { label: 'Stamina',                 value: 1     },
      accuracy:        { label: 'Attack Accuracy',         value: 0.1   },
      attackSpeed:     { label: 'Attack Speed',            value: 0.05  },
      damage:          { label: 'Damage',                  value: 0.3   },
      health:          { label: 'Health',                  value: 3     },
    },
  },
  Tactics: {
    description: 'Strategic thinking and ability control.',
    fullDescription:
      'Expertise in ability execution and resource management. Tactics grants a scaling bonus to all other stats based on total invested points (0.5% per point). High Tactics reduces ability costs, cooldowns, and provides armor penetration. Counters enemy Defense and Block. Essential for versatile builds.',
    gains: {
      stamina:           { label: 'Stamina',                    value: 3     },
      abilityCost:       { label: 'Ability Cost Reduction',     value: 0.075 },
      armorPenetration:  { label: 'Armor Penetration',          value: 0.2   },
      blockPenetration:  { label: 'Block Penetration',          value: 0.175 },
      defenseBreak:      { label: 'Defense Break Power',        value: 0.1   },
      comboCooldownRed:  { label: 'Combo Cooldown Reduction',   value: 0.125 },
      damage:            { label: 'Damage',                     value: 0.4   },
      defense:           { label: 'Physical Defense',           value: 1     },
      mana:              { label: 'Mana Pool',                  value: 1.5   },
      cooldownReduction: { label: 'Cooldown Reduction',         value: 0.05  },
      health:            { label: 'Health',                     value: 3     },
    },
  },
};
const ATTR_NAMES = Object.keys(ATTRIBUTES) as AttrName[];

// ── Stats: base values + descriptions + percentage flag ──────────────────────
const STAT_DESCRIPTIONS: Record<string, string> = {
  health: 'Total hit points.', mana: 'Energy for abilities.', stamina: 'Fuel for physical actions.',
  damage: 'Base damage dealt.', defense: 'Reduces physical damage.', block: 'Chance to block attacks.',
  blockEffect: 'Damage reduction on block.', evasion: 'Chance to avoid damage.', accuracy: 'Chance to hit.',
  criticalChance: 'Chance of critical hit.', criticalDamage: 'Extra damage on crit.',
  attackSpeed: 'How fast you attack.', movementSpeed: 'How fast you move.',
  resistance: 'Reduces magical damage.', cdrResist: 'Reduces enemy Cooldown Reduction.',
  defenseBreakResist: 'Resistance to Armor Break.', armorPenetration: 'Bypasses enemy Defense.',
  blockPenetration: 'Attacks ignore Block Chance.', defenseBreak: 'Reduces enemy Defense.',
  drainHealth: 'Heals for % of damage dealt.', manaRegen: 'Mana regen per second.',
  healthRegen: 'Health regen per second.', cooldownReduction: 'Reduces ability cooldowns.',
  abilityCost: 'Reduces ability costs.', spellAccuracy: 'Hit chance for spells.',
  stagger: 'Chance to interrupt enemies.', ccResistance: 'Reduces duration of stuns.',
  armor: 'Flat physical defense.', damageReduction: 'Reduces all incoming damage.',
  bleedResist: 'Resistance to bleeding.', statusEffect: 'Reduces duration of debuffs.',
  spellblock: 'Chance to negate spells.', dodge: 'Reduces cooldown of dodge ability.',
  reflexTime: 'Bonus to reaction time.', criticalEvasion: 'Chance to avoid crits.',
  fallDamage: 'Reduces fall damage.', comboCooldownRed: 'Cooldown reduction for combos.',
};
const STAT_KEYS = Object.keys(STAT_DESCRIPTIONS);
const PERCENTAGE_STATS = new Set([
  'attackSpeed','accuracy','criticalChance','criticalDamage','block','blockEffect','evasion','resistance',
  'drainHealth','damageReduction','movementSpeed','cooldownReduction','armorPenetration','blockPenetration',
  'ccResistance','spellblock','defenseBreak','spellAccuracy','cdrResist','defenseBreakResist','bleedResist',
  'statusEffect','dodge','reflexTime','criticalEvasion','fallDamage','comboCooldownRed','stagger','abilityCost',
]);
const BASE_STATS: Record<string, number> = {
  health: 250, mana: 100, stamina: 100, damage: 0, defense: 0, block: 0, blockEffect: 0, evasion: 0,
  accuracy: 0, criticalChance: 0, criticalDamage: 0, attackSpeed: 0, movementSpeed: 0, resistance: 0,
  cdrResist: 0, defenseBreakResist: 0, armorPenetration: 0, blockPenetration: 0, defenseBreak: 0,
  drainHealth: 0, manaRegen: 0, healthRegen: 0, cooldownReduction: 0, abilityCost: 0, spellAccuracy: 0,
  stagger: 0, ccResistance: 0, armor: 0, damageReduction: 0, bleedResist: 0, statusEffect: 0,
  spellblock: 0, dodge: 0, reflexTime: 0, criticalEvasion: 0, fallDamage: 0, comboCooldownRed: 0,
};

// ── Class tiers + name pool ──────────────────────────────────────────────────
interface ClassTier { minRank: number; maxRank: number; name: string; color: string; desc: string }
const CLASS_TIERS: ClassTier[] = [
  { minRank: 1,   maxRank: 10,  name: 'Legendary', color: T.diamond, desc: 'Mythical power achieved through perfect synergy.' },
  { minRank: 11,  maxRank: 50,  name: 'Warlord',   color: T.warlord, desc: 'A dominant force on the battlefield.' },
  { minRank: 51,  maxRank: 100, name: 'Epic',      color: T.purple,  desc: 'A hero of renown and great skill.' },
  { minRank: 101, maxRank: 200, name: 'Hero',      color: T.hero,    desc: 'A capable adventurer with potential.' },
  { minRank: 201, maxRank: 300, name: 'Normal',    color: T.grey,    desc: 'A standard combatant.' },
];
const CLASS_NAMES = (() => {
  const names: string[] = [];
  const prefixes = ['Void','Solar','Lunar','Star','Chaos','Holy','Dark','Blood','Iron','Storm','Frost','Fire','Wind','Earth','Spirit','Mind','Soul','Time','Space','Life'];
  const roots    = ['Walker','Weaver','Lord','King','Queen','God','Titan','Slayer','Breaker','Maker','Seer','Sage','Guard','Blade','Fist','Shield','Heart','Eye','Hand','Wing'];
  names.push(
    'Primordial God-King','Eternal Void Walker','Celestial Archon','Omniscient Sage','Timeless Sentinel',
    'Reality Weaver','Abyssal Sovereign','Divine Arbiter','Cosmic Guardian','Transcendent Being',
  );
  for (let i = 0; i < 40;  i++) names.push(`${prefixes[i % 20]} ${roots[i % 20]} Warlord`);
  for (let i = 0; i < 50;  i++) names.push(`Epic ${prefixes[i % 20]} ${roots[i % 20]}`);
  for (let i = 0; i < 100; i++) names.push(`${prefixes[i % 20]} ${roots[i % 20]}`);
  for (let i = 0; i < 100; i++) names.push(`Novice ${roots[i % 20]}`);
  return names;
})();

// ── Calculation engine ───────────────────────────────────────────────────────
type AttrPoints = Record<AttrName, number>;
const zeroPoints = (): AttrPoints =>
  ATTR_NAMES.reduce((acc, n) => { acc[n] = 0; return acc; }, {} as AttrPoints);

function calculateStats(points: AttrPoints): Record<string, number> {
  const stats: Record<string, number> = { ...BASE_STATS };
  for (const attr of ATTR_NAMES) {
    const p = points[attr];
    if (p <= 0) continue;
    const def = ATTRIBUTES[attr];
    for (const [key, gain] of Object.entries(def.gains)) {
      if (stats[key] !== undefined) stats[key] += gain.value * p;
    }
  }
  // Tactics scaling bonus: 0.5% per Tactics point applied to all non-resource stats.
  if (points.Tactics > 0) {
    const bonus = points.Tactics * 0.5;
    const mult  = 1 + bonus / 100;
    for (const k of Object.keys(stats)) {
      if (k === 'health' || k === 'mana' || k === 'stamina') continue;
      stats[k] *= mult;
    }
  }
  return stats;
}

function combatPower(stats: Record<string, number>): number {
  const ehp = stats.health * (1 + stats.defense / 100) * (1 + stats.resistance / 100);
  const dps = (stats.damage + 10) * (1 + (stats.criticalChance / 100) * (stats.criticalDamage / 100)) * (1 + stats.attackSpeed / 100);
  const utility = stats.cooldownReduction * 2 + stats.manaRegen * 10 + stats.movementSpeed * 2;
  return Math.floor(ehp * 0.4 + dps * 2.5 + utility * 5);
}

function totalSpent(p: AttrPoints): number {
  return ATTR_NAMES.reduce((s, n) => s + p[n], 0);
}

function buildScore(points: AttrPoints, stats: Record<string, number>): number {
  if (totalSpent(points) < TOTAL_POINTS) return 0;
  const cp = combatPower(stats);
  let score = (cp / 6000) * 100;
  // Synergy bonus (max of four archetype norms × 20).
  const n: Record<AttrName, number> = ATTR_NAMES.reduce((a, k) => {
    a[k] = points[k] / TOTAL_POINTS; return a;
  }, {} as AttrPoints);
  const synergy = Math.max(
    n.Strength + n.Vitality + n.Endurance,
    n.Intellect + n.Wisdom   + n.Tactics,
    n.Dexterity + n.Agility  + n.Strength,
    n.Tactics  + n.Endurance + n.Wisdom,
  ) * 20;
  return Math.min(100, score + synergy);
}

interface ClassResult {
  name:         string;
  tier:         string;
  description:  string;
  color:        string;
  combatPower:  number;
  score:        number;
  rating:       string;
  ratingColor:  string;
  advice:       string;
  unallocated:  boolean;
}
function detectClass(points: AttrPoints): ClassResult {
  const stats = calculateStats(points);
  const cp    = combatPower(stats);
  if (totalSpent(points) < TOTAL_POINTS) {
    return {
      name: '...', tier: 'Unclassified',
      description: 'Spend all 160 points to reveal your class rank.',
      color: T.unclass, combatPower: 0, score: 0,
      rating: '?', ratingColor: T.text,
      advice: 'Complete point allocation to see stats.',
      unallocated: true,
    };
  }
  const score = buildScore(points, stats);
  const rank  = Math.max(1, Math.floor(300 - score * 2.8));
  const tier  = CLASS_TIERS.find(t => rank >= t.minRank && rank <= t.maxRank) ?? CLASS_TIERS[CLASS_TIERS.length - 1];
  const name  = CLASS_NAMES[rank - 1] ?? 'Unknown Entity';

  let rating = 'F';
  if      (score > 90) rating = 'S+';
  else if (score > 80) rating = 'S';
  else if (score > 70) rating = 'A';
  else if (score > 60) rating = 'B';
  else if (score > 50) rating = 'C';
  else                 rating = 'D';
  const ratingColor = rating.startsWith('S') ? T.gold : rating === 'A' ? T.purple : T.text;

  let advice = 'Solid build. Consider specializing further for higher tiers.';
  if      (cp < 3000) advice = 'Low combat effectiveness. Try focusing on synergy stats.';
  else if (cp > 5000) advice = 'Excellent build efficiency!';

  return {
    name, tier: `${tier.name} (Rank ${rank})`, description: tier.desc,
    color: tier.color, combatPower: cp, score, rating, ratingColor, advice,
    unallocated: false,
  };
}

// ── Inline SVG radar chart (avoids adding chart.js / recharts) ──────────────
const RADAR_AXES = ['Survivability','Damage','Utility','Mobility','Control','Magic'] as const;

function radarValues(stats: Record<string, number>): number[] {
  const maxHP = 3000, maxDmg = 500, maxDef = 500;
  return [
    Math.min(100, (stats.health / maxHP) * 100 + (stats.defense / maxDef) * 50),
    Math.min(100, (stats.damage / maxDmg) * 100 + stats.criticalChance),
    Math.min(100, stats.cooldownReduction * 2 + stats.manaRegen * 5),
    Math.min(100, stats.movementSpeed * 5 + stats.evasion),
    Math.min(100, stats.block + stats.stagger * 2),
    Math.min(100, stats.resistance + stats.mana / 20),
  ];
}

function RadarChart({ values }: { values: number[] }) {
  const cx = 332, cy = 150, r = 110;
  const ref = [60, 60, 50, 50, 40, 40];
  const n   = values.length;
  const pt  = (v: number, i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rr = (v / 100) * r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
  };
  const path = (vs: number[]) =>
    vs.map((v, i) => { const [x, y] = pt(v, i); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ') + ' Z';

  return (
    <svg width="100%" height="300" viewBox="0 0 664 300" style={{ display: 'block' }}>
      {/* concentric grid rings */}
      {[20, 40, 60, 80, 100].map(p => (
        <polygon key={p}
          points={Array.from({ length: n }, (_, i) => pt(p, i).join(',')).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      ))}
      {/* axis spokes */}
      {RADAR_AXES.map((_, i) => {
        const [x, y] = pt(100, i);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />;
      })}
      {/* reference (Optimal Balanced) */}
      <path d={path(ref)} fill="rgba(165,180,208,0.1)" stroke={T.muted} strokeWidth={2} strokeDasharray="5 5" />
      {ref.map((v, i) => {
        const [x, y] = pt(v, i);
        return <circle key={`r${i}`} cx={x} cy={y} r={3} fill={T.muted} stroke="#fff" strokeWidth={1} />;
      })}
      {/* current build */}
      <path d={path(values)} fill="rgba(110,231,183,0.2)" stroke={T.accent} strokeWidth={3} />
      {values.map((v, i) => {
        const [x, y] = pt(v, i);
        return <circle key={`v${i}`} cx={x} cy={y} r={4} fill={T.accent} stroke="#fff" strokeWidth={1.5} />;
      })}
      {/* axis labels */}
      {RADAR_AXES.map((label, i) => {
        const [x, y] = pt(118, i);
        return (
          <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fill={T.text} fontSize={12} fontFamily="'Jost', sans-serif">{label}</text>
        );
      })}
      {/* legend */}
      <g transform="translate(20, 270)">
        <rect x={0} y={0} width={14} height={6} fill={T.accent} />
        <text x={20} y={5} fill={T.muted} fontSize={11} fontFamily="'Jost', sans-serif" dominantBaseline="middle">Current Build</text>
        <rect x={140} y={0} width={14} height={6} fill={T.muted} opacity={0.6} />
        <text x={160} y={5} fill={T.muted} fontSize={11} fontFamily="'Jost', sans-serif" dominantBaseline="middle">Optimal Balanced</text>
      </g>
    </svg>
  );
}

// ── Reusable styled controls ────────────────────────────────────────────────
const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(20,26,43,0.95), rgba(20,26,43,0.75))',
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: 20,
};
const h2Style: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: '1.2rem',
  borderBottom: `2px solid ${T.border}`,
  paddingBottom: 12,
  fontFamily: "'Cinzel', serif",
  color: T.text,
};

// ── Main component ──────────────────────────────────────────────────────────
interface Props { onExit: () => void }

export function CharacterBuilder({ onExit }: Props) {
  const [points, setPoints] = useState<AttrPoints>(zeroPoints);

  // Parse #share=... on mount, write back on changes.
  useEffect(() => {
    const hash = window.location.hash;
    const m = hash.match(/share=([^&]+)/);
    if (!m) return;
    try {
      const decoded = atob(decodeURIComponent(m[1]));
      const parsed = JSON.parse(decoded) as Partial<AttrPoints>;
      const next = zeroPoints();
      let total = 0;
      for (const k of ATTR_NAMES) {
        const v = Math.max(0, Math.min(TOTAL_POINTS, Math.floor(parsed[k] ?? 0)));
        if (total + v > TOTAL_POINTS) { next[k] = TOTAL_POINTS - total; total = TOTAL_POINTS; break; }
        next[k] = v; total += v;
      }
      setPoints(next);
    } catch { /* ignore malformed share string */ }
  }, []);

  const total      = useMemo(() => totalSpent(points), [points]);
  const remaining  = TOTAL_POINTS - total;
  const stats      = useMemo(() => calculateStats(points), [points]);
  const cls        = useMemo(() => detectClass(points), [points]);
  const radar      = useMemo(() => radarValues(stats), [stats]);

  const setAttr = useCallback((name: AttrName, raw: number | string) => {
    setPoints(prev => {
      const cur  = prev[name];
      let want   = Math.floor(typeof raw === 'string' ? parseInt(raw, 10) || 0 : raw);
      if (want < 0) want = 0;
      if (want > TOTAL_POINTS) want = TOTAL_POINTS;
      const diff = want - cur;
      const rem  = TOTAL_POINTS - totalSpent(prev);
      if (diff > 0 && diff > rem) want = cur + rem;
      if (want === cur) return prev;
      return { ...prev, [name]: want };
    });
  }, []);

  const reset = useCallback(() => {
    if (window.confirm('Reset all points?')) setPoints(zeroPoints);
  }, []);

  const randomize = useCallback(() => {
    const next = zeroPoints();
    let rem = TOTAL_POINTS;
    // Distribute by repeatedly picking a random attribute and giving it 1-20 points.
    while (rem > 0) {
      const a = ATTR_NAMES[Math.floor(Math.random() * ATTR_NAMES.length)];
      const give = Math.min(rem, Math.ceil(Math.random() * 20));
      next[a] = Math.min(TOTAL_POINTS, next[a] + give);
      rem -= give;
    }
    setPoints(next);
  }, []);

  const share = useCallback(async () => {
    const payload = btoa(JSON.stringify(points));
    const url = `${location.origin}${location.pathname}#share=${encodeURIComponent(payload)}`;
    try {
      await navigator.clipboard.writeText(url);
      window.alert('Build URL copied to clipboard.');
    } catch {
      window.prompt('Copy this build URL:', url);
    }
    history.replaceState(null, '', `#share=${encodeURIComponent(payload)}`);
  }, [points]);

  const pageBg = `radial-gradient(circle at 20% -10%, rgba(110,231,183,0.1), transparent 40%),
                  radial-gradient(circle at 90%   0%, rgba(99,102,241,0.1), transparent 40%),
                  ${T.bg}`;

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto',
      background: pageBg, color: T.text, fontFamily: "'Jost', sans-serif",
    }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, rgba(14,22,48,0.8), rgba(20,26,43,0.6))',
        borderBottom: `2px solid ${T.border}`, padding: 20, textAlign: 'center', position: 'relative',
      }}>
        <button onClick={onExit} style={{
          position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
          padding: '8px 14px', background: 'transparent', border: `1px solid ${T.border}`,
          color: T.muted, borderRadius: 6, cursor: 'pointer', fontFamily: "'Jost', sans-serif",
          fontSize: 13, letterSpacing: '0.05em',
        }}>← Back</button>
        <h1 style={{
          margin: 0, fontSize: '2rem', color: T.accent, letterSpacing: 1,
          fontFamily: "'Cinzel', serif",
        }}>⚔️ Grudge Warlords</h1>
        <div style={{ color: T.muted, fontSize: '0.95rem', marginTop: 6 }}>Ultimate Character Builder</div>
      </header>

      {/* 3-panel layout */}
      <div style={{
        maxWidth: 1600, margin: '0 auto', padding: 20,
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 350px) minmax(0, 1fr) minmax(360px, 400px)',
        gap: 20, alignItems: 'flex-start',
      }}>
        {/* LEFT ── attribute sliders ─────────────────────────────────────── */}
        <section style={panelStyle}>
          <h2 style={h2Style}>Attributes</h2>
          {ATTR_NAMES.map(name => (
            <AttributeRow key={name} name={name} value={points[name]} onChange={v => setAttr(name, v)} />
          ))}

          <PointsCounter total={total} />

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16,
          }}>
            <Button kind="primary" onClick={randomize}>Randomize</Button>
            <Button kind="secondary" onClick={share}>Share Build</Button>
            <Button kind="danger" onClick={reset} fullSpan>Reset All</Button>
          </div>
        </section>

        {/* CENTER ── result, radar, derived stats ─────────────────────────── */}
        <section style={panelStyle}>
          <ResultCard cls={cls} />

          <div style={{ marginBottom: 20, height: 300, position: 'relative' }}>
            <RadarChart values={radar} />
          </div>

          <StatisticalReview cls={cls} />

          <h2 style={h2Style}>Derived Stats</h2>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 12,
          }}>
            {STAT_KEYS.map(k => <StatCard key={k} statKey={k} value={stats[k] ?? 0} />)}
          </div>
        </section>

        {/* RIGHT ── learning panel ────────────────────────────────────────── */}
        <section style={panelStyle}>
          <h2 style={h2Style}>Learning Panel</h2>
          <div style={{ maxHeight: '80vh', overflowY: 'auto', paddingRight: 8 }}>
            {ATTR_NAMES.map(name => (
              <LearningEntry key={name} name={name} points={points[name]} />
            ))}
          </div>
        </section>
      </div>

      {remaining < 0 ? null : (
        <div style={{ height: 40 }} />
      )}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────
function AttributeRow({ name, value, onChange }: { name: AttrName; value: number; onChange: (v: number | string) => void }) {
  return (
    <div style={{ marginBottom: 16 }} title={ATTRIBUTES[name].description}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontWeight: 600, fontSize: '0.95rem', cursor: 'help', color: T.text }}>{name}</label>
        <span style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          fontSize: '0.9rem', color: T.accent, fontWeight: 700,
        }}>{value}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="range"
          min={0} max={TOTAL_POINTS} value={value}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, accentColor: T.purple }}
        />
        <input
          type="number"
          min={0} max={TOTAL_POINTS} value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 56, padding: 6, borderRadius: 6, border: `1px solid ${T.border}`,
            background: 'rgba(14,22,48,0.8)', color: T.accent, fontWeight: 600, textAlign: 'center',
            fontFamily: 'ui-monospace, monospace',
          }}
        />
      </div>
    </div>
  );
}

function PointsCounter({ total }: { total: number }) {
  const complete = total === TOTAL_POINTS;
  return (
    <div style={{
      textAlign: 'center', padding: 16, background: '#1e293b',
      border: `2px solid ${complete ? T.success : '#334155'}`,
      borderRadius: 8, margin: '16px 0',
    }}>
      <div style={{ color: T.muted, fontSize: '0.9rem' }}>Points Allocated</div>
      <div style={{
        fontSize: '2rem', fontWeight: 700,
        color: complete ? T.success : T.text, transition: 'color 0.3s',
      }}>{total} / {TOTAL_POINTS}</div>
    </div>
  );
}

function Button({
  kind, onClick, children, fullSpan,
}: {
  kind: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
  children: React.ReactNode;
  fullSpan?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const base: React.CSSProperties = {
    padding: 10, border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.2s ease', fontSize: '0.9rem', fontFamily: "'Jost', sans-serif",
    gridColumn: fullSpan ? '1 / -1' : undefined,
  };
  const variant = (() => {
    if (kind === 'primary') return {
      background: `linear-gradient(135deg, ${T.accent}, ${T.success})`, color: T.bg,
      transform: hover ? 'translateY(-2px)' : undefined,
      boxShadow: hover ? '0 8px 16px rgba(110,231,183,0.3)' : undefined,
    };
    if (kind === 'danger') return {
      background: hover ? '#dc2626' : T.danger, color: '#fff',
    };
    return {
      background: hover ? '#3a4560' : T.border, color: T.text,
    };
  })();
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variant }}>{children}</button>
  );
}

function ResultCard({ cls }: { cls: ClassResult }) {
  return (
    <div style={{
      textAlign: 'center', marginBottom: 24, padding: 16,
      border: `2px solid ${cls.color}`, borderRadius: 12,
      color: cls.color,
      boxShadow: cls.unallocated ? undefined : `0 0 20px ${cls.color}33`,
      transition: 'all 0.5s ease-in-out',
    }}>
      <p style={{ fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{cls.tier}</p>
      <h2 style={{
        fontSize: '1.5rem', fontWeight: 700, margin: '4px 0',
        fontFamily: "'Cinzel', serif",
      }}>{cls.name}</h2>
      <p style={{ fontSize: '0.9rem', color: T.muted, margin: 0 }}>{cls.description}</p>
    </div>
  );
}

function StatisticalReview({ cls }: { cls: ClassResult }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)', padding: 15, borderRadius: 8,
      marginBottom: 20, border: `1px solid ${T.border}`,
    }}>
      <h3 style={{ marginTop: 0, color: T.accent, fontFamily: "'Cinzel', serif" }}>Statistical Review</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.9rem', color: T.muted }}>Combat Power</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: T.gold }}>
            {cls.combatPower.toLocaleString()}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.9rem', color: T.muted }}>Build Rating</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: cls.ratingColor }}>{cls.rating}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: '0.85rem', color: T.muted, fontStyle: 'italic' }}>
        {cls.advice}
      </div>
    </div>
  );
}

function StatCard({ statKey, value }: { statKey: string; value: number }) {
  const [hover, setHover] = useState(false);
  const isPct  = PERCENTAGE_STATS.has(statKey);
  const human  = statKey.replace(/([A-Z])/g, ' $1').trim();
  const valStr = isPct ? value.toFixed(2) : Math.floor(value).toString();
  return (
    <div style={{
      background: 'rgba(20,26,43,0.7)', border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 12, position: 'relative',
    }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ color: T.muted, fontSize: '0.8rem', textTransform: 'uppercase' }}>
        <span style={{
          borderBottom: `1px dashed rgba(110,231,183,0.5)`,
          cursor: 'help', display: 'inline-block',
        }}>{human}</span>
      </div>
      <div style={{
        fontSize: '1.4rem', fontWeight: 700, color: T.accent, marginTop: 4,
        fontFamily: 'ui-monospace, monospace',
      }}>{valStr}{isPct ? <span style={{ fontSize: '0.9rem' }}>%</span> : null}</div>
      {hover ? (
        <div style={{
          position: 'absolute', bottom: '105%', left: 0, zIndex: 1000,
          width: 240, background: 'rgba(14,22,48,0.98)', color: T.text,
          border: `1px solid ${T.accent}`, borderRadius: 6, padding: 10,
          fontSize: '0.75rem', lineHeight: 1.4, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          textTransform: 'none',
        }}>{STAT_DESCRIPTIONS[statKey]}</div>
      ) : null}
    </div>
  );
}

function LearningEntry({ name, points }: { name: AttrName; points: number }) {
  const def = ATTRIBUTES[name];
  return (
    <div style={{
      marginBottom: 20, padding: 12,
      background: 'rgba(110,231,183,0.05)', borderLeft: `3px solid ${T.accent}`, borderRadius: 4,
    }}>
      <h4 style={{ margin: '0 0 8px', color: T.accent, fontSize: '0.95rem', fontFamily: "'Cinzel', serif" }}>
        {name} <span style={{ color: T.muted, fontWeight: 400 }}>({points} points)</span>
      </h4>
      <div style={{ color: T.muted, fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 8 }}>
        {def.fullDescription}
      </div>
      <div style={{
        background: 'rgba(14,22,48,0.8)', padding: 8, borderRadius: 4,
        fontSize: '0.8rem', lineHeight: 1.4, color: '#dbe7ff',
      }}>
        <strong style={{ display: 'block', marginBottom: 4, color: T.accent }}>Per-Point Gains:</strong>
        {Object.entries(def.gains).map(([k, gain]) => {
          const isPct = PERCENTAGE_STATS.has(k);
          const total = (gain.value * points).toFixed(2);
          return (
            <div key={k} style={{ margin: '4px 0', padding: '2px 0' }}>
              • {gain.label}: +{total}{isPct ? '%' : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
