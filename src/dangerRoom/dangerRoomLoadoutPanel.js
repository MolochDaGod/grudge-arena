/**
 * Danger Room gear panel — all 6 Grudge6 races, weapon type + D1 slot variants.
 * Matches dangerroom.puter.site loadout editing; persists via d1LoadoutStore.
 */

import {
  subscribeD1Loadout,
  getD1LoadoutState,
  setD1Race,
  setD1Weapon,
  setD1ArmorSlot,
  setD1WeaponSlot,
  ARENA_WEAPONS,
  D1_SLOT_GROUPS,
} from "../d1LoadoutStore.js";

const RACE_LABELS = {
  human: "Human",
  barbarian: "Barbarian",
  elf: "Elf",
  dwarf: "Dwarf",
  orc: "Orc",
  undead: "Undead",
};

let panelEl = null;
let unsub = null;
let onApply = null;
let getEquipment = null;
let catalog = null;

function refreshCatalog() {
  const eq = getEquipment?.();
  if (eq?.getCatalog) {
    catalog = eq.getCatalog();
    return catalog;
  }
  return catalog || {};
}

function slotSelect(id, label, options, value, onChange) {
  const opts = ['<option value="">—</option>']
    .concat(
      (options || []).map(
        (v) => `<option value="${v}"${value === v ? " selected" : ""}>${v}</option>`,
      ),
    )
    .join("");
  return `
    <label class="dr-gear-row" for="${id}">
      <span>${label}</span>
      <select id="${id}" class="dr-gear-select">${opts}</select>
    </label>`;
}

function buildPanel(state) {
  const cat = refreshCatalog();
  const armor = state.d1?.armor || {};
  const weapon = state.d1?.weapon || {};

  const armorRows = D1_SLOT_GROUPS.armor
    .map((slot) =>
      slotSelect(
        `dr-armor-${slot}`,
        slot,
        cat[slot],
        armor[slot] || "",
        null,
      ),
    )
    .join("");

  const weaponSlotRows = [
    slotSelect("dr-wpn-r-slot", "R hand", D1_SLOT_GROUPS.weapons, weapon.rSlot || "", null),
    slotSelect("dr-wpn-r-var", "R variant", cat[weapon.rSlot] || [], weapon.rVariant || "", null),
    slotSelect("dr-wpn-l-slot", "L hand", [...D1_SLOT_GROUPS.weapons, "shield"], weapon.lSlot || "", null),
    slotSelect("dr-wpn-l-var", "L variant", cat[weapon.lSlot] || [], weapon.lVariant || "", null),
  ].join("");

  const raceBtns = D1_SLOT_GROUPS.races
    .map(
      (r) =>
        `<button type="button" class="dr-gear-race${state.race === r ? " active" : ""}" data-race="${r}">${RACE_LABELS[r] || r}</button>`,
    )
    .join("");

  const weaponOpts = ARENA_WEAPONS.map(
    (w) =>
      `<option value="${w}"${state.weapon === w ? " selected" : ""}>${w}</option>`,
  ).join("");

  return `
    <div class="dr-gear-panel" id="dr-gear-panel">
      <button type="button" class="dr-gear-toggle" id="dr-gear-toggle" title="Gear editor (G)">Gear</button>
      <div class="dr-gear-drawer" id="dr-gear-drawer" hidden>
        <header class="dr-gear-header">
          <strong>Grudge6 Loadout</strong>
          <span class="dr-gear-hint">Saved automatically</span>
        </header>
        <section class="dr-gear-section">
          <div class="dr-gear-label">Race</div>
          <div class="dr-gear-races">${raceBtns}</div>
        </section>
        <section class="dr-gear-section">
          <label class="dr-gear-row" for="dr-weapon-type">
            <span>Weapon class</span>
            <select id="dr-weapon-type" class="dr-gear-select">${weaponOpts}</select>
          </label>
        </section>
        <section class="dr-gear-section">
          <div class="dr-gear-label">Armor (D1)</div>
          ${armorRows}
        </section>
        <section class="dr-gear-section">
          <div class="dr-gear-label">Weapon meshes</div>
          ${weaponSlotRows}
        </section>
        <footer class="dr-gear-footer">
          <button type="button" class="dr-gear-apply" id="dr-gear-apply">Apply to champion</button>
        </footer>
      </div>
    </div>`;
}

function bindHandlers() {
  if (!panelEl) return;

  panelEl.querySelector("#dr-gear-toggle")?.addEventListener("click", () => {
    const drawer = panelEl.querySelector("#dr-gear-drawer");
    if (drawer) {
      const opening = drawer.hidden;
      drawer.hidden = !opening;
      if (opening) {
        refreshCatalog();
        render(getD1LoadoutState());
      }
    }
  });

  panelEl.querySelectorAll(".dr-gear-race").forEach((btn) => {
    btn.addEventListener("click", () => {
      const race = btn.getAttribute("data-race");
      if (race) {
        setD1Race(race);
        onApply?.({ reason: "race" });
      }
    });
  });

  panelEl.querySelector("#dr-weapon-type")?.addEventListener("change", (e) => {
    setD1Weapon(e.target.value);
    onApply?.({ reason: "weapon" });
  });

  for (const slot of D1_SLOT_GROUPS.armor) {
    panelEl.querySelector(`#dr-armor-${slot}`)?.addEventListener("change", (e) => {
      setD1ArmorSlot(slot, e.target.value || null);
      onApply?.({ reason: "armor", live: true });
    });
  }

  const rSlot = panelEl.querySelector("#dr-wpn-r-slot");
  const rVar = panelEl.querySelector("#dr-wpn-r-var");
  const lSlot = panelEl.querySelector("#dr-wpn-l-slot");
  const lVar = panelEl.querySelector("#dr-wpn-l-var");

  const syncWeapon = () => {
    setD1WeaponSlot("r", rSlot?.value || null, rVar?.value || null);
    setD1WeaponSlot("l", lSlot?.value || null, lVar?.value || null);
    onApply?.({ reason: "weaponMesh", live: true });
  };

  rSlot?.addEventListener("change", () => {
    if (rVar && catalog) {
      const opts = catalog[rSlot.value] || [];
      rVar.innerHTML = ['<option value="">—</option>']
        .concat(opts.map((v) => `<option value="${v}">${v}</option>`))
        .join("");
    }
    syncWeapon();
  });
  rVar?.addEventListener("change", syncWeapon);
  lSlot?.addEventListener("change", () => {
    if (lVar && catalog) {
      const opts = catalog[lSlot.value] || [];
      lVar.innerHTML = ['<option value="">—</option>']
        .concat(opts.map((v) => `<option value="${v}">${v}</option>`))
        .join("");
    }
    syncWeapon();
  });
  lVar?.addEventListener("change", syncWeapon);

  panelEl.querySelector("#dr-gear-apply")?.addEventListener("click", () => {
    onApply?.({ reason: "apply" });
  });

  window.addEventListener("keydown", onGearKey);
}

function onGearKey(e) {
  if (e.code !== "KeyG" || e.repeat) return;
  if (!panelEl) return;
  const drawer = panelEl.querySelector("#dr-gear-drawer");
  if (drawer) {
    const opening = drawer.hidden;
    drawer.hidden = !opening;
    if (opening) {
      refreshCatalog();
      render(getD1LoadoutState());
    }
  }
}

function render(state) {
  if (!panelEl) return;
  const open = !panelEl.querySelector("#dr-gear-drawer")?.hidden;
  panelEl.innerHTML = buildPanel(state);
  const drawer = panelEl.querySelector("#dr-gear-drawer");
  if (drawer) drawer.hidden = !open;
  bindHandlers();
}

/**
 * @param {{ onApply?: (opts: { reason: string, live?: boolean }) => void, getEquipment?: () => object|null }} opts
 */
export function mountDangerRoomLoadoutPanel(opts = {}) {
  onApply = opts.onApply || null;
  getEquipment = opts.getEquipment || null;
  if (panelEl) return;

  panelEl = document.createElement("div");
  panelEl.id = "dr-gear-root";
  panelEl.className = "dr-gear-root";
  document.body.appendChild(panelEl);

  render(getD1LoadoutState());
  unsub = subscribeD1Loadout((s) => render(s));
}

export function unmountDangerRoomLoadoutPanel() {
  window.removeEventListener("keydown", onGearKey);
  unsub?.();
  unsub = null;
  onApply = null;
  panelEl?.remove();
  panelEl = null;
  catalog = null;
}

/** Refresh variant dropdowns from live EquipmentManager catalog. */
export function syncGearCatalog(equipmentManager) {
  if (!equipmentManager?.getCatalog) return;
  catalog = equipmentManager.getCatalog();
  const slots = Object.keys(catalog).length;
  console.log(`[dangerRoom] D1 gear catalog: ${slots} slots`, catalog);
  if (panelEl) render(getD1LoadoutState());
}

export function applyLiveD1ToEquipment(equipment, weaponType, d1Loadout) {
  if (!equipment?.applyD1Loadout) return null;
  return equipment.applyD1Loadout(weaponType, d1Loadout);
}