import Phaser from 'phaser';
import { STATIONS, CHUO_STATIONS } from '../stations.js';
import { buildStationPositions } from '../layout.js';
import { buildBoard, stepForward, stepBackward, getCell } from '../board.js';
import { buildProperties, stationIncome, isMonopoly, totalPropertyValue } from '../properties.js';
import { CARD_DEFS, drawRandomCard } from '../cards.js';
import { drawRoundedButton, BUTTON_FILL, BUTTON_FILL_HOVER, ACCENT_STROKE } from '../ui.js';
import { SFX } from '../sfx.js';
import { saveGame, SAVE_SLOT_COUNT, AUTOSAVE_SLOT, slotSummary, hasSave, downloadSave, uploadSaveToSlot } from '../save.js';

const FONT_FAMILY = '"Kosugi Maru", sans-serif';
const STARTING_CASH = 3000;
const SMALL_CELL_COLOR = { blue: 0x4477ff, red: 0xdd4444, card: 0xffcc33 };
const TOKEN_OFFSETS = [
  { x: 0, y: 0 },
  { x: 14, y: 0 },
  { x: 0, y: 14 },
  { x: 14, y: 14 },
];
// 「はやさ」レベル(1〜10)ごとの基準となる待ち時間(秒)。数字が小さいほど短い(はやい)。
const STEP_SECONDS_TABLE = [0.2, 0.28, 0.36, 0.45, 0.55, 0.68, 0.82, 1.0, 1.2, 1.5];
// マス移動アニメ(1マスごとの駒の見た目の進み)だけは、他の待ちより速く進める倍率
const MOVE_STEP_TICKS = 0.4;

export class GameBoardScene extends Phaser.Scene {
  constructor() {
    super('GameBoardScene');
  }

  create(data = {}) {
    const width = this.scale.width;
    const height = this.scale.height;
    this.layout = buildStationPositions(width, height);
    // 駅名の文字にコマが重ならないよう、ボタン中央ではなく左寄りに置く
    this.tokenBaseOffsetX = -this.layout.buttonWidth * 0.28;

    this.sfx = this.registry.get('sfx');
    if (!this.sfx) {
      this.sfx = new SFX();
      this.registry.set('sfx', this.sfx);
    }
    this.sfx.playTheme();
    this.events.once('shutdown', () => this.sfx.stopTheme());

    // ゲーム内の各種待ち時間(移動アニメ・ターン間の間など)の速さ。1〜10段階、初期値5
    // stepMs = 1マス分の移動アニメにかける実時間(ミリ秒)。数字が小さいほど短い(はやい)。
    this.speedLevel = this.registry.get('speedLevel') ?? 5;
    this.stepMs = STEP_SECONDS_TABLE[this.speedLevel - 1] * 1000;

    let startMessage = 'たびの はじまり! めざせ 総資産1位!';
    if (data.loadData) {
      this.loadFromSaveData(data.loadData);
      startMessage = 'つづきから さいかい!';
    } else {
      this.setupNewGame(data);
    }

    this.drawBoard();
    this.drawHud();
    this.playerTokens = this.players.map((p) => this.createToken(p));
    this.log(startMessage);
    this.updateHud();
    this.refreshTurnUI();
  }

  setupNewGame(data) {
    this.years = data.years ?? 5;
    this.board = buildBoard();
    this.properties = buildProperties();

    // 4人の初期位置は盤面上で均等に離しつつ、始点はゲームのたびにランダムにする
    const n = STATIONS.length;
    const startOffset = Math.floor(Math.random() * n);
    const startStationIdx = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75)].map((i) => (i + startOffset) % n);
    const startCells = startStationIdx.map((i) => this.board.stationCellIndex[i]);

    this.players = [
      { id: 'you', name: 'あなた', emoji: '🐶', color: 0x4477ff, isCPU: false, cash: STARTING_CASH, pos: { onChuo: false, index: startCells[0] }, cards: [] },
      { id: 'cpu1', name: 'CPU1', emoji: '🐱', color: 0xff6666, isCPU: true, cash: STARTING_CASH, pos: { onChuo: false, index: startCells[1] }, cards: [] },
      { id: 'cpu2', name: 'CPU2', emoji: '🐰', color: 0x55bb55, isCPU: true, cash: STARTING_CASH, pos: { onChuo: false, index: startCells[2] }, cards: [] },
      { id: 'cpu3', name: 'CPU3', emoji: '🐻', color: 0xbb77ee, isCPU: true, cash: STARTING_CASH, pos: { onChuo: false, index: startCells[3] }, cards: [] },
    ];
    this.currentPlayerIndex = 0;
    this.month = 1;
    this.year = 1;
    this.gameOver = false;
    this.turnMoved = false;
    this.noranekoOwnerId = null;
    this.targetStationIndex = this.pickNewTarget();
  }

  loadFromSaveData(saveData) {
    this.years = saveData.years;
    this.board = saveData.board;
    this.properties = saveData.properties;
    this.players = saveData.players;
    this.currentPlayerIndex = saveData.currentPlayerIndex;
    this.month = saveData.month;
    this.year = saveData.year;
    this.gameOver = saveData.gameOver;
    this.turnMoved = saveData.turnMoved;
    this.noranekoOwnerId = saveData.noranekoOwnerId;
    this.targetStationIndex = saveData.targetStationIndex;
  }

  buildSaveData() {
    return {
      years: this.years,
      board: this.board,
      properties: this.properties,
      players: this.players,
      currentPlayerIndex: this.currentPlayerIndex,
      month: this.month,
      year: this.year,
      gameOver: this.gameOver,
      turnMoved: this.turnMoved,
      noranekoOwnerId: this.noranekoOwnerId,
      targetStationIndex: this.targetStationIndex,
    };
  }

  // ---------- 盤面の見た目 ----------

  drawBoard() {
    const { points, chuoPoints, buttonWidth, buttonHeight, centerX } = this.layout;

    const routeLine = this.add.graphics();
    routeLine.lineStyle(6, 0x9acd32, 1);
    routeLine.beginPath();
    points.forEach((p, i) => (i === 0 ? routeLine.moveTo(p.x, p.y) : routeLine.lineTo(p.x, p.y)));
    routeLine.closePath();
    routeLine.strokePath();

    const shinjuku = points[STATIONS.findIndex((s) => s.name === '新宿')];
    const kanda = points[STATIONS.findIndex((s) => s.name === '神田')];
    const chuoLine = this.add.graphics();
    chuoLine.lineStyle(6, 0xf15a22, 1);
    chuoLine.beginPath();
    chuoLine.moveTo(shinjuku.x, shinjuku.y);
    chuoLine.lineTo(chuoPoints[0].x, chuoPoints[0].y);
    chuoLine.lineTo(chuoPoints[1].x, chuoPoints[1].y);
    chuoLine.lineTo(kanda.x, kanda.y);
    chuoLine.strokePath();

    // 小マス(メインループ)。路線の色に埋もれて見えにくいので、四角にして駅名より
    // 外側(右の列なら右、左の列なら左)にずらす
    const SMALL_CELL_SIZE = 20;
    const SMALL_CELL_OFFSET = 40;
    const outwardOffsetX = (x) => (x >= centerX ? SMALL_CELL_OFFSET : -SMALL_CELL_OFFSET);
    this.smallCellDots = {};
    this.board.mainLoop.forEach((cell, idx) => {
      if (cell.type === 'station') return;
      const pos = this.smallCellPixelPos(idx);
      const dot = this.add
        .rectangle(pos.x + outwardOffsetX(pos.x), pos.y, SMALL_CELL_SIZE, SMALL_CELL_SIZE, SMALL_CELL_COLOR[cell.type])
        .setStrokeStyle(2, 0x000000)
        .setDepth(1);
      this.smallCellDots[`main-${idx}`] = dot;
    });
    // 小マス(中央線)。新宿-四ツ谷間(idx0)と御茶ノ水-神田間(idx4)は本線との
    // 継ぎ目そのものなので、ずらさずちょうど繋ぎ目の位置に置く
    this.board.chuoPath.forEach((cell, idx) => {
      if (cell.type === 'station') return;
      const pos = this.chuoCellPixelPos(idx);
      const isJoint = idx === 0 || idx === 4;
      const dot = this.add
        .rectangle(pos.x + (isJoint ? 0 : outwardOffsetX(pos.x)), pos.y, SMALL_CELL_SIZE, SMALL_CELL_SIZE, SMALL_CELL_COLOR[cell.type])
        .setStrokeStyle(2, 0x000000)
        .setDepth(1);
      this.smallCellDots[`chuo-${idx}`] = dot;
    });

    // 駅ボタン
    this.stationButtons = {};
    STATIONS.forEach((station, i) => {
      const p = points[i];
      const bg = drawRoundedButton(this, p.x, p.y, buttonWidth, buttonHeight, { strokeWidth: 2 });
      const nameText = this.add
        .text(p.x, p.y, station.name, { fontFamily: FONT_FAMILY, fontSize: buttonHeight < 45 ? '16px' : '22px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(2);
      if (nameText.width > buttonWidth * 0.9) nameText.setScale((buttonWidth * 0.9) / nameText.width);
      bg.on('pointerdown', () => this.logStationProperties(i));
      this.stationButtons[i] = { bg, nameText };
    });
    CHUO_STATIONS.forEach((station, i) => {
      const p = chuoPoints[i];
      const bg = drawRoundedButton(this, p.x, p.y, buttonWidth, buttonHeight, { strokeColor: 0xf15a22, strokeWidth: 3 });
      const nameText = this.add
        .text(p.x, p.y, station.name, { fontFamily: FONT_FAMILY, fontSize: buttonHeight < 45 ? '16px' : '22px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(2);
      if (nameText.width > buttonWidth * 0.9) nameText.setScale((buttonWidth * 0.9) / nameText.width);
      this.stationButtons[`chuo-${i}`] = { bg, nameText };
    });

    this.targetMarker = this.add.text(0, 0, '🎯', { fontSize: '26px' }).setOrigin(0.5).setDepth(5).setVisible(false);
  }

  smallCellPixelPos(mainLoopIdx) {
    const { points } = this.layout;
    const len = this.board.mainLoop.length;
    const prev = this.board.mainLoop[(mainLoopIdx - 1 + len) % len];
    const next = this.board.mainLoop[(mainLoopIdx + 1) % len];
    const p1 = points[prev.stationIndex];
    const p2 = points[next.stationIndex];
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  chuoCellPixelPos(chuoIdx) {
    const { points, chuoPoints } = this.layout;
    const shinjuku = points[STATIONS.findIndex((s) => s.name === '新宿')];
    const kanda = points[STATIONS.findIndex((s) => s.name === '神田')];
    const anchors = [shinjuku, chuoPoints[0], chuoPoints[1], kanda];
    // chuoPath: [small0, station(四ツ谷), small1, station(御茶ノ水), small2]
    if (chuoIdx === 0) return mid(anchors[0], anchors[1]);
    if (chuoIdx === 2) return mid(anchors[1], anchors[2]);
    if (chuoIdx === 4) return mid(anchors[2], anchors[3]);
    return anchors[1];
    function mid(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  cellPixelPos(pos) {
    if (!pos.onChuo) {
      const cell = this.board.mainLoop[pos.index];
      if (cell.type === 'station') return this.layout.points[cell.stationIndex];
      return this.smallCellPixelPos(pos.index);
    }
    const cell = this.board.chuoPath[pos.index];
    if (cell.type === 'station') return this.layout.chuoPoints[cell.chuoIndex];
    return this.chuoCellPixelPos(pos.index);
  }

  createToken(player) {
    const pos = this.cellPixelPos(player.pos);
    const bx = pos.x + this.tokenBaseOffsetX;
    let ring = null;
    if (!player.isCPU) {
      // 自分の駒だけ、下に光る輪をつけてひと目でわかるようにする
      ring = this.add.circle(bx, pos.y, 22, 0xffee00, 0.35).setStrokeStyle(3, 0xff9900, 0.9).setDepth(5);
      this.tweens.add({
        targets: ring,
        scale: 1.35,
        alpha: 0.15,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    const circle = this.add.circle(bx, pos.y, 14, player.color).setStrokeStyle(2, 0x000000).setDepth(6);
    const label = this.add.text(bx, pos.y, player.emoji, { fontSize: '48px' }).setOrigin(0.5).setDepth(7);
    return { circle, label, ring };
  }

  moveTokenTo(playerIdx, pos, offset = { x: 0, y: 0 }) {
    const token = this.playerTokens[playerIdx];
    const p = this.cellPixelPos(pos);
    const bx = p.x + this.tokenBaseOffsetX;
    token.circle.setPosition(bx + offset.x, p.y + offset.y);
    token.label.setPosition(bx + offset.x, p.y + offset.y);
    if (token.ring) token.ring.setPosition(bx + offset.x, p.y + offset.y);
  }

  refreshTokenPositions() {
    // 同じマスに複数人いる場合は少しずらして重ならないようにする
    const groups = new Map();
    this.players.forEach((p, i) => {
      const key = `${p.pos.onChuo}-${p.pos.index}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    groups.forEach((indices) => {
      indices.forEach((i, k) => this.moveTokenTo(i, this.players[i].pos, TOKEN_OFFSETS[k] || TOKEN_OFFSETS[0]));
    });
  }

  updateTargetMarker() {
    // 前の目的地の駅は色を戻し、新しい目的地は派手な色にして目立たせる
    if (this.currentTargetButtonIdx !== undefined && this.currentTargetButtonIdx !== this.targetStationIndex) {
      const prevBtn = this.stationButtons[this.currentTargetButtonIdx];
      if (prevBtn) prevBtn.bg.setFillStyle(BUTTON_FILL);
    }
    const btn = this.stationButtons[this.targetStationIndex];
    if (btn) btn.bg.setFillStyle(0xff7043);
    this.currentTargetButtonIdx = this.targetStationIndex;

    // 駅間隔が狭い場所でも隣の駅と重ならないよう、ボタン右上の小バッジ位置に出す(サイコロと色がかぶらないよう内側寄りに)
    const p = this.layout.points[this.targetStationIndex];
    const x = p.x + this.layout.buttonWidth / 2 - 16;
    const y = p.y - this.layout.buttonHeight / 2 + 2;
    this.targetMarker.setPosition(x, y).setVisible(true);

    if (this.targetMarkerTween) this.targetMarkerTween.stop();
    this.targetMarker.setScale(1);
    this.targetMarkerTween = this.tweens.add({
      targets: this.targetMarker,
      scale: 1.35,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ---------- HUD ----------

  drawHud() {
    const width = this.scale.width;
    const height = this.scale.height;
    this.add.text(width / 2, 8, '山手線電鉄', { fontFamily: FONT_FAMILY, fontSize: '32px', color: '#000' }).setOrigin(0.5, 0);
    this.dateText = this.add.text(width / 2, 48, '', { fontFamily: FONT_FAMILY, fontSize: '22px', color: '#333' }).setOrigin(0.5, 0);

    // 盤面中央、四ツ谷/御茶ノ水の上にプレイヤー一覧、下にサイコロを配置する
    const { points, chuoPoints, buttonHeight, centerX } = this.layout;
    const sugamoIdx = STATIONS.findIndex((s) => s.name === '巣鴨');
    const tabataIdx = STATIONS.findIndex((s) => s.name === '田端');
    const osakiIdx = STATIONS.findIndex((s) => s.name === '大崎');
    const takanawaIdx = STATIONS.findIndex((s) => s.name === '高輪ゲートウェイ');
    const gotandaIdx = STATIONS.findIndex((s) => s.name === '五反田');
    const tamachiIdx = STATIONS.findIndex((s) => s.name === '田町');
    const topBandBottom = Math.min(points[sugamoIdx].y, points[tabataIdx].y) + buttonHeight / 2;
    const chuoTop = Math.min(chuoPoints[0].y, chuoPoints[1].y) - buttonHeight / 2;
    const chuoBottom = Math.max(chuoPoints[0].y, chuoPoints[1].y) + buttonHeight / 2;
    const bottomBandTop = Math.max(points[osakiIdx].y, points[takanawaIdx].y) - buttonHeight / 2;
    const logY = Math.min(points[gotandaIdx].y, points[tamachiIdx].y) - 10;

    const rowH = 30;
    const listH = this.players.length * rowH;
    const topBandH = chuoTop - topBandBottom;
    // プレイヤー一覧+サイコロのまとまりを、中央揃えよりも少し上寄りに配置する
    const UP_SHIFT = 36;
    const listTop = topBandBottom + (topBandH - listH) / 2 - UP_SHIFT;

    // 手番は一覧の▶マークで示すので、別枠の「〜の番!」表示は出さない
    this.playerCashTexts = this.players.map((p, i) =>
      this.add
        .text(centerX, listTop + i * rowH, '', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000' })
        .setOrigin(0.5, 0)
    );

    // 五反田・田町の高さ(=大崎/高輪ゲートウェイのひとつ上の行)、盤面中央の空きスペースにメッセージ表示欄を置く。
    // 下端をそろえたまま、長いメッセージは複数行に折り返して上に伸びるようにする。
    this.logText = this.add
      .text(centerX, logY, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '17px',
        color: '#444',
        align: 'center',
        wordWrap: { width: 380, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 1);

    // サイコロボタンはプレイヤー一覧のすぐ下(四ツ谷/御茶ノ水より上)に置き、
    // 駅ボタンと見分けがつくよう金色のピル型+パルス演出で目立たせる
    const listBottom = listTop + listH;
    const diceGap = chuoTop - listBottom;
    const diceH = Phaser.Math.Clamp(diceGap - 16, 32, 48);
    const diceY = listBottom + diceGap / 2;
    this.rollButton = drawRoundedButton(this, centerX, diceY, 200, diceH, {
      depth: 5,
      fillColor: 0x4fc3f7,
      strokeColor: 0x0277bd,
      strokeWidth: 4,
      radius: diceH / 2,
    });
    this.rollButtonText = this.add
      .text(centerX, diceY, '🎲 サイコロ', { fontFamily: FONT_FAMILY, fontSize: '22px', color: '#003a5c', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(7);
    this.tweens.add({
      targets: this.rollButtonText,
      scale: 1.1,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.rollButton.on('pointerdown', () => this.onRollClicked());
    this.rollButton.on('pointerover', () => this.rollButton.setFillStyle(0x81d4fa));
    this.rollButton.on('pointerout', () => this.rollButton.setFillStyle(0x4fc3f7));
    this.diceY = diceY;
    this.diceH = diceH;
    this.centerX = centerX;
    this.bottomBandTop = bottomBandTop;
    this.chuoBottom = chuoBottom;

    // 右上に「音を消す」「セーブ」「はやさ」を横並びで大きめに表示する
    const topRowY = 10;
    const topRowFontSize = '18px';

    // 左上にも「タイトルへ」ボタン(セーブボタンと同じ、セーブ/タイトル画面を開く)
    this.titleShortcutText = this.add
      .text(16, topRowY, '🏠 タイトルへ', { fontFamily: FONT_FAMILY, fontSize: topRowFontSize, color: '#555' })
      .setOrigin(0, 0)
      .setDepth(7)
      .setInteractive({ useHandCursor: true });
    this.titleShortcutText.on('pointerdown', () => this.openSaveModal());

    this.speedText = this.add
      .text(0, topRowY, `⏱ はやさ:${this.speedLevel}`, { fontFamily: FONT_FAMILY, fontSize: topRowFontSize, color: '#555' })
      .setOrigin(0, 0)
      .setDepth(7)
      .setInteractive({ useHandCursor: true });
    this.speedText.on('pointerdown', () => this.openSpeedModal());

    this.saveText = this.add
      .text(0, topRowY, '💾 セーブ', { fontFamily: FONT_FAMILY, fontSize: topRowFontSize, color: '#555' })
      .setOrigin(0, 0)
      .setDepth(7)
      .setInteractive({ useHandCursor: true });
    this.saveText.on('pointerdown', () => this.openSaveModal());

    this.muteText = this.add
      .text(0, topRowY, this.sfx.muted ? '🔇 音を出す' : '🔊 音を消す', {
        fontFamily: FONT_FAMILY,
        fontSize: topRowFontSize,
        color: '#555',
      })
      .setOrigin(0, 0)
      .setDepth(7)
      .setInteractive({ useHandCursor: true });
    this.muteText.on('pointerdown', () => {
      const muted = this.sfx.toggleMute();
      this.muteText.setText(muted ? '🔇 音を出す' : '🔊 音を消す');
      layoutTopRow();
    });

    const layoutTopRow = () => {
      const gap = 24;
      let x = width - 16;
      [this.muteText, this.saveText, this.speedText].forEach((t) => {
        x -= t.width;
        t.setPosition(x, topRowY);
        x -= gap;
      });
    };
    layoutTopRow();

    this.handContainer = [];
  }

  updateHud() {
    this.dateText.setText(`${this.year}年目 ${this.month}月 / ぜんぶで${this.years}年 目的地: ${STATIONS[this.targetStationIndex].name}`);
    const currentPlayer = this.players[this.currentPlayerIndex];
    this.players.forEach((p, i) => {
      const noraneko = this.noranekoOwnerId === p.id ? ' 🐈' : '';
      const isTurn = p.id === currentPlayer.id;
      const prefix = isTurn ? '▶ ' : '　';
      this.playerCashTexts[i].setText(`${prefix}${p.emoji}${p.name}: ¥${p.cash}${noraneko}`);
      this.playerCashTexts[i].setColor(isTurn ? '#cc6600' : '#000');
      this.playerCashTexts[i].setFontStyle(isTurn ? 'bold' : 'normal');
    });
    this.updateTargetMarker();
    this.refreshTokenPositions();
  }

  log(msg) {
    this.recentLog = msg;
    this.logText.setText(`📢 ${msg}`);
  }

  // ticksは「1マス分の移動アニメ(stepMs秒)」を単位とした倍数。
  // 「はやさ」レベルはSTEP_SECONDS_TABLEで秒数を直接指定しているので、ここでは掛け算のみ行う。
  delay(ticks, cb) {
    return this.time.delayedCall(ticks * this.stepMs, cb);
  }

  // ---------- セーブ ----------

  openSaveModal() {
    const width = this.scale.width;
    const height = this.scale.height;
    const rowH = 42;
    const panelH = 140 + SAVE_SLOT_COUNT * rowH;
    const panelW = 500;
    const objs = [];
    const bg = this.add.rectangle(width / 2, height / 2, panelW, panelH, 0xffffff, 0.98).setStrokeStyle(3, ACCENT_STROKE).setDepth(40);
    objs.push(bg);
    objs.push(
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 24, 'どこにセーブする?(⬇書き出し/⬆読み込み)', { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(41)
    );
    // 行ごとに「セーブする」ボタン+ダウンロード⬇/アップロード⬆の小さいアイコンボタンを並べる
    const mainBtnX = width / 2 - 95;
    const downloadBtnX = width / 2 + 130;
    const uploadBtnX = width / 2 + 185;
    for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot++) {
      const by = height / 2 - panelH / 2 + 56 + (slot - 1) * rowH;
      const summary = slotSummary(slot);
      const label = summary
        ? `スロット${slot}: ${summary.year}年目${summary.month}月/${summary.years}年 ¥${summary.cash}`
        : `スロット${slot}: 空き`;
      const btn = drawRoundedButton(this, mainBtnX, by, 300, 36, { depth: 40 });
      const text = this.add.text(mainBtnX, by, label, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#000' }).setOrigin(0.5).setDepth(41);
      objs.push(btn.gfx, btn.zone, text);
      btn.on('pointerdown', () => {
        saveGame(slot, this.buildSaveData());
        this.sfx.click();
        this.log(`スロット${slot}に セーブしました!`);
        objs.forEach((o) => o.destroy());
      });
      btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
      btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));

      const canDownload = hasSave(slot);
      const dlBtn = drawRoundedButton(this, downloadBtnX, by, 44, 36, { depth: 40, fillColor: canDownload ? BUTTON_FILL : 0xe6e0d4 });
      const dlText = this.add
        .text(downloadBtnX, by, '⬇', { fontFamily: FONT_FAMILY, fontSize: '18px', color: canDownload ? '#000' : '#999' })
        .setOrigin(0.5)
        .setDepth(41);
      objs.push(dlBtn.gfx, dlBtn.zone, dlText);
      if (canDownload) {
        dlBtn.on('pointerdown', () => {
          this.sfx.click();
          downloadSave(slot);
          this.log(`スロット${slot}のセーブデータをダウンロードしました`);
        });
        dlBtn.on('pointerover', () => dlBtn.setFillStyle(BUTTON_FILL_HOVER));
        dlBtn.on('pointerout', () => dlBtn.setFillStyle(BUTTON_FILL));
      }

      const ulBtn = drawRoundedButton(this, uploadBtnX, by, 44, 36, { depth: 40 });
      const ulText = this.add.text(uploadBtnX, by, '⬆', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000' }).setOrigin(0.5).setDepth(41);
      objs.push(ulBtn.gfx, ulBtn.zone, ulText);
      ulBtn.on('pointerdown', () => {
        this.sfx.click();
        uploadSaveToSlot(slot, (ok) => {
          if (ok) {
            this.log(`スロット${slot}にファイルを読み込みました`);
          } else {
            this.log(`スロット${slot}への読み込みに失敗しました(ファイル形式を確認してください)`);
          }
          objs.forEach((o) => o.destroy());
          this.openSaveModal();
        });
      });
      ulBtn.on('pointerover', () => ulBtn.setFillStyle(BUTTON_FILL_HOVER));
      ulBtn.on('pointerout', () => ulBtn.setFillStyle(BUTTON_FILL));
    }
    const closeBtn = drawRoundedButton(this, width / 2 - 100, height / 2 + panelH / 2 - 26, 160, 36, { depth: 40 });
    const closeText = this.add.text(width / 2 - 100, height / 2 + panelH / 2 - 26, 'とじる', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#000' }).setOrigin(0.5).setDepth(41);
    objs.push(closeBtn.gfx, closeBtn.zone, closeText);
    closeBtn.on('pointerdown', () => {
      this.sfx.click();
      objs.forEach((o) => o.destroy());
    });
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(BUTTON_FILL_HOVER));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(BUTTON_FILL));

    const titleBtn = drawRoundedButton(this, width / 2 + 100, height / 2 + panelH / 2 - 26, 220, 36, { depth: 40 });
    const titleText = this.add
      .text(width / 2 + 100, height / 2 + panelH / 2 - 26, 'セーブしないでタイトルへ', { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#000' })
      .setOrigin(0.5)
      .setDepth(41);
    objs.push(titleBtn.gfx, titleBtn.zone, titleText);
    titleBtn.on('pointerdown', () => {
      this.sfx.click();
      objs.forEach((o) => o.destroy());
      this.scene.start('TitleScene');
    });
    titleBtn.on('pointerover', () => titleBtn.setFillStyle(BUTTON_FILL_HOVER));
    titleBtn.on('pointerout', () => titleBtn.setFillStyle(BUTTON_FILL));
  }

  openSpeedModal() {
    const width = this.scale.width;
    const height = this.scale.height;
    const cols = 5;
    const rows = 2;
    const cellW = 76;
    const cellH = 62;
    const panelW = cols * cellW + 40;
    const panelH = 130 + rows * cellH;
    const objs = [];
    const bg = this.add.rectangle(width / 2, height / 2, panelW, panelH, 0xffffff, 0.98).setStrokeStyle(3, ACCENT_STROKE).setDepth(40);
    objs.push(bg);
    objs.push(
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 26, 'はやさを えらんでね(1〜10)', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(41)
    );
    objs.push(
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 54, '数字が小さいほど、1マス分の移動が早く(短い秒数で)おわります', {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          color: '#777',
        })
        .setOrigin(0.5)
        .setDepth(41)
    );
    const gridTop = height / 2 - panelH / 2 + 90;
    const gridLeft = width / 2 - (cols * cellW) / 2 + cellW / 2;
    for (let level = 1; level <= 10; level++) {
      const col = (level - 1) % cols;
      const row = Math.floor((level - 1) / cols);
      const bx = gridLeft + col * cellW;
      const by = gridTop + row * cellH;
      const isCurrent = level === this.speedLevel;
      const btn = drawRoundedButton(this, bx, by, cellW - 10, cellH - 10, {
        strokeColor: isCurrent ? ACCENT_STROKE : undefined,
        strokeWidth: isCurrent ? 4 : 2,
      });
      const text = this.add
        .text(bx, by - 10, `${level}`, { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(41);
      const secText = this.add
        .text(bx, by + 14, `${STEP_SECONDS_TABLE[level - 1].toFixed(2)}秒`, { fontFamily: FONT_FAMILY, fontSize: '11px', color: '#777' })
        .setOrigin(0.5)
        .setDepth(41);
      objs.push(btn.gfx, btn.zone, text, secText);
      btn.on('pointerdown', () => {
        this.speedLevel = level;
        this.stepMs = STEP_SECONDS_TABLE[level - 1] * 1000;
        this.registry.set('speedLevel', level);
        this.speedText.setText(`⏱ はやさ:${level}`);
        this.sfx.click();
        objs.forEach((o) => o.destroy());
      });
      btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
      btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));
    }
    const closeBtn = drawRoundedButton(this, width / 2, height / 2 + panelH / 2 - 26, 140, 36, { depth: 40 });
    const closeText = this.add.text(width / 2, height / 2 + panelH / 2 - 26, 'とじる', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#000' }).setOrigin(0.5).setDepth(41);
    objs.push(closeBtn.gfx, closeBtn.zone, closeText);
    closeBtn.on('pointerdown', () => {
      this.sfx.click();
      objs.forEach((o) => o.destroy());
    });
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(BUTTON_FILL_HOVER));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(BUTTON_FILL));
  }

  refreshTurnUI() {
    this.destroyHand();
    const player = this.players[this.currentPlayerIndex];
    this.checkTargetAtTurnStart(player);
    this.updateHud();
    const isHuman = !player.isCPU;
    this.rollButton.setVisible(isHuman && !this.turnMoved && !this.gameOver);
    if (isHuman && !this.gameOver) this.renderHand(player);
    if (!isHuman && !this.gameOver) {
      this.delay(3, () => this.cpuTakeTurn());
    }
  }

  destroyHand() {
    this.handContainer.forEach((o) => o.destroy());
    this.handContainer = [];
  }

  renderHand(player) {
    const centerX = this.centerX;
    const labelY = this.chuoBottom + 24;
    const y = labelY + 50;
    if (player.cards.length === 0) {
      const t = this.add
        .text(centerX, labelY, 'てもち カード: なし', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#777' })
        .setOrigin(0.5, 0)
        .setDepth(5);
      this.handContainer.push(t);
      return;
    }
    const label = this.add
      .text(centerX, labelY, 'てもちカード(クリックでつかう):', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#555' })
      .setOrigin(0.5, 0)
      .setDepth(5);
    this.handContainer.push(label);
    const cardW = 130;
    const totalW = player.cards.length * cardW + (player.cards.length - 1) * 8;
    const startX = centerX - totalW / 2 + cardW / 2;
    player.cards.forEach((cardId, i) => {
      const def = CARD_DEFS[cardId];
      const bx = startX + i * (cardW + 8);
      const btn = drawRoundedButton(this, bx, y, cardW, 40, { depth: 5 });
      const text = this.add
        .text(bx, y, def.name, { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(7);
      btn.on('pointerdown', () => this.useCard(this.currentPlayerIndex, i));
      btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
      btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));
      this.handContainer.push(btn.gfx, btn.zone, text);
    });
  }

  // ---------- ターン進行 ----------

  onRollClicked() {
    if (this.turnMoved || this.gameOver) return;
    const player = this.players[this.currentPlayerIndex];
    this.rollAndChooseMove(player, 1);
  }

  // サイコロをふって、進める方向(反時計回り/時計回り/分岐点なら中央線)を選ばせる。
  // 常にサイコロの出目ぶん進みきる(反時計回りだけでなく時計回りにも進める)。
  rollAndChooseMove(player, diceCount) {
    let steps = 0;
    for (let i = 0; i < diceCount; i++) steps += 1 + Math.floor(Math.random() * 6);
    this.sfx.diceRoll();
    this.turnMoved = true;
    this.rollButton.setVisible(false);
    this.log(`${player.name}は サイコロ${diceCount}個で ${steps}マス すすむ!`);

    const options = this.computeDirectionOptions(player, steps);
    if (player.isCPU) {
      this.beginMove(player, this.cpuChooseOption(options));
    } else {
      this.showMoveChoiceModal(player, options, diceCount, steps);
    }
  }

  isTargetPos(pos) {
    if (pos.onChuo) return false;
    return pos.index === this.board.stationCellIndex[this.targetStationIndex];
  }

  cellLabel(cell) {
    if (cell.type === 'station') {
      const name = cell.stationIndex !== undefined ? STATIONS[cell.stationIndex].name : CHUO_STATIONS[cell.chuoIndex].name;
      return `🚉${name}`;
    }
    // マス(駅ではない)は色つきの丸アイコンをつけて駅名と見分けやすくする
    if (cell.type === 'blue') return '🔵青マス';
    if (cell.type === 'red') return '🔴赤マス';
    if (cell.type === 'card') return '🟡カードマス';
    return '';
  }

  simulatePath(startPos, totalSteps, stepFn, shortcutAtStep) {
    let pos = { ...startPos };
    for (let s = 1; s <= totalSteps; s++) {
      pos = stepFn(this.board, pos, s === shortcutAtStep);
    }
    return pos;
  }

  // fromPos→toPosの画面上の向きから、対応する矢印キーを求める
  // (盤面はループなので、反時計回り/時計回りが上下左右のどれに対応するかは
  // 場所によって変わる。駒込や品川のような区間では左右になる)。
  arrowKeyForStep(fromPos, toPos) {
    const p0 = this.cellPixelPos(fromPos);
    const p1 = this.cellPixelPos(toPos);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    return dy > 0 ? 'ArrowDown' : 'ArrowUp';
  }

  // 現在地から出目ぶん進んだ先を、反時計回り/時計回り/中央線の方向ぶん計算する。
  // 中央線は、いま乗っている駅が新宿/神田そのものの場合だけでなく、その方向に
  // 進む途中で新宿/神田を通過する場合も分岐先として選べるようにする。
  computeDirectionOptions(player, totalSteps) {
    // すでに中央線に乗っている場合は、専用のロジックで新宿方面/神田方面の
    // 2方向(それぞれ本線に抜けた先で反時計回り/時計回りに枝分かれ)を計算する。
    if (player.pos.onChuo) {
      return this.computeChuoDirectionOptions(player.pos, totalSteps);
    }

    const options = [];

    const ccwFirstStep = stepForward(this.board, player.pos, false);
    const ccwPos = this.simulatePath(player.pos, totalSteps, stepForward, null);
    options.push({
      direction: 'ccw',
      label: `反時計回り: ${this.cellLabel(getCell(this.board, ccwPos))}`,
      steps: totalSteps,
      pos: ccwPos,
      shortcutAtStep: null,
      stepFn: 'forward',
      key: this.arrowKeyForStep(player.pos, ccwFirstStep),
    });

    const cwFirstStep = stepBackward(this.board, player.pos, false);
    const cwPos = this.simulatePath(player.pos, totalSteps, stepBackward, null);
    options.push({
      direction: 'cw',
      label: `時計回り: ${this.cellLabel(getCell(this.board, cwPos))}`,
      steps: totalSteps,
      pos: cwPos,
      shortcutAtStep: null,
      stepFn: 'backward',
      key: this.arrowKeyForStep(player.pos, cwFirstStep),
    });

    // 中央線は新宿・神田どちら側からでも、反時計回り/時計回りどちらの進行中でも
    // 通りがかれば入れる。ただし「今まさに分岐点に乗っている」場合は進行方向に
    // 関係なく同じ1つの分岐なので、二重に出さないようここだけ特別扱いする。
    const usedKeys = new Set(options.map((o) => o.key));
    const junctions = [this.board.shinjukuCellIndex, this.board.kandaCellIndex];
    if (!player.pos.onChuo && junctions.includes(player.pos.index)) {
      const chuoOpt = this.chuoEntryHereOption(player.pos, totalSteps, usedKeys);
      if (chuoOpt) options.push(chuoOpt);
    } else {
      [
        { stepFn: stepForward, stepFnName: 'forward' },
        { stepFn: stepBackward, stepFnName: 'backward' },
      ].forEach(({ stepFn, stepFnName }) => {
        junctions.forEach((junctionCellIndex) => {
          const chuoOpt = this.findChuoBranchPassThrough(player.pos, totalSteps, stepFn, junctionCellIndex, stepFnName, usedKeys);
          if (chuoOpt) {
            options.push(chuoOpt);
            usedKeys.add(chuoOpt.key);
          }
        });
      });
    }

    return options;
  }

  // 今まさに新宿/神田のセルに乗っている場合の中央線オプション(進行方向を問わず1つだけ)
  chuoEntryHereOption(startPos, totalSteps, usedKeys) {
    const chuoPos = this.simulatePath(startPos, totalSteps, stepForward, 1);
    const chuoEntryPos = stepForward(this.board, startPos, true);
    let key = this.arrowKeyForStep(startPos, chuoEntryPos);
    if (usedKeys && usedKeys.has(key)) {
      const fallback = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].find((k) => !usedKeys.has(k));
      key = fallback || key;
    }
    return {
      direction: 'chuo',
      label: `🚃中央線へ: ${this.cellLabel(getCell(this.board, chuoPos))}`,
      steps: totalSteps,
      pos: chuoPos,
      shortcutAtStep: 1,
      stepFn: 'forward',
      key,
    };
  }

  // startPosからstepFn方向にtotalStepsぶん進む「途中で」junctionCellIndex(新宿 or 神田)を
  // 通るなら、そこで中央線に入った場合の行き先を返す。通らないならnull。
  // (startPos自体が分岐点の場合はchuoEntryHereOptionで扱うのでここでは対象外)
  findChuoBranchPassThrough(startPos, totalSteps, stepFn, junctionCellIndex, stepFnName, usedKeys) {
    let pos = { ...startPos };
    for (let s = 1; s < totalSteps; s++) {
      pos = stepFn(this.board, pos, false);
      if (!pos.onChuo && pos.index === junctionCellIndex) {
        const chuoPos = this.simulatePath(startPos, totalSteps, stepFn, s + 1);
        const junctionPos = { onChuo: false, index: junctionCellIndex };
        const chuoEntryPos = stepFn(this.board, junctionPos, true);
        let key = this.arrowKeyForStep(junctionPos, chuoEntryPos);
        if (usedKeys && usedKeys.has(key)) {
          const fallback = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].find((k) => !usedKeys.has(k));
          key = fallback || key;
        }
        return {
          direction: 'chuo',
          label: `🚃中央線へ: ${this.cellLabel(getCell(this.board, chuoPos))}`,
          steps: totalSteps,
          pos: chuoPos,
          shortcutAtStep: s + 1,
          stepFn: stepFnName,
          key,
        };
      }
    }
    return null;
  }

  // すでに中央線上にいる時の移動先を計算する。新宿方面/神田方面の2方向があり、
  // それぞれ「本線に抜けるのに足りるか」で結果が変わる:
  //  - 足りない/ちょうど: 中央線内(または抜けた駅)に1通りだけ着地
  //  - 余りが出る: 抜けた先で反時計回り/時計回りに枝分かれし2通りになる
  // キーは各方向の「実際に画面上でどちらに進むか」から決める(近い/遠いの
  // 固定割り当てだと、見た目の向きと矢印キーがズレることがあるため)。
  computeChuoDirectionOptions(startPos, totalSteps) {
    const chuoLen = this.board.chuoPath.length;
    const towardShinjukuSteps = startPos.index + 1;
    const towardKandaSteps = chuoLen - startPos.index;

    const usedKeys = new Set();
    const options = [];
    this.pushChuoBranchOptions(
      this.resolveChuoBranch(startPos, totalSteps, towardShinjukuSteps, -1, this.board.shinjukuCellIndex, '新宿方面', usedKeys),
      options,
      usedKeys
    );
    this.pushChuoBranchOptions(
      this.resolveChuoBranch(startPos, totalSteps, towardKandaSteps, 1, this.board.kandaCellIndex, '神田方面', usedKeys),
      options,
      usedKeys
    );
    return options;
  }

  // 中央線上のstartPosからchuoDir方向(新宿方面なら-1、神田方面なら+1)に進んだ結果。
  // 出口(exitSteps)に届かなければ中央線内に1通り、届いてちょうどなら出口駅に1通り、
  // 余りが出るなら出口から反時計回り/時計回りに進む2通りを返す。キーはその都度
  // 実際の1歩目の画面上の向きから決める。
  resolveChuoBranch(startPos, totalSteps, exitSteps, chuoDir, exitCellIndex, label, usedKeys) {
    if (totalSteps <= exitSteps) {
      const pos =
        totalSteps === exitSteps
          ? { onChuo: false, index: exitCellIndex }
          : { onChuo: true, index: startPos.index + chuoDir * totalSteps, chuoDir };
      const firstStepPos =
        startPos.index + chuoDir < 0 || startPos.index + chuoDir >= this.board.chuoPath.length
          ? { onChuo: false, index: exitCellIndex }
          : { onChuo: true, index: startPos.index + chuoDir, chuoDir };
      const branchKey = this.pickKey(this.arrowKeyForStep(startPos, firstStepPos), usedKeys);
      return [
        {
          direction: 'chuo',
          label: `🚃${label}: ${this.cellLabel(getCell(this.board, pos))}`,
          steps: totalSteps,
          pos,
          shortcutAtStep: null,
          stepFn: 'forward',
          startChuoDir: chuoDir,
          key: branchKey,
        },
      ];
    }
    const remaining = totalSteps - exitSteps;
    const exitPos = { onChuo: false, index: exitCellIndex };
    const ccwPos = this.simulatePath(exitPos, remaining, stepForward, null);
    const cwPos = this.simulatePath(exitPos, remaining, stepBackward, null);
    const ccwFirstStep = stepForward(this.board, exitPos, false);
    const cwFirstStep = stepBackward(this.board, exitPos, false);
    return [
      {
        direction: 'chuo',
        label: `🚃${label}→反時計回り: ${this.cellLabel(getCell(this.board, ccwPos))}`,
        steps: totalSteps,
        pos: ccwPos,
        shortcutAtStep: null,
        stepFn: 'forward',
        startChuoDir: chuoDir,
        key: this.pickKey(this.arrowKeyForStep(exitPos, ccwFirstStep), usedKeys),
      },
      {
        direction: 'chuo',
        label: `🚃${label}→時計回り: ${this.cellLabel(getCell(this.board, cwPos))}`,
        steps: totalSteps,
        pos: cwPos,
        shortcutAtStep: null,
        stepFn: 'backward',
        startChuoDir: chuoDir,
        key: this.pickKey(this.arrowKeyForStep(exitPos, cwFirstStep), usedKeys),
      },
    ];
  }

  // 希望のキーがすでに使われていたら、空いている矢印キーに振り替える
  pickKey(preferredKey, usedKeys) {
    const key = usedKeys.has(preferredKey)
      ? ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].find((k) => !usedKeys.has(k)) || preferredKey
      : preferredKey;
    usedKeys.add(key);
    return key;
  }

  pushChuoBranchOptions(branchOptions, options) {
    options.push(...branchOptions);
  }

  // 中央線をはさむ経路の距離は、新宿/神田どちら経由で本線に戻るかの近似で見積もる
  approxDistanceToTarget(pos, depth = 0) {
    const targetCell = this.board.stationCellIndex[this.targetStationIndex];
    const len = this.board.mainLoop.length;
    if (!pos.onChuo) {
      const fwd = (targetCell - pos.index + len) % len;
      const bwd = (pos.index - targetCell + len) % len;
      return Math.min(fwd, bwd);
    }
    if (depth > 0) return this.board.chuoPath.length; // 無限再帰防止のフォールバック
    const toKanda = this.board.chuoPath.length - pos.index;
    const toShinjuku = pos.index + 1;
    const viaKanda = toKanda + this.approxDistanceToTarget({ onChuo: false, index: this.board.kandaCellIndex }, depth + 1);
    const viaShinjuku = toShinjuku + this.approxDistanceToTarget({ onChuo: false, index: this.board.shinjukuCellIndex }, depth + 1);
    return Math.min(viaKanda, viaShinjuku);
  }

  cpuChooseOption(options) {
    const targetOpt = options.find((o) => this.isTargetPos(o.pos));
    if (targetOpt) return targetOpt;
    // 目的地に一番近づく方向を選ぶ(反時計回り/時計回り/中央線を距離で比較)
    let best = options[0];
    let bestDist = this.approxDistanceToTarget(best.pos);
    for (let i = 1; i < options.length; i++) {
      const d = this.approxDistanceToTarget(options[i].pos);
      if (d < bestDist) {
        best = options[i];
        bestDist = d;
      }
    }
    return best;
  }

  showMoveChoiceModal(player, options, diceCount, steps) {
    const width = this.scale.width;
    const height = this.scale.height;
    const rowH = 54;
    const panelH = 140 + options.length * rowH;
    const panelW = 420;
    const objs = [];
    const bg = this.add.rectangle(width / 2, height / 2, panelW, panelH, 0xffffff, 0.98).setStrokeStyle(3, ACCENT_STROKE).setDepth(20);
    objs.push(bg);
    objs.push(
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 24, `🎲 サイコロ${diceCount}個で ${steps}マス すすむ!`, {
          fontFamily: FONT_FAMILY,
          fontSize: '20px',
          color: '#cc6600',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(21)
    );
    objs.push(
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 56, 'どっちに すすむ?(矢印キーもOK)', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(21)
    );

    const KEY_ARROW = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    // 選択肢の表示順はキーの実際の向きに関わらずいつも ↑←→↓ の並びにする
    const KEY_ORDER = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'];
    const sortedOptions = [...options].sort((a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key));

    sortedOptions.forEach((opt, i) => {
      const by = height / 2 - panelH / 2 + 100 + i * rowH;
      const btn = drawRoundedButton(this, width / 2, by, 360, 44, { depth: 20 });
      const text = this.add
        .text(width / 2, by, `[${KEY_ARROW[opt.key] || '?'}] ${opt.label}`, { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(21);
      objs.push(btn.gfx, btn.zone, text);
      btn.on('pointerdown', () => choose(opt));
      btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
      btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));
    });

    const onKeyDown = (event) => {
      const opt = options.find((o) => o.key === event.code);
      if (opt) choose(opt);
    };
    this.input.keyboard.on('keydown', onKeyDown);

    const choose = (opt) => {
      this.input.keyboard.off('keydown', onKeyDown);
      objs.forEach((o) => o.destroy());
      this.sfx.click();
      this.beginMove(player, opt);
    };
  }

  beginMove(player, chosen) {
    this.log(`${player.name}は ${chosen.label} すすむ!`);
    if (chosen.shortcutAtStep) this.sfx.shortcutJingle();
    // 中央線上からの移動は、この手番で選んだ方向を実際の駒の位置にも反映する
    // (以前の手番でどちら向きに入ったかに関係なく、今回選んだ方向を優先する)
    if (chosen.startChuoDir !== undefined && player.pos.onChuo) {
      player.pos = { ...player.pos, chuoDir: chosen.startChuoDir };
    }
    const stepFn = chosen.stepFn === 'backward' ? stepBackward : stepForward;
    this.animateSteps(player, chosen.steps, chosen.shortcutAtStep, stepFn, 0);
  }

  animateSteps(player, remaining, shortcutAtStep, stepFn, stepDone) {
    if (remaining <= 0) {
      this.delay(1, () => this.resolveCell(player));
      return;
    }
    const useShortcut = stepDone + 1 === shortcutAtStep;
    player.pos = stepFn(this.board, player.pos, useShortcut);
    this.refreshTokenPositions();
    this.sfx.step();
    this.delay(MOVE_STEP_TICKS, () => this.animateSteps(player, remaining - 1, shortcutAtStep, stepFn, stepDone + 1));
  }

  resolveCell(player) {
    const cell = getCell(this.board, player.pos);
    if (cell.type === 'blue') {
      const amount = Math.round((100 + Math.random() * 200) * (1 + (this.year - 1) * 0.1));
      player.cash += amount;
      this.log(`${player.name}: 青マス! +¥${amount}`);
      this.sfx.blueCell();
      this.afterCellResolved(player);
    } else if (cell.type === 'red') {
      const amount = Math.round((100 + Math.random() * 200) * (1 + (this.year - 1) * 0.1));
      player.cash = Math.max(0, player.cash - amount);
      this.log(`${player.name}: 赤マス… -¥${amount}`);
      this.sfx.redCell();
      this.afterCellResolved(player);
    } else if (cell.type === 'card') {
      const cardId = drawRandomCard();
      player.cards.push(cardId);
      this.log(`${player.name}: カードマス! 「${CARD_DEFS[cardId].name}」を手に入れた`);
      this.sfx.drawCard();
      this.afterCellResolved(player);
    } else if (cell.type === 'station') {
      const stationIndex = cell.stationIndex; // 中央線駅は chuoIndex しか持たないので物件なし
      if (stationIndex !== undefined) {
        this.arriveAtStation(player, stationIndex);
      } else {
        this.log(`${player.name}は ${cell.name}に とうちゃく`);
        this.sfx.arriveStation();
        this.afterCellResolved(player);
      }
    } else {
      this.afterCellResolved(player);
    }
  }

  arriveAtStation(player, stationIndex) {
    const isTarget = stationIndex === this.targetStationIndex;
    const unowned = this.properties[stationIndex].filter((p) => p.ownerId === null);
    this.sfx.arriveStation();

    const proceedAfterShopping = () => {
      if (isTarget) {
        this.handleTargetArrival(player);
      } else {
        this.afterCellResolved(player);
      }
    };

    if (unowned.length > 0) {
      if (player.isCPU) {
        // CPUは手持ちに余裕があれば安いものから買う(複数買ってもログが上書きされないよう1件にまとめる)
        const bought = [];
        unowned
          .slice()
          .sort((a, b) => a.price - b.price)
          .forEach((prop) => {
            if (player.cash >= prop.price * 1.3) {
              prop.ownerId = player.id;
              player.cash -= prop.price;
              bought.push(prop);
            }
          });
        if (bought.length > 0) {
          const total = bought.reduce((sum, p) => sum + p.price, 0);
          const names = bought.map((p) => `「${p.name}」`).join('');
          this.log(`${player.name}が${names}を購入(¥${total})`);
        }
        proceedAfterShopping();
      } else {
        this.log(`${STATIONS[stationIndex].name}駅に とうちゃく`);
        this.showPropertyModal(stationIndex, player, proceedAfterShopping);
      }
    } else {
      this.log(`${player.name}は ${STATIONS[stationIndex].name}駅に とうちゃく`);
      proceedAfterShopping();
    }
  }

  // 駅ボタンをクリックしたときに、その駅の物件一覧(価格・所有者)をログに表示する
  logStationProperties(stationIndex) {
    const props = this.properties[stationIndex];
    if (!props || props.length === 0) return;
    const summary = props
      .map((p) => {
        if (p.ownerId === null) return `${p.name}¥${p.price}(空き)`;
        const owner = this.players.find((pl) => pl.id === p.ownerId);
        return `${p.name}¥${p.price}(${owner ? owner.name : '?'}所有)`;
      })
      .join(' / ');
    this.log(`${STATIONS[stationIndex].name}の物件: ${summary}`);
  }

  showPropertyModal(stationIndex, player, onClose) {
    const width = this.scale.width;
    const height = this.scale.height;
    const props = this.properties[stationIndex];
    const panelH = 90 + props.length * 46;
    const objs = [];
    const bg = this.add.rectangle(width / 2, height / 2, 460, panelH, 0xffffff, 0.98).setStrokeStyle(3, ACCENT_STROKE).setDepth(20);
    objs.push(bg);
    objs.push(
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 18, `${STATIONS[stationIndex].name}駅 の物件`, {
          fontFamily: FONT_FAMILY,
          fontSize: '22px',
          color: '#000',
        })
        .setOrigin(0.5)
        .setDepth(21)
    );
    props.forEach((prop, i) => {
      const ry = height / 2 - panelH / 2 + 56 + i * 46;
      const owned = prop.ownerId !== null;
      const ownerPlayer = owned ? this.players.find((pl) => pl.id === prop.ownerId) : null;
      const ownerLabel = owned ? (prop.ownerId === player.id ? '(所有中)' : `(${ownerPlayer.name}が所有)`) : '';
      objs.push(
        this.add
          .text(width / 2 - 200, ry, `${prop.name} ¥${prop.price} ${ownerLabel}`, { fontFamily: FONT_FAMILY, fontSize: '17px', color: owned ? '#999' : '#000' })
          .setOrigin(0, 0.5)
          .setDepth(21)
      );
      if (!owned) {
        const canAfford = player.cash >= prop.price;
        const btn = drawRoundedButton(this, width / 2 + 160, ry, 100, 34, { depth: 20, fillColor: canAfford ? BUTTON_FILL : 0xe6e0d4 });
        const btnText = this.add.text(width / 2 + 160, ry, '買う', { fontFamily: FONT_FAMILY, fontSize: '17px', color: canAfford ? '#000' : '#999' }).setOrigin(0.5).setDepth(21);
        objs.push(btn.gfx, btn.zone, btnText);
        if (canAfford) {
          btn.on('pointerdown', () => {
            prop.ownerId = player.id;
            player.cash -= prop.price;
            this.log(`「${prop.name}」を購入した(¥${prop.price})`);
            this.sfx.buyProperty();
            this.updateHud();
            cleanup();
            this.showPropertyModal(stationIndex, player, onClose);
          });
          btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
          btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));
        }
      }
    });
    const closeBtn = drawRoundedButton(this, width / 2, height / 2 + panelH / 2 - 26, 140, 40, { depth: 20 });
    const closeText = this.add.text(width / 2, height / 2 + panelH / 2 - 26, 'とじる', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000' }).setOrigin(0.5).setDepth(21);
    objs.push(closeBtn.gfx, closeBtn.zone, closeText);
    const cleanup = () => objs.forEach((o) => o.destroy());
    closeBtn.on('pointerdown', () => {
      cleanup();
      this.sfx.click();
      this.updateHud();
      onClose();
    });
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(BUTTON_FILL_HOVER));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(BUTTON_FILL));
  }

  handleTargetArrival(player) {
    this.awardTargetArrival(player);
    this.afterCellResolved(player);
  }

  // 目的地にいる状態でターンが回ってきた(=最初に行動しようとした)プレイヤーがゴール扱いになる
  checkTargetAtTurnStart(player) {
    if (this.gameOver) return;
    if (player.pos.onChuo) return;
    if (player.pos.index !== this.board.stationCellIndex[this.targetStationIndex]) return;
    this.awardTargetArrival(player);
  }

  awardTargetArrival(player) {
    const bonus = Math.round(800 + this.year * 150);
    player.cash += bonus;
    this.log(`🎉 ${player.name}が目的地「${STATIONS[this.targetStationIndex].name}」に一番乗り! +¥${bonus}`);
    this.sfx.goal();
    this.celebrateGoal(this.targetStationIndex, bonus);

    // ノラネコ: 目的地から一番遠いプレイヤーに居着く(到着した本人は距離0=対象外)
    const oldTargetIdx = this.targetStationIndex;
    const targetCellIdx = this.board.stationCellIndex[oldTargetIdx];
    const len = this.board.mainLoop.length;
    let farthestIdx = 0;
    let farthestDist = -1;
    this.players.forEach((p, i) => {
      const cellIdx = p.pos.onChuo ? this.board.shinjukuCellIndex : p.pos.index;
      const d = (cellIdx - targetCellIdx + len) % len;
      if (d > farthestDist) {
        farthestDist = d;
        farthestIdx = i;
      }
    });
    const farthestPlayer = this.players[farthestIdx];
    if (this.noranekoOwnerId !== farthestPlayer.id) {
      this.noranekoOwnerId = farthestPlayer.id;
      // ゴールのログをすぐ消してしまわないよう少し遅らせて出す
      this.delay(2, () => {
        this.log(`🐈 ノラネコが ${farthestPlayer.name} に ついてきた…`);
        this.sfx.noranekoAttach();
      });
    }

    this.targetStationIndex = this.pickNewTarget();
    this.updateHud();
  }

  // 目的地到着時の演出。絵文字が弾け飛んで、画面がパッと光る(3waveぶん、長めに見せる)
  celebrateGoal(stationIndex, bonus) {
    const p = this.layout.points[stationIndex];
    const emojis = ['🎉', '✨', '🎊', '⭐', '🏆'];
    const spawnWave = (delayMs) => {
      this.time.delayedCall(delayMs, () => {
        for (let i = 0; i < 14; i++) {
          const emoji = emojis[Math.floor(Math.random() * emojis.length)];
          const angle = Math.random() * Math.PI * 2;
          const dist = 70 + Math.random() * 90;
          const text = this.add.text(p.x, p.y, emoji, { fontSize: '30px' }).setOrigin(0.5).setDepth(50);
          this.tweens.add({
            targets: text,
            x: p.x + Math.cos(angle) * dist,
            y: p.y + Math.sin(angle) * dist - 40,
            alpha: 0,
            scale: 1.8,
            duration: 1300 + Math.random() * 500,
            ease: 'Cubic.easeOut',
            onComplete: () => text.destroy(),
          });
        }
        this.cameras.main.flash(300, 255, 220, 120);
      });
    };
    spawnWave(0);
    spawnWave(500);
    spawnWave(1000);

    const bonusText = this.add
      .text(p.x, p.y - 40, `+¥${bonus}!`, { fontFamily: FONT_FAMILY, fontSize: '30px', color: '#ff8800', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(51)
      .setScale(0.4);
    this.tweens.add({
      targets: bonusText,
      scale: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: bonusText,
      y: p.y - 120,
      alpha: 0,
      delay: 1400,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => bonusText.destroy(),
    });
    this.cameras.main.shake(300, 0.004);
  }

  pickNewTarget() {
    let idx;
    do {
      idx = Math.floor(Math.random() * STATIONS.length);
    } while (idx === this.targetStationIndex);
    return idx;
  }

  afterCellResolved(player) {
    // ノラネコ移動のログは、直前のマス処理ログを消してしまわないよう少し遅らせて出す
    this.delay(1, () => this.checkNoranekoTransfer());
    this.updateHud();
    this.delay(2.5, () => this.endTurn());
  }

  checkNoranekoTransfer() {
    if (!this.noranekoOwnerId) return;
    const owner = this.players.find((p) => p.id === this.noranekoOwnerId);
    if (!owner) return;
    const other = this.players.find(
      (p) => p.id !== owner.id && p.pos.onChuo === owner.pos.onChuo && p.pos.index === owner.pos.index
    );
    if (other) {
      this.noranekoOwnerId = other.id;
      this.log(`🐈 ノラネコが ${other.name} に うつった!`);
      this.sfx.noranekoTransfer();
    }
  }

  // ---------- カード ----------

  useCard(playerIdx, cardIndex) {
    const player = this.players[playerIdx];
    const cardId = player.cards[cardIndex];
    const def = CARD_DEFS[cardId];
    if (!def) return;

    if (def.category === 'progress') {
      if (this.turnMoved) return;
      player.cards.splice(cardIndex, 1);
      this.destroyHand();
      this.log(`${player.name}は「${def.name}」をつかった!`);
      this.sfx.useCard();
      this.rollAndChooseMove(player, def.diceCount);
      return;
    }

    if (def.category === 'move') {
      if (this.turnMoved) return;
      player.cards.splice(cardIndex, 1);
      this.destroyHand();
      this.turnMoved = true;
      this.rollButton.setVisible(false);
      this.log(`${player.name}は「${def.name}」をつかった!`);
      this.sfx.useCard();
      if (def.effect === 'randomStation') {
        const idx = Math.floor(Math.random() * STATIONS.length);
        player.pos = { onChuo: false, index: this.board.stationCellIndex[idx] };
      } else if (def.effect === 'chuoStation') {
        const idx = Math.floor(Math.random() * CHUO_STATIONS.length);
        player.pos = { onChuo: true, index: idx === 0 ? 1 : 3, chuoDir: 1 };
      }
      this.refreshTokenPositions();
      this.delay(1.5, () => this.resolveCell(player));
      return;
    }

    // 妨害系・お金系・防御系はいつでも即時効果、移動フェーズは消費しない
    const others = this.players.filter((p) => p.id !== player.id);
    const opponent = others[Math.floor(Math.random() * others.length)];
    player.cards.splice(cardIndex, 1);
    this.sfx.useCard();

    if (def.effect === 'stealCard' || def.effect === 'breakCard' || def.effect === 'sendToStart') {
      if (this.consumeShieldIfHeld(opponent)) {
        this.log(`${opponent.name}のシールドで「${def.name}」は むこうにされた!`);
      } else if (def.effect === 'stealCard' && opponent.cards.length > 0) {
        const stolen = opponent.cards.splice(Math.floor(Math.random() * opponent.cards.length), 1)[0];
        player.cards.push(stolen);
        this.log(`${player.name}が${opponent.name}の「${CARD_DEFS[stolen].name}」をうばった!`);
      } else if (def.effect === 'breakCard' && opponent.cards.length > 0) {
        const broken = opponent.cards.splice(Math.floor(Math.random() * opponent.cards.length), 1)[0];
        this.log(`${player.name}が${opponent.name}の「${CARD_DEFS[broken].name}」をこわした!`);
      } else if (def.effect === 'sendToStart') {
        opponent.pos = { onChuo: false, index: this.board.startCellIndex };
        this.log(`${opponent.name}は 品川(スタート)へ もどされた!`);
      } else {
        this.log(`${def.name}をつかったが、対象がなかった`);
      }
    } else if (def.effect === 'lottery') {
      const amount = 100 + Math.floor(Math.random() * 900);
      player.cash += amount;
      this.log(`${player.name}: たからくじで +¥${amount}!`);
    } else if (def.effect === 'earlyIncome') {
      let total = 0;
      for (let i = 0; i < STATIONS.length; i++) total += stationIncome(this.properties, i, player.id);
      player.cash += total;
      this.log(`${player.name}: ぎんこうで 収益を先取り +¥${total}`);
    } else if (def.effect === 'shield') {
      this.log(`${player.name}は シールドを手にいれた(次の妨害をふせぐ)`);
      player.cards.push(cardId); // 手札に保持し続ける(消費は攻撃を受けた時)
    }

    this.destroyHand();
    this.renderHand(player);
    this.updateHud();
  }

  consumeShieldIfHeld(player) {
    const idx = player.cards.indexOf('shield');
    if (idx === -1) return false;
    player.cards.splice(idx, 1);
    return true;
  }

  // ---------- ターン終了・年度更新 ----------

  endTurn() {
    if (this.gameOver) return;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.turnMoved = false;
    if (this.currentPlayerIndex === 0) {
      this.month += 1;
      if (this.month > 12) {
        this.month = 1;
        const settlementYear = this.year;
        const results = this.runSettlement();
        this.year += 1;
        const isGameEnd = this.year > this.years;
        this.showSettlementModal(settlementYear, results, () => {
          if (isGameEnd) {
            this.endGame();
          } else {
            this.continueEndTurn();
          }
        });
        return;
      }
    }
    this.continueEndTurn();
  }

  // ノラネコの悪行・手番交代の演出をまとめた、決算モーダルを閉じた後にも呼ばれる後処理
  continueEndTurn() {
    const player = this.players[this.currentPlayerIndex];
    if (this.noranekoOwnerId === player.id) {
      const loss = 20 + Math.floor(Math.random() * 40);
      player.cash = Math.max(0, player.cash - loss);
      this.log(`🐈 ノラネコが ${player.name}の お金を ¥${loss}分 もっていった…`);
    }
    this.sfx.turnStart(!player.isCPU);
    this.updateHud();
    this.refreshTurnUI();
    saveGame(AUTOSAVE_SLOT, this.buildSaveData());
  }

  // 収益を計算・加算するだけ(表示はshowSettlementModalが担当)。プレイヤーごとの{player, total}を返す。
  runSettlement() {
    this.sfx.settlement();
    const results = this.players.map((p) => {
      let total = 0;
      for (let i = 0; i < STATIONS.length; i++) total += stationIncome(this.properties, i, p.id);
      p.cash += total;
      return { player: p, total };
    });
    this.updateHud();
    return results;
  }

  // 決算結果を全員ぶんモーダルで表示し、OKを押すまで次のターンへ進めない
  showSettlementModal(year, results, onClose) {
    const width = this.scale.width;
    const height = this.scale.height;
    const rowH = 40;
    const panelW = 380;
    const panelH = 130 + results.length * rowH;
    const objs = [];
    const bg = this.add.rectangle(width / 2, height / 2, panelW, panelH, 0xffffff, 0.98).setStrokeStyle(3, ACCENT_STROKE).setDepth(40);
    objs.push(bg);
    objs.push(
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 28, `📊 ${year}年 決算`, {
          fontFamily: FONT_FAMILY,
          fontSize: '22px',
          color: '#000',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(41)
    );
    results.forEach((r, i) => {
      const by = height / 2 - panelH / 2 + 70 + i * rowH;
      const amountText = r.total > 0 ? `+¥${r.total}` : '¥0';
      const color = r.total > 0 ? '#2a8a2a' : '#999';
      objs.push(
        this.add
          .text(width / 2 - panelW / 2 + 30, by, `${r.player.emoji} ${r.player.name}`, { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#000' })
          .setOrigin(0, 0.5)
          .setDepth(41)
      );
      objs.push(
        this.add
          .text(width / 2 + panelW / 2 - 30, by, amountText, { fontFamily: FONT_FAMILY, fontSize: '17px', color, fontStyle: 'bold' })
          .setOrigin(1, 0.5)
          .setDepth(41)
      );
    });
    const okBtn = drawRoundedButton(this, width / 2, height / 2 + panelH / 2 - 30, 140, 40, { depth: 40 });
    const okText = this.add
      .text(width / 2, height / 2 + panelH / 2 - 30, 'OK', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000' })
      .setOrigin(0.5)
      .setDepth(41);
    objs.push(okBtn.gfx, okBtn.zone, okText);
    okBtn.on('pointerdown', () => {
      this.sfx.click();
      objs.forEach((o) => o.destroy());
      onClose();
    });
    okBtn.on('pointerover', () => okBtn.setFillStyle(BUTTON_FILL_HOVER));
    okBtn.on('pointerout', () => okBtn.setFillStyle(BUTTON_FILL));
  }

  totalAssets(player) {
    return player.cash + totalPropertyValue(this.properties, player.id);
  }

  endGame() {
    this.gameOver = true;
    this.destroyHand();
    this.rollButton.setVisible(false);
    const width = this.scale.width;
    const height = this.scale.height;
    const results = this.players
      .map((p) => ({ p, total: this.totalAssets(p) }))
      .sort((a, b) => b.total - a.total);
    const winner = results[0].p;

    this.sfx.stopTheme();
    if (!winner.isCPU) this.sfx.victory();
    else this.sfx.gameOver();

    const panelH = 210 + results.length * 26;
    const bg = this.add.rectangle(width / 2, height / 2, 480, panelH, 0xffffff, 0.98).setStrokeStyle(4, ACCENT_STROKE).setDepth(30);
    this.add
      .text(width / 2, height / 2 - panelH / 2 + 34, `🏁 ${this.years}年目 しゅうりょう!`, { fontFamily: FONT_FAMILY, fontSize: '26px', color: '#000' })
      .setOrigin(0.5)
      .setDepth(31);
    this.add
      .text(width / 2, height / 2 - panelH / 2 + 74, `優勝: ${winner.emoji} ${winner.name}!`, { fontFamily: FONT_FAMILY, fontSize: '30px', color: '#cc8800', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(31);
    results.forEach((r, i) => {
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 114 + i * 26, `${i + 1}位  ${r.p.emoji}${r.p.name}: 総資産 ¥${r.total}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '19px',
          color: '#000',
        })
        .setOrigin(0.5)
        .setDepth(31);
    });
    const btn = drawRoundedButton(this, width / 2, height / 2 + panelH / 2 - 40, 200, 50, { depth: 30 });
    const btnText = this.add.text(width / 2, height / 2 + panelH / 2 - 40, 'タイトルへ', { fontFamily: FONT_FAMILY, fontSize: '19px', color: '#000' }).setOrigin(0.5).setDepth(31);
    btn.on('pointerdown', () => this.scene.start('TitleScene'));
    btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
    btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));
  }

  // ---------- CPU ----------

  cpuTakeTurn() {
    if (this.gameOver) return;
    const player = this.players[this.currentPlayerIndex];
    // 30%で進行系カードを使う、なければ通常のサイコロ
    const progressIdx = player.cards.findIndex((c) => CARD_DEFS[c].category === 'progress');
    if (progressIdx !== -1 && Math.random() < 0.3) {
      this.useCard(this.currentPlayerIndex, progressIdx);
      return;
    }
    // 20%で妨害カードを使う(ログが読めるよう、サイコロを振るまで少し待つ)
    const attackIdx = player.cards.findIndex((c) => CARD_DEFS[c].category === 'attack');
    if (attackIdx !== -1 && Math.random() < 0.2) {
      this.useCard(this.currentPlayerIndex, attackIdx);
      this.delay(1.5, () => this.rollAndChooseMove(player, 1));
      return;
    }
    this.rollAndChooseMove(player, 1);
  }
}
