/**
 * Grudge UUID — format spec mirrored from GrudgeSDK v6.0.
 *
 * Format:  {PREFIX}-{YYYYMMDDHHmmss}-{SEQ:6hex}-{HASH:8hex}
 * Example: ITEM-20260422153012-00001A-A1B2C3D4
 *
 * These IDs are cross-app compatible with every Grudge service
 * (backend /inventory, cNFT minting, SSO character lookups).
 * Do not diverge from this format — the backend validates it.
 */

export const PREFIX_MAP = {
  hero: 'HERO',
  item: 'ITEM',
  equipment: 'EQIP',
  ability: 'ABIL',
  material: 'MATL',
  recipe: 'RECP',
  node: 'NODE',
  mob: 'MOBS',
  boss: 'BOSS',
  mission: 'MISS',
  infusion: 'INFU',
  loot: 'LOOT',
  consumable: 'CONS',
  quest: 'QUST',
  zone: 'ZONE',
  save: 'SAVE',
  character: 'CHAR',
};

let _seq = 0;

function _fnv1a8(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash = hash >>> 0;
  const h2 = (hash ^ (hash >>> 16)) >>> 0;
  return h2.toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
}

function _timestamp(date = new Date()) {
  return date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0') +
    String(date.getHours()).padStart(2, '0') +
    String(date.getMinutes()).padStart(2, '0') +
    String(date.getSeconds()).padStart(2, '0');
}

/**
 * Generate a Grudge UUID.
 * @param {keyof PREFIX_MAP | string} entityType  'item' | 'character' | ... or a raw 4-char prefix.
 * @param {string} [metadata]  Optional seed included in the hash for collision resistance.
 * @returns {string} Cross-app compatible Grudge UUID.
 */
export function generateGrudgeUuid(entityType, metadata = '') {
  const prefix = PREFIX_MAP[entityType] || entityType.slice(0, 4).toUpperCase();
  const ts = _timestamp();
  _seq++;
  const seq = _seq.toString(16).toUpperCase().padStart(6, '0');
  const hash = _fnv1a8(`${prefix}-${ts}-${seq}-${metadata}-${Math.random()}`);
  return `${prefix}-${ts}-${seq}-${hash}`;
}

/**
 * Parse a Grudge UUID into its components.
 * Returns null for malformed input.
 */
export function parseGrudgeUuid(uuid) {
  if (!uuid || typeof uuid !== 'string') return null;
  const parts = uuid.split('-');
  if (parts.length !== 4) return null;
  const [prefix, ts, sequence, hash] = parts;
  const entityType = Object.entries(PREFIX_MAP).find(([, v]) => v === prefix)?.[0] || 'unknown';
  let createdAt = null;
  if (/^\d{14}$/.test(ts)) {
    createdAt = new Date(
      parseInt(ts.slice(0, 4), 10),
      parseInt(ts.slice(4, 6), 10) - 1,
      parseInt(ts.slice(6, 8), 10),
      parseInt(ts.slice(8, 10), 10),
      parseInt(ts.slice(10, 12), 10),
      parseInt(ts.slice(12, 14), 10),
    );
  }
  return { prefix, timestamp: ts, sequence, hash, entityType, createdAt };
}

/** Validate a Grudge UUID string. */
export function isValidGrudgeUuid(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  return /^[A-Z]{4}-\d{14}-[0-9A-F]{6}-[0-9A-F]{8}$/.test(uuid);
}

export default { generateGrudgeUuid, parseGrudgeUuid, isValidGrudgeUuid, PREFIX_MAP };
