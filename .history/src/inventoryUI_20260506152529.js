/**
 * InventoryUI — DOM bridge between the player's ECS components and the
 * floating panels (#panel-inv, #panel-char, #panel-skills) defined in index.html.
 *
 * Re-renders only when a component's `.version` field changes, so this
 * class is cheap to call every frame from the game loop.
 *
 * Reads:
 *   playerEntity.Inventory  → 8x5 grid of itemIds
 *   playerEntity.Equipment  → 17 named slots (head, chest, mainHand, …)
 *   playerEntity.SkillBar   → 9 hotbar slots
 * Mutations all go through the InventorySystem so they hit memory + localStorage
 * + backend in one call.
 */

import { itemRegistry } from "./itemRegistry.js";
import { EQUIPMENT_SLOTS } from "./engine/ECS.js";

const SLOT_GLYPHS = {
  head: "🪖", neck: "📿", shoulders: "👔", back: "🧣", chest: "🥋",
  wrists: "⚖", hands: "🧤", waist: "🎗", legs: "👖", feet: "🥾",
  ring1: "💍", ring2: "💍", trinket1: "🔮", trinket2: "🔮",
  mainHand: "⚔", offHand: "🛡", ranged: "🏹",
};
const LEFT_COL  = ["head", "neck", "shoulders", "chest", "wrists", "hands", "waist", "mainHand"];
const RIGHT_COL = ["back", "legs", "feet", "ring1", "ring2", "trinket1", "trinket2", "offHand"];
const RARITY_GLYPH = { weapon: "⚔", armor: "🛡", consumable: "🧪", offhand: "🛡", relic: "🔮", ring: "💍", material: "⛏" };

export class InventoryUI {
  constructor(playerEntity, inventorySystem) {
    this.entity = playerEntity;
    this.system = inventorySystem;
    this._cache = { inv: -1, eq: -1, sk: -1 };
    this._activePanel = null;
    this._tooltipEl = document.getElementById("item-tooltip");
    this._ctxEl = document.getElementById("ctx-menu");

    this._bindPanelToggles();
    this._bindCloseButtons();
    this._bindGlobalHandlers();
    this._buildEquipmentDoll();
  }

  /** Toggle a panel by id; closes any other open panel. */
  toggle(panelId) {
    if (this._activePanel === panelId) { this.close(); return; }
    if (this._activePanel) document.getElementById(this._activePanel)?.classList.remove("active");
    document.getElementById(panelId)?.classList.add("active");
    this._activePanel = panelId;
    this._syncToggleButtons();
    this._renderActive();
  }

  close() {
    if (!this._activePanel) return;
    document.getElementById(this._activePanel)?.classList.remove("active");
    this._activePanel = null;
    this._syncToggleButtons();
    this._hideCtx();
  }

  /** Called every frame from the game loop. Cheap when nothing changed. */
  update() {
    const inv = this.entity.getComponent("Inventory");
    const eq  = this.entity.getComponent("Equipment");
    const sk  = this.entity.getComponent("SkillBar");
    if (!inv || !eq || !sk) return;
    if (inv.version !== this._cache.inv) { this._cache.inv = inv.version; this._renderInventory(inv); }
    if (eq.version  !== this._cache.eq)  { this._cache.eq  = eq.version;  this._renderEquipment(eq); }
    if (sk.version  !== this._cache.sk)  { this._cache.sk  = sk.version;  this._renderSkills(sk); }
  }

  _renderActive() {
    if (!this._activePanel) return;
    const inv = this.entity.getComponent("Inventory");
    const eq  = this.entity.getComponent("Equipment");
    const sk  = this.entity.getComponent("SkillBar");
    if (this._activePanel === "panel-inv"    && inv) this._renderInventory(inv);
    if (this._activePanel === "panel-char"   && eq)  this._renderEquipment(eq);
    if (this._activePanel === "panel-skills" && sk)  this._renderSkills(sk);
  }

  // ── Renderers ──────────────────────────────────────────────────────

  _renderInventory(inv) {
    const grid = document.getElementById("inv-grid");
    const count = document.getElementById("inv-count");
    if (!grid) return;
    const used = inv.slots.filter(Boolean).length;
    if (count) count.textContent = `${used}/${inv.capacity}`;
    grid.innerHTML = "";
    for (let i = 0; i < inv.capacity; i++) {
      const itemId = inv.slots[i];
      const cell = document.createElement("div");
      cell.className = "inv-cell" + (itemId ? " filled" : "");
      cell.dataset.idx = String(i);
      if (itemId) {
        cell.dataset.itemId = itemId;
        const view = itemRegistry.getInstance(itemId);
        const cat = view?.catalogId || "";
        cell.textContent = RARITY_GLYPH[cat?.split("-")[0]] || "❖";
        const qty = view?.qty || 1;
        if (qty > 1) {
          const qel = document.createElement("span");
          qel.className = "inv-qty"; qel.textContent = String(qty);
          cell.appendChild(qel);
        }
        this._wireItemCell(cell, itemId, "inventory");
      }
      grid.appendChild(cell);
    }
  }

  _buildEquipmentDoll() {
    const doll = document.getElementById("equip-doll");
    if (!doll || doll.children.length) return;
    const portrait = document.createElement("div");
    portrait.className = "equip-portrait"; portrait.textContent = "⚔";
    const cells = {};
    for (let i = 0; i < 8; i++) {
      const lk = LEFT_COL[i], rk = RIGHT_COL[i];
      const lc = this._mkEquipSlot(lk); lc.style.gridColumn = "1"; lc.style.gridRow = String(i + 1);
      const rc = this._mkEquipSlot(rk); rc.style.gridColumn = "3"; rc.style.gridRow = String(i + 1);
      cells[lk] = lc; cells[rk] = rc;
      doll.appendChild(lc); doll.appendChild(rc);
    }
    doll.appendChild(portrait);
    this._eqCells = cells;
  }

  _mkEquipSlot(slot) {
    const el = document.createElement("div");
    el.className = "equip-slot"; el.dataset.slot = slot;
    el.dataset.slotLabel = slot.replace(/([A-Z])/g, " $1").slice(0, 8);
    el.textContent = SLOT_GLYPHS[slot] || "—";
    return el;
  }
}
