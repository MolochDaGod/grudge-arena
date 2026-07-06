import { describe, it, expect } from "vitest";
import { parseRoute, ROUTES } from "../src/arenaRouter.js";

describe("arenaRouter", () => {
  it("maps dressing room slug", () => {
    const r = parseRoute("/dressing-room");
    expect(r.id).toBe("dressing-room");
    expect(r.autoStart).toBe(false);
  });

  it("maps arena with auto start", () => {
    const r = parseRoute("/arena");
    expect(r.gameMode).toBe("arena");
    expect(r.autoStart).toBe(true);
  });

  it("maps danger room", () => {
    const r = parseRoute("/danger-room");
    expect(r.gameMode).toBe("danger");
    expect(r.autoStart).toBe(true);
  });

  it("redirects home to danger room", () => {
    const r = parseRoute("/");
    expect(r.redirect).toBe(ROUTES.DANGER_ROOM);
  });

  it("maps combat sandbox route", () => {
    const r = parseRoute("/combat-sandbox");
    expect(r.id).toBe("combat-sandbox");
    expect(r.gameMode).toBe("danger");
    expect(r.autoStart).toBe(true);
    expect(r.combatSandbox).toBe(true);
  });

  it("aliases lobby and training", () => {
    expect(parseRoute("/lobby").id).toBe("dressing-room");
    expect(parseRoute("/training").gameMode).toBe("danger");
  });
});