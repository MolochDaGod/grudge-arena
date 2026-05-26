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

const SLOT_GLYPHS = {
  head: "🪖",
  neck: "📿",
  shoulders: "👔",
  back: "🧣",
  chest: "🥋",
  wrists: "⚖",
  hands: "🧤",
  waist: "🎗",
  legs: "👖",
  feet: "🥾",
  ring1: "💍",
  ring2: "💍",
  trinket1: "🔮",
  trinket2: "🔮",
  mainHand: "⚔",
  offHand: "🛡",
  ranged: "🏹",
};
const LEFT_COL = [
  "head",
  "neck",
  "shoulders",
  "chest",
  "wrists",
  "hands",
  "waist",
  "mainHand",
];
const RIGHT_COL = [
  "back",
  "legs",
  "feet",
  "ring1",
  "ring2",
  "trinket1",
  "trinket2",
  "offHand",
];
const RARITY_GLYPH = {
  weapon: "⚔",
  armor: "🛡",
  consumable: "🧪",
  offhand: "🛡",
  relic: "🔮",
  ring: "💍",
  material: "⛏",
};

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
    if (this._activePanel === panelId) {
      this.close();
      return;
    }
    if (this._activePanel)
      document.getElementById(this._activePanel)?.classList.remove("active");
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
    const eq = this.entity.getComponent("Equipment");
    const sk = this.entity.getComponent("SkillBar");
    if (!inv || !eq || !sk) return;
    if (inv.version !== this._cache.inv) {
      this._cache.inv = inv.version;
      this._renderInventory(inv);
    }
    if (eq.version !== this._cache.eq) {
      this._cache.eq = eq.version;
      this._renderEquipment(eq);
    }
    if (sk.version !== this._cache.sk) {
      this._cache.sk = sk.version;
      this._renderSkills(sk);
    }
  }

  _renderActive() {
    if (!this._activePanel) return;
    const inv = this.entity.getComponent("Inventory");
    const eq = this.entity.getComponent("Equipment");
    const sk = this.entity.getComponent("SkillBar");
    if (this._activePanel === "panel-inv" && inv) this._renderInventory(inv);
    if (this._activePanel === "panel-char" && eq) this._renderEquipment(eq);
    if (this._activePanel === "panel-skills" && sk) this._renderSkills(sk);
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
        const resolved = itemRegistry.resolveSync(itemId);
        this._paintCell(cell, resolved, null);
        this._wireItemCell(cell, itemId, "inventory");
      }
      grid.appendChild(cell);
    }
  }

  /** Paint an inventory or equipment cell with icon, tier color, and qty.
   *  `resolved` is the { instance, catalog, view } record from itemRegistry.
   *  `slotKey` (equipment only) is used to fall back to a slot glyph.
   */
  _paintCell(cell, resolved, slotKey) {
    const view = resolved?.view || null;
    const inst = resolved?.instance || null;
    const tierColor = view?.tierColor || "";
    cell.innerHTML = "";
    if (tierColor) {
      cell.style.borderColor = tierColor;
      cell.style.boxShadow = `inset 0 0 0 1px ${tierColor}55, 0 0 8px ${tierColor}33`;
    } else {
      cell.style.borderColor = "";
      cell.style.boxShadow = "";
    }
    const glyphFallback =
      view?.emoji ||
      RARITY_GLYPH[view?.type] ||
      RARITY_GLYPH[view?.category] ||
      (slotKey ? SLOT_GLYPHS[slotKey] : null) ||
      "❖";
    if (view?.iconUrl) {
      const img = document.createElement("img");
      img.className = "inv-icon";
      img.src = view.iconUrl;
      img.alt = view.name || "";
      img.draggable = false;
      img.onerror = () => {
        img.remove();
        const span = document.createElement("span");
        span.className = "inv-glyph";
        span.textContent = glyphFallback;
        cell.appendChild(span);
      };
      cell.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "inv-glyph";
      span.textContent = glyphFallback;
      cell.appendChild(span);
    }
    const qty = inst?.qty ?? view?.qty ?? 1;
    if (qty > 1) {
      const qel = document.createElement("span");
      qel.className = "inv-qty";
      qel.textContent = String(qty);
      cell.appendChild(qel);
    }
  }

  _buildEquipmentDoll() {
    const doll = document.getElementById("equip-doll");
    if (!doll || doll.children.length) return;
    const portrait = document.createElement("div");
    portrait.className = "equip-portrait";
    portrait.textContent = "⚔";
    const cells = {};
    for (let i = 0; i < 8; i++) {
      const lk = LEFT_COL[i],
        rk = RIGHT_COL[i];
      const lc = this._mkEquipSlot(lk);
      lc.style.gridColumn = "1";
      lc.style.gridRow = String(i + 1);
      const rc = this._mkEquipSlot(rk);
      rc.style.gridColumn = "3";
      rc.style.gridRow = String(i + 1);
      cells[lk] = lc;
      cells[rk] = rc;
      doll.appendChild(lc);
      doll.appendChild(rc);
    }
    doll.appendChild(portrait);
    this._eqCells = cells;
  }

  _mkEquipSlot(slot) {
    const el = document.createElement("div");
    el.className = "equip-slot";
    el.dataset.slot = slot;
    el.dataset.slotLabel = slot.replace(/([A-Z])/g, " $1").slice(0, 8);
    el.textContent = SLOT_GLYPHS[slot] || "—";
    return el;
  }

  _renderEquipment(eq) {
    if (!this._eqCells) this._buildEquipmentDoll();
    for (const [slot, cell] of Object.entries(this._eqCells || {})) {
      const itemId = eq.slots[slot];
      cell.classList.toggle("filled", !!itemId);
      if (itemId) {
        cell.dataset.itemId = itemId;
        const resolved = itemRegistry.resolveSync(itemId);
        this._paintCell(cell, resolved, slot);
        this._wireItemCell(cell, itemId, "equipment", slot);
      } else {
        delete cell.dataset.itemId;
        cell.style.borderColor = "";
        cell.style.boxShadow = "";
        cell.innerHTML = "";
        const span = document.createElement("span");
        span.className = "inv-glyph";
        span.textContent = SLOT_GLYPHS[slot] || "—";
        cell.appendChild(span);
        cell.onclick = null;
        cell.oncontextmenu = null;
        cell.onmouseenter = null;
        cell.onmouseleave = null;
      }
    }
    this._renderEquipStats(eq);
  }

  _renderEquipStats(eq) {
    const host = document.getElementById("equip-stats");
    if (!host) return;
    const totals = {};
    for (const itemId of Object.values(eq.slots)) {
      if (!itemId) continue;
      const resolved = itemRegistry.resolveSync(itemId);
      const stats = resolved?.stats || {};
      for (const [k, v] of Object.entries(stats)) {
        if (typeof v === "number") totals[k] = (totals[k] || 0) + v;
      }
    }
    const keys = Object.keys(totals).sort();
    if (!keys.length) {
      host.innerHTML =
        '<div class="stat-row"><span class="stat-key">No equipment</span></div>';
      return;
    }
    host.innerHTML = keys
      .map(
        (k) =>
          `<div class="stat-row"><span class="stat-key">${k}</span><span class="stat-val">+${totals[k]}</span></div>`,
      )
      .join("");
  }

  _renderSkills(sk) {
    const grid = document.getElementById("skill-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < sk.size; i++) {
      const skillId = sk.slots[i];
      const cell = document.createElement("div");
      cell.className = "skill-cell" + (skillId ? " active" : "");
      cell.dataset.idx = String(i);
      cell.innerHTML =
        `<span class="sk-key">${i + 1}</span>` +
        (skillId
          ? `<span class="sk-glyph">✦</span><span class="sk-name">${skillId}</span>`
          : `<span class="sk-name">empty</span>`);
      grid.appendChild(cell);
    }
  }

  // ── Wiring ─────────────────────────────────────────────────────────

  _bindPanelToggles() {
    document.querySelectorAll(".panel-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.toggle(btn.dataset.panel));
    });
  }

  _bindCloseButtons() {
    document.querySelectorAll(".fp-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.close;
        document.getElementById(id)?.classList.remove("active");
        if (this._activePanel === id) this._activePanel = null;
        this._syncToggleButtons();
      });
    });
  }

  _syncToggleButtons() {
    document.querySelectorAll(".panel-toggle-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.panel === this._activePanel);
    });
  }

  _bindGlobalHandlers() {
    // Hide ctx menu on any outside click
    document.addEventListener("click", (e) => {
      if (this._ctxEl && !this._ctxEl.contains(e.target)) this._hideCtx();
    });
    // Suppress browser context menu while a panel is open
    document.addEventListener("contextmenu", (e) => {
      if (this._activePanel && e.target.closest?.(".float-panel"))
        e.preventDefault();
    });
  }

  _wireItemCell(cell, itemId, source, slot = null) {
    cell.onmouseenter = (e) => this._showTooltip(itemId, e.clientX, e.clientY);
    cell.onmousemove = (e) => this._moveTooltip(e.clientX, e.clientY);
    cell.onmouseleave = () => this._hideTooltip();
    cell.onclick = (e) => {
      e.stopPropagation();
      if (source === "inventory") this.system.equip(itemId).catch(() => {});
      else if (source === "equipment" && slot) this.system.unequip(slot);
    };
    cell.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._hideTooltip();
      this._showCtx(itemId, source, slot, e.clientX, e.clientY);
    };
  }

  // ── Tooltip ────────────────────────────────────────────────────────

  async _showTooltip(itemId, x, y) {
    if (!this._tooltipEl) return;
    // Paint the synchronous view immediately so hover feels instant, then
    // upgrade to the awaited resolve once the master catalog is available.
    const sync = itemRegistry.resolveSync(itemId);
    if (sync?.view) this._paintTooltip(sync);
    const resolved = await itemRegistry.resolve(itemId);
    if (!resolved) return;
    this._paintTooltip(resolved);
    this._tooltipEl.classList.add("show");
    this._moveTooltip(x, y);
  }

  _paintTooltip(resolved) {
    if (!this._tooltipEl) return;
    const v = resolved.view || {};
    const inst = resolved.instance || {};
    const tierColor = v.tierColor || "#888";
    const escape = (s) =>
      String(s ?? "").replace(
        /[<>&]/g,
        (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c,
      );

    const subtype = [v.tierLabel, v.subCategory || v.slotType, v.material]
      .filter(Boolean)
      .join(" · ");
    const lines = [];
    lines.push(
      `<div class="tt-name" style="color:${tierColor}">${escape(v.name)}</div>`,
    );
    if (subtype || inst.bound) {
      lines.push(
        `<div class="tt-type">${escape(subtype || v.type || "item")}` +
          (inst.bound ? ' · <span class="tt-bound">bound</span>' : "") +
          `</div>`,
      );
    }
    if (v.setName) {
      lines.push(`<div class="tt-set">⚜ ${escape(v.setName)}</div>`);
    }

    // Stats — merged catalog + instance rolls.
    const stats = resolved.stats || {};
    const numericStats = Object.entries(stats).filter(
      ([, val]) => typeof val === "number" && val !== 0,
    );
    if (numericStats.length) {
      lines.push(
        '<div class="tt-stats">' +
          numericStats
            .map(
              ([k, val]) => `<span class="tt-stat">+${val} ${escape(k)}</span>`,
            )
            .join("") +
          "</div>",
      );
    }

    if (v.signature) {
      lines.push(`<div class="tt-signature">★ ${escape(v.signature)}</div>`);
    }
    const passives =
      v.passives && v.passives.length
        ? v.passives
        : v.passive
          ? [v.passive]
          : [];
    for (const p of passives) {
      lines.push(`<div class="tt-passive">◆ ${escape(p)}</div>`);
    }
    if (v.proc) {
      lines.push(`<div class="tt-proc">⚡ ${escape(v.proc)}</div>`);
    }
    if (v.setBonus) {
      lines.push(`<div class="tt-setbonus">⚜ Set: ${escape(v.setBonus)}</div>`);
    }
    if (v.abilities && v.abilities.length) {
      lines.push(
        '<div class="tt-abilities">' +
          v.abilities
            .map(
              (a) =>
                `<span class="tt-ability">${escape(typeof a === "string" ? a : a?.name)}</span>`,
            )
            .join("") +
          "</div>",
      );
    }
    if (v.description) {
      lines.push(`<div class="tt-desc">${escape(v.description)}</div>`);
    }

    this._tooltipEl.innerHTML = lines.join("");
    this._tooltipEl.style.borderColor = tierColor;
    this._tooltipEl.style.boxShadow = `0 0 18px ${tierColor}55`;
  }

  _moveTooltip(x, y) {
    if (!this._tooltipEl) return;
    this._tooltipEl.style.left =
      Math.min(x + 14, window.innerWidth - 280) + "px";
    this._tooltipEl.style.top =
      Math.min(y + 14, window.innerHeight - 200) + "px";
  }

  _hideTooltip() {
    this._tooltipEl?.classList.remove("show");
  }

  // ── Context menu ───────────────────────────────────────────────────

  _showCtx(itemId, source, slot, x, y) {
    if (!this._ctxEl) return;
    const items = [];
    if (source === "inventory") {
      items.push({ label: "Equip", fn: () => this.system.equip(itemId) });
    } else if (source === "equipment" && slot) {
      items.push({ label: "Unequip", fn: () => this.system.unequip(slot) });
    }
    items.push({
      label: "Inspect",
      fn: () => console.log("[Inventory]", itemRegistry.getInstance(itemId)),
    });
    items.push({ sep: true });
    items.push({
      label: "Discard",
      danger: true,
      fn: () => this.system.destroy(itemId),
    });

    this._ctxEl.innerHTML = items
      .map((i) =>
        i.sep
          ? `<div class="ctx-sep"></div>`
          : `<div class="ctx-item${i.danger ? " danger" : ""}" data-act="${i.label}">${i.label}</div>`,
      )
      .join("");
    Array.from(this._ctxEl.querySelectorAll(".ctx-item")).forEach((el, idx) => {
      const handler = items.filter((i) => !i.sep)[idx];
      el.onclick = (e) => {
        e.stopPropagation();
        handler?.fn?.();
        this._hideCtx();
      };
    });
    this._ctxEl.style.left = Math.min(x, window.innerWidth - 160) + "px";
    this._ctxEl.style.top = Math.min(y, window.innerHeight - 180) + "px";
    this._ctxEl.classList.add("show");
  }

  _hideCtx() {
    this._ctxEl?.classList.remove("show");
  }
}
