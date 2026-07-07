/**
 * VFX Catalog — live wiring to the Grudge Studio ObjectStore VFX API.
  *
   * Data sources (no auth required):
    *   effectSprites.json  — 143 sprite-sheet definitions (frame data, categories)
     *   abilityEffects.json — 209 ability -> VFX effect-chain mappings
      *     (classAbilities.<class>.<abilityName>, weaponSkills.<id>, enemyAbilities.<id>)
       *
        * This module only fetches + indexes the real catalog data — it does not
         * replace ParticleSystem.js's renderer. ParticleSystem currently only draws
          * GPU points and has no sprite-sheet/flipbook support, so full frame-by-frame
           * sprite rendering is a separate follow-up. What this DOES unlock today:
            *   - real effect category + blend mode per ability (via getAbilityVfx)
             *   - a stable color hint derived from the live category (via categoryColor)
              *   - the resolved sprite-sheet URL for every effect (via getEffectSprite),
               *     ready to hand to a future flipbook/sprite renderer.
                */

const WORKER_URL = "https://objectstore.grudge-studio.com";
const PAGES_URL = "https://molochdagod.github.io/ObjectStore/api/v1";
const INFO_URL = "https://info.grudge-studio.com/api/v1";

let _spriteCache = null; // { sourceBase, effects: Map<key, effect> }
let _abilityCache = null; // { classAbilities, weaponSkills, enemyAbilities }

async function fetchJsonWithFallback(pagesFile) {
  const urls = [
    `${INFO_URL}/${pagesFile}`,
    `${WORKER_URL}/api/v1/${pagesFile}`,
    `${PAGES_URL}/${pagesFile}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* try next */ }
  }
      return null;
}

  /** Fetch + index effectSprites.json (143 sprite sheets). Cached. */
  export async function loadEffectSprites() {
    if (_spriteCache) return _spriteCache;
    const data = await fetchJsonWithFallback("effectSprites.json");
      const sourceBase = data?.sourceBase || "https://molochdagod.github.io/ObjectStore";
    const effects = new Map();
    if (data?.effects) {
      for (const [key, effect] of Object.entries(data.effects)) {
        effects.set(key, { key, ...effect });
      }
    }
        _spriteCache = { sourceBase, effects, raw: data };
        return _spriteCache;
    }

      /** Fetch + index abilityEffects.json (209 ability -> VFX mappings). Cached. */
      export async function loadAbilityEffects() {
        if (_abilityCache) return _abilityCache;
        const data = await fetchJsonWithFallback("abilityEffects.json");
        _abilityCache = {
          classAbilities: data?.classAbilities || {},
          weaponSkills: data?.weaponSkills || {},
          enemyAbilities: data?.enemyAbilities || {},
              raw: data,
        };
          return _abilityCache;
      }

        /**
         * Resolve a single effect sprite's absolute CDN URL + frame data.
          * @param {string} key e.g. "fireSpin", "magicSpell"
           */
        export async function getEffectSprite(key) {
          if (!key) return null;
          const { sourceBase, effects } = await loadEffectSprites();
          const effect = effects.get(key);
          if (!effect) return null;
            const src = effect.src || effect.sourceUrl;
          return {
                ...effect,
                url: src ? sourceBase + src : null,
          };
        }

          /**
           * Look up the VFX effect chain wired to a named ability, searching class
            * abilities (all classes), weapon-skill ids, and enemy-ability ids.
             * @param {string} name Ability name or weapon-skill id (e.g. "Cleave", "ws_sword_slash")
              * @returns {Promise<{effect:string, beam:string|null, anim:string|null, isAoE?:boolean, source:string}|null>}
               */
          export async function getAbilityVfx(name) {
            if (!name) return null;
            const { classAbilities, weaponSkills, enemyAbilities } = await loadAbilityEffects();

            if (weaponSkills[name]) return { ...weaponSkills[name], source: "weaponSkills" };
            if (enemyAbilities[name]) return { ...enemyAbilities[name], source: "enemyAbilities" };

            for (const [className, abilities] of Object.entries(classAbilities)) {
              if (abilities[name]) return { ...abilities[name], source: `classAbilities.${className}` };
              const hit = Object.entries(abilities).find(
                ([abilityName]) => abilityName.toLowerCase() === String(name).toLowerCase(),
              );
              if (hit) return { ...hit[1], source: `classAbilities.${className}` };
            }
                return null;
          }

            /** Live category -> color hint, derived from effectSprites.json categories. */
            const CATEGORY_COLORS = {
                fire: 0xff6a00,
                explosion: 0xff4400,
                lightning: 0xffe066,
                ice: 0x66ccff,
                frozen: 0x66ccff,
                water: 0x3aa0ff,
                nature: 0x66ff99,
                earth: 0x9a7a4f,
                stone: 0x9a7a4f,
                wind: 0xd8f5ff,
                dark: 0x9955ff,
                poison: 0x66cc33,
                holy: 0xfff2b0,
                arcane: 0xb388ff,
                heal: 0x7CFC9A,
                crit: 0xffffff,
                largecrit: 0xffffff,
                stun: 0xffffaa,
                slow: 0x88aadd,
                debuff: 0xaa4466,
                buff: 0xffd27f,
                physical: 0xffd080,
                melee: 0xffd080,
                block: 0xcccccc,
                counter: 0xcccccc,
                projectile: 0xffcc66,
            };
    const DEFAULT_VFX_COLOR = 0xffd080;

    /** Best-effort color hint for procedural (non-sprite) VFX fallback rendering. */
    export function categoryColor(categories) {
      if (!categories) return DEFAULT_VFX_COLOR;
      const list = Array.isArray(categories) ? categories : [categories];
      for (const c of list) {
        if (CATEGORY_COLORS[c] != null) return CATEGORY_COLORS[c];
      }
          return DEFAULT_VFX_COLOR;
    }

      /**
       * Full resolve: ability name -> {effect sprite + color hint + anim + beam}.
        * This is the single entry point combatVfx.js / ParticleSystem.js should
         * call to connect a gameplay ability to the real Grudge Studio VFX catalog.
          */
      export async function resolveVfxForAbility(name) {
        const abilityVfx = await getAbilityVfx(name);
        if (!abilityVfx) return null;
        const sprite = await getEffectSprite(abilityVfx.effect);
        const color = categoryColor(sprite?.categories);
        return { ability: name, ...abilityVfx, sprite, color };
      }

        export default {
            loadEffectSprites,
            loadAbilityEffects,
            getEffectSprite,
            getAbilityVfx,
            categoryColor,
            resolveVfxForAbility,
        };
    
