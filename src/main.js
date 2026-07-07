import Phaser from 'phaser';
import { TitleScene } from './scenes/TitleScene.js';
import { GameBoardScene } from './scenes/GameBoardScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#87ceeb',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameBoardScene],
};

new Phaser.Game(config);
