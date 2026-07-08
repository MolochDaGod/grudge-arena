/**
 * Runtime quality gates — verify loaded units meet GLTF/skeleton/anim contract.
 * Surfaced on window.__grudgeArena._qualityReport for smoke tests and debugging.
 */

import { validateCharacterSkeleton, validateClipBinding } from "./skeletonContract.js";

const HEIGHT_TOLERANCE = 0.15;
const SCALE_TOLERANCE = 0.08;

/**
 * @param {object} unitResult — createBakedGrudge6Unit return value
 * @param {{ strict?: boolean, label?: string }} [opts]
 */
export function verifyUnitQuality(unitResult, opts = {}) {
  const label = opts.label || unitResult.race || "unit";
  const issues = [];
  const warnings = [];
  const scene = unitResult.scene || unitResult.mesh;
  const metrics =
    scene?.userData?.characterMetrics || unitResult.characterMetrics;

  if (!scene) issues.push("missing scene root");
  if (!unitResult.mixer) issues.push("missing AnimationMixer");
  if (!unitResult.controller) issues.push("missing animation controller");

  const skel = scene ? validateCharacterSkeleton(scene) : { ok: false, missing: ["scene"] };
  if (!skel.ok) {
    issues.push(`skeleton missing: ${skel.missing?.join(", ") || "unknown"}`);
  }

  if (metrics) {
    const target = metrics.targetHeight || 1.75;
    const measured = metrics.measuredHeight || 0;
    if (measured > 0 && Math.abs(measured - target) / target > HEIGHT_TOLERANCE) {
      issues.push(
        `height ${measured.toFixed(2)}m vs target ${target.toFixed(2)}m`,
      );
    }
    const hadWorldFix = String(metrics.source || "").includes("world-body-fix");
    if (
      metrics.source === "manifest-baked" &&
      Math.abs((metrics.appliedScale ?? 1) - 1) > SCALE_TOLERANCE &&
      !hadWorldFix
    ) {
      issues.push(
        `baked GLB rescale ${metrics.appliedScale?.toFixed(3)} — should be 1.0`,
      );
    }
    if (
      (metrics.appliedScale > 2 || metrics.appliedScale < 0.5) &&
      !hadWorldFix
    ) {
      issues.push(`extreme scene.scale ${metrics.appliedScale?.toFixed(3)}`);
    }
    const worldBody = metrics.worldBodyHeight;
    if (
      worldBody > 0 &&
      Math.abs(worldBody - target) / target > HEIGHT_TOLERANCE
    ) {
      issues.push(
        `world body ${worldBody.toFixed(2)}m vs target ${target.toFixed(2)}m`,
      );
    }
  } else {
    warnings.push("no characterMetrics on scene");
  }

  const idle = unitResult.controller?.clips?.get?.("idle");
  if (idle && scene) {
    const bind = validateClipBinding(idle, scene);
    if (!bind.ok) {
      issues.push(
        `idle anim bind ${bind.bound}/${bind.total} (${Math.round(bind.ratio * 100)}%)`,
      );
    }
  } else if (!idle) {
    warnings.push("no idle clip registered");
  }

  const mats = unitResult.textureAudit;
  if (mats && mats.total > 0 && mats.withMap < mats.total * 0.5) {
    issues.push(`textures ${mats.withMap}/${mats.total} mapped`);
  }

  const ok = issues.length === 0;
  if (!ok && opts.strict) {
    const err = new Error(`[qualityGate] ${label}: ${issues.join("; ")}`);
    err.code = "QUALITY_GATE_FAIL";
    err.issues = issues;
    throw err;
  }

  return { ok, issues, warnings, label, race: unitResult.race, metrics };
}

/**
 * @param {object[]} unitResults
 * @param {{ strict?: boolean, playerOnly?: boolean }} [opts]
 */
export function verifyArenaRoster(unitResults, opts = {}) {
  const units = [];
  let ok = true;
  const failed = [];
  for (const u of unitResults) {
    const label = u.isPlayer ? `${u.race || "unit"} (player)` : u.race || "unit";
    const r = verifyUnitQuality(u, { strict: false, label });
    units.push({ ...r, isPlayer: !!u.isPlayer });
    if (!r.ok) {
      ok = false;
      failed.push(r);
    }
    const blockBoot =
      opts.strict &&
      !r.ok &&
      (!opts.playerOnly || u.isPlayer);
    if (blockBoot) {
      const err = new Error(
        `[qualityGate] roster failed at ${r.label}: ${r.issues.join("; ")}`,
      );
      err.code = "QUALITY_GATE_FAIL";
      err.units = units;
      throw err;
    }
  }
  if (opts.playerOnly && failed.length) {
    const npcFailed = failed.filter((x) => !x.isPlayer);
    if (npcFailed.length) {
      console.warn(
        `[qualityGate] ${npcFailed.length} NPC(s) below bar (non-blocking): ` +
          npcFailed.map((x) => `${x.label}: ${x.issues.join(", ")}`).join(" | "),
      );
    }
  }
  return {
    ok,
    generatedAt: new Date().toISOString(),
    unitCount: units.length,
    units,
    playerOk: units.filter((x) => x.isPlayer).every((x) => x.ok),
  };
}