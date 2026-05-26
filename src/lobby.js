
// ── Grudge Auth ───────────────────────────────────────────────
// Auth contract: Puter SDK for identity, Phantom for wallet, Guest fallback
// Token key: grudge_auth_token (shared across all Grudge apps for SSO)
// API calls via /api/* → Vercel rewrites to id.grudge-studio.com & api.grudge-studio.com
const API_BASE = '/api';
const WS_URL = 'https://ws.grudge-studio.com';
let selectedRace = 'human';
  let selectedClass = 'warlord';
  let selectedWeapon = 'greatsword';
let grudgeUser = null;

  const ATTRIBUTE_TOTAL = 160;
  const ATTRIBUTE_KEYS = ['Strength', 'Intellect', 'Vitality', 'Dexterity', 'Endurance', 'Wisdom', 'Agility', 'Tactics'];
  const BUILD_STORAGE_KEY = 'grudge_arena_character_build_v1';

  const CLASS_WEAPON_DEFAULTS = {
    warlord: 'greatsword',
    arcanist: 'scythe',
    ranger: 'bow',
    assassin: 'sabres',
  };

      const RACE_WEAPON_ALLOWLIST = {
        human: ['greatsword', 'sabres', 'runeblade', 'bow', 'scythe'],
        barbarian: ['greatsword', 'scythe', 'sabres', 'bow'],
        elf: ['bow', 'sabres', 'runeblade', 'scythe'],
        dwarf: ['greatsword', 'runeblade', 'sabres', 'scythe'],
        orc: ['greatsword', 'scythe', 'sabres', 'bow'],
        undead: ['scythe', 'runeblade', 'bow', 'greatsword'],
      };

      const RACE_DETAILS = {
        human: {
          icon: '🛡️',
          title: 'Human · The Ironwall',
          meta: 'Faction: Crusade · Archetype: Warrior',
          lore: 'A veteran of a hundred crusades. His shield has never broken.',
        },
        barbarian: {
          icon: '⚔️',
          title: 'Barbarian · The Immortal',
          meta: 'Faction: Crusade · Archetype: Warrior',
          lore: 'Rage is his armor. Death is his offering.',
        },
        elf: {
          icon: '🏹',
          title: 'Elf · The Assassin',
          meta: 'Faction: Fabled · Archetype: Ranger',
          lore: 'Shadows are her home. Silence is her weapon.',
        },
        dwarf: {
          icon: '🔨',
          title: 'Dwarf · The Wall',
          meta: 'Faction: Fabled · Archetype: Warrior',
          lore: 'Built like stone. Hits like a mountain.',
        },
        orc: {
          icon: '🪓',
          title: 'Orc · The Crusher',
          meta: 'Faction: Legion · Archetype: Warrior',
          lore: 'His army follows. Everything else burns.',
        },
        undead: {
          icon: '💀',
          title: 'Undead · The Weaver of Souls',
          meta: 'Faction: Legion · Archetype: Mage',
          lore: 'Death is merely the beginning of service.',
        },
      };

      const VALID_RACES = Object.keys(RACE_DETAILS);
      const VALID_CLASSES = ['warlord', 'arcanist', 'ranger', 'assassin'];
      const DEFAULT_CLASS = 'warlord';

  const RING_TIERS = {
    iron: { power: 1, hp: 0, speed: 0 },
    bronze: { power: 1.04, hp: 30, speed: 0.1 },
    mythic: { power: 1.09, hp: 70, speed: 0.2 },
    ascendant: { power: 1.16, hp: 120, speed: 0.35 },
  };

  const RING_PERKS = [
    { id: 'valor', label: 'Valor Core', bonus: 'Damage +8%' },
    { id: 'aegis', label: 'Aegis Mesh', bonus: 'Shield +12%' },
    { id: 'celerity', label: 'Celerity Pulse', bonus: 'Move +6%' },
    { id: 'focus', label: 'Focus Sigil', bonus: 'CDR +10%' },
  ];

  let attributePoints = {
    Strength: 20,
    Intellect: 20,
    Vitality: 20,
    Dexterity: 20,
    Endurance: 20,
    Wisdom: 20,
    Agility: 20,
    Tactics: 20,
  };
  let selectedRingTier = 'mythic';
  let selectedRingPerks = ['valor', 'focus'];

// ── LocalStorage keys (cross-app SSO compatible with GrudgeBuilder) ──
const AUTH_TOKEN_KEY = 'grudge_auth_token';
const SESSION_TOKEN_KEY = 'grudge_session_token';
const DEVICE_ID_KEY = 'grudge_device_id';

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY);
}
function setToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}
function getUser() {
  try { return JSON.parse(localStorage.getItem('grudge_user') || 'null'); } catch { return null; }
}
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'ga_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function setAuthStatus(msg) {
  const el = document.getElementById('auth-status');
  if (el) el.textContent = msg;
}

  function getPointsSpent() {
    return Object.values(attributePoints).reduce((sum, value) => sum + value, 0);
  }

  function saveBuildToStorage() {
    try {
      localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify({
        race: selectedRace,
        classId: selectedClass,
        weapon: selectedWeapon,
        ringTier: selectedRingTier,
        ringPerks: selectedRingPerks,
        attributes: attributePoints,
      }));
    } catch { }
  }

  function loadBuildFromStorage() {
    try {
      const raw = localStorage.getItem(BUILD_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.race) selectedRace = parsed.race;
      if (parsed?.classId) selectedClass = parsed.classId;
      if (parsed?.weapon) selectedWeapon = parsed.weapon;
      if (parsed?.ringTier && RING_TIERS[parsed.ringTier]) selectedRingTier = parsed.ringTier;
      if (Array.isArray(parsed?.ringPerks)) selectedRingPerks = parsed.ringPerks.slice(0, 3);
      if (parsed?.attributes && typeof parsed.attributes === 'object') {
        for (const key of ATTRIBUTE_KEYS) {
          const val = Number(parsed.attributes[key]);
          if (!Number.isNaN(val) && val >= 0) attributePoints[key] = Math.floor(val);
        }
        normalizeAttributes();
      }
    } catch { }
  }

  function normalizeAttributes() {
    for (const key of ATTRIBUTE_KEYS) {
      attributePoints[key] = Math.max(0, Math.min(160, Number(attributePoints[key] || 0)));
    }
    let total = getPointsSpent();
    if (total === ATTRIBUTE_TOTAL) return;
    const order = [...ATTRIBUTE_KEYS];
    if (total > ATTRIBUTE_TOTAL) {
      let overflow = total - ATTRIBUTE_TOTAL;
      for (const key of order) {
        if (overflow <= 0) break;
        const cut = Math.min(overflow, attributePoints[key]);
        attributePoints[key] -= cut;
        overflow -= cut;
      }
    } else {
      let remain = ATTRIBUTE_TOTAL - total;
      for (const key of order) {
        if (remain <= 0) break;
        attributePoints[key] += 1;
        remain -= 1;
      }
    }
  }

  function setAttributeValue(attr, next) {
    const oldVal = attributePoints[attr] || 0;
    let newVal = Math.max(0, Math.min(160, Number(next) || 0));
    const diff = newVal - oldVal;
    if (diff > 0) {
      const remaining = ATTRIBUTE_TOTAL - getPointsSpent();
      if (diff > remaining) newVal = oldVal + remaining;
    }
    attributePoints[attr] = newVal;
    renderAttributeEditor();
    updateBuildSummary();
    saveBuildToStorage();
  }

  function renderAttributeEditor() {
    const root = document.getElementById('attribute-builder');
    const points = document.getElementById('builder-points');
    if (!root || !points) return;
    root.innerHTML = '';
    const spent = getPointsSpent();
    points.textContent = `${spent} / ${ATTRIBUTE_TOTAL}`;
    points.classList.toggle('complete', spent === ATTRIBUTE_TOTAL);

    for (const attr of ATTRIBUTE_KEYS) {
      const row = document.createElement('div');
      row.className = 'attribute-row';
      row.innerHTML = `
      <div class="attribute-row-head">
        <span>${attr}</span>
        <strong>${attributePoints[attr]}</strong>
      </div>
      <div class="attribute-row-controls">
        <input type="range" min="0" max="160" value="${attributePoints[attr]}" data-attr="${attr}">
        <input type="number" min="0" max="160" value="${attributePoints[attr]}" data-attr="${attr}">
      </div>
    `;
      root.appendChild(row);
    }

    root.querySelectorAll('input[type="range"]').forEach((slider) => {
      slider.addEventListener('input', (event) => setAttributeValue(event.target.dataset.attr, event.target.value));
    });
    root.querySelectorAll('input[type="number"]').forEach((field) => {
      field.addEventListener('change', (event) => setAttributeValue(event.target.dataset.attr, event.target.value));
    });
  }

  function renderRingPerks() {
    const root = document.getElementById('ring-perks');
    if (!root) return;
    root.innerHTML = '';
    for (const perk of RING_PERKS) {
      const active = selectedRingPerks.includes(perk.id);
      const btn = document.createElement('button');
      btn.className = `ring-perk ${active ? 'active' : ''}`;
      btn.type = 'button';
      btn.innerHTML = `<span>${perk.label}</span><small>${perk.bonus}</small>`;
      btn.addEventListener('click', () => {
        if (selectedRingPerks.includes(perk.id)) {
          selectedRingPerks = selectedRingPerks.filter((id) => id !== perk.id);
        } else {
          if (selectedRingPerks.length >= 3) selectedRingPerks.shift();
          selectedRingPerks.push(perk.id);
        }
        renderRingPerks();
        updateBuildSummary();
        saveBuildToStorage();
      });
      root.appendChild(btn);
    }
  }

  function classTargetVector(classId) {
    const map = {
      warlord: ['Strength', 'Vitality', 'Endurance'],
      arcanist: ['Intellect', 'Wisdom', 'Tactics'],
      ranger: ['Dexterity', 'Agility', 'Tactics'],
      assassin: ['Dexterity', 'Agility', 'Strength'],
    };
    return map[classId] || map.warlord;
  }

  function calculateBuildPower() {
    const ring = RING_TIERS[selectedRingTier] || RING_TIERS.iron;
    const attr = attributePoints;
    const offense = (attr.Strength * 2.1) + (attr.Dexterity * 2.0) + (attr.Intellect * 2.2) + (attr.Tactics * 1.8);
    const defense = (attr.Vitality * 2.6) + (attr.Endurance * 2.1) + (attr.Wisdom * 1.6);
    const utility = (attr.Agility * 1.4) + (attr.Tactics * 1.5) + (attr.Wisdom * 1.1);

    const perks = new Set(selectedRingPerks);
    const perkMult =
      (perks.has('valor') ? 1.08 : 1) *
      (perks.has('aegis') ? 1.05 : 1) *
      (perks.has('celerity') ? 1.04 : 1) *
      (perks.has('focus') ? 1.05 : 1);

    const base = (offense * 2.5) + (defense * 1.9) + (utility * 1.4) + (ring.hp * 2.2);
    return Math.floor(base * ring.power * perkMult);
  }

  function updateBuildSummary() {
    const power = calculateBuildPower();
    const meta = document.getElementById('builder-meta');
    const advice = document.getElementById('builder-advice');
    const powerEl = document.getElementById('builder-power');
    const ratingEl = document.getElementById('builder-rating');
    if (!meta || !advice || !powerEl || !ratingEl) return;

    const target = classTargetVector(selectedClass);
    const focusScore = target.reduce((sum, key) => sum + (attributePoints[key] || 0), 0);
    const spent = getPointsSpent();

    let rating = 'D';
    if (power > 4800) rating = 'S';
    else if (power > 4100) rating = 'A';
    else if (power > 3400) rating = 'B';
    else if (power > 2700) rating = 'C';

    if (spent < ATTRIBUTE_TOTAL) rating = '?';
    powerEl.textContent = power.toLocaleString();
    ratingEl.textContent = rating;
    meta.textContent = `${selectedRace[0].toUpperCase() + selectedRace.slice(1)} ${selectedClass[0].toUpperCase() + selectedClass.slice(1)} · ${selectedWeapon[0].toUpperCase() + selectedWeapon.slice(1)} · ${selectedRingTier[0].toUpperCase() + selectedRingTier.slice(1)} Ring`;

    if (spent < ATTRIBUTE_TOTAL) {
      advice.textContent = `Allocate all ${ATTRIBUTE_TOTAL} points to finalize your champion profile.`;
    } else if (focusScore < 70) {
      advice.textContent = 'Your stat spread is broad. Focus harder on class core stats for stronger arena pressure.';
    } else if (rating === 'S' || rating === 'A') {
      advice.textContent = 'Elite profile. Strong synergy between class path, weapon curve, and Titan ring perks.';
    } else {
      advice.textContent = 'Stable build. Push more points into your class triad for higher burst or survivability.';
    }

    updateReadinessState();
  }

  function sanitizeSelectionState() {
    if (!VALID_RACES.includes(selectedRace)) {
      selectedRace = 'human';
    }

    if (!VALID_CLASSES.includes(selectedClass)) {
      selectedClass = DEFAULT_CLASS;
    }

    if (!RING_TIERS[selectedRingTier]) {
      selectedRingTier = 'mythic';
    }

    // Keep up to 3 known perks.
    const knownPerks = new Set(RING_PERKS.map((p) => p.id));
    selectedRingPerks = (selectedRingPerks || []).filter((id) => knownPerks.has(id)).slice(0, 3);

    refreshWeaponAvailability();
    normalizeAttributes();
  }

  function normalizeBuildConfig(rawBuild) {
    const build = rawBuild && typeof rawBuild === 'object' ? rawBuild : {};
    const race = VALID_RACES.includes(build.race) ? build.race : selectedRace;
    const classId = VALID_CLASSES.includes(build.classId) ? build.classId : selectedClass;

    const allowed = RACE_WEAPON_ALLOWLIST[race] || ['greatsword'];
    const preferred = CLASS_WEAPON_DEFAULTS[classId] || 'greatsword';
    const weapon = allowed.includes(build.weapon)
      ? build.weapon
      : (allowed.includes(preferred) ? preferred : allowed[0]);

    const ringTier = RING_TIERS[build.ringTier] ? build.ringTier : selectedRingTier;
    const knownPerks = new Set(RING_PERKS.map((p) => p.id));
    const ringPerks = Array.isArray(build.ringPerks)
      ? build.ringPerks.filter((id) => knownPerks.has(id)).slice(0, 3)
      : [...selectedRingPerks];

    const attrs = {};
    for (const key of ATTRIBUTE_KEYS) {
      const value = Number(build.attributes?.[key]);
      attrs[key] = Number.isFinite(value) ? Math.max(0, Math.min(160, Math.floor(value))) : (attributePoints[key] || 0);
    }

    const total = Object.values(attrs).reduce((sum, v) => sum + v, 0);
    if (total !== ATTRIBUTE_TOTAL) {
      const fixed = { ...attrs };
      let delta = ATTRIBUTE_TOTAL - total;
      while (delta !== 0) {
        for (const key of ATTRIBUTE_KEYS) {
          if (delta === 0) break;
          if (delta > 0) {
            fixed[key] += 1;
            delta -= 1;
          } else if (fixed[key] > 0) {
            fixed[key] -= 1;
            delta += 1;
          }
        }
      }
      Object.assign(attrs, fixed);
    }

    return {
      race,
      classId,
      weapon,
      ringTier,
      ringPerks,
      attributes: attrs,
      combatPower: Number(build.combatPower) || calculateBuildPower(),
    };
  }

  function getCurrentBuildConfig() {
    return normalizeBuildConfig({
      race: selectedRace,
      classId: selectedClass,
      weapon: selectedWeapon,
      ringTier: selectedRingTier,
      ringPerks: [...selectedRingPerks],
      attributes: { ...attributePoints },
      combatPower: calculateBuildPower(),
    });
  }

  window.applyBuildPreset = function (type) {
    const preset = {
      Strength: 20,
      Intellect: 20,
      Vitality: 20,
      Dexterity: 20,
      Endurance: 20,
      Wisdom: 20,
      Agility: 20,
      Tactics: 20,
    };
    if (type === 'tank') {
      Object.assign(preset, { Strength: 30, Intellect: 8, Vitality: 34, Dexterity: 12, Endurance: 32, Wisdom: 14, Agility: 8, Tactics: 22 });
      selectedClass = 'warlord';
      selectedWeapon = 'greatsword';
    } else if (type === 'burst') {
      Object.assign(preset, { Strength: 14, Intellect: 34, Vitality: 10, Dexterity: 20, Endurance: 8, Wisdom: 26, Agility: 14, Tactics: 34 });
      selectedClass = 'arcanist';
      selectedWeapon = 'scythe';
    } else if (type === 'control') {
      Object.assign(preset, { Strength: 10, Intellect: 24, Vitality: 14, Dexterity: 24, Endurance: 12, Wisdom: 28, Agility: 22, Tactics: 26 });
      selectedClass = 'ranger';
      selectedWeapon = 'bow';
    }
    attributePoints = preset;
    normalizeAttributes();
    syncBuilderSelectionUI();
    renderAttributeEditor();
    updateBuildSummary();
    saveBuildToStorage();
  };

  window.randomizeBuildAttributes = function () {
    const next = {};
    ATTRIBUTE_KEYS.forEach((key) => { next[key] = 0; });
    let points = ATTRIBUTE_TOTAL;
    while (points > 0) {
      const key = ATTRIBUTE_KEYS[Math.floor(Math.random() * ATTRIBUTE_KEYS.length)];
      next[key] += 1;
      points -= 1;
    }
    attributePoints = next;
    renderAttributeEditor();
    updateBuildSummary();
    saveBuildToStorage();
  };

  window.shareBuildCode = async function () {
    const build = getCurrentBuildConfig();
    const code = btoa(JSON.stringify(build));
    const url = `${window.location.origin}${window.location.pathname}?build=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setAuthStatus('Build URL copied to clipboard');
      setTimeout(() => setAuthStatus(''), 1800);
    } catch {
      setAuthStatus(`Build code: ${code.slice(0, 40)}...`);
    }
  };

  function hydrateBuildFromURL() {
    const params = new URLSearchParams(window.location.search);
    const payload = params.get('build');
    if (!payload) return;
    try {
      const build = JSON.parse(atob(payload));
      if (build.race) selectedRace = build.race;
      if (build.classId) selectedClass = build.classId;
      if (build.weapon) selectedWeapon = build.weapon;
      if (build.ringTier && RING_TIERS[build.ringTier]) selectedRingTier = build.ringTier;
      if (Array.isArray(build.ringPerks)) selectedRingPerks = build.ringPerks.slice(0, 3);
      if (build.attributes && typeof build.attributes === 'object') {
        for (const key of ATTRIBUTE_KEYS) {
          const value = Number(build.attributes[key]);
          if (!Number.isNaN(value) && value >= 0) attributePoints[key] = Math.floor(value);
        }
        normalizeAttributes();
      }
    } catch (err) {
      console.warn('[arena] Failed to decode build from URL:', err);
    }
  }

  function syncBuilderSelectionUI() {
    document.querySelectorAll('.race-card').forEach((card) => card.classList.toggle('selected', card.dataset.race === selectedRace));
    document.querySelectorAll('.class-card').forEach((card) => card.classList.toggle('selected', card.dataset.class === selectedClass));
    document.querySelectorAll('.weapon-pill').forEach((pill) => pill.classList.toggle('active', pill.dataset.weapon === selectedWeapon));
    const ringSelect = document.getElementById('ring-tier-select');
    if (ringSelect) ringSelect.value = selectedRingTier;
  }

      function updateSpotlight() {
        const detail = RACE_DETAILS[selectedRace] || RACE_DETAILS.human;
        const icon = document.getElementById('spotlight-icon');
        const title = document.getElementById('spotlight-title');
        const meta = document.getElementById('spotlight-meta');
        const lore = document.getElementById('spotlight-lore');
        if (icon) icon.textContent = detail.icon;
        if (title) title.textContent = detail.title;
        if (meta) meta.textContent = detail.meta;
        if (lore) lore.textContent = detail.lore;
      }

      function refreshWeaponAvailability() {
        const raceAllowed = new Set(RACE_WEAPON_ALLOWLIST[selectedRace] || []);
        const classPreferred = CLASS_WEAPON_DEFAULTS[selectedClass];
        const pills = document.querySelectorAll('.weapon-pill');

        pills.forEach((pill) => {
          const allowed = raceAllowed.has(pill.dataset.weapon);
          pill.classList.toggle('disabled', !allowed);
          pill.disabled = !allowed;
          if (!allowed) pill.classList.remove('active');
        });

        if (!raceAllowed.has(selectedWeapon)) {
          selectedWeapon = raceAllowed.has(classPreferred)
            ? classPreferred
            : (RACE_WEAPON_ALLOWLIST[selectedRace] || ['greatsword'])[0];
        }
        syncBuilderSelectionUI();
      }

      function updateReadinessState() {
        const ready = getPointsSpent() === ATTRIBUTE_TOTAL;
        const enterBtn = document.getElementById('enter-btn');
        const queueBtn = document.querySelector('.queue-btn');
        const readyEl = document.getElementById('builder-readiness');

        if (enterBtn) enterBtn.disabled = !ready;
        if (queueBtn) queueBtn.disabled = !ready;
        if (readyEl) {
          readyEl.classList.toggle('ready', ready);
          readyEl.textContent = ready
            ? 'Champion profile locked in. You are ready for arena deployment.'
            : `Allocate all ${ATTRIBUTE_TOTAL} points to unlock Enter Arena.`;
        }
      }

  function setupCharacterBuilder() {
    loadBuildFromStorage();
    hydrateBuildFromURL();
    sanitizeSelectionState();
    syncBuilderSelectionUI();
    renderAttributeEditor();
    renderRingPerks();
    updateSpotlight();
    updateBuildSummary();
    updateReadinessState();

    const ringSelect = document.getElementById('ring-tier-select');
    if (ringSelect) {
      ringSelect.addEventListener('change', (event) => {
        selectedRingTier = event.target.value;
        updateBuildSummary();
        saveBuildToStorage();
      });
    }
  }

function showLoggedIn(user) {
  grudgeUser = user;
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('race-select').classList.add('show');
  document.getElementById('un').textContent = user.displayName || user.username || 'Warlord';
  const gid = (user.grudgeId || user.grudge_id || localStorage.getItem('grudge_id') || '').slice(0, 8).toUpperCase();
  document.getElementById('ug').textContent = gid ? 'GRUDGE-' + gid : '';
  const walletAddr = user.walletAddress || user.serverWalletAddress || '';
  if (walletAddr) {
    document.getElementById('ug').textContent += (gid ? ' · ' : '') + walletAddr.slice(0, 4) + '...' + walletAddr.slice(-4);
  }
  if (user.avatarUrl) {
    document.getElementById('ua').innerHTML = '<img src="' + user.avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
  } else {
    document.getElementById('ua').textContent = (user.username || 'W')[0].toUpperCase();
  }
}

function showLoggedOut() {
  document.getElementById('auth-gate').style.display = 'block';
  document.getElementById('race-select').classList.remove('show');
}

function storeAuth(token, user) {
  if (token) setToken(token);
  if (user) {
    localStorage.setItem('grudge_user', JSON.stringify(user));
    if (user.grudgeId || user.grudge_id) localStorage.setItem('grudge_id', user.grudgeId || user.grudge_id);
    if (user.username) localStorage.setItem('grudge_username', user.username);
    if (user.id) localStorage.setItem('grudge_user_id', String(user.id));
  }
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem('grudge_user');
  localStorage.removeItem('grudge_id');
  localStorage.removeItem('grudge_username');
  localStorage.removeItem('grudge_user_id');
  localStorage.removeItem('grudge-session');
}

function handleAuthData(data) {
  const token = data.sessionToken || data.token;
  const user = data.user || {};
  if (!user.grudgeId && data.grudgeId) user.grudgeId = data.grudgeId;
  if (!user.username && data.username) user.username = data.username;
  storeAuth(token, user);
  try {
    localStorage.setItem('grudge-session', JSON.stringify({
      type: user.walletAddress ? 'wallet' : (user.isGuest ? 'guest' : (user.puterUuid ? 'puter' : 'grudge')),
      username: user.username || 'Warlord',
      grudgeId: user.grudgeId,
      accountId: user.id,
      walletAddress: user.walletAddress,
      puterUuid: user.puterUuid,
      loginTime: Date.now()
    }));
  } catch {}
  return user;
}

async function fetchUserProfile(token) {
  try {
    const r = await fetch(API_BASE + '/auth/user', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function verifyToken(token) {
  try {
    const r = await fetch(API_BASE + '/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const d = await r.json();
    return d.valid === true;
  } catch { return false; }
}

// ── Phantom Wallet Connect (with message signing) ────────────
function getPhantomProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return null;
}

document.getElementById('phantom-btn').addEventListener('click', async () => {
  const provider = getPhantomProvider();
  if (!provider) {
    window.open('https://phantom.app/', '_blank');
    setAuthStatus('Install Phantom wallet extension, then try again');
    return;
  }

  const btn = document.getElementById('phantom-btn');
  btn.disabled = true;
  setAuthStatus('Connecting to Phantom...');

  try {
    const resp = await provider.connect();
    const walletAddress = resp.publicKey.toString();
    setAuthStatus('Wallet connected · Verifying ownership...');

    // Sign a message to prove wallet ownership
    const timestamp = Date.now();
    const message = `Grudge Arena Login: ${timestamp}`;
    const encodedMessage = new TextEncoder().encode(message);
    let signature = null;
    try {
      const signResult = await provider.signMessage(encodedMessage, 'utf8');
      signature = btoa(String.fromCharCode(...signResult.signature));
    } catch (signErr) {
      if (signErr.message?.includes('rejected')) {
        setAuthStatus('Signature cancelled');
        btn.disabled = false;
        return;
      }
      // If signing fails (older Phantom), proceed without signature
      console.warn('[arena] signMessage not supported, proceeding without signature');
    }

    setAuthStatus('Signing in...');

    // Auth with Grudge backend
    try {
      const r = await fetch(API_BASE + '/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress, signature, message, timestamp })
      });

      if (r.ok) {
        const data = await r.json();
        const user = handleAuthData(data);
        if (!user.walletAddress) user.walletAddress = walletAddress;
        storeAuth(null, user);
        setAuthStatus('');
        showLoggedIn(user);
        return;
      }
    } catch (netErr) {
      console.warn('[arena] Backend unreachable for wallet auth:', netErr.message);
    }

    // Fallback: offline wallet session (no Grudge ID, play with wallet identity)
    console.log('[arena] Using offline wallet session');
    const offlineUser = {
      username: walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4),
      walletAddress,
      isOffline: true,
    };
    storeAuth(null, offlineUser);
    setAuthStatus('');
    showLoggedIn(offlineUser);
  } catch (err) {
    console.error('[arena] Phantom auth error:', err);
    setAuthStatus(err.message === 'User rejected the request.' ? 'Connection cancelled' : err.message || 'Wallet connection failed');
    btn.disabled = false;
  }
});

// ── Puter Auth (Grudge ID via Puter SDK) ─────────────────────
document.getElementById('puter-btn').addEventListener('click', async () => {
  const btn = document.getElementById('puter-btn');
  btn.disabled = true;
  setAuthStatus('Connecting to Grudge ID...');

  try {
    // Use Puter SDK to authenticate
    if (typeof puter === 'undefined' || !puter.auth) {
      throw new Error('Auth service unavailable. Please refresh and try again.');
    }

    const puterUser = await puter.auth.signIn();
    if (!puterUser) throw new Error('Sign-in was cancelled');

    const puterUuid = puterUser.uuid || puterUser.id || puterUser.username;
    const puterUsername = puterUser.username || puterUser.email || 'Warlord';
    setAuthStatus('Signed in · Linking Grudge ID...');

    // Register/login with Grudge backend using Puter identity
    try {
      const r = await fetch(API_BASE + '/auth/puter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puterUuid, puterUsername })
      });

      if (r.ok) {
        const data = await r.json();
        const user = handleAuthData(data);
        if (!user.username) user.username = puterUsername;
        user.puterUuid = puterUuid;
        storeAuth(null, user);
        setAuthStatus('');
        showLoggedIn(user);
        return;
      }
    } catch (netErr) {
      console.warn('[arena] Backend unreachable for Puter auth:', netErr.message);
    }

    // Fallback: offline Puter session
    console.log('[arena] Using offline Puter session');
    const offlineUser = {
      username: puterUsername,
      puterUuid,
      isOffline: true,
    };
    storeAuth(null, offlineUser);
    setAuthStatus('');
    showLoggedIn(offlineUser);
  } catch (err) {
    console.error('[arena] Puter auth error:', err);
    setAuthStatus(err.message || 'Sign-in failed');
    btn.disabled = false;
  }
});

// ── Guest Login (client-first, backend registration in background) ──
document.getElementById('guest-btn').addEventListener('click', async () => {
  const btn = document.getElementById('guest-btn');
  btn.disabled = true;
  setAuthStatus('Entering as Guest...');

  const deviceId = getDeviceId();
  const guestUser = {
    username: 'Guest',
    displayName: 'Guest',
    isGuest: true,
    deviceId,
  };

  // Immediately show the game — don't block on backend
  storeAuth(null, guestUser);
  setAuthStatus('');
  showLoggedIn(guestUser);

  // Attempt backend registration in the background (creates Grudge ID for guest)
  try {
    const r = await fetch(API_BASE + '/auth/puter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puterUuid: 'guest_' + deviceId, puterUsername: 'Guest' })
    });
    if (r.ok) {
      const data = await r.json();
      const user = handleAuthData(data);
      user.isGuest = true;
      user.username = user.username || 'Guest';
      storeAuth(null, user);
      grudgeUser = user;
      // Update GID display if we got one
      const gid = (user.grudgeId || user.grudge_id || '').slice(0, 8).toUpperCase();
      if (gid) document.getElementById('ug').textContent = 'GRUDGE-' + gid;
      console.log('[arena] Guest linked to Grudge ID:', gid);
    }
  } catch (err) {
    console.warn('[arena] Guest backend registration failed (playing offline):', err.message);
  }
});

// ── Boot auth flow ───────────────────────────────
(async function initAuth() {
  const params = new URLSearchParams(location.search);
  const incomingToken = params.get('token') || params.get('sso_token');
  const incomingGrudgeId = params.get('grudge_id') || params.get('grudgeId');
  const incomingUsername = params.get('grudge_username') || params.get('username');

  // Case 1: Returning from OAuth/SSO with a token in the URL
  if (incomingToken) {
    storeAuth(incomingToken, null);
    if (incomingGrudgeId) localStorage.setItem('grudge_id', incomingGrudgeId);
    if (incomingUsername) localStorage.setItem('grudge_username', incomingUsername);
    const user = await fetchUserProfile(incomingToken);
    if (user) {
      storeAuth(incomingToken, user);
    } else {
      storeAuth(incomingToken, { grudgeId: incomingGrudgeId || '', username: incomingUsername || 'Warlord' });
    }
    history.replaceState({}, '', location.pathname);
    showLoggedIn(getUser() || { username: incomingUsername || 'Warlord', grudgeId: incomingGrudgeId || '' });
    return;
  }

  // Case 2: Existing token in localStorage
  const existingToken = getToken();
  if (existingToken) {
    const valid = await verifyToken(existingToken);
    if (valid) {
      let user = getUser();
      if (!user || !user.username) {
        user = await fetchUserProfile(existingToken);
        if (user) storeAuth(existingToken, user);
      }
      if (user) { showLoggedIn(user); return; }
    }
    clearAuth();
  }

  // Case 3: Existing local user data (offline session from wallet/guest)
  const localUser = getUser();
  if (localUser && (localUser.walletAddress || localUser.puterUuid || localUser.isGuest)) {
    showLoggedIn(localUser);
    return;
  }

  // Case 4: Try silent Puter auth if SDK is loaded and user is already signed in
  try {
    if (typeof puter !== 'undefined' && puter.auth) {
      const puterUser = await puter.auth.getUser();
      if (puterUser && puterUser.uuid) {
        const user = { username: puterUser.username || 'Warlord', puterUuid: puterUser.uuid };
        storeAuth(null, user);
        showLoggedIn(user);
        // Background: sync with backend
        fetch(API_BASE + '/auth/puter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ puterUuid: puterUser.uuid, puterUsername: puterUser.username })
        }).then(r => r.ok ? r.json() : null).then(data => {
          if (data) { const u = handleAuthData(data); u.puterUuid = puterUser.uuid; storeAuth(null, u); grudgeUser = u; }
        }).catch(() => {});
        return;
      }
    }
  } catch { /* Puter SDK not ready or not signed in */ }

  // Case 5: No session — show auth gate
  showLoggedOut();
})();

// ── Race Selection ───────────────────────────────────
window.selectRace = function(el) {
  document.querySelectorAll('.race-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedRace = el.dataset.race;
  refreshWeaponAvailability();
  updateSpotlight();
      updateBuildSummary();
  updateReadinessState();
      saveBuildToStorage();
    };

    window.selectClassCard = function (el) {
      document.querySelectorAll('.class-card').forEach((card) => card.classList.remove('selected'));
      el.classList.add('selected');
      selectedClass = el.dataset.class;
      const preferred = CLASS_WEAPON_DEFAULTS[selectedClass];
      if (preferred) {
        selectedWeapon = preferred;
        refreshWeaponAvailability();
        syncBuilderSelectionUI();
      }
      updateBuildSummary();
      updateReadinessState();
      saveBuildToStorage();
    };

    window.selectWeaponPill = function (el) {
      if (el.disabled || el.classList.contains('disabled')) return;
      document.querySelectorAll('.weapon-pill').forEach((pill) => pill.classList.remove('active'));
      el.classList.add('active');
      selectedWeapon = el.dataset.weapon;
      updateBuildSummary();
      updateReadinessState();
      saveBuildToStorage();
};

// ── Enter Arena ──────────────────────────────
window.enterArena = function() {
  sanitizeSelectionState();
  const build = normalizeBuildConfig(getCurrentBuildConfig());
  selectedRace = build.race;
  selectedClass = build.classId;
  selectedWeapon = build.weapon;
  attributePoints = { ...build.attributes };

  if (getPointsSpent() !== ATTRIBUTE_TOTAL) {
    setAuthStatus(`Spend all ${ATTRIBUTE_TOTAL} points before entering arena`);
    return;
  }
  saveBuildToStorage();
  document.getElementById('lobby-overlay').classList.add('hidden');
  document.getElementById('loading-overlay').classList.add('active');
  loadArenaGame(build.race, null, build);
};

// ── PvP Queue ────────────────────────────────────────
window.joinQueue = async function() {
  sanitizeSelectionState();
  const build = normalizeBuildConfig(getCurrentBuildConfig());
  selectedRace = build.race;
  selectedClass = build.classId;
  selectedWeapon = build.weapon;
  attributePoints = { ...build.attributes };

  if (getPointsSpent() !== ATTRIBUTE_TOTAL) {
    setAuthStatus(`Spend all ${ATTRIBUTE_TOTAL} points before queueing`);
    return;
  }
  const token = getToken();
  if (!token && !grudgeUser) return;
  const btn = document.querySelector('.queue-btn');
  btn.textContent = '🔍 Searching for opponent...';
  btn.disabled = true;

  try {
    const { io } = await import('socket.io-client');
    const pvpSocket = io(WS_URL + '/pvp', {
      auth: { token: token || 'guest_' + getDeviceId() },
      transports: ['websocket', 'polling'],
    });

    pvpSocket.on('connect', () => console.log('[arena] Connected to PvP service'));

    pvpSocket.on('pvp:queue_matched', (data) => {
      console.log('[arena] Match found!', data);
      btn.textContent = '⚔ MATCH FOUND!';
      setTimeout(() => {
        document.getElementById('lobby-overlay').classList.add('hidden');
        document.getElementById('game-root').classList.add('active');
        loadArenaGame(build.race, data, build);
      }, 1500);
    });

    pvpSocket.on('connect_error', (err) => {
      console.warn('[arena] PvP connect error:', err.message);
      btn.textContent = '🔍 Find PvP Match';
      btn.disabled = false;
    });
  } catch (err) {
    console.error('[arena] Queue error:', err);
    btn.textContent = '🔍 Find PvP Match';
    btn.disabled = false;
  }
};

// ── Load Arena Game ──────────────────────────
function setLoadingProgress(pct, text) {
  const bar = document.getElementById('loading-bar');
  const label = document.getElementById('loading-text');
  if (bar) bar.style.width = pct + '%';
  if (label && text) label.textContent = text;
}

  async function loadArenaGame(race, matchData, buildConfig) {
    const normalizedBuild = normalizeBuildConfig(buildConfig);
    const normalizedRace = VALID_RACES.includes(race) ? race : normalizedBuild.race;
  const root = document.getElementById('game-root');
  const playerName = grudgeUser?.username || 'Warlord';
    const raceName = normalizedRace.charAt(0).toUpperCase() + normalizedRace.slice(1);

  setLoadingProgress(10, 'Loading game engine...');

  try {
    const { GrudgeArena } = await import('../game.js');
    setLoadingProgress(40, 'Initializing arena...');

    const arena = new GrudgeArena({
      container: root,
      race: normalizedRace,
      weapon: normalizedBuild.weapon,
      classId: normalizedBuild.classId,
      buildConfig: normalizedBuild,
      playerName: playerName,
      grudgeId: grudgeUser?.grudgeId || localStorage.getItem('grudge_id') || '',
      matchData: matchData || null,
      wsUrl: WS_URL,
      token: getToken(),
    });

    setLoadingProgress(60, 'Building world...');
    await arena.init();

    setLoadingProgress(100, 'Ready!');

    const hudInfo = document.getElementById('hud-player-info');
    if (hudInfo) hudInfo.textContent = playerName + ' · ' + raceName;

    setTimeout(() => {
      document.getElementById('loading-overlay').classList.remove('active');
      root.classList.add('active');
    }, 300);

    console.log('[arena] Game loaded —', raceName);
  } catch (err) {
    console.error('[arena] Failed to load game engine:', err);
    setLoadingProgress(100, 'Loading failed — ' + (err.message || 'unknown error'));
    setTimeout(() => {
      document.getElementById('loading-overlay').classList.remove('active');
      document.getElementById('lobby-overlay').classList.remove('hidden');
    }, 3000);
  }
}

  setupCharacterBuilder();
