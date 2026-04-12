/**
 * NetworkManager — Socket.IO multiplayer networking
 *
 * Connects to ws.grudge-studio.com for:
 *   arena  — PvP matchmaking, position sync, ability events
 *   mmo    — zone transitions, NPC state, player presence
 *   rts    — unit commands, resource updates, victory conditions
 *
 * Architecture:
 *   Client sends: position, rotation, animation state, abilities used
 *   Server broadcasts: other player states, damage events, match state
 *   Reconciliation: server authoritative for HP/damage, client predicts movement
 */

export class NetworkManager {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || 'https://ws.grudge-studio.com';
    this.token = options.token || null;
    this.mode = options.mode || 'arena'; // arena | mmo | rts

    this.socket = null;
    this.connected = false;
    this.playerId = null;
    this.roomId = null;

    // Remote player states
    this.remotePlayers = new Map(); // playerId → { position, rotation, anim, health }

    // Event callbacks
    this._handlers = {};

    // Sync rate
    this.sendRate = 1 / 20; // 20 updates per second
    this._sendAccum = 0;

    // Register in updates
    if (!window.updates) window.updates = [];
    window.updates.push(this);
  }

  /** Connect to the websocket server */
  async connect() {
    try {
      const { io } = await import('socket.io-client');
      this.socket = io(this.wsUrl + '/' + this.mode, {
        auth: { token: this.token },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.connected = true;
        this.playerId = this.socket.id;
        console.log(`[net] Connected to ${this.mode} server:`, this.playerId);
        this._emit('connected', { playerId: this.playerId });
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log('[net] Disconnected');
        this._emit('disconnected');
      });

      // Player state updates from server
      this.socket.on('state', (data) => {
        for (const [id, state] of Object.entries(data.players || {})) {
          if (id !== this.playerId) {
            this.remotePlayers.set(id, state);
          }
        }
        this._emit('state', data);
      });

      // Match events (arena)
      this.socket.on('match:start', (data) => this._emit('matchStart', data));
      this.socket.on('match:end', (data) => this._emit('matchEnd', data));
      this.socket.on('match:countdown', (data) => this._emit('countdown', data));

      // Damage events (server authoritative)
      this.socket.on('damage', (data) => this._emit('damage', data));
      this.socket.on('death', (data) => this._emit('death', data));
      this.socket.on('ability', (data) => this._emit('ability', data));

      // Player joined/left
      this.socket.on('player:join', (data) => this._emit('playerJoin', data));
      this.socket.on('player:leave', (data) => {
        this.remotePlayers.delete(data.playerId);
        this._emit('playerLeave', data);
      });

    } catch (err) {
      console.warn('[net] Failed to connect:', err.message);
    }
  }

  /** Register event handler */
  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
    return this;
  }

  _emit(event, data) {
    for (const handler of this._handlers[event] || []) {
      handler(data);
    }
  }

  /** Send local player state to server */
  sendState(character) {
    if (!this.socket || !this.connected) return;
    this.socket.emit('state', {
      position: {
        x: character.body?.body.position.x || character.mesh?.position.x || 0,
        y: character.body?.body.position.y || character.mesh?.position.y || 0,
        z: character.body?.body.position.z || character.mesh?.position.z || 0,
      },
      rotation: character.mesh?.rotation.y || 0,
      anim: character.stateName,
      health: character.health,
      facing: { x: character.facing.x, y: character.facing.y },
    });
  }

  /** Send ability used event */
  sendAbility(slot, targetId) {
    if (!this.socket || !this.connected) return;
    this.socket.emit('ability', { slot, targetId });
  }

  /** Send damage dealt (for server validation) */
  sendDamage(targetId, amount, abilitySlot) {
    if (!this.socket || !this.connected) return;
    this.socket.emit('damage', { targetId, amount, abilitySlot });
  }

  /** Join arena queue */
  joinQueue(mode = '3v3') {
    if (!this.socket) return;
    this.socket.emit('queue:join', { mode });
  }

  /** Called every frame — throttled state sync */
  update(dt) {
    this._sendAccum += dt;
    if (this._sendAccum >= this.sendRate) {
      this._sendAccum = 0;
      const player = window.role || window.updates?.find(u => u.team === 'player' && u.mesh);
      if (player) this.sendState(player);
    }
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
    this.connected = false;
  }
}
