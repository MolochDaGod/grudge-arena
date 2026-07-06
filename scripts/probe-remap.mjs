import { chromium } from "playwright";

const BONE_ALIASES = {
  Hips: "Bip001_Pelvis",
  Spine: "Bip001_Spine",
  Spine1: "Bip001_Spine",
  Spine2: "Bip001_Spine1",
  Neck: "Bip001_Neck",
  Head: "Bip001_Head",
  HeadTop_End: "Bip001_Head",
  LeftShoulder: "Bip001_L_Clavicle",
  LeftArm: "Bip001_L_UpperArm",
  LeftForeArm: "Bip001_L_Forearm",
  LeftHand: "Bip001_L_Hand",
  RightShoulder: "Bip001_R_Clavicle",
  RightArm: "Bip001_R_UpperArm",
  RightForeArm: "Bip001_R_Forearm",
  RightHand: "Bip001_R_Hand",
  LeftUpLeg: "Bip001_L_Thigh",
  LeftLeg: "Bip001_L_Calf",
  LeftFoot: "Bip001_L_Foot",
  LeftToeBase: "Bip001_L_Toe0",
  RightUpLeg: "Bip001_R_Thigh",
  RightLeg: "Bip001_R_Calf",
  RightFoot: "Bip001_R_Foot",
  RightToeBase: "Bip001_R_Toe0",
};

const VALID_BONES = new Set([
  "Bip001",
  "Bip001_Pelvis",
  "Bip001_Spine",
  "Bip001_Spine1",
  "Bip001_Neck",
  "Bip001_Head",
  "Bip001_L_Clavicle",
  "Bip001_L_UpperArm",
  "Bip001_L_Forearm",
  "Bip001_L_Hand",
  "Bip001_R_Clavicle",
  "Bip001_R_UpperArm",
  "Bip001_R_Forearm",
  "Bip001_R_Hand",
  "Bip001_L_Thigh",
  "Bip001_L_Calf",
  "Bip001_L_Foot",
  "Bip001_L_Toe0",
  "Bip001_R_Thigh",
  "Bip001_R_Calf",
  "Bip001_R_Foot",
  "Bip001_R_Toe0",
  "Armature",
]);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js"}}</script>
</head><body></body></html>`);

const result = await page.evaluate(
  async ({ BONE_ALIASES, validBones }) => {
    const VALID_BONES = new Set(validBones);
    const THREE = await import("three");
    const { GLTFLoader } = await import(
      "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"
    );

    function remapClipBoneNames(clip) {
      for (const track of clip.tracks) {
        const dotIdx = track.name.indexOf(".");
        if (dotIdx === -1) continue;
        let bone = track.name.substring(0, dotIdx);
        const prop = track.name.substring(dotIdx);
        if (bone.startsWith("mixamorig")) bone = bone.slice("mixamorig".length);
        if (bone in BONE_ALIASES) {
          const mapped = BONE_ALIASES[bone];
          if (!mapped) {
            track.name = "__REMOVE__" + prop;
            continue;
          }
          bone = mapped;
        }
        track.name = bone + prop;
      }
      clip.tracks = clip.tracks.filter((t) => !t.name.startsWith("__REMOVE__"));
      clip.tracks = clip.tracks.filter((track) => {
        const dotIdx = track.name.indexOf(".");
        if (dotIdx === -1) return true;
        return VALID_BONES.has(track.name.substring(0, dotIdx));
      });
      return clip;
    }

    function bindStats(action) {
      let bound = 0;
      const total = action._propertyBindings?.length || 0;
      for (const b of action._propertyBindings || []) {
        if (b?.binding?.node) bound++;
      }
      return { bound, total, ratio: total ? bound / total : 0 };
    }

    const loader = new GLTFLoader();
    const load = (url) =>
      new Promise((res, rej) => loader.load(url, res, undefined, rej));

    const char = await load(
      "https://grudge-arena.grudge-studio.com/cdn/assets/characters/human/WK_Characters.glb",
    );
    const animGltf = await load(
      "https://grudge-arena.grudge-studio.com/cdn/assets/animations/axe/standing%20idle.glb",
    );

    const scene = char.scene;
    const mixer = new THREE.AnimationMixer(scene);
    const rawClip = animGltf.animations[0];
    const remapped = rawClip.clone();
    remapClipBoneNames(remapped);

    const action = mixer.clipAction(remapped, scene);
    action.play();
    mixer.update(0);
    const stats = bindStats(action);

    // Sample bone rotation after 1s of playback
    mixer.update(1.0);
    const pelvis = scene.getObjectByName("Bip001_Pelvis");
    const head = scene.getObjectByName("Bip001_Head");

    return {
      rawTrackSample: rawClip.tracks.slice(0, 3).map((t) => t.name),
      remappedTrackSample: remapped.tracks.slice(0, 5).map((t) => t.name),
      remappedTrackCount: remapped.tracks.length,
      bindStats: stats,
      pelvisRotY: pelvis?.rotation?.y,
      headRotX: head?.rotation?.x,
      hasPelvisUnderscore: !!scene.getObjectByName("Bip001_Pelvis"),
      hasPelvisSpace: !!scene.getObjectByName("Bip001 Pelvis"),
    };
  },
  { BONE_ALIASES, validBones: [...VALID_BONES] },
);

console.log(JSON.stringify(result, null, 2));
await browser.close();