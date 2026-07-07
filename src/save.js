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

// スロットのセーブデータを.jsonファイルとしてダウンロードさせる
export function downloadSave(slot) {
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) return false;
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yamanote_dentetsu_slot${slot}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

// ファイル選択ダイアログを開き、選ばれた.jsonをスロットに書き込む(成功/失敗をコールバックで通知)
export function uploadSaveToSlot(slot, onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) {
      input.remove();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        localStorage.setItem(slotKey(slot), JSON.stringify(parsed));
        onDone(true);
      } catch {
        onDone(false);
      }
      input.remove();
    };
    reader.onerror = () => {
      onDone(false);
      input.remove();
    };
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
}
