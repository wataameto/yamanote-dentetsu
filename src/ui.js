// 角丸+やわらかい影のついた「かわいいボタン」を作る共通ヘルパー。
// Rectangleの代わりにGraphicsで描画しつつ、既存コードと同じ
// on('pointerdown'/'pointerover'/'pointerout') / setFillStyle() が使えるようにする。
export const BUTTON_FILL = 0xfff6ec;
export const BUTTON_FILL_HOVER = 0xffe8cc;
export const BUTTON_STROKE = 0xc98a54;
export const ACCENT_STROKE = 0xdd8800;

export function drawRoundedButton(scene, x, y, w, h, options = {}) {
  const { fillColor = BUTTON_FILL, strokeColor = BUTTON_STROKE, strokeWidth = 3, radius, depth = 0 } = options;
  const r = radius ?? Math.min(h * 0.35, 16);
  const gfx = scene.add.graphics().setDepth(depth);

  const draw = (fc) => {
    gfx.clear();
    gfx.fillStyle(0x000000, 0.12);
    gfx.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 4, w, h, r);
    gfx.fillStyle(fc, 1);
    gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
    gfx.lineStyle(strokeWidth, strokeColor, 1);
    gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
  };
  draw(fillColor);

  const zone = scene.add
    .zone(x, y, w, h)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .setDepth(depth + 1);

  return {
    gfx,
    zone,
    setFillStyle: (fc) => draw(fc),
    on: (evt, cb) => zone.on(evt, cb),
    setVisible: (v) => {
      gfx.setVisible(v);
      zone.setVisible(v);
      if (v) zone.setInteractive({ useHandCursor: true });
      else zone.disableInteractive();
      return this;
    },
  };
}
