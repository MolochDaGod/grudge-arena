/**
 * Categorize Mixamo boxanimation FBX filenames → pack folder + normalized rel path.
 */

const SKIP = [
  /skinning test/i,
  /entering car|exiting car|driving/i,
  /working on device/i,
  /punching bag/i,
  /harvesting/i,
  /talking$/i,
  /smoking/i,
  /rapping/i,
  /soccer tackle/i,
  /northern soul/i,
  /macaco/i,
  /breakdance/i,
];

const RULES = [
  { cat: "rifle", re: /rifle|gunplay|firing|shooting|bayonet|grab rifle|put back rifle/i },
  { cat: "longbow", re: /bow|arrow|disarm bow/i },
  { cat: "magic", re: /magic|spell|fireball|heal/i },
  { cat: "sword_shield", re: /sword|shield|great sword|draw|sheath|withdraw/i },
  { cat: "reactions", re: /death|dying|hit|react|knocked|stunned|stumble|dizzy|hurt|sweep fall/i },
  { cat: "emotes", re: /taunt|bow|inspecting|ninja idle/i },
  { cat: "traversal", re: /climb|hang|vault|wall|freehang|drop to/i },
  { cat: "unarmed", re: /punch|kick|unarmed|combo|stab|slash|club|hook|flip|uppercut|dagger|maul|mutant|thrust/i },
  { cat: "locomotion", re: /walk|run|sprint|strafe|turn|crouch|jump|dodge|roll|fall|land|sneak|swing|block|aim|idle|flip|strafing/i },
];

export function shouldSkipBoxAnim(filename) {
  const base = filename.replace(/\.fbx$/i, "");
  return SKIP.some((re) => re.test(base));
}

export function normalizeAnimName(filename) {
  return filename
    .replace(/\.fbx$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function categorizeBoxAnim(filename) {
  const base = normalizeAnimName(filename);
  if (shouldSkipBoxAnim(filename)) return null;
  for (const { cat, re } of RULES) {
    if (re.test(base)) return { category: cat, name: base };
  }
  return { category: "locomotion", name: base };
}