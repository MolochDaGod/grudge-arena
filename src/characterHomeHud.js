/**
 * Character Home HUD — Warlords bottom bar (chat, hotbar 1–8, status + I/C/K).
 * Combat sandbox production overlay; mirrors archive/overlay-draft.html layout.
 */

import { isCombatSandboxUi } from "./dangerRoom/dangerRoomStore.js";
import { assetUrl } from "./assetConfig.js";

let mounted = false;
let rootEl = null;

const RACE_GLYPH = {
  human: "⚔",
  barbarian: "⚔",
  elf: "🏹",
  dwarf: "⛏",
  orc: "🪓",
  undead: "💀",
};

const EFFECT_ICONS = {
  fireball: "ability_fireball",
  dot_projectile: "ability_venom_edge",
  lifesteal_projectile: "ability_life_drain",
  multi_projectile: "ability_multishot",
  debuff_target: "ability_enfeeble",
  frost_nova: "ability_holy_nova",
  meteor: "ability_meteor_strike",
  aoe_zone: "ability_molotov",
  shield: "ability_divine_shield",
  buff_damage: "ability_damage_surge",
  reset_cooldowns: "ability_mana_flow",
  dash: "ability_wind_walk",
  blink: "ability_evasion",
  teleport_behind: "ability_evasive",
  aoe_melee: "ability_whirlwind",
  execute: "ability_execute",
  aoe_strike: "ability_thunderclap",
  stealth: "ability_sleep_dart",
  projectile_pull: "ability_entangle",
  melee_lifesteal: "ability_lacerate",
  aoe_shield: "ability_mana_shield",
  beam: "ability_lightning",
  ground_zone: "ability_rejuvenate",
  full_heal_invuln: "ability_invincible",
  reload: "ability_mana_flow",
  bear_form: "ability_damage_surge",
  projectile: "ability_arcane_bolt",
  melee: "ability_thunderclap",
};

function iconForAbility(ability) {
  const name = EFFECT_ICONS[ability?.effect] || "ability_arcane_bolt";
  return assetUrl(`assets/icons/abilities/${name}.png`);
}

function buildShell() {
  return `
    <div id="ch-ui-overlay" class="ch-ui-overlay panel-style">
      <div id="ch-hud-chat" class="ch-hud-chat">
        <div id="ch-chat-log" class="ch-chat-log">
          <div class="ch-chat-line ch-chat-system">Island Crusade combat sandbox — Warlords HUD active.</div>
        </div>
        <input class="ch-chat-input" id="ch-chat-input" placeholder="Press Enter to chat…" autocomplete="off" />
      </div>
      <div id="ch-hud-hotbar" class="ch-hud-hotbar"></div>
      <div id="ch-hud-status-col" class="ch-hud-status-col">
        <div id="ch-hud-ics-row">
          <button type="button" class="ch-circle-btn" data-panel="panel-inv" title="Inventory [I]">I</button>
          <button type="button" class="ch-circle-btn" data-panel="panel-char" title="Character [C]">C</button>
          <button type="button" class="ch-circle-btn" data-panel="panel-skills" title="Spell Book [K]">K</button>
        </div>
        <div id="ch-hud-status-panel" class="ch-hud-status-panel panel-style">
          <div class="ch-hud-portrait-col">
            <div id="ch-hud-portrait" title="Character [C]">⚔</div>
            <div class="ch-hud-bar-track ch-hud-bar-hp"><div id="ch-hud-hp" class="ch-hud-bar-fill"></div></div>
            <div class="ch-hud-bar-track ch-hud-bar-res" id="ch-hud-res-wrap" data-resource="mana">
              <div id="ch-hud-res" class="ch-hud-bar-fill"></div>
            </div>
          </div>
          <div class="ch-hud-info-col">
            <div id="ch-hud-name" class="ch-hud-name">Warlord</div>
            <div id="ch-hud-class" class="ch-hud-class-row">Lv.42 Warrior</div>
            <div class="ch-hud-divider"></div>
            <div class="ch-hud-equipped-label">Equipped</div>
            <div id="ch-hud-gear" class="ch-hud-gear"></div>
          </div>
        </div>
      </div>
    </div>`;
}

function wirePanelButtons() {
  rootEl?.querySelectorAll(".ch-circle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = btn.dataset.panel;
      window.__grudgeArena?.inventoryUI?.toggle?.(panel);
      rootEl?.querySelectorAll(".ch-circle-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.panel === panel);
      });
    });
  });
  rootEl?.querySelector("#ch-hud-portrait")?.addEventListener("click", () => {
    window.__grudgeArena?.inventoryUI?.toggle?.("panel-char");
  });
  const chatInput = rootEl?.querySelector("#ch-chat-input");
  chatInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const msg = chatInput.value.trim();
    if (!msg) return;
    const log = rootEl?.querySelector("#ch-chat-log");
    if (log) {
      const line = document.createElement("div");
      line.className = "ch-chat-line";
      line.textContent = `[You]: ${msg}`;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }
    chatInput.value = "";
  });
}

/** Build 8 hotbar slot shells (abilities 1–4, ultimate 5, consumables 6–8). */
function ensureHotbarSlots() {
  const bar = rootEl?.querySelector("#ch-hud-hotbar");
  if (!bar || bar.childElementCount >= 8) return;
  bar.innerHTML = "";
  for (let i = 1; i <= 8; i++) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "ch-hotbar-slot";
    slot.dataset.slot = String(i);
    slot.innerHTML = `<span class="ch-hotbar-num">${i}</span><span class="ch-hotbar-glyph">—</span>`;
    slot.addEventListener("click", () => onHotbarClick(i));
    bar.appendChild(slot);
  }
}

function onHotbarClick(slotNum) {
  const arena = window.__grudgeArena;
  if (!arena) return;
  const keyMap = { 1: "Q", 2: "E", 3: "R", 4: "F", 5: "P" };
  if (keyMap[slotNum]) {
    arena.useAbility?.(keyMap[slotNum]);
    return;
  }
  if (slotNum >= 6 && slotNum <= 8) {
    arena.inventoryUI?.useConsumableSlot?.(slotNum - 5);
  }
}

export function mountCharacterHomeHud() {
  if (!isCombatSandboxUi() || mounted) return;
  mounted = true;
  document.body.classList.add("character-home-hud-active", "era-warlords");

  rootEl = document.createElement("div");
  rootEl.id = "character-home-hud";
  rootEl.className = "ch-hud-root";
  rootEl.innerHTML = buildShell();
  document.body.appendChild(rootEl);

  ensureHotbarSlots();
  wirePanelButtons();

  const legacy = [
    "sandbox-status",
    "abilityBar",
    "hud-bars",
    "panel-toggles",
    "fkey-hints",
  ];
  for (const sel of legacy) {
    const el = document.querySelector(sel.startsWith(".") ? sel : `#${sel}`);
    if (el) el.style.display = "none";
  }
}

export function unmountCharacterHomeHud() {
  if (!mounted) return;
  mounted = false;
  rootEl?.remove();
  rootEl = null;
  document.body.classList.remove("character-home-hud-active", "era-warlords");
}

/**
 * Sync portrait, bars, gear, and hotbar from live arena state.
 * @param {object} arena GrudgeArena instance
 */
export function updateCharacterHomeHud(arena) {
  if (!mounted || !rootEl || !arena?.playerEntity) return;

  const hp = arena.playerEntity.getComponent("Health");
  const res = arena.playerEntity.getComponent("Resources");
  const info = arena.playerEntity.getComponent("TargetInfo");
  const profile = arena.playerEntity.getComponent("BuildProfile");
  const weapon = arena.getCurrentWeapon?.();
  if (!hp || !res) return;

  const pct = (cur, max) => Math.round((cur / Math.max(max, 1)) * 100);
  const primary = weapon?.primaryResource || "mana";
  const pool = res[primary] || res.mana;

  const setW = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.style.width = `${v}%`;
  };
  setW("ch-hud-hp", pct(hp.current, hp.max));
  setW("ch-hud-res", pct(pool.current, pool.max));

  const resWrap = document.getElementById("ch-hud-res-wrap");
  if (resWrap) resWrap.dataset.resource = primary;

  const nameEl = document.getElementById("ch-hud-name");
  const classEl = document.getElementById("ch-hud-class");
  const portrait = document.getElementById("ch-hud-portrait");
  if (nameEl) nameEl.textContent = info?.displayName || "Warlord";
  if (classEl) {
    const cls =
      (profile?.classId || "warrior").charAt(0).toUpperCase() +
      (profile?.classId || "warrior").slice(1);
    const race = info?.race
      ? String(info.race).charAt(0).toUpperCase() + String(info.race).slice(1)
      : "Human";
    classEl.textContent = `Lv.${profile?.level ?? 42} ${cls} · ${race}`;
  }
  if (portrait) {
    portrait.textContent =
      RACE_GLYPH[String(info?.race || "").toLowerCase()] || "⚔";
  }

  const gearEl = document.getElementById("ch-hud-gear");
  if (gearEl && weapon) {
    const eq = arena.playerEntity.getComponent("Equipment");
    const mainId = eq?.slots?.mainHand;
    const chestId = eq?.slots?.chest;
    const lines = [
      `⚔ ${weapon.name}`,
      chestId ? "🥋 Equipped chest" : "🛡 No chest equipped",
    ];
    if (mainId) lines[0] = `⚔ ${weapon.title || ""} ${weapon.name}`.trim();
    gearEl.innerHTML = lines.map((t) => `<div>${t}</div>`).join("");
  }

  updateCharacterHomeHotbar(arena, weapon);
}

/**
 * Paint hotbar slots 1–5 with weapon abilities (Q/E/R/F/P).
 */
export function updateCharacterHomeHotbar(arena, weapon) {
  if (!mounted || !rootEl) return;
  ensureHotbarSlots();
  const bar = rootEl.querySelector("#ch-hud-hotbar");
  if (!bar || !weapon?.abilities) return;

  const slotMap = [
    ["Q", 1],
    ["E", 2],
    ["R", 3],
    ["F", 4],
    ["P", 5],
  ];

  for (const [key, num] of slotMap) {
    const ability = weapon.abilities[key];
    const slot = bar.querySelector(`[data-slot="${num}"]`);
    if (!slot || !ability) continue;
    const icon = iconForAbility(ability);
    slot.dataset.key = key;
    slot.title = `[${key}] ${ability.name}`;
    slot.innerHTML = `
      <span class="ch-hotbar-num">${num}</span>
      <img class="ch-hotbar-icon" src="${icon}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <span class="ch-hotbar-glyph ch-hotbar-fallback" style="display:none">✦</span>`;
    slot.classList.toggle("ch-hotbar-ult", key === "P");
  }

  for (let n = 6; n <= 8; n++) {
    const slot = bar.querySelector(`[data-slot="${n}"]`);
    if (!slot) continue;
    slot.dataset.key = String(n);
    slot.title = `Consumable slot ${n}`;
    slot.innerHTML = `<span class="ch-hotbar-num">${n}</span><span class="ch-hotbar-glyph">🧪</span>`;
    slot.classList.remove("ch-hotbar-ult");
  }

  const as = arena?.playerEntity?.getComponent("AbilityState");
  if (as) {
    bar.querySelectorAll(".ch-hotbar-slot").forEach((slot) => {
      const key = slot.dataset.key;
      const cd = as.cooldowns?.[key] || 0;
      slot.classList.toggle("on-cd", cd > 0.05);
    });
  }
}

export function syncCharacterHomePanelActive(panelId) {
  if (!rootEl) return;
  rootEl.querySelectorAll(".ch-circle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.panel === panelId);
  });
}