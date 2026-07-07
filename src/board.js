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
// pos: { onChuo: boolean, index: number, chuoDir?: 1 | -1 }
// 中央線は新宿側からも神田側からも、進行方向(反時計回り/時計回り)に関係なく
// 入れる。一度中央線に入ったら、入った側と逆側に抜けるまでchuoDirの向きに歩く。
// takeShortcut: 新宿 or 神田のセルに乗っている状態でこの関数を呼ぶ場合、中央線を使うかどうか
export function stepForward(board, pos, takeShortcut) {
  if (!pos.onChuo) {
    if (pos.index === board.shinjukuCellIndex && takeShortcut) {
      return { onChuo: true, index: 0, chuoDir: 1 };
    }
    if (pos.index === board.kandaCellIndex && takeShortcut) {
      return { onChuo: true, index: board.chuoPath.length - 1, chuoDir: -1 };
    }
    return { onChuo: false, index: (pos.index + 1) % board.mainLoop.length };
  }
  return stepChuo(board, pos);
}

// 駒を1マス「時計回り」(stepForwardと逆方向)に進める。
export function stepBackward(board, pos, takeShortcut) {
  if (!pos.onChuo) {
    if (pos.index === board.kandaCellIndex && takeShortcut) {
      return { onChuo: true, index: board.chuoPath.length - 1, chuoDir: -1 };
    }
    if (pos.index === board.shinjukuCellIndex && takeShortcut) {
      return { onChuo: true, index: 0, chuoDir: 1 };
    }
    return { onChuo: false, index: (pos.index - 1 + board.mainLoop.length) % board.mainLoop.length };
  }
  return stepChuo(board, pos);
}

// 中央線上を歩く処理は、入った側(chuoDir)に沿って進み、逆側で本線に合流する。
// 反時計回り/時計回りどちらで来たかには依存しない。
function stepChuo(board, pos) {
  const next = pos.index + pos.chuoDir;
  if (next < 0) return { onChuo: false, index: board.shinjukuCellIndex };
  if (next >= board.chuoPath.length) return { onChuo: false, index: board.kandaCellIndex };
  return { onChuo: true, index: next, chuoDir: pos.chuoDir };
}

export function getCell(board, pos) {
  return pos.onChuo ? board.chuoPath[pos.index] : board.mainLoop[pos.index];
}

// 2セル間の距離(メインループのみを想定した概算。目的地までの残り歩数の目安表示に使う)
export function mainLoopDistance(board, fromIndex, toIndex) {
  const len = board.mainLoop.length;
  return ((toIndex - fromIndex + len) % len) || len;
}
