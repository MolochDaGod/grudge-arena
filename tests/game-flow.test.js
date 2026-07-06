import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map();
vi.stubGlobal("sessionStorage", {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
});

const { stashPendingRoute, consumePendingRoute } = await import("../src/gameFlow.js");

describe("gameFlow pending routes", () => {
  beforeEach(() => {
    store.clear();
  });

  it("stashes and consumes danger-room path", () => {
    stashPendingRoute("/danger-room");
    expect(consumePendingRoute()).toBe("/danger-room");
    expect(consumePendingRoute()).toBeNull();
  });

  it("does not stash dressing-room", () => {
    stashPendingRoute("/dressing-room");
    expect(consumePendingRoute()).toBeNull();
  });
});