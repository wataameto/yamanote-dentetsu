import Phaser from 'phaser';
import { drawRoundedButton, BUTTON_FILL, BUTTON_FILL_HOVER } from '../ui.js';

const FONT_FAMILY = '"Kosugi Maru", sans-serif';

// 駅を選んだあとのゲーム本編(じゅんびちゅう)。ここに新ゲームを実装していく。
// data: { name: 駅名, rank: 難易度rank(0〜7) }
export class StationScene extends Phaser.Scene {
  constructor() {
    super('StationScene');
  }

  create(data = {}) {
    const width = this.scale.width;
    const height = this.scale.height;
    const name = data.name ?? '???';

    this.add
      .text(width / 2, height / 2 - 60, `${name}駅`, { fontFamily: FONT_FAMILY, fontSize: '48px', color: '#000' })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2, '🚧 じゅんびちゅう 🚧', { fontFamily: FONT_FAMILY, fontSize: '24px', color: '#666' })
      .setOrigin(0.5);

    const backButton = drawRoundedButton(this, width / 2, height / 2 + 90, 220, 56);
    this.add
      .text(width / 2, height / 2 + 90, '駅選択にもどる', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#000' })
      .setDepth(2)
      .setOrigin(0.5);
    backButton.on('pointerdown', () => this.scene.start('StageSelectScene'));
    backButton.on('pointerover', () => backButton.setFillStyle(BUTTON_FILL_HOVER));
    backButton.on('pointerout', () => backButton.setFillStyle(BUTTON_FILL));
  }
}
