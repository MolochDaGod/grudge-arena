import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  sanitizeClipInPlace,
  ensureLocoClips,
  splitTrackName,
  createCharacterMixer,
} from "../src/engine/AnimClipSanitize.js";

function makeClip(name, trackNames) {
  const tracks = trackNames.map((n) => {
    if (n.endsWith(".quaternion")) {
      return new THREE.QuaternionKeyframeTrack(n, [0, 0.5], [0, 0, 0, 1, 0, 0, 0, 1]);
    }
    return new THREE.VectorKeyframeTrack(n, [0, 0.5], [0, 0, 0, 1, 2, 3]);
  });
  return new THREE.AnimationClip(name, 0.5, tracks);
}

describe("AnimClipSanitize XZ/Y contract", () => {
  it("strips position and scale tracks", () => {
    const clip = makeClip("walk", [
      "Bip001 Pelvis.quaternion",
      "Bip001 Pelvis.position",
      "Bip001.position",
      "Bip001 Spine.scale",
      "Bip001 Spine.quaternion",
    ]);
    sanitizeClipInPlace(clip);
    const names = clip.tracks.map((t) => t.name);
    expect(names).toContain("Bip001 Pelvis.quaternion");
    expect(names).toContain("Bip001 Spine.quaternion");
    expect(names.some((n) => n.includes("position"))).toBe(false);
    expect(names.some((n) => n.includes("scale"))).toBe(false);
  });

  it("ensureLocoClips clones chain when run missing", () => {
    const idle = makeClip("idle", ["Bip001 Pelvis.quaternion"]);
    const clips = new Map([["idle", idle]]);
    const loco = ensureLocoClips(clips, { idle });
    expect(loco.idle).toBeTruthy();
    expect(loco.walk).toBeTruthy();
    expect(loco.run).toBeTruthy();
    expect(loco.sprint).toBeTruthy();
    expect(clips.get("sprint").name).toBe("sprint");
  });

  it("createCharacterMixer binds to anim root", () => {
    const root = new THREE.Group();
    root.name = "animRoot";
    const mixer = createCharacterMixer(root);
    expect(mixer.getRoot()).toBe(root);
  });

  it("splitTrackName parses bone.prop", () => {
    expect(splitTrackName("Bip001 L Hand.quaternion")).toEqual({
      bone: "Bip001 L Hand",
      prop: "quaternion",
    });
  });
});
