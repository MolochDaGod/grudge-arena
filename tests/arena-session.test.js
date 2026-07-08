import { describe, it, expect, beforeEach } from "vitest";
import {
  getArenaSession,
  setSessionPhase,
  setActiveArena,
  clearActiveArena,
  buildArenaBootConfig,
} from "../src/arenaSessionStore.js";

describe("arenaSessionStore", () => {
  beforeEach(() => {
    clearActiveArena();
    setSessionPhase("lobby");
  });

  it("tracks boot phase transitions", () => {
    setSessionPhase("loading");
    expect(getArenaSession().phase).toBe("loading");
    setSessionPhase("playing");
    expect(getArenaSession().phase).toBe("playing");
  });

  it("exposes active arena on window for smoke probes", () => {
    const fake = { dangerMode: true, dispose: () => {} };
    setActiveArena(fake);
    expect(getArenaSession().activeArena).toBe(fake);
    clearActiveArena();
    expect(getArenaSession().activeArena).toBeNull();
  });

  it("buildArenaBootConfig maps danger mode for sandbox routes", () => {
    const cfg = buildArenaBootConfig({
      container: null,
      mode: "danger",
      race: "human",
      weapon: "greatsword",
      classId: "warrior",
      buildConfig: {},
      playerName: "Test",
    });
    expect(cfg.mode).toBe("danger");
    expect(cfg.race).toBe("human");
  });
});