import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isSandboxAutoStartRoute,
  sandboxEntryPath,
} from "../src/sandboxGameFlow.js";
import { parseRoute } from "../src/arenaRouter.js";

describe("sandboxGameFlow", () => {
  const origHostname = globalThis.location?.hostname;

  beforeEach(() => {
    globalThis.location = { hostname: "island-crusade-combat-sandbox.vercel.app", pathname: "/arena", search: "" };
  });

  afterEach(() => {
    if (origHostname !== undefined) {
      globalThis.location.hostname = origHostname;
    }
  });

  it("detects sandbox auto-start routes on host", () => {
    const route = parseRoute("/arena");
    expect(route.combatSandbox).toBe(true);
    expect(isSandboxAutoStartRoute(route)).toBe(true);
  });

  it("uses /arena entry on sandbox host", () => {
    expect(sandboxEntryPath()).toBe("/arena");
  });
});