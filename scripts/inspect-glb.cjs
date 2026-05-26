const fs = require("fs");
const path = require("path");
const race = process.argv[2] || "barbarian";
const buf = fs.readFileSync(
  path.join(__dirname, "../public/models/", race + ".glb"),
);
// GLB: magic(4) version(4) length(4) | chunk0_len(4) chunk0_type(4) chunk0_data
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
const meshes = (json.meshes || []).map((m) => m.name);
const nodes = (json.nodes || []).map((n) => n.name).filter(Boolean);
console.log("=== MESHES ===");
meshes.forEach((m) => console.log(" ", m));
console.log("\n=== NODES (first 60) ===");
nodes.slice(0, 60).forEach((n) => console.log(" ", n));
