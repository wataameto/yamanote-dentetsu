import Phaser from 'phaser';
import { drawRoundedButton, BUTTON_FILL, BUTTON_FILL_HOVER, ACCENT_STROKE } from '../ui.js';
import { SFX } from '../sfx.js';
import { SAVE_SLOT_COUNT, AUTOSAVE_SLOT, loadGame, slotSummary, hasSave, downloadSave, uploadSaveToSlot } from '../save.js';

const FONT_FAMILY = '"Kosugi Maru", sans-serif';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.sfx = this.registry.get('sfx');
    if (!this.sfx) {
      this.sfx = new SFX();
      this.registry.set('sfx', this.sfx);
    }
    this.sfx.playTheme();
    this.input.once('pointerdown', () => this.sfx.playTheme());

    this.add
      .text(width / 2, height / 2 - 180, '山手線電鉄', { fontFamily: FONT_FAMILY, fontSize: '56px', color: '#000' })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 - 110, 'すごろく × 資産バトル(桃鉄ライク)', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: '#555',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 - 60, 'プレイ年数をえらんでね', { fontFamily: FONT_FAMILY, fontSize: '24px', color: '#333' })
      .setOrigin(0.5);

    const years = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000];
    const cols = 3;
    years.forEach((y, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = width / 2 + (col - 1) * 150;
      const by = height / 2 + 10 + row * 66;
      const isRecommended = y === 10;
      const btn = drawRoundedButton(this, bx, by, 130, 58, { strokeColor: isRecommended ? ACCENT_STROKE : undefined, strokeWidth: isRecommended ? 4 : 2 });
      const label = this.add
        .text(bx, by, `${y}年`, { fontFamily: FONT_FAMILY, fontSize: '24px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(2);
      if (label.width > 110) label.setScale(110 / label.width);
      btn.on('pointerdown', () => {
        this.sfx.gameStart();
        this.scene.start('GameBoardScene', { years: y });
      });
      btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
      btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));
    });

    this.add
      .text(width / 2, height / 2 + 230, 'あなた 🐶 vs CPU 🐱🐰🐻 の4人対戦', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#777' })
      .setOrigin(0.5);

    const continueBtn = drawRoundedButton(this, width / 2, height / 2 + 280, 220, 50, { depth: 5 });
    this.add
      .text(width / 2, height / 2 + 280, '📂 つづきから', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#000' })
      .setOrigin(0.5)
      .setDepth(6);
    continueBtn.on('pointerdown', () => {
      this.sfx.click();
      this.openLoadModal();
    });
    continueBtn.on('pointerover', () => continueBtn.setFillStyle(BUTTON_FILL_HOVER));
    continueBtn.on('pointerout', () => continueBtn.setFillStyle(BUTTON_FILL));

    this.muteText = this.add
      .text(width - 20, 20, this.sfx.muted ? '🔇 音を出す' : '🔊 音を消す', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#555' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.muteText.on('pointerdown', () => {
      const muted = this.sfx.toggleMute();
      this.muteText.setText(muted ? '🔇 音を出す' : '🔊 音を消す');
    });
  }

  openLoadModal() {
    const width = this.scale.width;
    const height = this.scale.height;
    const rowH = 42;
    const panelH = 100 + (SAVE_SLOT_COUNT + 1) * rowH;
    const panelW = 500;
    const objs = [];
    const bg = this.add.rectangle(width / 2, height / 2, panelW, panelH, 0xffffff, 0.98).setStrokeStyle(3, ACCENT_STROKE).setDepth(40);
    objs.push(bg);
    objs.push(
      this.add
        .text(width / 2, height / 2 - panelH / 2 + 24, 'どのセーブを よみこむ?(⬇書き出し/⬆読み込み)', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(41)
    );
    const mainBtnX = width / 2 - 95;
    const downloadBtnX = width / 2 + 130;
    const uploadBtnX = width / 2 + 185;
    const slotRow = (slot, by, label, empty) => {
      const btn = drawRoundedButton(this, mainBtnX, by, 300, 36, { depth: 40, fillColor: empty ? 0xe6e0d4 : BUTTON_FILL });
      const text = this.add
        .text(mainBtnX, by, label, { fontFamily: FONT_FAMILY, fontSize: '14px', color: empty ? '#999' : '#000' })
        .setOrigin(0.5)
        .setDepth(41);
      objs.push(btn.gfx, btn.zone, text);
      if (!empty) {
        btn.on('pointerdown', () => {
          this.sfx.click();
          const data = loadGame(slot);
          objs.forEach((o) => o.destroy());
          this.scene.start('GameBoardScene', { loadData: data });
        });
        btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
        btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));
      }
      return btn;
    };

    const dlUlRow = (slot, by) => {
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
        });
        dlBtn.on('pointerover', () => dlBtn.setFillStyle(BUTTON_FILL_HOVER));
        dlBtn.on('pointerout', () => dlBtn.setFillStyle(BUTTON_FILL));
      }

      const ulBtn = drawRoundedButton(this, uploadBtnX, by, 44, 36, { depth: 40 });
      const ulText = this.add.text(uploadBtnX, by, '⬆', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#000' }).setOrigin(0.5).setDepth(41);
      objs.push(ulBtn.gfx, ulBtn.zone, ulText);
      ulBtn.on('pointerdown', () => {
        this.sfx.click();
        uploadSaveToSlot(slot, () => {
          objs.forEach((o) => o.destroy());
          this.openLoadModal();
        });
      });
      ulBtn.on('pointerover', () => ulBtn.setFillStyle(BUTTON_FILL_HOVER));
      ulBtn.on('pointerout', () => ulBtn.setFillStyle(BUTTON_FILL));
    };

    // オートセーブ(毎ターン自動保存)専用の行を、数値スロットの一番上に表示する
    const autoBy = height / 2 - panelH / 2 + 56;
    const autoSummary = slotSummary(AUTOSAVE_SLOT);
    const autoEmpty = !autoSummary;
    const autoLabel = autoEmpty
      ? 'オートセーブ: なし'
      : `⚡オートセーブ: ${autoSummary.year}年目${autoSummary.month}月/${autoSummary.years}年 ¥${autoSummary.cash}`;
    slotRow(AUTOSAVE_SLOT, autoBy, autoLabel, autoEmpty);
    dlUlRow(AUTOSAVE_SLOT, autoBy);

    for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot++) {
      const by = height / 2 - panelH / 2 + 56 + slot * rowH;
      const summary = slotSummary(slot);
      const empty = !summary;
      const label = empty
        ? `スロット${slot}: 空き`
        : `スロット${slot}: ${summary.year}年目${summary.month}月/${summary.years}年 ¥${summary.cash}`;
      slotRow(slot, by, label, empty);
      dlUlRow(slot, by);
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
}
