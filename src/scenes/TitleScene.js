import Phaser from 'phaser';
import { drawRoundedButton, BUTTON_FILL, BUTTON_FILL_HOVER, ACCENT_STROKE } from '../ui.js';
import { SFX } from '../sfx.js';

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
        fontSize: '18px',
        color: '#555',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 - 60, 'プレイ年数をえらんでね', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#333' })
      .setOrigin(0.5);

    const years = [3, 5, 10];
    years.forEach((y, i) => {
      const bx = width / 2 + (i - 1) * 180;
      const by = height / 2 + 10;
      const btn = drawRoundedButton(this, bx, by, 150, 70, { strokeColor: y === 5 ? ACCENT_STROKE : undefined, strokeWidth: y === 5 ? 4 : 2 });
      this.add
        .text(bx, by, `${y}年`, { fontFamily: FONT_FAMILY, fontSize: '26px', color: '#000' })
        .setOrigin(0.5)
        .setDepth(2);
      btn.on('pointerdown', () => {
        this.sfx.gameStart();
        this.scene.start('GameBoardScene', { years: y });
      });
      btn.on('pointerover', () => btn.setFillStyle(BUTTON_FILL_HOVER));
      btn.on('pointerout', () => btn.setFillStyle(BUTTON_FILL));
    });

    this.add
      .text(width / 2, height / 2 + 150, 'あなた 🐕 vs CPU 🐱🐰🐻 の4人対戦', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#777' })
      .setOrigin(0.5);

    this.muteText = this.add
      .text(width - 20, 20, this.sfx.muted ? '🔇 音を出す' : '🔊 音を消す', { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#555' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.muteText.on('pointerdown', () => {
      const muted = this.sfx.toggleMute();
      this.muteText.setText(muted ? '🔇 音を出す' : '🔊 音を消す');
    });
  }
}
