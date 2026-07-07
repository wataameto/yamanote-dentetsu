import { STATIONS, CHUO_STATIONS } from './stations.js';

// 盤面のセル構成。
// メインループ: 駅と駅の間に小マスを1個ずつ挟む(30駅+30小マス=60セル)。
// 中央線ブランチ: 新宿(メインループ)から神田(メインループ)へ、
//   小マス-四ツ谷-小マス-御茶ノ水-小マスの5セルで直結するショートカット。
const SMALL_TYPES = ['blue', 'red', 'card'];

function pickSmallType(rng) {
  const r = rng();
  if (r < 0.42) return 'blue';
  if (r < 0.84) return 'red';
  return 'card';
}

export function buildBoard(rng = Math.random) {
  const mainLoop = [];
  STATIONS.forEach((station, i) => {
    mainLoop.push({ type: 'station', stationIndex: i, name: station.name });
    mainLoop.push({ type: pickSmallType(rng) });
  });

  const stationCellIndex = {};
  mainLoop.forEach((cell, idx) => {
    if (cell.type === 'station') stationCellIndex[cell.stationIndex] = idx;
  });

  const shinjukuIdx = STATIONS.findIndex((s) => s.name === '新宿');
  const kandaIdx = STATIONS.findIndex((s) => s.name === '神田');
  const shinagawaIdx = STATIONS.findIndex((s) => s.name === '品川');

  const chuoPath = [
    { type: pickSmallType(rng) },
    { type: 'station', chuoIndex: 0, name: CHUO_STATIONS[0].name },
    { type: pickSmallType(rng) },
    { type: 'station', chuoIndex: 1, name: CHUO_STATIONS[1].name },
    { type: pickSmallType(rng) },
  ];

  return {
    mainLoop,
    chuoPath,
    stationCellIndex, // 山手線STATIONS添字 -> mainLoopでのセルindex
    shinjukuCellIndex: stationCellIndex[shinjukuIdx],
    kandaCellIndex: stationCellIndex[kandaIdx],
    startCellIndex: stationCellIndex[shinagawaIdx],
  };
}

// 駒(プレイヤー)を1マス進める。中央線への分岐/合流をここで処理する。
// pos: { onChuo: boolean, index: number }
// takeShortcut: 新宿セルに乗っている状態でこの関数を呼ぶ場合、中央線を使うかどうか
export function stepForward(board, pos, takeShortcut) {
  if (!pos.onChuo) {
    if (pos.index === board.shinjukuCellIndex && takeShortcut) {
      return { onChuo: true, index: 0 };
    }
    return { onChuo: false, index: (pos.index + 1) % board.mainLoop.length };
  }
  // 中央線を歩いている途中
  if (pos.index + 1 >= board.chuoPath.length) {
    return { onChuo: false, index: board.kandaCellIndex };
  }
  return { onChuo: true, index: pos.index + 1 };
}

export function getCell(board, pos) {
  return pos.onChuo ? board.chuoPath[pos.index] : board.mainLoop[pos.index];
}

// 2セル間の距離(メインループのみを想定した概算。目的地までの残り歩数の目安表示に使う)
export function mainLoopDistance(board, fromIndex, toIndex) {
  const len = board.mainLoop.length;
  return ((toIndex - fromIndex + len) % len) || len;
}
