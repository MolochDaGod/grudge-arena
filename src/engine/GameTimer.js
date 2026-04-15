/**
 * GameTimer — Pause-aware timer system for ability effects.
 *
 * Replaces setTimeout which doesn't respect match pause state.
 * Timers are ticked by the game loop delta — they freeze when combat is paused.
 *
 * Usage:
 *   gameTimers.add(3, () => mesh.remove(shield));  // 3 seconds, pause-aware
 *   gameTimers.update(delta, isCombatActive);       // called every frame
 */

export class GameTimerSystem {
  constructor() {
    /** @type {{ remaining: number, callback: () => void }[]} */
    this.timers = [];
  }

  /**
   * Schedule a callback after `duration` seconds of active (non-paused) game time.
   * @param {number} duration — seconds
   * @param {() => void} callback — called once when timer expires
   */
  add(duration, callback) {
    this.timers.push({ remaining: duration, callback });
  }

  /**
   * Tick all timers. Only counts down when `active` is true.
   * @param {number} delta — frame delta in seconds
   * @param {boolean} active — false during pause/countdown
   */
  update(delta, active = true) {
    if (!active) return;

    // Swap-and-pop for expired timers
    let i = 0;
    while (i < this.timers.length) {
      const t = this.timers[i];
      t.remaining -= delta;
      if (t.remaining <= 0) {
        try { t.callback(); } catch (e) { console.warn('[GameTimer] callback error:', e); }
        this.timers[i] = this.timers[this.timers.length - 1];
        this.timers.pop();
        continue;
      }
      i++;
    }
  }

  /** Cancel all pending timers */
  clear() {
    this.timers.length = 0;
  }

  get count() { return this.timers.length; }
}
