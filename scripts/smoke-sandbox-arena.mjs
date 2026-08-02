import { chromium } from "playwright";

if (process.argv.includes("--local")) {
  process.env.ARENA_URL = process.env.ARENA_URL || "http://localhost:5173";
}
const BASE =
  process.env.ARENA_URL || "https://island-crusade-combat-sandbox.vercel.app";
const IS_LOCAL = /localhost|127\.0\.0\.1/i.test(BASE);
/** Local dev uses /combat-sandbox; deployed sandbox uses /arena (host-detected). */
const ENTRY_PATH = process.env.ARENA_PATH || (IS_LOCAL ? "/combat-sandbox" : "/arena");
const logs = [];
const errors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[arena]") || text.includes("[modelLoader]")) logs.push(text);
  if (msg.type() === "error" && !/404|favicon/.test(text)) errors.push(text);
});
page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));

function texturedFromLogs(logLines) {
  const hit = logLines.find((l) => /(\d+)\/(\d+) materials textured/.test(l));
  if (!hit) return null;
  const [, withMap, total] = hit.match(/(\d+)\/(\d+) materials textured/);
  return { withMap: Number(withMap), total: Number(total) };
}

const ARENA_WAIT_MS = Number(process.env.SMOKE_ARENA_WAIT_MS) || 120000;

async function preflightLocal() {
  if (!IS_LOCAL) return;
  try {
    const res = await fetch(`${BASE}${ENTRY_PATH}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error(`[smoke] dev server returned ${res.status} — run: npm run dev`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`[smoke] cannot reach ${BASE} — start dev server: npm run dev`);
    console.error(String(e?.message || e));
    process.exit(1);
  }
}

let exitCode = 1;
try {
  await preflightLocal();
  await page.goto(`${BASE}${ENTRY_PATH}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const guest = page.getByRole("button", { name: /Play as Guest/i });
  if (await guest.count()) {
    await guest.first().click();
    await page.waitForTimeout(2000);
  }
  for (let i = 0; i < 60; i++) {
    const txt = await page.locator("#loading-text").textContent().catch(() => "");
    if ((txt || "").includes("Ready")) break;
    await page.waitForTimeout(1000);
  }

  try {
    await page.waitForFunction(
      () => window.__grudgeArena?.dangerMode && window.__grudgeArena?.playerUnit?.mesh,
      undefined,
      { timeout: ARENA_WAIT_MS },
    );
  } catch (e) {
    const diag = await page.evaluate(() => ({
      href: location.href,
      loadingText: document.getElementById("loading-text")?.textContent ?? "",
      errorOverlay: document.getElementById("error-message")?.textContent ?? "",
      hasArena: !!window.__grudgeArena,
      dangerMode: window.__grudgeArena?.dangerMode ?? false,
      hasPlayer: !!window.__grudgeArena?.playerUnit?.mesh,
    }));
    console.error("[smoke] arena did not become ready in time:", diag);
    throw e;
  }

  await page.evaluate(async () => {
    const p = window.__grudgeArena?._dangerEnv?.terrainLoadPromise;
    if (p) await p;
  });

  try {
    await page.waitForFunction(
      () => {
        const a = window.__grudgeArena;
        if (!a?._dangerEnv?.terrainLoadPromise) return true;
        const ts = a._terrainSystem;
        if (!ts || (a._obstacleMeshes?.length ?? 0) < 8) return false;
        return ts.isWalkable(0, 0) && ts.isWalkable(0, 5);
      },
      undefined,
      { timeout: 60000 },
    );
  } catch (e) {
    const diag = await page.evaluate(() => ({
      islandTerrainReady: window.__grudgeArena?._islandTerrainReady ?? false,
      obstacleMeshes: window.__grudgeArena?._obstacleMeshes?.length ?? 0,
      proceduralRigSampler: !!window.__grudgeArena?._proceduralRig?.groundSampler,
      centreWalkable: window.__grudgeArena?._terrainSystem?.isWalkable?.(0, 0),
      playerSpawnWalkable: window.__grudgeArena?._terrainSystem?.isWalkable?.(0, 5),
    }));
    console.warn("[smoke] spawn nav ready timeout:", diag);
  }

  await page.waitForTimeout(1500);

  // Let AnimationDirector / DirLocoBlend advance at least one cycle.
  await page.waitForTimeout(2500);

  const animBind = await page.evaluate(() => {
    const a = window.__grudgeArena;
    if (!a?.allUnits?.length) return { ok: false, units: [] };

    const findBone = (root, names) => {
      let hit = null;
      root?.traverse?.((n) => {
        if (hit) return;
        if (n?.isBone && names.includes(n.name)) hit = n;
        if (n?.isSkinnedMesh?.skeleton?.bones) {
          for (const b of n.skeleton.bones) {
            if (!hit && names.includes(b.name)) hit = b;
          }
        }
      });
      return hit;
    };

    const out = [];
    for (const u of a.allUnits) {
      const mesh = u.mesh;
      const ctrl = u.controller;
      if (!mesh || !ctrl?.mixer) {
        out.push({ race: u.race, ok: false, reason: "no-mixer" });
        continue;
      }
      const action =
        ctrl.actions?.get?.("idle") ||
        ctrl.actions?.get?.("idleExamine") ||
        ctrl.director?.loco?.idle;
      const pelvis = findBone(mesh, ["Bip001 Pelvis", "Bip001_Pelvis"]);
      const t0 = action?.time ?? 0;
      const q0 = pelvis?.quaternion?.toArray?.() ?? null;
      ctrl.update?.(1.0);
      ctrl.mixer.update(1.0);
      const t1 = action?.time ?? 0;
      let delta = t1 - t0;
      if (pelvis && q0) {
        const q1 = pelvis.quaternion.toArray();
        let qd = 0;
        for (let i = 0; i < 4; i++) qd += Math.abs(q1[i] - q0[i]);
        if (qd > delta) delta = qd;
      }
      out.push({
        race: u.race,
        ok: delta > 0.0005,
        delta,
        state: ctrl.currentState,
      });
    }
    const minOk = Math.max(5, Math.ceil(out.length * 0.7));
    return {
      ok: out.filter((x) => x.ok).length >= minOk,
      units: out,
    };
  });

  const qualityGate = await page.evaluate(() => {
    const qr = window.__grudgeArena?._qualityReport;
    if (!qr) return { ok: false, reason: "missing _qualityReport", units: [] };
    const bad = (qr.units || []).filter((u) => !u.ok);
    return {
      ok: qr.ok === true,
      unitCount: qr.unitCount ?? qr.units?.length ?? 0,
      failed: bad.map((u) => ({ label: u.label, issues: u.issues })),
      units: (qr.units || []).map((u) => ({
        label: u.label,
        ok: u.ok,
        metrics: u.metrics,
      })),
    };
  });

  const worldBodyAudit = await page.evaluate(() => {
    const isBody = (node) => {
      if (!node?.isSkinnedMesh || node.visible === false) return false;
      const n = (node.name || "").toLowerCase();
      return !/weapon_|_shield_|xtra_|quiver|pick_|wood_/.test(n);
    };
    const measure = (mesh) => {
      mesh.updateMatrixWorld(true);
      let minY = Infinity;
      let maxY = -Infinity;
      let samples = 0;
      mesh.traverse((node) => {
        if (!isBody(node) || !node.geometry?.attributes?.position) return;
        const pos = node.geometry.attributes.position;
        const m = node.matrixWorld.elements;
        const step = Math.max(1, Math.floor(pos.count / 300));
        for (let i = 0; i < pos.count; i += step) {
          const wy =
            m[1] * pos.getX(i) + m[5] * pos.getY(i) + m[9] * pos.getZ(i) + m[13];
          minY = Math.min(minY, wy);
          maxY = Math.max(maxY, wy);
          samples++;
        }
      });
      return samples ? maxY - minY : 0;
    };
    const units = (window.__grudgeArena?.allUnits || []).map((u) => {
      const target = u.characterMetrics?.targetHeight ?? 1.75;
      const worldH = measure(u.mesh);
      return {
        race: u.race,
        team: u.team,
        target,
        worldH,
        ok: worldH > 0.5 && worldH < target * 1.35,
      };
    });
    return {
      ok: units.length > 0 && units.every((u) => u.ok),
      units,
    };
  });

  const audit = await page.evaluate(() => {
    const a = window.__grudgeArena;
    if (!a) return { ok: false };
    const pu = a.playerUnit;
    const root = pu?.mesh;
    let mats = { total: 0, withMap: 0 };
    root?.traverse?.((ch) => {
      if (!ch.isMesh && !ch.isSkinnedMesh) return;
      const ms = Array.isArray(ch.material) ? ch.material : [ch.material];
      for (const m of ms) {
        if (!m) continue;
        mats.total++;
        const img = m.map?.image;
        if (img && img.width > 1 && img.height > 1) mats.withMap++;
      }
    });
    return {
      dangerMode: a.dangerMode,
      usingRapier: a._usingRapier,
      terrainMeshes: a._terrainMeshes?.length ?? 0,
      envTerrain: a._dangerEnv?.terrainMeshes?.length ?? 0,
      obstacleMeshes: a._obstacleMeshes?.length ?? 0,
      clampRadius: a._dangerClampRadius,
      groundSampler: !!a._groundSampler,
      propMeshes: a._groundSampler?._propMeshes?.length ?? 0,
      terrainSystem: !!a._terrainSystem,
      proceduralRigSampler: !!a._proceduralRig?.groundSampler,
      units: a.allUnits?.length ?? 0,
      metrics: pu?.characterMetrics,
      physicsBody: !!pu?.physicsBody,
      cannonProxy: !!pu?.cannonProxyBody,
      mats,
      softZoneHidden: document.getElementById("dr-softlock-zone")?.hidden !== false,
    };
  });

  /** Re-ground player at danger spawn before collision probes (loop may climb during wait). */
  await page.evaluate(() => {
    const a = window.__grudgeArena;
    const mesh = a?.playerUnit?.mesh;
    const ts = a?._terrainSystem;
    const pc = a?.playerController;
    if (!mesh || !ts) return;
    const x = 0;
    const z = 5;
    const y = ts.navMesh?.heightAt?.(x, z) ?? ts.groundSampler.sampleY(x, z, 0);
    pc._climbing = false;
    mesh.position.set(x, y, z);
  });

  /** Runtime collider + climb probes (ArenaTerrainSystem). */
  const terrainProbe = await page.evaluate(() => {
    const a = window.__grudgeArena;
    const ts = a?._terrainSystem;
    const mesh = a?.playerUnit?.mesh;
    const pc = a?.playerController;
    if (!ts || !mesh || !pc) {
      return { ok: false, reason: "missing terrainSystem or player" };
    }

    const v3 = (x, y, z) => ({
      x,
      y,
      z,
      normalize() {
        const l = Math.hypot(this.x, this.y, this.z) || 1;
        this.x /= l;
        this.y /= l;
        this.z /= l;
        return this;
      },
    });

    const envLayer = a.collisionSystem?.layers?.environment ?? 8;
    const envColliders =
      a.collisionSystem?.colliders?.filter((c) => (c.layer & envLayer) !== 0).length ?? 0;
    const rapierStatics = a.physicsWorld?._staticMeshKeys?.size ?? 0;

    const centreWalkable = ts.isWalkable(0, 0);
    const playerSpawnWalkable = ts.isWalkable(0, 5);
    const spawnStep = ts.navMesh.constrainMove(0, 5, 2, 5);
    const spawnMoveOk = !spawnStep.blocked && Math.hypot(spawnStep.x, spawnStep.z - 5) > 0.4;
    let ringWalkable = false;
    let ringProbe = null;
    for (let r = 18; r <= 45 && !ringWalkable; r += 3) {
      for (let ang = 0; ang < Math.PI * 2; ang += 0.22) {
        const x = r * Math.cos(ang);
        const z = r * Math.sin(ang);
        if (ts.isWalkable(x, z)) {
          ringWalkable = true;
          ringProbe = { x, z, r };
          break;
        }
      }
    }
    const constrain = ringProbe
      ? ts.navMesh.constrainMove(ringProbe.x, ringProbe.z, 0, 5)
      : { x: 0, z: 5 };
    const constrainOffCentre =
      ringProbe && Math.hypot(constrain.x - ringProbe.x, constrain.z - ringProbe.z) > 4;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    const playerSpawn = {
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
    };
    const groundY = ts.navMesh?.heightAt?.(playerSpawn.x, playerSpawn.z) ?? playerSpawn.y;

    // Environment raycast hits terrain or props (use spawn — climb scan mutates mesh).
    let envRayHit = false;
    const chestY = groundY + 1.1;
    for (const [dx, dz] of dirs) {
      const hit = a.collisionSystem?.checkCollision?.(
        v3(playerSpawn.x, chestY, playerSpawn.z),
        v3(dx, 0, dz),
        12,
        envLayer,
      );
      if (hit?.hit) {
        envRayHit = true;
        break;
      }
    }

    // Wall slide: probe from spawn and from ring walkable cell toward env geometry.
    let wallBlocked = false;
    let wallProbe = null;
    const wallOrigins = [
      { x: playerSpawn.x, z: playerSpawn.z, y: groundY },
    ];
    if (ringProbe) {
      wallOrigins.push({
        x: ringProbe.x,
        z: ringProbe.z,
        y: ts.groundSampler.sampleY(ringProbe.x, ringProbe.z, 0),
      });
    }
    for (const origin of wallOrigins) {
      if (wallBlocked) break;
      const ox = origin.x;
      const oz = origin.z;
      const oy = origin.y;
      for (const [dx, dz] of dirs) {
        const dir = v3(dx, 0, dz).normalize();
        const hit = a.collisionSystem?.checkCollision?.(
          v3(ox, oy + 1, oz),
          dir,
          14,
          envLayer,
        );
        if (!hit?.hit || hit.distance > 12) continue;
        mesh.position.set(ox, oy, oz);
        const step = Math.min(3, hit.distance * 0.85);
        const resolved = ts.resolveMove(mesh, dir.x * step, dir.z * step, dir.x, dir.z);
        const moved = Math.hypot(resolved.x - ox, resolved.z - oz);
        mesh.position.set(ox, oy, oz);
        wallProbe = { moved, attempted: step, blocked: resolved.blocked, hitDist: hit.distance };
        if (moved < step * 0.7 || resolved.blocked) {
          wallBlocked = true;
          break;
        }
      }
    }

    // Scan island ring for climbable slope.
    let climbSpot = null;
    for (let r = 28; r <= 40 && !climbSpot; r += 2) {
      for (let ang = 0; ang < Math.PI * 2; ang += 0.12) {
        const x = r * Math.cos(ang);
        const z = r * Math.sin(ang);
        if (!ts.isWalkable(x, z)) continue;
        const y = ts.groundSampler.sampleY(x, z, 0);
        mesh.position.set(x, y, z);
        const fx = Math.cos(ang + 0.35);
        const fz = Math.sin(ang + 0.35);
        const hint = ts.climbDetector.detect(mesh, fx, fz);
        if (hint.canClimb) {
          climbSpot = { x, z, y, fx, fz, reason: hint.reason, topY: hint.topY };
          break;
        }
      }
    }

    // Mesh climb near village / prop obstacles.
    if (!climbSpot) {
      for (const obs of a._obstacleMeshes || []) {
        if (!obs?.position) continue;
        const cx = obs.position.x;
        const cz = obs.position.z;
        for (const [ox, oz] of [[-2.2, 0], [2.2, 0], [0, -2.2], [0, 2.2]]) {
          const x = cx + ox;
          const z = cz + oz;
          const y = ts.groundSampler.sampleY(x, z, 0);
          mesh.position.set(x, y, z);
          const dx = cx - x;
          const dz = cz - z;
          const len = Math.hypot(dx, dz) || 1;
          const hint = ts.climbDetector.detect(mesh, dx / len, dz / len);
          if (hint.canClimb) {
            climbSpot = {
              x,
              z,
              y,
              fx: dx / len,
              fz: dz / len,
              reason: hint.reason,
              topY: hint.topY,
            };
            break;
          }
        }
        if (climbSpot) break;
      }
    }

    const savedPos = { ...playerSpawn };

    // Climb execution: natural spot or injected hint at walkable ring cell.
    let climbExecuted = false;
    let climbDeltaY = 0;
    let climbMode = null;
    if (climbSpot) {
      climbMode = "natural";
      mesh.position.set(climbSpot.x, climbSpot.y, climbSpot.z);
      mesh.rotation.y = Math.atan2(climbSpot.fx, climbSpot.fz);
      pc._lastClimbHint = ts.climbDetector.detect(mesh, climbSpot.fx, climbSpot.fz);
    } else if (ringWalkable && ringProbe) {
      climbMode = "synthetic";
      const x = ringProbe.x;
      const z = ringProbe.z;
      const y = ts.groundSampler.sampleY(x, z, 0);
      mesh.position.set(x, y, z);
      mesh.rotation.y = Math.atan2(1, 0);
      pc._lastClimbHint = {
        canClimb: true,
        reason: "synthetic",
        topY: y + 1.25,
      };
    }

    if (climbMode) {
      const y0 = mesh.position.y;
      const started = pc._tryStartClimb?.();
      if (started) {
        for (let i = 0; i < 10; i++) pc._updateClimb?.(0.08);
        climbDeltaY = mesh.position.y - y0;
        climbExecuted = climbDeltaY > 0.12 || pc._climbing;
      }
    }

    mesh.position.set(savedPos.x, savedPos.y, savedPos.z);
    ts.snapMesh(mesh);

    return {
      ok: true,
      playerSpawn,
      envColliders,
      rapierStatics,
      centreWalkable,
      playerSpawnWalkable,
      spawnMoveOk,
      constrainOffCentre,
      ringWalkable,
      ringProbe,
      wallBlocked,
      wallProbe,
      envRayHit,
      climbSpot: climbSpot
        ? { reason: climbSpot.reason, topY: climbSpot.topY }
        : null,
      climbMode,
      climbExecuted,
      climbDeltaY,
    };
  });

  /** Keyboard Space climb at walkable ring (synthetic hint if no natural ledge). */
  let keyboardClimb = null;
  if (terrainProbe.ok && terrainProbe.ringWalkable) {
    await page.evaluate((natural) => {
      const a = window.__grudgeArena;
      const ts = a._terrainSystem;
      const mesh = a.playerUnit.mesh;
      const pc = a.playerController;
      pc._climbing = false;
      if (natural) return;
      let x = 30;
      let z = 4;
      for (let r = 18; r <= 45; r += 3) {
        let found = false;
        for (let ang = 0; ang < Math.PI * 2; ang += 0.22) {
          const px = r * Math.cos(ang);
          const pz = r * Math.sin(ang);
          if (ts.isWalkable(px, pz)) {
            x = px;
            z = pz;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      const y = ts.groundSampler.sampleY(x, z, 0);
      mesh.position.set(x, y, z);
      mesh.rotation.y = 0;
      pc._lastClimbHint = { canClimb: true, reason: "synthetic", topY: y + 1.25 };
    }, !!terrainProbe.climbSpot);
    const yBefore = await page.evaluate(
      () => window.__grudgeArena.playerUnit.mesh.position.y,
    );
    for (let frame = 0; frame < 14; frame++) {
      await page.evaluate((f) => {
        const pc = window.__grudgeArena?.playerController;
        if (!pc) return;
        if (f === 0) pc.tickKey.Space = true;
        pc.update(0.08);
        if (f === 0) pc.tickKey.Space = false;
      }, frame);
      await page.waitForTimeout(40);
    }
    keyboardClimb = await page.evaluate((y0) => {
      const pc = window.__grudgeArena?.playerController;
      const y1 = window.__grudgeArena?.playerUnit?.mesh?.position?.y ?? y0;
      return {
        started: pc?._climbing || y1 > y0 + 0.1,
        deltaY: y1 - y0,
        climbing: !!pc?._climbing,
      };
    }, yBefore);
  }

  const logMats = texturedFromLogs(logs);
  const meshTextured =
    audit.mats?.withMap >= 20 && audit.mats.withMap === audit.mats.total;
  const logTextured =
    logMats && logMats.withMap >= 20 && logMats.withMap === logMats.total;

  const playerWorldH =
    audit.metrics?.worldBodyHeight ??
    worldBodyAudit.units?.find((u) => u.team === "A" && u.race)?.worldH ??
    worldBodyAudit.units?.[0]?.worldH;
  const playerTarget = audit.metrics?.targetHeight ?? 1.75;

  const checks = {
    loaded: !!audit.dangerMode,
    textured: meshTextured || logTextured,
    scaled:
      playerWorldH > 0.5
        ? Math.abs(playerWorldH - playerTarget) / playerTarget <= 0.12
        : audit.metrics &&
          audit.metrics.measuredHeight > 0 &&
          Math.abs(audit.metrics.measuredHeight - playerTarget) / playerTarget <=
            0.12,
    rapier: audit.usingRapier === true,
    colliders: audit.physicsBody && audit.cannonProxy,
    terrain:
      audit.groundSampler &&
      (audit.terrainMeshes >= 1 || audit.envTerrain >= 1),
    terrainSystem: audit.terrainSystem === true,
    propGrounding:
      audit.propMeshes >= 8 && audit.proceduralRigSampler === true,
    islandObstacles: audit.obstacleMeshes >= 8,
    envColliders:
      terrainProbe.ok &&
      terrainProbe.envColliders >= (audit.terrainMeshes || 1),
    rapierStatics: terrainProbe.ok && terrainProbe.rapierStatics >= 1,
    navMesh:
      terrainProbe.ok &&
      terrainProbe.centreWalkable &&
      terrainProbe.playerSpawnWalkable &&
      terrainProbe.spawnMoveOk &&
      terrainProbe.ringWalkable &&
      terrainProbe.constrainOffCentre,
    wallBlock:
      terrainProbe.ok &&
      (terrainProbe.wallBlocked || terrainProbe.envRayHit),
    climbPipeline:
      terrainProbe.ok &&
      (terrainProbe.climbExecuted || (keyboardClimb?.started ?? false)),
    radialHud: audit.softZoneHidden,
    animBind: animBind.ok,
    qualityGate: qualityGate.ok,
    rosterScale:
      qualityGate.ok &&
      qualityGate.units.every(
        (u) =>
          !u.metrics ||
          Math.abs((u.metrics.appliedScale ?? 1) - 1) <= 0.08 ||
          String(u.metrics.source || "").includes("world-body-fix") ||
          u.metrics.source !== "manifest-baked",
      ),
    worldBodyScale: worldBodyAudit.ok,
    noErrors: errors.length === 0,
  };

  const CRITICAL = [
    "loaded",
    "textured",
    "scaled",
    "worldBodyScale",
    "qualityGate",
    "animBind",
    "noErrors",
    "rapier",
    "colliders",
    "terrain",
    "terrainSystem",
  ];
  const ADVISORY = [
    "propGrounding",
    "islandObstacles",
    "envColliders",
    "rapierStatics",
    "navMesh",
    "wallBlock",
    "climbPipeline",
    "radialHud",
    "rosterScale",
  ];
  const criticalFailed = CRITICAL.filter((k) => !checks[k]);
  const advisoryFailed = ADVISORY.filter((k) => !checks[k]);
  const smokeVerdict = {
    criticalOk: criticalFailed.length === 0,
    advisoryOk: advisoryFailed.length === 0,
    criticalFailed,
    advisoryFailed,
  };

  console.log(
    JSON.stringify(
      {
        audit,
        animBind,
        qualityGate,
        worldBodyAudit,
        terrainProbe,
        keyboardClimb,
        logMats,
        checks,
        smokeVerdict,
      },
      null,
      2,
    ),
  );
  console.log("logs tail:", logs.slice(-8).join("\n"));
  if (advisoryFailed.length) {
    console.warn(
      `[smoke] advisory (non-blocking): ${advisoryFailed.join(", ")}`,
    );
  }
  if (criticalFailed.length) {
    console.error(
      `[smoke] critical failures: ${criticalFailed.join(", ")}`,
    );
  }
  exitCode = smokeVerdict.criticalOk ? 0 : 1;
} finally {
  await browser.close();
}
process.exit(exitCode);