import Phaser from 'phaser';
import { STATIONS, CHUO_STATIONS } from './stations.js';

// 6角形の輪っかに30駅を配置する座標計算(旧StageSelectSceneから抽出)。
// 品川を下の頂点、駒込を上の頂点にし、大崎・高輪ゲートウェイ・巣鴨・田端は
// 斜め区間(隣とX方向1/3重ね)。中央線(四ツ谷・御茶ノ水)は新宿・神田と
// 同じ高さで、それぞれボタン幅1/3ぶん寄せた位置に置く。
export function buildStationPositions(width, height) {
  const centerX = width / 2;
  const centerY = height / 2 + 40;
  const topMargin = 150;
  const bottomMargin = 30;
  const sideMargin = 50;
  const n = STATIONS.length;
  const findStationIndex = (name) => STATIONS.findIndex((s) => s.name === name);

  const ASPECT = 6.0;
  const TIGHT_FACTOR = 1.12;
  const STRAIGHT_GAPS = 11;
  const OVERLAP_FRACTION = 1 / 3;
  const GAP_Y_RATIO = 1.15;
  const DIAGONAL_STEPS = 2;

  const buildPoints = (h) => {
    const buttonWidth = h * ASPECT;
    const radiusX = buttonWidth * (1 - OVERLAP_FRACTION) * DIAGONAL_STEPS;
    const shoulderY = (h * TIGHT_FACTOR * STRAIGHT_GAPS) / 2;
    const radiusY = shoulderY + h * GAP_Y_RATIO * DIAGONAL_STEPS;
    const vertexDefs = [
      { name: '品川', pos: { x: 0, y: radiusY } },
      { name: '田町', pos: { x: radiusX, y: shoulderY } },
      { name: '西日暮里', pos: { x: radiusX, y: -shoulderY } },
      { name: '駒込', pos: { x: 0, y: -radiusY } },
      { name: '大塚', pos: { x: -radiusX, y: -shoulderY } },
      { name: '五反田', pos: { x: -radiusX, y: shoulderY } },
    ];
    const vertexIndices = vertexDefs.map((v) => findStationIndex(v.name));
    const pts = new Array(n);
    vertexDefs.forEach((seg, k) => {
      const startIdx = vertexIndices[k];
      const endIdx = vertexIndices[(k + 1) % vertexDefs.length];
      const startPos = seg.pos;
      const endPos = vertexDefs[(k + 1) % vertexDefs.length].pos;
      pts[startIdx] = { x: centerX + startPos.x, y: centerY + startPos.y };
      const interior = [];
      for (let i = (startIdx + 1) % n; i !== endIdx; i = (i + 1) % n) interior.push(i);
      interior.forEach((stationIdx, i) => {
        const t = (i + 1) / (interior.length + 1);
        pts[stationIdx] = {
          x: centerX + startPos.x + (endPos.x - startPos.x) * t,
          y: centerY + startPos.y + (endPos.y - startPos.y) * t,
        };
      });
    });
    return pts;
  };

  const countOverlaps = (h) => {
    const w = h * ASPECT;
    const pts = buildPoints(h);
    let overlaps = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = Math.abs(pts[i].x - pts[j].x);
        const dy = Math.abs(pts[i].y - pts[j].y);
        if (w - dx > 0 && h - dy > 0) overlaps++;
      }
    }
    return overlaps;
  };

  const hMaxByWidth = (width / 2 - sideMargin) / (ASPECT * ((1 - OVERLAP_FRACTION) * DIAGONAL_STEPS + 0.5));
  const hMaxByHeight =
    (height - topMargin - bottomMargin) / 2 / ((TIGHT_FACTOR * STRAIGHT_GAPS) / 2 + GAP_Y_RATIO * DIAGONAL_STEPS);
  let lo = 10;
  let hi = Math.min(200, hMaxByWidth, hMaxByHeight);
  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2;
    if (countOverlaps(mid) === 0) lo = mid;
    else hi = mid;
  }
  const buttonHeight = Phaser.Math.Clamp(lo * 0.96, 20, 200);
  const buttonWidth = buttonHeight * ASPECT;
  const points = buildPoints(buttonHeight);

  const shinjuku = points[findStationIndex('新宿')];
  const kanda = points[findStationIndex('神田')];
  const chuoOffsetX = buttonWidth / 3;
  const chuoPoints = [
    { x: centerX - chuoOffsetX, y: shinjuku.y }, // 四ツ谷
    { x: centerX + chuoOffsetX, y: kanda.y }, // 御茶ノ水
  ];

  return { points, chuoPoints, buttonWidth, buttonHeight, centerX, centerY };
}

export { STATIONS, CHUO_STATIONS };
