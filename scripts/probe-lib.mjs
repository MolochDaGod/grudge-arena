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

  const [char, lib] = await Promise.all([
    load(
      "https://grudge-arena.grudge-studio.com/cdn/assets/characters/human/WK_Characters.glb",
    ),
    load("https://grudge-arena.grudge-studio.com/models/animation-library.glb"),
  ]);

  const scene = char.scene;
  const mixer = new THREE.AnimationMixer(scene);
  const clip = lib.animations.find((a) => a.name.includes("greatsword__idle")) || lib.animations[0];
  const action = mixer.clipAction(clip, scene);
  action.play();
  mixer.update(0);
  let bound = 0;
  const total = action._propertyBindings?.length || 0;
  for (const b of action._propertyBindings || []) if (b?.binding?.node) bound++;

  const trackBones = [...new Set(clip.tracks.map((t) => t.name.split(".")[0]))].slice(0, 8);

  return {
    clipName: clip.name,
    trackCount: clip.tracks.length,
    bound,
    total,
    trackBones,
    libClipCount: lib.animations.length,
    libClipNames: lib.animations.map((a) => a.name).slice(0, 8),
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();