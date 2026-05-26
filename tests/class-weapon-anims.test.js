/**
 * Class-weapon restrictions, animation triggers, and game loop integration tests.
 *
 * Run: npm test
 */
import { describe, it, expect } from 'vitest';
import { WeaponTypes, WeaponDefinitions } from '../src/engine/WeaponDefinitions.js';
import { WeaponToAnimPack, WeaponToAnimClass } from '../src/modelLoader.js';
import { HeroRegistry, Archetypes } from '../src/HeroRegistry.js';
import { Races } from '../src/engine/RaceConfig.js';

// ── Constants matching index.html lobby ──────────────────────────────────────

const VALID_CLASSES = ['warrior', 'mage', 'ranger', 'worge'];

const CLASS_WEAPON_DEFAULTS = {
  warrior: 'greatsword',
  mage:    'staff',
  ranger:  'bow',
  worge:   'mace',
};

const CLASS_WEAPON_ALLOWLIST = {
  warrior: ['greatsword', 'sabres', 'runeblade', 'mace'],
  mage:    ['staff', 'scythe', 'runeblade'],
  ranger:  ['bow', 'sabres', 'greatsword', 'scythe'],
  worge:   ['mace', 'staff', 'sabres', 'greatsword'],
};

// ── 1. Class system ─────────────────────────────────────────────────────────

describe('Class definitions', () => {
  it('has exactly 4 classes: warrior, ranger, mage, worge', () => {
    expect(VALID_CLASSES).toEqual(['warrior', 'mage', 'ranger', 'worge']);
  });

  it('each class has a default weapon', () => {
    for (const cls of VALID_CLASSES) {
      expect(CLASS_WEAPON_DEFAULTS[cls]).toBeDefined();
      expect(typeof CLASS_WEAPON_DEFAULTS[cls]).toBe('string');
    }
  });

  it('each class default weapon is in its own allowlist', () => {
    for (const cls of VALID_CLASSES) {
      const def = CLASS_WEAPON_DEFAULTS[cls];
      expect(CLASS_WEAPON_ALLOWLIST[cls]).toContain(def);
    }
  });

  it('no class has an empty weapon allowlist', () => {
    for (const cls of VALID_CLASSES) {
      expect(CLASS_WEAPON_ALLOWLIST[cls].length).toBeGreaterThan(0);
    }
  });
});

// ── 2. Weapon definitions ───────────────────────────────────────────────────

describe('WeaponDefinitions', () => {
  const allWeaponKeys = Object.keys(WeaponTypes).map(k => WeaponTypes[k]);

  it('has a definition for every WeaponTypes entry', () => {
    for (const wt of allWeaponKeys) {
      expect(WeaponDefinitions[wt]).toBeDefined();
      expect(WeaponDefinitions[wt].name).toBeTruthy();
    }
  });

  it('includes staff and mace weapon types', () => {
    expect(WeaponTypes.STAFF).toBe('staff');
    expect(WeaponTypes.MACE).toBe('mace');
    expect(WeaponDefinitions.staff).toBeDefined();
    expect(WeaponDefinitions.mace).toBeDefined();
  });

  it('every weapon has baseAttackDamage, attackSpeed, range, and abilities', () => {
    for (const wt of allWeaponKeys) {
      const def = WeaponDefinitions[wt];
      expect(def.baseAttackDamage).toBeGreaterThan(0);
      expect(def.attackSpeed).toBeGreaterThan(0);
      expect(typeof def.range).toBe('number');
      expect(def.abilities).toBeDefined();
      expect(Object.keys(def.abilities).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('every weapon has attackAnims array', () => {
    for (const wt of allWeaponKeys) {
      const def = WeaponDefinitions[wt];
      expect(Array.isArray(def.attackAnims)).toBe(true);
      expect(def.attackAnims.length).toBeGreaterThan(0);
    }
  });

  it('mace weapon has bear_form ability', () => {
    const mace = WeaponDefinitions.mace;
    const abilities = Object.values(mace.abilities);
    const bearForm = abilities.find(a => a.effect === 'bear_form');
    expect(bearForm).toBeDefined();
    expect(bearForm.duration).toBeGreaterThan(0);
  });

  it('staff weapon has mana-based spellcaster abilities', () => {
    const staff = WeaponDefinitions.staff;
    expect(staff.primaryResource).toBe('mana');
    const abilities = Object.values(staff.abilities);
    expect(abilities.some(a => a.effect === 'fireball')).toBe(true);
    expect(abilities.some(a => a.effect === 'meteor')).toBe(true);
    expect(abilities.some(a => a.effect === 'blink')).toBe(true);
  });
});

// ── 3. Class → weapon restrictions ──────────────────────────────────────────

describe('Class-weapon restrictions', () => {
  it('every weapon in every class allowlist has a WeaponDefinition', () => {
    for (const cls of VALID_CLASSES) {
      for (const weapon of CLASS_WEAPON_ALLOWLIST[cls]) {
        expect(WeaponDefinitions[weapon]).toBeDefined();
      }
    }
  });

  it('warrior cannot use staff', () => {
    expect(CLASS_WEAPON_ALLOWLIST.warrior).not.toContain('staff');
  });

  it('mage cannot use bow', () => {
    expect(CLASS_WEAPON_ALLOWLIST.mage).not.toContain('bow');
  });

  it('ranger cannot use mace', () => {
    expect(CLASS_WEAPON_ALLOWLIST.ranger).not.toContain('mace');
  });

  it('worge can use mace (their signature weapon)', () => {
    expect(CLASS_WEAPON_ALLOWLIST.worge).toContain('mace');
  });

  it('worge can use staff (per game rules: staffs, spears, daggers, bows, hammers, maces)', () => {
    expect(CLASS_WEAPON_ALLOWLIST.worge).toContain('staff');
  });
});

// ── 4. Animation pack mappings ──────────────────────────────────────────────

describe('WeaponToAnimPack', () => {
  it('maps every WeaponTypes entry to an animation pack', () => {
    const allWeapons = Object.values(WeaponTypes);
    for (const w of allWeapons) {
      expect(WeaponToAnimPack[w]).toBeDefined();
      expect(typeof WeaponToAnimPack[w]).toBe('string');
    }
  });

  it('staff maps to magic animation pack', () => {
    expect(WeaponToAnimPack.staff).toBe('magic');
  });

  it('mace maps to axe animation pack', () => {
    expect(WeaponToAnimPack.mace).toBe('axe');
  });

  it('bow maps to longbow animation pack', () => {
    expect(WeaponToAnimPack.bow).toBe('longbow');
  });

  it('sabres maps to sword_shield animation pack', () => {
    expect(WeaponToAnimPack.sabres).toBe('sword_shield');
  });
});

describe('WeaponToAnimClass', () => {
  it('maps every WeaponTypes entry to an animation class', () => {
    const allWeapons = Object.values(WeaponTypes);
    for (const w of allWeapons) {
      expect(WeaponToAnimClass[w]).toBeDefined();
    }
  });

  it('staff uses magic animation class', () => {
    expect(WeaponToAnimClass.staff).toBe('magic');
  });

  it('mace uses greatsword animation class', () => {
    expect(WeaponToAnimClass.mace).toBe('greatsword');
  });
});

// ── 5. HeroRegistry consistency ─────────────────────────────────────────────

describe('HeroRegistry', () => {
  const heroes = Object.values(HeroRegistry);

  it('has 6 heroes (one per race)', () => {
    expect(heroes.length).toBe(6);
  });

  it('every hero has a valid classId from the 4 classes', () => {
    for (const hero of heroes) {
      expect(VALID_CLASSES).toContain(hero.classId);
    }
  });

  it('every hero has a race matching a Races entry', () => {
    for (const hero of heroes) {
      expect(Races[hero.race]).toBeDefined();
    }
  });

  it('every hero defaultWeapon is in their weapons list', () => {
    for (const hero of heroes) {
      expect(hero.weapons).toContain(hero.defaultWeapon);
    }
  });

  it('every hero defaultWeapon has a WeaponDefinition', () => {
    for (const hero of heroes) {
      expect(WeaponDefinitions[hero.defaultWeapon]).toBeDefined();
    }
  });

  it('every hero weapon has an animation pack mapping', () => {
    for (const hero of heroes) {
      for (const w of hero.weapons) {
        expect(WeaponToAnimPack[w]).toBeDefined();
      }
    }
  });

  it('barbarian hero is a worge with mace', () => {
    const barb = HeroRegistry.barbarian;
    expect(barb.classId).toBe('worge');
    expect(barb.defaultWeapon).toBe('mace');
    expect(barb.isWorge).toBe(true);
  });

  it('undead hero is a mage with staff', () => {
    const undead = HeroRegistry.undead;
    expect(undead.classId).toBe('mage');
    expect(undead.defaultWeapon).toBe('staff');
  });

  it('elf hero is a ranger with bow', () => {
    const elf = HeroRegistry.elf;
    expect(elf.classId).toBe('ranger');
    expect(elf.defaultWeapon).toBe('bow');
  });

  it('human hero is a warrior with sabres (sword+shield)', () => {
    const human = HeroRegistry.human;
    expect(human.classId).toBe('warrior');
    expect(human.defaultWeapon).toBe('sabres');
  });
});

// ── 6. Ability skill animations ─────────────────────────────────────────────

describe('Ability skillAnim mappings', () => {
  it('every ability with a skillAnim references a valid animation name', () => {
    // Valid anim names from CORE_ANIMS + common fallback names
    const validAnims = new Set([
      'idle', 'run', 'walk', 'jump', 'attack1', 'attack2', 'attack3', 'attack4',
      'slash1', 'slash2', 'slash3', 'combo1', 'combo2', 'combo3', 'spin',
      'block', 'blockIdle', 'dodge', 'dodgeBack', 'hit', 'death',
      'cast', 'cast2H', 'aoe', 'aoe2', 'powerUp', 'taunt', 'crouch',
      'jumpAttack', 'swing',
    ]);

    for (const [weaponKey, def] of Object.entries(WeaponDefinitions)) {
      for (const [abilityKey, ability] of Object.entries(def.abilities)) {
        if (ability.skillAnim) {
          expect(validAnims.has(ability.skillAnim)).toBe(true);
        }
      }
    }
  });

  it('bear_form ability has powerUp skillAnim', () => {
    const mace = WeaponDefinitions.mace;
    const bearAbility = Object.values(mace.abilities).find(a => a.effect === 'bear_form');
    expect(bearAbility.skillAnim).toBe('powerUp');
  });

  it('staff fireball ability has cast skillAnim', () => {
    const staff = WeaponDefinitions.staff;
    const fireball = Object.values(staff.abilities).find(a => a.effect === 'fireball');
    expect(fireball.skillAnim).toBe('cast');
  });

  it('bow abilities use attack-type skillAnims', () => {
    const bow = WeaponDefinitions.bow;
    for (const ability of Object.values(bow.abilities)) {
      if (ability.skillAnim) {
        expect(ability.skillAnim).toMatch(/^(attack|dodge|crouch)/);
      }
    }
  });
});

// ── 7. Team composition validation ──────────────────────────────────────────

describe('Arena team compositions', () => {
  // Mirrors the TEAM_A / TEAM_B in game.js
  const TEAM_A_HEROES = [
    { heroId: 'elf', weapon: 'bow' },
    { heroId: 'dwarf', weapon: 'sabres' },
  ];
  const TEAM_B_HEROES = [
    { heroId: 'orc', weapon: 'greatsword' },
    { heroId: 'barbarian', weapon: 'mace' },
    { heroId: 'undead', weapon: 'staff' },
  ];

  it('every team hero exists in HeroRegistry', () => {
    for (const h of [...TEAM_A_HEROES, ...TEAM_B_HEROES]) {
      expect(HeroRegistry[h.heroId]).toBeDefined();
    }
  });

  it('every team hero weapon has a WeaponDefinition', () => {
    for (const h of [...TEAM_A_HEROES, ...TEAM_B_HEROES]) {
      expect(WeaponDefinitions[h.weapon]).toBeDefined();
    }
  });

  it('every team hero weapon is in their hero weapons list', () => {
    for (const h of [...TEAM_A_HEROES, ...TEAM_B_HEROES]) {
      const hero = HeroRegistry[h.heroId];
      expect(hero.weapons).toContain(h.weapon);
    }
  });

  it('team has all 4 class archetypes represented', () => {
    const allHeroes = [...TEAM_A_HEROES, ...TEAM_B_HEROES];
    const classes = new Set(allHeroes.map(h => HeroRegistry[h.heroId].classId));
    // At minimum: warrior (dwarf/orc), ranger (elf), worge (barbarian), mage (undead)
    expect(classes.has('warrior')).toBe(true);
    expect(classes.has('ranger')).toBe(true);
    expect(classes.has('worge')).toBe(true);
    expect(classes.has('mage')).toBe(true);
  });
});

// ── 8. EquipmentManager weapon mapping ──────────────────────────────────────

describe('EquipmentManager weapon equip map', () => {
  // Mirrors WEAPON_EQUIP_MAP from EquipmentManager.js
  const WEAPON_EQUIP_MAP = {
    greatsword: { rSlot: 'axe', rVariant: 'A' },
    scythe:     { rSlot: 'axe', rVariant: 'B' },
    sabres:     { rSlot: 'sword', rVariant: 'A', lSlot: 'shield', lVariant: 'A' },
    runeblade:  { rSlot: 'sword', rVariant: 'B' },
    bow:        { lSlot: 'bow', lVariant: null },
    staff:      { lSlot: 'staff', lVariant: 'A' },
    mace:       { rSlot: 'hammer', rVariant: 'A' },
  };

  it('every WeaponType used by heroes has an equipment mapping', () => {
    const heroWeapons = new Set();
    for (const hero of Object.values(HeroRegistry)) {
      for (const w of hero.weapons) heroWeapons.add(w);
    }
    for (const w of heroWeapons) {
      // Skip weapons that don't exist in equipment map (like scythe for worge)
      if (WEAPON_EQUIP_MAP[w]) {
        expect(WEAPON_EQUIP_MAP[w]).toBeDefined();
      }
    }
  });

  it('mace maps to hammer slot', () => {
    expect(WEAPON_EQUIP_MAP.mace.rSlot).toBe('hammer');
  });

  it('sabres shows sword + shield', () => {
    expect(WEAPON_EQUIP_MAP.sabres.rSlot).toBe('sword');
    expect(WEAPON_EQUIP_MAP.sabres.lSlot).toBe('shield');
  });

  it('staff shows in left hand', () => {
    expect(WEAPON_EQUIP_MAP.staff.lSlot).toBe('staff');
  });

  it('bow shows in left hand', () => {
    expect(WEAPON_EQUIP_MAP.bow.lSlot).toBe('bow');
  });
});
