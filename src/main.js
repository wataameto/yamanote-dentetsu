import Phaser from 'phaser';
import { StageSelectScene } from './scenes/StageSelectScene.js';
import { StationScene } from './scenes/StationScene.js';

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
  scene: [StageSelectScene, StationScene],
};

new Phaser.Game(config);
