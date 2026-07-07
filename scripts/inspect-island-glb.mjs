import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function boundsFromGlb(path) {
  const buf = fs.readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const accIdx = prim.attributes?.POSITION;
      if (accIdx == null) continue;
      const acc = json.accessors[accIdx];
      const bv = json.bufferViews[acc.bufferView];
      const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const stride = bv.byteStride || 12;
      for (let i = 0; i < acc.count; i++) {
        const base = binStart + off + i * stride;
        const x = buf.readFloatLE(base);
        const y = buf.readFloatLE(base + 4);
        const z = buf.readFloatLE(base + 8);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
    }
  }
  return {
    sx: maxX - minX,
    sy: maxY - minY,
    sz: maxZ - minZ,
    materials: (json.materials || []).map((m) => m.name),
    images: (json.images || []).map((i) => i.uri || "embedded"),
  };
}

const files = [
  "public/assets/island/village/glb/SM_BLD_base_v01_01.glb",
  "public/assets/island/village/glb/SM_BLD_body_v01_01.glb",
  "public/assets/island/village/glb/SM_PROP_well.glb",
  "public/assets/island/forest_pack.glb",
];

for (const rel of files) {
  const b = boundsFromGlb(join(root, rel));
  console.log(`\n${rel.split("/").pop()}`);
  console.log(`  size@1: ${b.sx.toFixed(2)} x ${b.sy.toFixed(2)} x ${b.sz.toFixed(2)} m`);
  console.log(`  materials: ${b.materials.join(", ")}`);
  if (b.images.length) console.log(`  images: ${b.images.slice(0, 5).join(", ")}`);
}