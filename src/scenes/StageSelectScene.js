import Phaser from 'phaser';
import { STATIONS, CHUO_STATIONS } from '../stations.js';
import { drawRoundedButton, BUTTON_FILL, BUTTON_FILL_HOVER, BUTTON_STROKE, ACCENT_STROKE } from '../ui.js';

const FONT_FAMILY = '"Kosugi Maru", sans-serif';

export class StageSelectScene extends Phaser.Scene {
  constructor() {
    super('StageSelectScene');
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.add
      .text(width / 2, 20, '山手線電鉄 駅選択', { fontFamily: FONT_FAMILY, fontSize: '36px', color: '#000' })
      .setOrigin(0.5, 0);

    // 6角形の輪っかに30駅を配置(実際の山手線のループをイメージ)。
    // 品川を下の頂点、駒込を上の頂点にして、大崎・高輪ゲートウェイ(下)と
    // 巣鴨・田端(上)は斜め区間(隣とX方向1/3重ね・Y方向は少し隙間)。
    // 左まっすぐ:大塚⇄五反田、右まっすぐ:田町⇄西日暮里。
    // 斜めのぶん輪の横幅が広がり、内側に中央線の駅を置く空間ができる。
    const centerX = width / 2;
    const centerY = height / 2 + 40;
    const topMargin = 150;
    const bottomMargin = 30;
    const sideMargin = 50;
    const n = STATIONS.length;
    const findStationIndex = (name) => STATIONS.findIndex((s) => s.name === name);

    const ASPECT = 6.0; // ボタンの横長比率(幅/高さ)
    // まっすぐ区間(12駅・間隔11個)の駅間隔を「ボタン高さ×この倍率」に固定し、隙間を詰める。
    const TIGHT_FACTOR = 1.12;
    const STRAIGHT_GAPS = 11;
    // 斜め区間は隣同士をX方向に1/3だけ重ねる。
    const OVERLAP_FRACTION = 1 / 3;
    const GAP_Y_RATIO = 1.15; // 斜め区間の隣同士のY間隔(ボタン高さ基準)
    const DIAGONAL_STEPS = 2; // 頂点(品川・駒込)から肩(直線区間の端)までの段数

    // ボタン高さhを与えると6角形の全駅座標を返す
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

    // 「高さh・幅h*ASPECT」のボタンを全駅に置いたとき重なりが出ないかを判定
    // (斜め区間の1/3重なりはY方向がGAP_Y_RATIO*h離れているので重なり扱いにならない)
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

    // 二分探索で「重ならない最大の高さ」を求め、安全マージンとして少しだけ控える
    const hMaxByWidth =
      (width / 2 - sideMargin) / (ASPECT * ((1 - OVERLAP_FRACTION) * DIAGONAL_STEPS + 0.5));
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

    // 山手線らしい路線カラーの線で駅を結ぶ(ボタンの背後に描画)
    const ROUTE_COLOR = 0x9acd32;
    const routeLine = this.add.graphics();
    routeLine.lineStyle(6, ROUTE_COLOR, 1);
    routeLine.beginPath();
    points.forEach((p, i) => (i === 0 ? routeLine.moveTo(p.x, p.y) : routeLine.lineTo(p.x, p.y)));
    routeLine.closePath();
    routeLine.strokePath();

    // 中央線(オレンジ)が山手線の内側を横断する: 新宿 → 四ツ谷 → 御茶ノ水 → 神田。
    // 四ツ谷は新宿と同じ高さ・御茶ノ水は神田と同じ高さで、中央の縦軸に通常サイズのボタンで置く
    const CHUO_COLOR = 0xf15a22;
    const shinjuku = points[findStationIndex('新宿')];
    const kanda = points[findStationIndex('神田')];
    const chuoPoints = [
      { x: centerX, y: shinjuku.y }, // 四ツ谷
      { x: centerX, y: kanda.y }, // 御茶ノ水
    ];
    const chuoLine = this.add.graphics();
    chuoLine.lineStyle(6, CHUO_COLOR, 1);
    chuoLine.beginPath();
    chuoLine.moveTo(shinjuku.x, shinjuku.y);
    chuoPoints.forEach((p) => chuoLine.lineTo(p.x, p.y));
    chuoLine.lineTo(kanda.x, kanda.y);
    chuoLine.strokePath();

    // 頂点駅(品川・駒込)は起点/終点として少し目立たせる
    const terminalNames = ['品川', '駒込'];

    // 駅ボタン1個を描く(山手線・中央線で共通)
    const addStationButton = (station, bx, by, strokeColor, strokeWidth) => {
      const bg = drawRoundedButton(this, bx, by, buttonWidth, buttonHeight, { strokeColor, strokeWidth });

      const nameFontSize = buttonHeight < 45 ? '16px' : '20px';
      const nameText = this.add
        .text(bx - 8, by, station.name, { fontFamily: FONT_FAMILY, fontSize: nameFontSize, color: '#000' })
        .setDepth(2)
        .setOrigin(1, 0.5);
      // 「高輪ゲートウェイ」のような長い駅名が左半分からはみ出さないよう縮小する
      const maxNameWidth = buttonWidth * 0.5 - 16;
      if (nameText.width > maxNameWidth) {
        nameText.setScale(maxNameWidth / nameText.width);
      }

      const stars = station.rank + 1; // rankは0〜7の8段階なので、そのまま★1〜8に対応させる
      // 6個以上は★を並べず「⭐N」のようにまとめて表示する
      const starDisplay = stars >= 6 ? `⭐${stars}` : '★'.repeat(stars);
      this.add
        .text(bx + 8, by, starDisplay, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#e08a00' })
        .setDepth(2)
        .setOrigin(0, 0.5);

      bg.on('pointerdown', () => this.scene.start('StationScene', { name: station.name, rank: station.rank }));
      bg.on('pointerover', () => bg.setFillStyle(BUTTON_FILL_HOVER));
      bg.on('pointerout', () => bg.setFillStyle(BUTTON_FILL));
    };

    STATIONS.forEach((station, i) => {
      const isTerminal = terminalNames.includes(station.name);
      addStationButton(
        station,
        points[i].x,
        points[i].y,
        isTerminal ? ACCENT_STROKE : BUTTON_STROKE,
        isTerminal ? 4 : 2
      );
    });

    // 中央線の駅は他と同じサイズのオレンジ枠ボタン
    CHUO_STATIONS.forEach((station, i) => {
      addStationButton(station, chuoPoints[i].x, chuoPoints[i].y, CHUO_COLOR, 3);
    });
  }
}
