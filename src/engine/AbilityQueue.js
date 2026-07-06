/**
 * WoW-style single-slot ability queue — latest press wins, fires when GCD/cast clears.
 */

export class AbilityQueue {
  constructor() {
    /** @type {string|null} */
    this.queuedKey = null;
    this.queuedAt = 0;
  }

  /** Queue an ability key (replaces any prior queued key). */
  queue(key) {
    this.queuedKey = key;
    this.queuedAt = performance.now();
  }

  peek() {
    return this.queuedKey;
  }

  clear() {
    this.queuedKey = null;
    this.queuedAt = 0;
  }

  /** Returns and clears the queued key. */
  consume() {
    const key = this.queuedKey;
    this.clear();
    return key;
  }

  /** Drop stale queue entries (WoW queue window ~400ms before press expires). */
  isStale(maxAgeMs = 2500) {
    if (!this.queuedKey) return true;
    return performance.now() - this.queuedAt > maxAgeMs;
  }
}