import { Animation } from "../types";

const COLS = 10;
const ROWS = 10;

// 決定的な疑似乱数 (フレーム間でバラつかないように)
const rand = (n: number): number => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const animationBarabara: Animation = (
  keyframe,
  ctx,
  image,
  offsetH,
  offsetV,
  width,
  height,
  cellWidth,
  cellHeight,
) => {
  // gif準拠: 1枚目は完全な絵、2枚目で即ヒビ割れ→あとは飛散+縮小+フェード
  // 溜めの膨らみなし、回転なし、四角のまま飛ぶ
  // easeOutで初速MAX = パンッと弾ける感じ
  const t = keyframe <= 0 ? 0 : 1 - (1 - keyframe) ** 2;
  const p = t;

  const centerX = cellWidth / 2;
  const centerY = cellHeight / 2;
  const baseX = cellWidth / 4;
  const baseY = cellHeight / 4;
  const pw = (cellWidth / 2) / COLS;
  const ph = (cellHeight / 2) / ROWS;
  const sw = width / COLS;
  const sh = height / ROWS;

  for (let iy = 0; iy < ROWS; iy += 1) {
    for (let ix = 0; ix < COLS; ix += 1) {
      const n = iy * COLS + ix;
      const bx = baseX + ix * pw + pw / 2;
      const by = baseY + iy * ph + ph / 2;

      // 中心から外向き + 少しだけランダムにずらす
      const radial = Math.atan2(by - centerY, bx - centerX);
      const angle = radial + (rand(n * 3 + 1) - 0.5) * 1.0;
      const dist = 0.4 + rand(n * 3 + 2) * 0.6; // 0.4-1.0

      const dx = Math.cos(angle) * dist * p * cellWidth * 0.55;
      const dy = Math.sin(angle) * dist * p * cellHeight * 0.55
        + p * p * cellHeight * 0.15;

      const cx = bx + dx;
      const cy = by + dy;
      // 回転はほぼなし = gifみたいに四角のまま
      const rot = (rand(n * 3 + 3) - 0.5) * 0.6 * p;

      // 割れた瞬間にヒビ(隙間)が見えるよう即縮小、その後消えるまで縮小
      const crack = 0.18 * Math.min(1, p * 10);
      const shrink = 0.55 * p;
      const pieceScale = Math.max(0.05, 1 - crack - shrink);

      const sx = offsetH + ix * sw;
      const sy = offsetV + iy * sh;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(pieceScale, pieceScale);
      ctx.globalAlpha = (1 - p) ** 1.2;
      if (ctx.globalAlpha > 0.01) {
        ctx.drawImage(image, sx, sy, sw, sh, -pw / 2, -ph / 2, pw, ph);
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
};

export default animationBarabara;
