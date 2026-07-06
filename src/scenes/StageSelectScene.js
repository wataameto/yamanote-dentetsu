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

    // 角丸長方形の輪っかに30駅を配置(実際の山手線のループをイメージ)。
    // 上の辺:巣鴨・駒込・田端の3駅、下の辺:大崎・品川・高輪ゲートウェイの3駅が横並びで、
    // 駒込・品川はそれぞれ左右両方のまっすぐ区間にX方向1/3だけ重なる形でつなぐ。
    // 右まっすぐ:田端⇄高輪ゲートウェイ、左まっすぐ:巣鴨⇄大崎。
    const centerX = width / 2;
    const centerY = height / 2 + 40;
    const topMargin = 150;
    const bottomMargin = 30;
    const sideMargin = 50;
    const n = STATIONS.length;
    const findStationIndex = (name) => STATIONS.findIndex((s) => s.name === name);

    const ASPECT = 6.0; // ボタンの横長比率(幅/高さ)
    // まっすぐ区間(14駅・間隔13個)の駅間隔を「ボタン高さ×この倍率」に固定し、隙間を詰める。
    const TIGHT_FACTOR = 1.12;
    const STRAIGHT_GAPS = 13;
    // 上下の辺は隣同士をX方向に1/3だけ重ねる。
    const OVERLAP_FRACTION = 1 / 3;

    // ボタン高さhを与えると、駒込・品川はX方向だけ両隣の列に1/3重ね(Y方向はさらに外側に離す)、
    // 左右のまっすぐ区間はh基準でタイトになるように配置する
    const Y_GAP_RATIO = 1.05; // 駒込・品川をまっすぐ区間の端からY方向に離す量(ボタン高さ基準)
    const buildPoints = (h) => {
      const buttonWidth = h * ASPECT;
      const radiusX = buttonWidth * (1 - OVERLAP_FRACTION);
      const radiusY = (h * TIGHT_FACTOR * STRAIGHT_GAPS) / 2;
      const yGap = h * Y_GAP_RATIO;
      const pts = new Array(n);
      const idx = (name) => findStationIndex(name);

      pts[idx('巣鴨')] = { x: centerX - radiusX, y: centerY - radiusY };
      pts[idx('駒込')] = { x: centerX, y: centerY - radiusY - yGap };
      pts[idx('田端')] = { x: centerX + radiusX, y: centerY - radiusY };
      pts[idx('大崎')] = { x: centerX - radiusX, y: centerY + radiusY };
      pts[idx('品川')] = { x: centerX, y: centerY + radiusY + yGap };
      pts[idx('高輪ゲートウェイ')] = { x: centerX + radiusX, y: centerY + radiusY };

      const fillStraight = (fromName, toName, x) => {
        const fromIdx = idx(fromName);
        const toIdx = idx(toName);
        const y0 = pts[fromIdx].y;
        const y1 = pts[toIdx].y;
        const interior = [];
        for (let i = (fromIdx + 1) % n; i !== toIdx; i = (i + 1) % n) interior.push(i);
        interior.forEach((stationIdx, i) => {
          const t = (i + 1) / (interior.length + 1);
          pts[stationIdx] = { x: centerX + x, y: y0 + (y1 - y0) * t };
        });
      };
      fillStraight('高輪ゲートウェイ', '田端', radiusX);
      fillStraight('巣鴨', '大崎', -radiusX);

      return pts;
    };

    // 上下の辺で意図的に1/3重ねているペアは重なり判定から除外する
    const intentionalOverlapPairs = new Set(
      [
        ['品川', '高輪ゲートウェイ'],
        ['品川', '大崎'],
        ['駒込', '田端'],
        ['駒込', '巣鴨'],
      ].map(([a, b]) => [findStationIndex(a), findStationIndex(b)].sort((x, y) => x - y).join(','))
    );

    // 「高さh・幅h*ASPECT」のボタンを全駅に置いたとき重なりが出ないかを判定
    const countOverlaps = (h) => {
      const w = h * ASPECT;
      const pts = buildPoints(h);
      let overlaps = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (intentionalOverlapPairs.has(`${i},${j}`)) continue;
          const dx = Math.abs(pts[i].x - pts[j].x);
          const dy = Math.abs(pts[i].y - pts[j].y);
          if (w - dx > 0 && h - dy > 0) overlaps++;
        }
      }
      return overlaps;
    };

    // 二分探索で「重ならない最大の高さ」を求め、安全マージンとして少しだけ控える
    const hMaxByWidth = (width / 2 - sideMargin) / (ASPECT * (1 - OVERLAP_FRACTION));
    const hMaxByHeight = (height - topMargin - bottomMargin) / 2 / ((TIGHT_FACTOR * STRAIGHT_GAPS) / 2 + Y_GAP_RATIO);
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
    // 輪の内側の横幅は狭い(ボタン幅の約1/3)ので、中央線の駅は中央の縦軸に小さめのボタンで並べる
    const CHUO_COLOR = 0xf15a22;
    const shinjuku = points[findStationIndex('新宿')];
    const kanda = points[findStationIndex('神田')];
    const chuoMidY = (shinjuku.y + kanda.y) / 2;
    const chuoBtnH = buttonHeight;
    const chuoPoints = CHUO_STATIONS.map((_, i) => ({
      x: centerX,
      y: chuoMidY + (i - (CHUO_STATIONS.length - 1) / 2) * (chuoBtnH * 1.3),
    }));
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

    // 中央線の駅は輪の内側に収まる小さめのオレンジ枠ボタン(名前上・⭐N下の2段)
    const chuoBtnW = Math.min(buttonWidth / 3 - 4, 110);
    CHUO_STATIONS.forEach((station, i) => {
      const { x: bx, y: by } = chuoPoints[i];
      const bg = drawRoundedButton(this, bx, by, chuoBtnW, chuoBtnH, { strokeColor: CHUO_COLOR, strokeWidth: 3 });
      const nameText = this.add
        .text(bx, by - 8, station.name, { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#000' })
        .setDepth(2)
        .setOrigin(0.5);
      if (nameText.width > chuoBtnW - 10) {
        nameText.setScale((chuoBtnW - 10) / nameText.width);
      }
      this.add
        .text(bx, by + 10, `⭐${station.rank + 1}`, { fontFamily: FONT_FAMILY, fontSize: '10px', color: '#e08a00' })
        .setDepth(2)
        .setOrigin(0.5);
      bg.on('pointerdown', () => this.scene.start('StationScene', { name: station.name, rank: station.rank }));
      bg.on('pointerover', () => bg.setFillStyle(BUTTON_FILL_HOVER));
      bg.on('pointerout', () => bg.setFillStyle(BUTTON_FILL));
    });
  }
}
