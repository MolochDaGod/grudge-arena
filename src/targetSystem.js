/**
 * Target Selection System — WoW-style targeting
 *
 * Tab          = cycle enemy targets (nearest-first)
 * Shift+Tab    = cycle ally targets
 * F1           = select self
 * F2           = select first ally
 * F3           = select next ally
 * Escape       = deselect
 * Click        = direct target on 3D mesh
 */

import * as THREE from 'three';

const RING_SEGMENTS = 48;
const RING_INNER = 0.6;
const RING_OUTER = 0.8;
const RING_Y = 0.05;

const COLORS = {
  enemy: 0xff3333,
  ally:  0x33ff66,
  self:  0xffffff,
};

function createRing(color) {
  const geo = new THREE.RingGeometry(RING_INNER, RING_OUTER, RING_SEGMENTS);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = RING_Y;
  ring.name = '__targetRing';
  return ring;
}

export class TargetSystem {
  constructor(camera, scene, renderer) {
    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;

    /** All targetable units: { entity, mesh, team, isPlayer } */
    this.units = [];

    /** Currently selected target (or null) */
    this.currentTarget = null;
    this._ring = null;
    this._enemyIndex = -1;
    this._allyIndex = -1;

    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();

    this._setupInput();
  }

  /** Register a unit as targetable */
  register(unit) {
    this.units.push(unit);
  }

  /** Remove dead units etc */
  cleanup() {
    this.units = this.units.filter(u => !u.entity.hasTag('dead'));
    if (this.currentTarget && this.currentTarget.entity.hasTag('dead')) {
      this.deselect();
    }
  }

  /** Player's entity (team A, isPlayer=true) */
  get playerUnit() {
    return this.units.find(u => u.isPlayer);
  }

  /** Get enemies of the player's team */
  get enemies() {
    return this.units.filter(u => u.team === 'B' && !u.entity.hasTag('dead'));
  }

  /** Get allies (same team, not self) */
  get allies() {
    return this.units.filter(u => u.team === 'A' && !u.isPlayer && !u.entity.hasTag('dead'));
  }

  // ── Selection ─────────────────────────────────────────────────────────

  select(unit) {
    if (this.currentTarget === unit) return;
    this._removeRing();
    this.currentTarget = unit;

    if (!unit) return;

    const color = unit.isPlayer ? COLORS.self
      : unit.team === 'A' ? COLORS.ally
      : COLORS.enemy;

    this._ring = createRing(color);
    unit.mesh.add(this._ring);

    this._updateTargetFrame(unit);
  }

  deselect() {
    this._removeRing();
    this.currentTarget = null;
    this._enemyIndex = -1;
    this._allyIndex = -1;
    this._hideTargetFrame();
  }

  _removeRing() {
    if (this._ring && this._ring.parent) {
      this._ring.parent.remove(this._ring);
      this._ring.geometry.dispose();
      this._ring.material.dispose();
    }
    this._ring = null;
  }

  // ── Tab cycling ───────────────────────────────────────────────────────

  cycleEnemies() {
    const list = this._sortedByDistance(this.enemies);
    if (list.length === 0) return;
    this._enemyIndex = (this._enemyIndex + 1) % list.length;
    this.select(list[this._enemyIndex]);
  }

  cycleAllies() {
    const list = this.allies;
    if (list.length === 0) return;
    this._allyIndex = (this._allyIndex + 1) % list.length;
    this.select(list[this._allyIndex]);
  }

  selectSelf() {
    const p = this.playerUnit;
    if (p) this.select(p);
  }

  selectAllyBySlot(slot) {
    const list = this.allies;
    if (slot < list.length) this.select(list[slot]);
  }

  _sortedByDistance(list) {
    const player = this.playerUnit;
    if (!player) return list;
    const pPos = player.mesh.position;
    return [...list].sort((a, b) =>
      a.mesh.position.distanceToSquared(pPos) - b.mesh.position.distanceToSquared(pPos)
    );
  }

  // ── Click targeting ───────────────────────────────────────────────────

  _onClickTarget(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this.camera);

    // Collect all unit meshes for raycasting
    const meshes = this.units
      .filter(u => !u.entity.hasTag('dead'))
      .map(u => ({ mesh: u.mesh, unit: u }));

    for (const { mesh, unit } of meshes) {
      const intersects = this._raycaster.intersectObject(mesh, true);
      if (intersects.length > 0) {
        this.select(unit);
        return;
      }
    }
    // Clicked empty space — deselect
    this.deselect();
  }

  // ── Input binding ─────────────────────────────────────────────────────

  _setupInput() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          this.cycleAllies();
        } else {
          this.cycleEnemies();
        }
      }
      if (e.key === 'F1') { e.preventDefault(); this.selectSelf(); }
      if (e.key === 'F2') { e.preventDefault(); this.selectAllyBySlot(0); }
      if (e.key === 'F3') { e.preventDefault(); this.selectAllyBySlot(1); }
      if (e.key === 'Escape') { this.deselect(); }
    });

    this.renderer.domElement.addEventListener('click', (e) => {
      this._onClickTarget(e);
    });
  }

  // ── HUD ───────────────────────────────────────────────────────────────

  _updateTargetFrame(unit) {
    const frame = document.getElementById('target-frame');
    if (!frame) return;
    frame.style.display = 'block';

    const info = unit.entity.getComponent('TargetInfo');
    const health = unit.entity.getComponent('Health');

    const nameEl = frame.querySelector('.target-name');
    const hpBar = frame.querySelector('.target-hp-bar');
    const hpText = frame.querySelector('.target-hp-text');

    if (nameEl) {
      nameEl.textContent = info?.displayName || 'Unknown';
      nameEl.style.color = unit.team === 'A' ? '#33ff66' : '#ff3333';
    }
    if (health && hpBar) {
      hpBar.style.width = `${(health.current / health.max) * 100}%`;
    }
    if (health && hpText) {
      hpText.textContent = `${Math.round(health.current)} / ${health.max}`;
    }
  }

  _hideTargetFrame() {
    const frame = document.getElementById('target-frame');
    if (frame) frame.style.display = 'none';
  }

  /** Call each frame to keep target frame HP updated */
  updateTargetFrameHP() {
    if (!this.currentTarget) return;
    this._updateTargetFrame(this.currentTarget);
  }

  /** Update all team health bars in the HUD */
  updateTeamFrames() {
    this._updateTeamFrame('team-a-frames', this.units.filter(u => u.team === 'A'));
    this._updateTeamFrame('team-b-frames', this.units.filter(u => u.team === 'B'));
  }

  _updateTeamFrame(containerId, teamUnits) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Build bars if not yet created
    if (container.children.length === 0) {
      for (const unit of teamUnits) {
        const info = unit.entity.getComponent('TargetInfo');
        const bar = document.createElement('div');
        bar.className = 'team-unit-bar';
        bar.dataset.entityId = unit.entity.id;
        bar.innerHTML = `
          <span class="team-unit-name">${info?.displayName || 'Unit'}</span>
          <div class="team-unit-hp-track"><div class="team-unit-hp-fill"></div></div>
        `;
        bar.addEventListener('click', () => this.select(unit));
        container.appendChild(bar);
      }
    }

    // Update HP
    for (const unit of teamUnits) {
      const el = container.querySelector(`[data-entity-id="${unit.entity.id}"]`);
      if (!el) continue;
      const health = unit.entity.getComponent('Health');
      const fill = el.querySelector('.team-unit-hp-fill');
      if (health && fill) {
        const pct = Math.max(0, (health.current / health.max) * 100);
        fill.style.width = `${pct}%`;
        if (unit.entity.hasTag('dead')) {
          el.style.opacity = '0.4';
        }
      }
    }
  }
}
