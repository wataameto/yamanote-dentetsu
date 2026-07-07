import Phaser from 'phaser';
import { STATIONS, CHUO_STATIONS } from '../stations.js';
import { buildStationPositions } from '../layout.js';
import { buildBoard, stepForward, getCell, mainLoopDistance } from '../board.js';
import { buildProperties, stationIncome, isMonopoly, totalPropertyValue } from '../properties.js';
import { CARD_DEFS, drawRandomCard } from '../cards.js';
import { drawRoundedButton, BUTTON_FILL, BUTTON_FILL_HOVER, ACCENT_STROKE } from '../ui.js';

const FONT_FAMILY = '"Kosugi Maru", sans-serif';
const STARTING_CASH = 3000;
const SMALL_CELL_COLOR = { blue: 0x4477ff, red: 0xdd4444, card: 0xffcc33 };

export class GameBoardScene extends Phaser.Scene {
  constructor() {
    super('GameBoardScene');
  }

  create(data = {}) {
    const width = this.scale.width;
    const height = this.scale.height;
    this.years = data.years ?? 5;

    this.layout = buildStationPositions(width, height);
    this.board = buildBoard();
    this.properties = buildProperties();

    this.players = [
      { id: 'you', name: 'あなた', emoji: '🐕', color: 0x4477ff, isCPU: false, cash: STARTING_CASH, pos: { onChuo: false, index: this.board.startCellIndex }, cards: [] },
      { id: 'cpu', name: 'CPU', emoji: '🐱', color: 0xff6666, isCPU: true, cash: STARTING_CASH, pos: { onChuo: false, index: this.board.startCellIndex }, cards: [] },
    ];
    this.currentPlayerIndex = 0;
    this.month = 1;
    this.year = 1;
    this.gameOver = false;
    this.turnMoved = false;
    this.noranekoOwnerId = null;
    this.targetStationIndex = this.pickNewTarget();

    this.drawBoard();
    this.drawHud();
    this.playerTokens = this.players.map((p) => this.createToken(p));
    this.log('たびの はじまり! めざせ 総資産1位!');
    this.updateHud();
    this.refreshTurnUI();
  }

  // ---------- 盤面の見た目 ----------

  drawBoard() {
    const { points, chuoPoints, buttonWidth, buttonHeight } = this.layout;

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

    // 小マス(メインループ)
    this.smallCellDots = {};
    this.board.mainLoop.forEach((cell, idx) => {
      if (cell.type === 'station') return;
      const pos = this.smallCellPixelPos(idx);
      const dot = this.add.circle(pos.x, pos.y, 9, SMALL_CELL_COLOR[cell.type]).setStrokeStyle(2, 0x000000).setDepth(0);
      this.smallCellDots[`main-${idx}`] = dot;
    });
    // 小マス(中央線)
    this.board.chuoPath.forEach((cell, idx) => {
      if (cell.type === 'station') return;
      const pos = this.chuoCellPixelPos(idx);
      const dot = this.add.circle(pos.x, pos.y, 9, SMALL_CELL_COLOR[cell.type]).setStrokeStyle(2, 0x000000).setDepth(0);
      this.smallCellDots[`chuo-${idx}`] = dot;
    });

    // 駅ボタン
    this.stationButtons = {};
    STATIONS.forEach((station, i) => {
      const p = points[i];
      const bg = drawRoundedButton(this, p.x, p.y, buttonWidth, buttonHeight, { strokeWidth: 2 });
      const nameText = this.add
        .text(p.x, p.y, station.name, { fontFamily: FONT_FAMILY, fontSize: buttonHeight < 45 ? '14px' : '18px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(2);
      if (nameText.width > buttonWidth * 0.9) nameText.setScale((buttonWidth * 0.9) / nameText.width);
      this.stationButtons[i] = { bg, nameText };
    });
    CHUO_STATIONS.forEach((station, i) => {
      const p = chuoPoints[i];
      const bg = drawRoundedButton(this, p.x, p.y, buttonWidth, buttonHeight, { strokeColor: 0xf15a22, strokeWidth: 3 });
      const nameText = this.add
        .text(p.x, p.y, station.name, { fontFamily: FONT_FAMILY, fontSize: buttonHeight < 45 ? '14px' : '18px', color: '#000' })
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
    const circle = this.add.circle(pos.x, pos.y, 14, player.color).setStrokeStyle(2, 0x000000).setDepth(6);
    const label = this.add.text(pos.x, pos.y, player.emoji, { fontSize: '16px' }).setOrigin(0.5).setDepth(7);
    return { circle, label };
  }

  moveTokenTo(playerIdx, pos, offset) {
    const token = this.playerTokens[playerIdx];
    const p = this.cellPixelPos(pos);
    const ox = offset ? 12 : 0;
    token.circle.setPosition(p.x + ox, p.y);
    token.label.setPosition(p.x + ox, p.y);
  }

  refreshTokenPositions() {
    // 同じマスに2人いる場合は少しずらして重ならないようにする
    const samePos = this.players[0].pos.onChuo === this.players[1].pos.onChuo && this.players[0].pos.index === this.players[1].pos.index;
    this.players.forEach((p, i) => this.moveTokenTo(i, p.pos, samePos && i === 1));
  }

  updateTargetMarker() {
    // 駅間隔が狭い場所でも隣の駅と重ならないよう、ボタン右上の小バッジ位置に出す
    const p = this.layout.points[this.targetStationIndex];
    const x = p.x + this.layout.buttonWidth / 2 - 6;
    const y = p.y - this.layout.buttonHeight / 2 - 6;
    this.targetMarker.setPosition(x, y).setVisible(true);
  }

  // ---------- HUD ----------

  drawHud() {
    const width = this.scale.width;
    this.add.text(width / 2, 8, '山手線電鉄', { fontFamily: FONT_FAMILY, fontSize: '22px', color: '#000' }).setOrigin(0.5, 0);
    this.dateText = this.add.text(width / 2, 34, '', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#333' }).setOrigin(0.5, 0);

    this.playerCashTexts = this.players.map((p, i) =>
      this.add
        .text(16, 8 + i * 22, '', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#000' })
        .setOrigin(0, 0)
    );

    this.logText = this.add
      .text(16, height_bottom(this) - 30, '', { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#444' })
      .setOrigin(0, 1);

    this.rollButton = drawRoundedButton(this, width - 100, 40, 150, 48, { depth: 5 });
    this.rollButtonText = this.add.text(width - 100, 40, '🎲 サイコロ', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#000' }).setOrigin(0.5).setDepth(7);
    this.rollButton.on('pointerdown', () => this.onRollClicked());
    this.rollButton.on('pointerover', () => this.rollButton.setFillStyle(BUTTON_FILL_HOVER));
    this.rollButton.on('pointerout', () => this.rollButton.setFillStyle(BUTTON_FILL));

    this.handContainer = [];

    function height_bottom(scene) {
      return scene.scale.height;
    }
  }

  updateHud() {
    this.dateText.setText(`${this.year}年目 ${this.month}月 / ぜんぶで${this.years}年 目的地: ${STATIONS[this.targetStationIndex].name}`);
    this.players.forEach((p, i) => {
      const noraneko = this.noranekoOwnerId === p.id ? ' 🐈' : '';
      this.playerCashTexts[i].setText(`${p.emoji}${p.name}: ¥${p.cash}${noraneko}`);
    });
    this.updateTargetMarker();
    this.refreshTokenPositions();
  }

  log(msg) {
    this.recentLog = msg;
    this.logText.setText(`📢 ${msg}`);
  }

  refreshTurnUI() {
    this.destroyHand();
    const player = this.players[this.currentPlayerIndex];
    const isHuman = !player.isCPU;
    this.rollButton.setVisible(isHuman && !this.turnMoved && !this.gameOver);
    if (isHuman && !this.gameOver) this.renderHand(player);
    if (!isHuman && !this.gameOver) {
      this.time.delayedCall(700, () => this.cpuTakeTurn());
    }
  }

  destroyHand() {
    this.handContainer.forEach((o) => o.destroy());
    this.handContainer = [];
  }

  renderHand(player) {
    const width = this.scale.width;
    const height = this.scale.height;
    const y = height - 60;
    if (player.cards.length === 0) {
      const t = this.add.text(16, y, 'てもち カード: なし', { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#777' }).setDepth(5);
      this.handContainer.push(t);
      return;
    }
    const label = this.add.text(16, y - 22, 'てもちカード(クリックでつかう):', { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#555' }).setDepth(5);
    this.handContainer.push(label);
    const cardW = 130;
    player.cards.forEach((cardId, i) => {
      const def = CARD_DEFS[cardId];
      const bx = 16 + cardW / 2 + i * (cardW + 8);
      const btn = drawRoundedButton(this, bx, y, cardW, 40, { depth: 5 });
      const text = this.add
        .text(bx, y, def.name, { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#000' })
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
    this.maybeAskShortcutThenMove(player, 1);
  }

  maybeAskShortcutThenMove(player, diceCount) {
    if (!player.pos.onChuo && player.pos.index === this.board.shinjukuCellIndex) {
      if (player.isCPU) {
        this.doMovement(player, diceCount, Math.random() < 0.5);
      } else {
        this.showShortcutPrompt(player, diceCount);
      }
    } else {
      this.doMovement(player, diceCount, false);
    }
  }

  showShortcutPrompt(player, diceCount) {
    const width = this.scale.width;
    const height = this.scale.height;
    const bg = this.add.rectangle(width / 2, height / 2, 420, 160, 0xffffff, 0.98).setStrokeStyle(3, ACCENT_STROKE).setDepth(20);
    const text = this.add
      .text(width / 2, height / 2 - 40, '新宿駅: 中央線をつかいますか?', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000' })
      .setOrigin(0.5)
      .setDepth(21);
    const yesBtn = drawRoundedButton(this, width / 2 - 90, height / 2 + 30, 150, 48, { depth: 20 });
    const yesText = this.add.text(width / 2 - 90, height / 2 + 30, 'つかう(近道)', { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#000' }).setOrigin(0.5).setDepth(21);
    const noBtn = drawRoundedButton(this, width / 2 + 90, height / 2 + 30, 150, 48, { depth: 20 });
    const noText = this.add.text(width / 2 + 90, height / 2 + 30, 'そのまま進む', { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#000' }).setOrigin(0.5).setDepth(21);
    const cleanup = () => [bg, text, yesBtn.gfx, yesBtn.zone, yesText, noBtn.gfx, noBtn.zone, noText].forEach((o) => o.destroy());
    yesBtn.on('pointerdown', () => {
      cleanup();
      this.doMovement(player, diceCount, true);
    });
    noBtn.on('pointerdown', () => {
      cleanup();
      this.doMovement(player, diceCount, false);
    });
  }

  doMovement(player, diceCount, takeShortcut) {
    let steps = 0;
    for (let i = 0; i < diceCount; i++) steps += 1 + Math.floor(Math.random() * 6);
    this.turnMoved = true;
    this.rollButton.setVisible(false);

    // 目的地を通り越さないよう、届く場合はそこでピタッと止める(余ったマスは使わない)
    if (!takeShortcut && !player.pos.onChuo) {
      const targetCellIndex = this.board.stationCellIndex[this.targetStationIndex];
      const distToTarget = mainLoopDistance(this.board, player.pos.index, targetCellIndex);
      if (distToTarget <= steps) steps = distToTarget;
    }

    this.log(`${player.name}は サイコロ${diceCount}個で ${steps}マス すすむ!`);
    this.animateSteps(player, steps, takeShortcut, 0);
  }

  animateSteps(player, remaining, takeShortcut, stepDone) {
    if (remaining <= 0) {
      this.time.delayedCall(150, () => this.resolveCell(player));
      return;
    }
    const useShortcut = stepDone === 0 ? takeShortcut : false;
    player.pos = stepForward(this.board, player.pos, useShortcut);
    this.refreshTokenPositions();
    this.time.delayedCall(90, () => this.animateSteps(player, remaining - 1, takeShortcut, stepDone + 1));
  }

  resolveCell(player) {
    const cell = getCell(this.board, player.pos);
    if (cell.type === 'blue') {
      const amount = Math.round((100 + Math.random() * 200) * (1 + (this.year - 1) * 0.1));
      player.cash += amount;
      this.log(`${player.name}: 青マス! +¥${amount}`);
      this.afterCellResolved(player);
    } else if (cell.type === 'red') {
      const amount = Math.round((100 + Math.random() * 200) * (1 + (this.year - 1) * 0.1));
      player.cash = Math.max(0, player.cash - amount);
      this.log(`${player.name}: 赤マス… -¥${amount}`);
      this.afterCellResolved(player);
    } else if (cell.type === 'card') {
      const cardId = drawRandomCard();
      player.cards.push(cardId);
      this.log(`${player.name}: カードマス! 「${CARD_DEFS[cardId].name}」を手に入れた`);
      this.afterCellResolved(player);
    } else if (cell.type === 'station') {
      const stationIndex = cell.stationIndex; // 中央線駅は chuoIndex しか持たないので物件なし
      if (stationIndex !== undefined) {
        this.arriveAtStation(player, stationIndex);
      } else {
        this.log(`${player.name}は ${cell.name}に とうちゃく`);
        this.afterCellResolved(player);
      }
    } else {
      this.afterCellResolved(player);
    }
  }

  arriveAtStation(player, stationIndex) {
    const isTarget = stationIndex === this.targetStationIndex;
    const unowned = this.properties[stationIndex].filter((p) => p.ownerId === null);

    const proceedAfterShopping = () => {
      if (isTarget) {
        this.handleTargetArrival(player);
      } else {
        this.afterCellResolved(player);
      }
    };

    if (unowned.length > 0) {
      if (player.isCPU) {
        // CPUは手持ちに余裕があれば安いものから買う
        unowned
          .slice()
          .sort((a, b) => a.price - b.price)
          .forEach((prop) => {
            if (player.cash >= prop.price * 1.3) {
              prop.ownerId = player.id;
              player.cash -= prop.price;
              this.log(`CPUが「${prop.name}」を購入(¥${prop.price})`);
            }
          });
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
          fontSize: '18px',
          color: '#000',
        })
        .setOrigin(0.5)
        .setDepth(21)
    );
    props.forEach((prop, i) => {
      const ry = height / 2 - panelH / 2 + 56 + i * 46;
      const owned = prop.ownerId !== null;
      const ownerLabel = owned ? (prop.ownerId === player.id ? '(所有中)' : '(相手が所有)') : '';
      objs.push(
        this.add
          .text(width / 2 - 200, ry, `${prop.name} ¥${prop.price} ${ownerLabel}`, { fontFamily: FONT_FAMILY, fontSize: '13px', color: owned ? '#999' : '#000' })
          .setOrigin(0, 0.5)
          .setDepth(21)
      );
      if (!owned) {
        const canAfford = player.cash >= prop.price;
        const btn = drawRoundedButton(this, width / 2 + 160, ry, 100, 34, { depth: 20, fillColor: canAfford ? BUTTON_FILL : 0xe6e0d4 });
        const btnText = this.add.text(width / 2 + 160, ry, '買う', { fontFamily: FONT_FAMILY, fontSize: '13px', color: canAfford ? '#000' : '#999' }).setOrigin(0.5).setDepth(21);
        objs.push(btn.gfx, btn.zone, btnText);
        if (canAfford) {
          btn.on('pointerdown', () => {
            prop.ownerId = player.id;
            player.cash -= prop.price;
            this.log(`「${prop.name}」を購入した(¥${prop.price})`);
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
    const closeText = this.add.text(width / 2, height / 2 + panelH / 2 - 26, 'とじる', { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#000' }).setOrigin(0.5).setDepth(21);
    objs.push(closeBtn.gfx, closeBtn.zone, closeText);
    const cleanup = () => objs.forEach((o) => o.destroy());
    closeBtn.on('pointerdown', () => {
      cleanup();
      this.updateHud();
      onClose();
    });
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(BUTTON_FILL_HOVER));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(BUTTON_FILL));
  }

  handleTargetArrival(player) {
    const bonus = Math.round(800 + this.year * 150);
    player.cash += bonus;
    this.log(`🎉 ${player.name}が目的地「${STATIONS[this.targetStationIndex].name}」に一番乗り! +¥${bonus}`);

    // ノラネコ: 目的地から一番遠いプレイヤーに居着く
    const oldTargetIdx = this.targetStationIndex;
    let farthestIdx = 0;
    let farthestDist = -1;
    this.players.forEach((p, i) => {
      const cellIdx = p.pos.onChuo ? this.board.shinjukuCellIndex : p.pos.index;
      const d = mainLoopDistance(this.board, this.board.stationCellIndex[oldTargetIdx], cellIdx);
      if (d > farthestDist) {
        farthestDist = d;
        farthestIdx = i;
      }
    });
    const farthestPlayer = this.players[farthestIdx];
    if (this.noranekoOwnerId !== farthestPlayer.id) {
      this.noranekoOwnerId = farthestPlayer.id;
      this.log(`🐈 ノラネコが ${farthestPlayer.name} に ついてきた…`);
    }

    this.targetStationIndex = this.pickNewTarget();
    this.updateHud();
    this.afterCellResolved(player);
  }

  pickNewTarget() {
    let idx;
    do {
      idx = Math.floor(Math.random() * STATIONS.length);
    } while (idx === this.targetStationIndex);
    return idx;
  }

  afterCellResolved(player) {
    this.checkNoranekoTransfer();
    this.updateHud();
    this.time.delayedCall(200, () => this.endTurn());
  }

  checkNoranekoTransfer() {
    if (!this.noranekoOwnerId) return;
    const [p1, p2] = this.players;
    const same = p1.pos.onChuo === p2.pos.onChuo && p1.pos.index === p2.pos.index;
    if (same) {
      const other = this.players.find((p) => p.id !== this.noranekoOwnerId);
      if (other) {
        this.noranekoOwnerId = other.id;
        this.log(`🐈 ノラネコが ${other.name} に うつった!`);
      }
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
      this.maybeAskShortcutThenMove(player, def.diceCount);
      return;
    }

    if (def.category === 'move') {
      if (this.turnMoved) return;
      player.cards.splice(cardIndex, 1);
      this.destroyHand();
      this.turnMoved = true;
      this.rollButton.setVisible(false);
      this.log(`${player.name}は「${def.name}」をつかった!`);
      if (def.effect === 'randomStation') {
        const idx = Math.floor(Math.random() * STATIONS.length);
        player.pos = { onChuo: false, index: this.board.stationCellIndex[idx] };
      } else if (def.effect === 'chuoStation') {
        const idx = Math.floor(Math.random() * CHUO_STATIONS.length);
        player.pos = { onChuo: true, index: idx === 0 ? 1 : 3 };
      }
      this.refreshTokenPositions();
      this.time.delayedCall(200, () => this.resolveCell(player));
      return;
    }

    // 妨害系・お金系・防御系はいつでも即時効果、移動フェーズは消費しない
    const opponent = this.players.find((p) => p.id !== player.id);
    player.cards.splice(cardIndex, 1);

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
        this.runSettlement();
        this.year += 1;
        if (this.year > this.years) {
          this.endGame();
          return;
        }
      }
    }
    // 新しい手番プレイヤーがノラネコ持ちなら軽い悪行
    const player = this.players[this.currentPlayerIndex];
    if (this.noranekoOwnerId === player.id) {
      const loss = 20 + Math.floor(Math.random() * 40);
      player.cash = Math.max(0, player.cash - loss);
      this.log(`🐈 ノラネコが ${player.name}の お金を ¥${loss}分 もっていった…`);
    }
    this.updateHud();
    this.refreshTurnUI();
  }

  runSettlement() {
    this.players.forEach((p) => {
      let total = 0;
      for (let i = 0; i < STATIONS.length; i++) total += stationIncome(this.properties, i, p.id);
      p.cash += total;
      if (total > 0) this.log(`${this.year}年 決算: ${p.name}に収益 +¥${total}`);
    });
    this.updateHud();
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

    const bg = this.add.rectangle(width / 2, height / 2, 480, 260, 0xffffff, 0.98).setStrokeStyle(4, ACCENT_STROKE).setDepth(30);
    this.add
      .text(width / 2, height / 2 - 90, `🏁 ${this.years}年目 しゅうりょう!`, { fontFamily: FONT_FAMILY, fontSize: '22px', color: '#000' })
      .setOrigin(0.5)
      .setDepth(31);
    this.add
      .text(width / 2, height / 2 - 50, `優勝: ${winner.emoji} ${winner.name}!`, { fontFamily: FONT_FAMILY, fontSize: '26px', color: '#cc8800', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(31);
    results.forEach((r, i) => {
      this.add
        .text(width / 2, height / 2 - 5 + i * 26, `${i + 1}位  ${r.p.emoji}${r.p.name}: 総資産 ¥${r.total}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '16px',
          color: '#000',
        })
        .setOrigin(0.5)
        .setDepth(31);
    });
    const btn = drawRoundedButton(this, width / 2, height / 2 + 100, 200, 50, { depth: 30 });
    const btnText = this.add.text(width / 2, height / 2 + 100, 'タイトルへ', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#000' }).setOrigin(0.5).setDepth(31);
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
    // 20%で妨害カードを使う
    const attackIdx = player.cards.findIndex((c) => CARD_DEFS[c].category === 'attack');
    if (attackIdx !== -1 && Math.random() < 0.2) {
      this.useCard(this.currentPlayerIndex, attackIdx);
    }
    this.maybeAskShortcutThenMove(player, 1);
  }
}
