/**
 * CombatSystem — WoW-style combat tick engine for Grudge Arena
 *
 * Features:
 *   - Global Cooldown (GCD) — 1.5s shared lockout across all abilities
 *   - Cast bars — channeled/cast-time spells with interrupt support
 *   - Auto-attack swing timer — weapon-speed-based melee/ranged auto hits
 *   - Spell definitions — mana cost, cast time, cooldown, damage, effects
 *   - Buff/debuff tracking with duration + tick intervals (DoTs/HoTs)
 *   - Combat event bus for UI updates (cast start, damage, heal, buff, etc.)
 *
 * Usage:
 *   const combat = new CombatSystem(playerUnit);
 *   // Each frame:
 *   combat.update(delta);
 *   // On hotkey press:
 *   combat.castSpell('fireball');
 *   // Toggle auto-attack:
 *   combat.toggleAutoAttack();
 */

// ── Spell Definitions ────────────────────────────────────────────

export const SpellDatabase = {
  // ── Warrior (greatsword/sabres/runeblade) ──
  mortalStrike:  { name: 'Mortal Strike',  icon: '⚔️', manaCost: 0,  castTime: 0,    cooldown: 6,   damage: 45, type: 'melee',  school: 'physical', animation: 'attack1' },
  slam:          { name: 'Slam',           icon: '🔨', manaCost: 0,  castTime: 0,    cooldown: 0,   damage: 30, type: 'melee',  school: 'physical', animation: 'combo1' },
  whirlwind:     { name: 'Whirlwind',      icon: '🌪️', manaCost: 0,  castTime: 0,    cooldown: 10,  damage: 25, type: 'melee',  school: 'physical', animation: 'spin', aoe: true, aoeRadius: 5 },
  execute:       { name: 'Execute',        icon: '💀', manaCost: 0,  castTime: 0,    cooldown: 15,  damage: 80, type: 'melee',  school: 'physical', animation: 'combo3', executeThreshold: 0.2 },
  charge:        { name: 'Charge',         icon: '🏃', manaCost: 0,  castTime: 0,    cooldown: 12,  damage: 15, type: 'gap_close', school: 'physical', animation: 'dodge', range: 25 },

  // ── Mage (staff/wand) ──
  fireball:      { name: 'Fireball',       icon: '🔥', manaCost: 25, castTime: 2.5,  cooldown: 0,   damage: 55, type: 'ranged', school: 'fire',     animation: 'cast', projectile: true, range: 30 },
  frostBolt:     { name: 'Frost Bolt',     icon: '❄️', manaCost: 20, castTime: 2.0,  cooldown: 0,   damage: 40, type: 'ranged', school: 'frost',    animation: 'cast', projectile: true, range: 30, slow: { duration: 4, amount: 0.5 } },
  arcaneBlast:   { name: 'Arcane Blast',   icon: '✨', manaCost: 30, castTime: 1.5,  cooldown: 0,   damage: 50, type: 'ranged', school: 'arcane',   animation: 'cast2H', projectile: true, range: 30 },
  flamestrike:   { name: 'Flamestrike',    icon: '☄️', manaCost: 40, castTime: 3.0,  cooldown: 8,   damage: 35, type: 'ranged', school: 'fire',     animation: 'aoe', aoe: true, aoeRadius: 6, dot: { damage: 10, duration: 6, interval: 2 } },
  blink:         { name: 'Blink',          icon: '⚡', manaCost: 15, castTime: 0,    cooldown: 15,  damage: 0,  type: 'utility', school: 'arcane',  animation: 'dodge', teleportDistance: 12 },

  // ── Ranger (bow/rifle) ──
  steadyShot:    { name: 'Steady Shot',    icon: '🎯', manaCost: 0,  castTime: 1.8,  cooldown: 0,   damage: 35, type: 'ranged', school: 'physical', animation: 'attack1', range: 35 },
  multiShot:     { name: 'Multi-Shot',     icon: '🏹', manaCost: 15, castTime: 0,    cooldown: 6,   damage: 25, type: 'ranged', school: 'physical', animation: 'attack2', range: 30, aoe: true, aoeRadius: 4 },
  concussiveShot:{ name: 'Concussive Shot', icon: '💫', manaCost: 10, castTime: 0,   cooldown: 10,  damage: 20, type: 'ranged', school: 'physical', animation: 'attack3', range: 30, stun: { duration: 2 } },
  rapidFire:     { name: 'Rapid Fire',     icon: '⚡', manaCost: 0,  castTime: 0,    cooldown: 20,  damage: 0,  type: 'buff',   school: 'physical', animation: 'powerUp', buff: { name: 'Rapid Fire', duration: 8, attackSpeedMod: 0.5 } },
  disengage:     { name: 'Disengage',      icon: '↩️', manaCost: 0,  castTime: 0,    cooldown: 15,  damage: 0,  type: 'utility', school: 'physical', animation: 'dodgeBack', leapBack: 10 },
};

// ── Combat Constants ────────────────────────────────────────────

const GCD_DURATION = 1.5;       // Global cooldown seconds
const BASE_SWING_SPEED = 2.8;   // Auto-attack interval (weapon speed)
const MANA_REGEN_RATE = 3;      // Mana per second (out of combat: 5x)
const MAX_MANA = 100;
const MAX_HEALTH = 100;
const COMBAT_TIMEOUT = 5;       // Seconds after last action to leave combat

// ── Event Types ─────────────────────────────────────────────────

export const CombatEventType = {
  CAST_START:     'cast_start',      // { spellId, castTime }
  CAST_COMPLETE:  'cast_complete',   // { spellId }
  CAST_INTERRUPT: 'cast_interrupt',  // { spellId, reason }
  GCD_START:      'gcd_start',       // { duration }
  GCD_END:        'gcd_end',         // {}
  DAMAGE_DEALT:   'damage_dealt',    // { targetId, amount, school, isCrit }
  DAMAGE_TAKEN:   'damage_taken',    // { sourceId, amount, school, isCrit }
  HEAL:           'heal',            // { targetId, amount }
  BUFF_APPLIED:   'buff_applied',    // { targetId, buff }
  BUFF_EXPIRED:   'buff_expired',    // { targetId, buffName }
  DEBUFF_APPLIED: 'debuff_applied',  // { targetId, debuff }
  DOT_TICK:       'dot_tick',        // { targetId, damage, school }
  AUTO_ATTACK:    'auto_attack',     // { targetId, damage }
  SPELL_FAIL:     'spell_fail',      // { spellId, reason }
  ENTER_COMBAT:   'enter_combat',    // {}
  LEAVE_COMBAT:   'leave_combat',    // {}
  MANA_CHANGE:    'mana_change',     // { current, max }
  HEALTH_CHANGE:  'health_change',   // { current, max }
};

// ── CombatSystem Class ──────────────────────────────────────────

export class CombatSystem {
  constructor(unit) {
    this.unit = unit;             // { mesh, controller, animCtrl, ... }
    this.target = null;           // Current target unit

    // Resources
    this.health = MAX_HEALTH;
    this.maxHealth = MAX_HEALTH;
    this.mana = MAX_MANA;
    this.maxMana = MAX_MANA;

    // GCD
    this.gcdTimer = 0;
    this.gcdDuration = GCD_DURATION;

    // Casting
    this.casting = null;          // { spellId, spell, elapsed, total }
    this.isCasting = false;

    // Auto-attack
    this.autoAttackOn = false;
    this.swingTimer = 0;
    this.swingSpeed = BASE_SWING_SPEED;

    // Cooldowns: Map<spellId, remainingSeconds>
    this.cooldowns = new Map();

    // Buffs/Debuffs: Array<{ name, duration, remaining, interval?, tickTimer?, effect }>
    this.buffs = [];
    this.debuffs = [];

    // Combat state
    this.inCombat = false;
    this.combatTimer = 0;

    // Event listeners: Map<eventType, Set<callback>>
    this._listeners = new Map();

    // Spell hotbar (index 1-5 → spellId)
    this.hotbar = [null, null, null, null, null];
  }

  // ── Hotbar Setup ──────────────────────────────────────────────

  setHotbar(index, spellId) {
    if (index >= 1 && index <= 5) {
      this.hotbar[index - 1] = spellId;
    }
  }

  getHotbarSpell(index) {
    const id = this.hotbar[index - 1];
    return id ? { id, ...SpellDatabase[id] } : null;
  }

  // ── Target ────────────────────────────────────────────────────

  setTarget(unit) {
    this.target = unit;
  }

  // ── Cast Spell ────────────────────────────────────────────────

  castSpell(spellId) {
    const spell = SpellDatabase[spellId];
    if (!spell) {
      this._emit(CombatEventType.SPELL_FAIL, { spellId, reason: 'Unknown spell' });
      return false;
    }

    // Check GCD
    if (this.gcdTimer > 0 && spell.castTime === 0) {
      this._emit(CombatEventType.SPELL_FAIL, { spellId, reason: 'GCD active' });
      return false;
    }

    // Check already casting
    if (this.isCasting) {
      this._emit(CombatEventType.SPELL_FAIL, { spellId, reason: 'Already casting' });
      return false;
    }

    // Check cooldown
    const cd = this.cooldowns.get(spellId) || 0;
    if (cd > 0) {
      this._emit(CombatEventType.SPELL_FAIL, { spellId, reason: `On cooldown (${cd.toFixed(1)}s)` });
      return false;
    }

    // Check mana
    if (this.mana < spell.manaCost) {
      this._emit(CombatEventType.SPELL_FAIL, { spellId, reason: 'Not enough mana' });
      return false;
    }

    // Check range (if target required)
    if ((spell.type === 'melee' || spell.type === 'ranged') && !this.target) {
      this._emit(CombatEventType.SPELL_FAIL, { spellId, reason: 'No target' });
      return false;
    }

    // Execute threshold check
    if (spell.executeThreshold && this.target) {
      const targetHpPct = (this.target.health || 100) / (this.target.maxHealth || 100);
      if (targetHpPct > spell.executeThreshold) {
        this._emit(CombatEventType.SPELL_FAIL, { spellId, reason: 'Target above execute threshold' });
        return false;
      }
    }

    // Enter combat
    this._enterCombat();

    // Instant cast (castTime === 0)
    if (spell.castTime === 0) {
      this._consumeResources(spell);
      this._startGCD();
      this._applySpell(spellId, spell);
      return true;
    }

    // Start cast bar
    this.casting = { spellId, spell, elapsed: 0, total: spell.castTime };
    this.isCasting = true;
    this._emit(CombatEventType.CAST_START, { spellId, castTime: spell.castTime, spellName: spell.name });

    // Play cast animation
    if (this.unit.controller) {
      this.unit.controller.send({ type: 'skill' });
    }

    return true;
  }

  castHotbar(index) {
    const spellId = this.hotbar[index - 1];
    if (spellId) return this.castSpell(spellId);
    return false;
  }

  // ── Auto-Attack ───────────────────────────────────────────────

  toggleAutoAttack() {
    this.autoAttackOn = !this.autoAttackOn;
    if (this.autoAttackOn) {
      this._enterCombat();
      this.swingTimer = 0; // First swing is immediate
    }
  }

  // ── Interrupt ─────────────────────────────────────────────────

  interrupt(reason = 'interrupted') {
    if (!this.isCasting) return;
    const spellId = this.casting.spellId;
    this.casting = null;
    this.isCasting = false;
    this._emit(CombatEventType.CAST_INTERRUPT, { spellId, reason });
  }

  // ── Take Damage ───────────────────────────────────────────────

  takeDamage(amount, school = 'physical', sourceId = null) {
    this._enterCombat();
    const isCrit = Math.random() < 0.15;
    const finalDmg = isCrit ? Math.round(amount * 1.5) : amount;
    this.health = Math.max(0, this.health - finalDmg);
    this._emit(CombatEventType.DAMAGE_TAKEN, { sourceId, amount: finalDmg, school, isCrit });
    this._emit(CombatEventType.HEALTH_CHANGE, { current: this.health, max: this.maxHealth });

    // Interrupt cast on damage (pushback)
    if (this.isCasting && school !== 'holy') {
      this.interrupt('damage');
    }

    return finalDmg;
  }

  // ── Per-Frame Update ──────────────────────────────────────────

  update(delta) {
    // GCD countdown
    if (this.gcdTimer > 0) {
      this.gcdTimer = Math.max(0, this.gcdTimer - delta);
      if (this.gcdTimer === 0) {
        this._emit(CombatEventType.GCD_END, {});
      }
    }

    // Cooldown countdown
    for (const [id, remaining] of this.cooldowns) {
      const next = remaining - delta;
      if (next <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, next);
    }

    // Cast bar progress
    if (this.isCasting && this.casting) {
      this.casting.elapsed += delta;
      if (this.casting.elapsed >= this.casting.total) {
        // Cast complete
        const { spellId, spell } = this.casting;
        this.casting = null;
        this.isCasting = false;
        this._consumeResources(spell);
        this._startGCD();
        this._applySpell(spellId, spell);
        this._emit(CombatEventType.CAST_COMPLETE, { spellId });
      }
    }

    // Auto-attack swing timer
    if (this.autoAttackOn && this.target && !this.isCasting) {
      this.swingTimer += delta;
      const speed = this._getModifiedSwingSpeed();
      if (this.swingTimer >= speed) {
        this.swingTimer -= speed;
        this._performAutoAttack();
      }
    }

    // Buff tick processing
    this._tickBuffs(delta, this.buffs, false);
    this._tickBuffs(delta, this.debuffs, true);

    // Mana regeneration
    const regenRate = this.inCombat ? MANA_REGEN_RATE : MANA_REGEN_RATE * 5;
    if (this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + regenRate * delta);
      this._emit(CombatEventType.MANA_CHANGE, { current: Math.round(this.mana), max: this.maxMana });
    }

    // Combat timeout
    if (this.inCombat) {
      this.combatTimer += delta;
      if (this.combatTimer > COMBAT_TIMEOUT) {
        this.inCombat = false;
        this.combatTimer = 0;
        this._emit(CombatEventType.LEAVE_COMBAT, {});
      }
    }
  }

  // ── Internal Methods ──────────────────────────────────────────

  _startGCD() {
    this.gcdTimer = this.gcdDuration;
    this._emit(CombatEventType.GCD_START, { duration: this.gcdDuration });
  }

  _consumeResources(spell) {
    if (spell.manaCost > 0) {
      this.mana = Math.max(0, this.mana - spell.manaCost);
      this._emit(CombatEventType.MANA_CHANGE, { current: Math.round(this.mana), max: this.maxMana });
    }
    if (spell.cooldown > 0) {
      this.cooldowns.set(spell.name, spell.cooldown);
    }
  }

  _applySpell(spellId, spell) {
    // Play animation
    if (spell.animation && this.unit.animCtrl) {
      this.unit.animCtrl.playOnce(spell.animation, 1.0);
    }

    // Damage
    if (spell.damage > 0 && this.target) {
      const isCrit = Math.random() < 0.2;
      const dmg = isCrit ? Math.round(spell.damage * 1.5) : spell.damage;
      this._emit(CombatEventType.DAMAGE_DEALT, {
        targetId: this.target.id,
        amount: dmg,
        school: spell.school,
        isCrit,
        spellName: spell.name,
      });
    }

    // Apply buff
    if (spell.buff) {
      this.buffs.push({
        name: spell.buff.name,
        remaining: spell.buff.duration,
        effect: spell.buff,
      });
      this._emit(CombatEventType.BUFF_APPLIED, { targetId: 'self', buff: spell.buff });
    }

    // Apply DoT
    if (spell.dot && this.target) {
      this.target.debuffs = this.target.debuffs || [];
      this.target.debuffs.push({
        name: spell.name + ' (DoT)',
        remaining: spell.dot.duration,
        interval: spell.dot.interval,
        tickTimer: 0,
        damage: spell.dot.damage,
        school: spell.school,
      });
      this._emit(CombatEventType.DEBUFF_APPLIED, { targetId: this.target.id, debuff: spell.dot });
    }

    // Apply slow
    if (spell.slow && this.target) {
      this._emit(CombatEventType.DEBUFF_APPLIED, {
        targetId: this.target.id,
        debuff: { name: 'Slowed', duration: spell.slow.duration, amount: spell.slow.amount },
      });
    }

    // Apply stun
    if (spell.stun && this.target) {
      this._emit(CombatEventType.DEBUFF_APPLIED, {
        targetId: this.target.id,
        debuff: { name: 'Stunned', duration: spell.stun.duration },
      });
    }
  }

  _performAutoAttack() {
    if (!this.target) return;
    const baseDmg = 12 + Math.floor(Math.random() * 8);
    const isCrit = Math.random() < 0.15;
    const dmg = isCrit ? Math.round(baseDmg * 2) : baseDmg;

    // Play attack animation
    if (this.unit.animCtrl) {
      const attacks = ['attack1', 'attack2', 'attack3'];
      const pick = attacks[Math.floor(Math.random() * attacks.length)];
      this.unit.animCtrl.playOnce(pick, 1.0);
    }

    this._emit(CombatEventType.AUTO_ATTACK, { targetId: this.target.id, damage: dmg, isCrit });
    this._enterCombat();
  }

  _getModifiedSwingSpeed() {
    let speed = this.swingSpeed;
    for (const buff of this.buffs) {
      if (buff.effect?.attackSpeedMod) {
        speed *= (1 - buff.effect.attackSpeedMod);
      }
    }
    return Math.max(0.5, speed);
  }

  _tickBuffs(delta, list, isDebuff) {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.remaining -= delta;

      // DoT/HoT tick
      if (b.interval && b.damage) {
        b.tickTimer = (b.tickTimer || 0) + delta;
        if (b.tickTimer >= b.interval) {
          b.tickTimer -= b.interval;
          this._emit(CombatEventType.DOT_TICK, {
            targetId: isDebuff ? 'target' : 'self',
            damage: b.damage,
            school: b.school || 'magic',
            buffName: b.name,
          });
        }
      }

      // Expired
      if (b.remaining <= 0) {
        list.splice(i, 1);
        this._emit(CombatEventType.BUFF_EXPIRED, { targetId: isDebuff ? 'target' : 'self', buffName: b.name });
      }
    }
  }

  _enterCombat() {
    this.combatTimer = 0;
    if (!this.inCombat) {
      this.inCombat = true;
      this._emit(CombatEventType.ENTER_COMBAT, {});
    }
  }

  // ── Event System ──────────────────────────────────────────────

  on(eventType, callback) {
    if (!this._listeners.has(eventType)) {
      this._listeners.set(eventType, new Set());
    }
    this._listeners.get(eventType).add(callback);
    return () => this._listeners.get(eventType)?.delete(callback);
  }

  _emit(eventType, data) {
    const listeners = this._listeners.get(eventType);
    if (listeners) {
      for (const cb of listeners) {
        try { cb(data); } catch (e) { console.error(`[CombatSystem] Event handler error:`, e); }
      }
    }
  }

  // ── UI Getters ────────────────────────────────────────────────

  getCastProgress() {
    if (!this.isCasting || !this.casting) return null;
    return {
      spellName: this.casting.spell.name,
      elapsed: this.casting.elapsed,
      total: this.casting.total,
      percent: (this.casting.elapsed / this.casting.total) * 100,
    };
  }

  getGCDProgress() {
    if (this.gcdTimer <= 0) return null;
    return {
      remaining: this.gcdTimer,
      total: this.gcdDuration,
      percent: (1 - this.gcdTimer / this.gcdDuration) * 100,
    };
  }

  getSpellCooldown(spellId) {
    return this.cooldowns.get(spellId) || 0;
  }

  getResources() {
    return {
      health: Math.round(this.health),
      maxHealth: this.maxHealth,
      mana: Math.round(this.mana),
      maxMana: this.maxMana,
      healthPct: (this.health / this.maxHealth) * 100,
      manaPct: (this.mana / this.maxMana) * 100,
    };
  }
}
