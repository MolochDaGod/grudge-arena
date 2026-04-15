/**
 * Arena Match System — WoW-style arena flow
 *
 * Phases: setup → countdown → combat → victory
 * Teams spawn on opposite sides, frozen during countdown.
 */

import * as THREE from 'three';
import { arenaApi, isLoggedIn } from './grudge-api.js';

export const MatchPhase = {
  SETUP:     'setup',
  COUNTDOWN: 'countdown',
  COMBAT:    'combat',
  VICTORY:   'victory',
};

const COUNTDOWN_SECONDS = 5;
const MATCH_TIME_LIMIT  = 300; // 5 minutes

export class ArenaMatch {
  constructor() {
    this.phase = MatchPhase.SETUP;
    this.countdown = COUNTDOWN_SECONDS;
    this.matchTimer = MATCH_TIME_LIMIT;
    this.teamA = []; // entity refs
    this.teamB = [];
    this.winner = null;
    this._countdownAccum = 0;
    this._onPhaseChange = null;
  }

  onPhaseChange(cb) { this._onPhaseChange = cb; }

  /** Register units into teams. Each unit: { entity, mesh, controller, team } */
  registerTeams(teamA, teamB) {
    this.teamA = teamA;
    this.teamB = teamB;
  }

  /** Get spawn positions for a team slot (0-based index within team) */
  static getSpawnPosition(teamId, slot, teamSize) {
    const xSign = teamId === 'A' ? -1 : 1;
    const baseX = 15 * xSign;
    const spacing = 4;
    const zOffset = (slot - (teamSize - 1) / 2) * spacing;
    return new THREE.Vector3(baseX, 0, zOffset);
  }

  /** Get facing rotation for a team (face the opposing team) */
  static getSpawnFacing(teamId) {
    return teamId === 'A' ? Math.PI / 2 : -Math.PI / 2;
  }

  /** Transition to a new phase */
  setPhase(phase) {
    this.phase = phase;
    if (this._onPhaseChange) this._onPhaseChange(phase);
    this._updateHUD();
  }

  /** Start the match (call after all units are loaded and placed) */
  start() {
    this.countdown = COUNTDOWN_SECONDS;
    this.matchTimer = MATCH_TIME_LIMIT;
    this._countdownAccum = 0;
    this.winner = null;
    this.setPhase(MatchPhase.COUNTDOWN);
  }

  /** Called every frame. Returns current phase. */
  update(delta) {
    if (this.phase === MatchPhase.COUNTDOWN) {
      this._countdownAccum += delta;
      if (this._countdownAccum >= 1) {
        this._countdownAccum -= 1;
        this.countdown--;
        this._updateCountdownHUD();
        if (this.countdown <= 0) {
          this.setPhase(MatchPhase.COMBAT);
          this._showFightBanner();
        }
      }
      return this.phase;
    }

    if (this.phase === MatchPhase.COMBAT) {
      this.matchTimer -= delta;
      this._updateTimerHUD();

      // Check win conditions
      const aAlive = this.teamA.filter(u => !u.entity.hasTag('dead'));
      const bAlive = this.teamB.filter(u => !u.entity.hasTag('dead'));

      if (bAlive.length === 0) {
        this.winner = 'A';
        this.setPhase(MatchPhase.VICTORY);
        this._reportResult();
      } else if (aAlive.length === 0) {
        this.winner = 'B';
        this.setPhase(MatchPhase.VICTORY);
        this._reportResult();
      } else if (this.matchTimer <= 0) {
        // Time ran out — team with more total HP% wins
        const aHP = aAlive.reduce((s, u) => {
          const h = u.entity.getComponent('Health');
          return s + (h ? h.current / h.max : 0);
        }, 0);
        const bHP = bAlive.reduce((s, u) => {
          const h = u.entity.getComponent('Health');
          return s + (h ? h.current / h.max : 0);
        }, 0);
        this.winner = aHP >= bHP ? 'A' : 'B';
        this.setPhase(MatchPhase.VICTORY);
        this._reportResult();
      }
      return this.phase;
    }

    return this.phase;
  }

  /** Is combat active (units can move/attack)? */
  isCombatActive() {
    return this.phase === MatchPhase.COMBAT;
  }

  // ── HUD helpers ─────────────────────────────────────────────────────────

  _updateHUD() {
    const el = document.getElementById('countdown-overlay');
    if (!el) return;

    if (this.phase === MatchPhase.COUNTDOWN) {
      el.style.display = 'flex';
      el.querySelector('.countdown-number').textContent = this.countdown;
    } else if (this.phase === MatchPhase.COMBAT) {
      el.style.display = 'none';
    } else if (this.phase === MatchPhase.VICTORY) {
      el.style.display = 'flex';
      const isPlayerWin = this.winner === 'A';
      el.querySelector('.countdown-number').textContent = '';
      el.querySelector('.countdown-label').textContent =
        isPlayerWin ? 'VICTORY' : 'DEFEAT';
      el.querySelector('.countdown-label').style.color =
        isPlayerWin ? '#22c55e' : '#ef4444';
    }
  }

  _updateCountdownHUD() {
    const num = document.querySelector('#countdown-overlay .countdown-number');
    if (num) num.textContent = this.countdown > 0 ? this.countdown : '';
    const label = document.querySelector('#countdown-overlay .countdown-label');
    if (label) label.textContent = this.countdown > 0 ? 'Arena starting...' : '';
  }

  _showFightBanner() {
    const el = document.getElementById('countdown-overlay');
    if (!el) return;
    const num = el.querySelector('.countdown-number');
    const label = el.querySelector('.countdown-label');
    if (num) { num.textContent = 'FIGHT!'; num.style.color = '#ef4444'; }
    if (label) label.textContent = '';
    setTimeout(() => {
      el.style.display = 'none';
      if (num) { num.style.color = ''; }
    }, 1200);
  }

  /** Report match result to Grudge backend (fire-and-forget) */
  _reportResult() {
    if (!isLoggedIn()) return;
    const playerUnit = this.teamA.find(u => u.isPlayer);
    arenaApi.postMatchResult({
      winner: this.winner,
      playerTeam: 'A',
      playerWon: this.winner === 'A',
      race: playerUnit?.race || 'human',
      weapon: playerUnit?.weaponDef?.name || 'greatsword',
      matchDuration: Math.round(MATCH_TIME_LIMIT - this.matchTimer),
      teamAComp: this.teamA.map(u => ({ race: u.race, weapon: u.weaponDef?.name })),
      teamBComp: this.teamB.map(u => ({ race: u.race, weapon: u.weaponDef?.name })),
    }).catch(err => console.warn('[arena] Failed to report match:', err.message));
  }

  _updateTimerHUD() {
    const el = document.getElementById('match-timer');
    if (!el) return;
    const mins = Math.floor(Math.max(0, this.matchTimer) / 60);
    const secs = Math.floor(Math.max(0, this.matchTimer) % 60);
    el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
