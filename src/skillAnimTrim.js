/**
 * Per-clip playback trim (start/end/timeScale) for anim-test skill previews.
 */

const STORAGE_KEY = "grudge-arena-skill-anim-trim";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** @returns {{ start: number, end: number|null, timeScale: number }} */
export function getClipTrim(clipKey) {
  const t = readAll()[clipKey];
  return {
    start: t?.start ?? 0,
    end: t?.end ?? null,
    timeScale: t?.timeScale ?? 1,
  };
}

export function setClipTrim(clipKey, patch) {
  const all = readAll();
  all[clipKey] = { ...getClipTrim(clipKey), ...patch };
  writeAll(all);
}

/**
 * Stop action when trimmed end reached. @returns {boolean} still playing
 */
export function tickTrimmedAction(action, trim) {
  if (!action?.isRunning?.()) return false;
  const end = trim?.end;
  if (end == null || !Number.isFinite(end)) return true;
  if (action.time >= end) {
    action.stop();
    return false;
  }
  return true;
}