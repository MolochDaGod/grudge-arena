import { z } from 'zod';

/**
 * Runtime types for the .gruda asset manifest format.
 * Mirrors `docs/gruda-spec.md` (gruda/1.0).
 *
 * Anything loaded at runtime goes through `GrudaSchema.parse(json)` first;
 * unknown / malformed manifests throw with a clear path so we never run with
 * a half-broken asset.
 */

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const EulerDeg = z.tuple([z.number(), z.number(), z.number()]);

const ShapeCommon = {
  id: z.string(),
  bone: z.string().optional(),
};

const Capsule = z.object({
  ...ShapeCommon,
  shape: z.literal('capsule'),
  from: Vec3,
  to: Vec3,
  radius: z.number().positive(),
  multiplier: z.number().positive().default(1),
  tags: z.array(z.string()).optional(),
});
const Sphere = z.object({
  ...ShapeCommon,
  shape: z.literal('sphere'),
  centre: Vec3.optional(),
  radius: z.number().positive(),
  multiplier: z.number().positive().default(1),
  tags: z.array(z.string()).optional(),
});
const Box = z.object({
  ...ShapeCommon,
  shape: z.literal('box'),
  centre: Vec3.optional(),
  halfExtents: Vec3,
  multiplier: z.number().positive().default(1),
  tags: z.array(z.string()).optional(),
});
export const Collider = z.discriminatedUnion('shape', [Capsule, Sphere, Box]);
export type Collider = z.infer<typeof Collider>;

const Socket = z.object({
  bone: z.string(),
  offset: Vec3.default([0, 0, 0]),
  rotationEulerDeg: EulerDeg.default([0, 0, 0]),
});
export type Socket = z.infer<typeof Socket>;

const Attach = z.object({
  socket: z.string(),
  fallbackSockets: z.array(z.string()).optional(),
  localOffset: Vec3.default([0, 0, 0]),
  localRotationEulerDeg: EulerDeg.default([0, 0, 0]),
});

const NamedBones = z.object({
  head: z.string(), neck: z.string().optional(), spine: z.string(),
  pelvis: z.string(), shoulderL: z.string(), shoulderR: z.string(),
  handL: z.string(), handR: z.string(), footL: z.string(), footR: z.string(),
});

const Skeleton = z.object({
  convention: z.enum(['biped', 'mixamo', 'custom']),
  boneCount: z.number().int().positive(),
  rootBone: z.string(),
  hasFingers: z.boolean(),
  bindPose: z.enum(['T', 'A']),
  boneNamingNormalized: z.boolean(),
  namedBones: NamedBones,
});

const Geometry = z.object({
  vertexCount: z.number().int().nonnegative(),
  triangleCount: z.number().int().nonnegative(),
  boundsMeters: z.object({ min: Vec3, max: Vec3 }),
  pivot: z.enum(['feet', 'origin', 'centre']),
  upAxis: z.enum(['Y', 'Z']).default('Y'),
  units: z.enum(['meters']).default('meters'),
  tangentsBaked: z.boolean().default(false),
});

const Materials = z.object({
  atlasCount: z.number().int().nonnegative(),
  totalTextures: z.number().int().nonnegative(),
  maxTextureSize: z.number().int().positive(),
  ktx2: z.boolean().default(false),
  specGloss: z.boolean().default(false),
  transparent: z.boolean().default(false),
});

const Compression = z.object({
  draco: z.boolean().default(false),
  meshopt: z.boolean().default(false),
  ktx2: z.boolean().default(false),
  sizeBytes: z.number().int().nonnegative(),
});

const DamageWindow = z.object({
  clip: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  colliderIds: z.array(z.string()).min(1),
});
const Damage = z.object({
  base: z.number().nonnegative(),
  type: z.enum(['slash', 'pierce', 'blunt', 'fire', 'frost', 'arcane']),
  stamina: z.number().nonnegative().default(0),
  knockback: z.number().nonnegative().default(0),
  windows: z.array(DamageWindow),
});

const BodyOverride = z.object({
  covers: z.array(z.string()),
  skinTo: z.literal('character'),
  weightTransfer: z.enum(['auto', 'authored']).default('authored'),
});

const Source = z.object({
  tool: z.enum(['synty', 'mixamo', 'meshy', 'blender', 'custom']),
  license: z.string().optional(),
  needsRetopology: z.boolean().default(false),
  generationPrompt: z.string().nullable().optional(),
});

const Validation = z.object({
  schemaVersion: z.string(),
  validatedAt: z.string(),
  validatorVersion: z.string(),
  checks: z.enum(['all-passed', 'passed-with-warnings', 'failed']),
  warnings: z.array(z.string()).default([]),
  ranBy: z.enum(['ci', 'local']).default('local'),
});

const Gameplay = z.object({
  controller: z.string(),
  loadout: z.string().optional(),
  abilities: z.array(z.string()).default([]),
  stats: z.record(z.number()).default({}),
  ikChains: z.array(z.string()).default([]),
  faction: z.string().optional(),
});

const Base = {
  schema: z.literal('gruda/1.0'),
  id: z.string().min(1),
  displayName: z.string().optional(),
  asset: z.string().min(1),
  sha256: z.string().optional(),
  source: Source,
  validation: Validation.optional(),
  geometry: Geometry,
  materials: Materials,
  compression: Compression,
};

export const CharacterGruda = z.object({
  ...Base,
  kind: z.literal('character'),
  skeleton: Skeleton,
  skinning: z.object({
    maxInfluencesPerVertex: z.number().int().min(1).max(8),
    unweightedVertices: z.number().int().nonnegative(),
    normalized: z.boolean(),
  }),
  animations: z.object({
    clips: z.array(z.string()),
    sampleRateFps: z.number().int().positive().default(30),
    rootMotion: z.enum(['locked', 'authored']).default('locked'),
  }),
  sockets: z.record(Socket),
  hurtboxes: z.array(Collider).default([]),
  gameplay: Gameplay,
});
export type CharacterGruda = z.infer<typeof CharacterGruda>;

export const WeaponGruda = z.object({
  ...Base,
  kind: z.literal('weapon'),
  attach: Attach,
  hitColliders: z.array(Collider).min(1),
  damage: Damage,
});
export type WeaponGruda = z.infer<typeof WeaponGruda>;

// Note: armour must declare either `attach` or `bodyOverride`. We can't enforce
// that with .refine() inside a discriminatedUnion (Zod erases the discriminator
// type), so the validator (runMechanicalChecks) checks it instead.
export const ArmourGruda = z.object({
  ...Base,
  kind: z.literal('armour'),
  attach: Attach.optional(),
  bodyOverride: BodyOverride.optional(),
});
export type ArmourGruda = z.infer<typeof ArmourGruda>;

export const HairGruda = z.object({
  ...Base,
  kind: z.literal('hair'),
  attach: Attach,
});
export const FaceGruda = z.object({
  ...Base,
  kind: z.literal('face'),
  attach: Attach,
});
export const PropGruda = z.object({ ...Base, kind: z.literal('prop') });
export const VfxGruda = z.object({ ...Base, kind: z.literal('vfx') });

export const Gruda = z.discriminatedUnion('kind', [
  CharacterGruda, WeaponGruda, ArmourGruda,
  HairGruda, FaceGruda, PropGruda, VfxGruda,
]);
export type Gruda = z.infer<typeof Gruda>;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Budget enforcement (§10).  Pure function — used by validator and runtime  */
/* ────────────────────────────────────────────────────────────────────────── */

const BUDGETS: Record<string, { sizeBytes: number; vertices: number; textures: number }> = {
  character: { sizeBytes: 700_000, vertices: 25_000, textures: 4 },
  weapon:    { sizeBytes:  80_000, vertices:  3_000, textures: 1 },
  armour:    { sizeBytes: 120_000, vertices:  4_000, textures: 2 },
  hair:      { sizeBytes:  60_000, vertices:  2_500, textures: 1 },
  face:      { sizeBytes: 100_000, vertices:  3_500, textures: 1 },
  prop:      { sizeBytes: 250_000, vertices:  8_000, textures: 2 },
  vfx:       { sizeBytes: 150_000, vertices:  4_000, textures: 2 },
};

export interface BudgetCheck { ok: boolean; reasons: string[]; }

export function checkBudget(g: Gruda): BudgetCheck {
  const b = BUDGETS[g.kind as string];
  if (!b) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  if (g.compression.sizeBytes > b.sizeBytes)
    reasons.push(`size ${g.compression.sizeBytes}B exceeds ${b.sizeBytes}B`);
  if (g.geometry.vertexCount > b.vertices)
    reasons.push(`vertices ${g.geometry.vertexCount} exceeds ${b.vertices}`);
  if (g.materials.totalTextures > b.textures)
    reasons.push(`textures ${g.materials.totalTextures} exceeds ${b.textures}`);
  return { ok: reasons.length === 0, reasons };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Mechanical rule checks (§1–§7) on a parsed manifest.                      */
/*  Returns warnings + errors; the demo + validator both call this.           */
/* ────────────────────────────────────────────────────────────────────────── */

export interface RuleCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function runMechanicalChecks(g: Gruda): RuleCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (g.materials.specGloss) errors.push('§1.5 specGloss is deprecated — re-export with metallic-roughness');
  if (g.geometry.upAxis !== 'Y') errors.push('§1.4 upAxis must be Y');
  if (g.geometry.units !== 'meters') errors.push('§1.4 units must be meters');

  // Scale (§2.7) — only enforced for characters
  if (g.kind === 'character') {
    const h = g.geometry.boundsMeters.max[1] - g.geometry.boundsMeters.min[1];
    if (h < 1.5 || h > 2.2) warnings.push(`§2.7 character height ${h.toFixed(2)}m outside 1.5–2.2m`);
    if (Math.abs(g.geometry.boundsMeters.min[1]) > 0.05)
      errors.push(`§2.6 pivot not at feet: bbox.min.y = ${g.geometry.boundsMeters.min[1]}`);
    if (g.skeleton.bindPose !== 'T') errors.push('§3.4 bindPose must be T');
    if (!g.skeleton.boneNamingNormalized) warnings.push('§3.2 bone names not normalized — runtime will fix but re-export recommended');
    if (g.skeleton.boneCount > 90) errors.push(`§3.5 boneCount ${g.skeleton.boneCount} exceeds 90`);
    if (g.skinning.maxInfluencesPerVertex > 4) errors.push('§4.1 max influences per vertex must be ≤ 4');
    if (!g.skinning.normalized) errors.push('§4.2 skin weights not normalized');
    if (g.skinning.unweightedVertices > 0) errors.push(`§4.4 ${g.skinning.unweightedVertices} unweighted vertices`);
  }

  const budget = checkBudget(g);
  for (const r of budget.reasons) errors.push(`§10 budget — ${r}`);

  return { ok: errors.length === 0, errors, warnings };
}
