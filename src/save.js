// localStorageベースのセーブ機能。スロットは10個(1〜10)。
export const SAVE_SLOT_COUNT = 10;

function slotKey(slot) {
  return `yamanote_dentetsu_save_${slot}`;
}

export function saveGame(slot, state) {
  localStorage.setItem(slotKey(slot), JSON.stringify(state));
}

export function loadGame(slot) {
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasSave(slot) {
  return localStorage.getItem(slotKey(slot)) !== null;
}

export function slotSummary(slot) {
  const data = loadGame(slot);
  if (!data) return null;
  const you = data.players?.find((p) => p.id === 'you');
  return {
    year: data.year,
    years: data.years,
    month: data.month,
    cash: you ? you.cash : 0,
  };
}
