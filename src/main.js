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

window.__game = window.__game = window.__game = new Phaser.Game(config);
