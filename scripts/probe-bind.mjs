import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js"}}</script>
</head><body></body></html>`);

const result = await page.evaluate(async () => {
  const THREE = await import("three");
  const { GLTFLoader } = await import(
    "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"
  );
  const loader = new GLTFLoader();
  const load = (url) =>
    new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const [char, anim] = await Promise.all([
    load("https://grudge-arena.grudge-studio.com/cdn/assets/characters/human/WK_Characters.glb"),
    load("https://grudge-arena.grudge-studio.com/cdn/assets/animations/axe/standing%20idle.glb"),
  ]);
  const scene = char.scene;
  const raw = anim.animations[0];
  const mixer = new THREE.AnimationMixer(scene);

  function bindTest(clip, root, label) {
    const action = mixer.clipAction(clip, root);
    action.play();
    mixer.update(0);
    let bound = 0;
    const total = action._propertyBindings?.length || 0;
    for (const b of action._propertyBindings || []) if (b?.binding?.node) bound++;
    return { label, trackCount: clip.tracks.length, bound, total, sample: clip.tracks.slice(0, 3).map((t) => t.name) };
  }

  const bipRoot = scene.getObjectByName("Bip001") || scene;
  const names = [];
  scene.traverse((o) => {
    if (o.name && /Bip|mixamo/i.test(o.name)) names.push(o.name);
  });
  const skinBones = [];
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) {
      for (const b of o.skeleton.bones) skinBones.push(b.name);
    }
  });
  return {
    raw: bindTest(raw, scene, "raw+scene"),
    bip: bindTest(raw.clone(), bipRoot, "raw+bip"),
    hasPelvis: !!scene.getObjectByName("Bip001 Pelvis"),
    sceneBoneNames: names.slice(0, 15),
    skinBoneNames: skinBones.slice(0, 15),
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();