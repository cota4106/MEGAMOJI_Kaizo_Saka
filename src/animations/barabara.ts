import { Animation } from "../types";

const COLS = 8;
const ROWS = 8;

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
  // 0-0.12は溜めて膨らむ、0.12-1.0でパンッと弾けて散る
  // 1フレーム目 = ちゃんとした絵、というMEGAMOJIのお約束を守るため
  const BURST_START = 0.12;
  let t: number;
  let inflate: number;
  if (keyframe < BURST_START) {
    t = 0;
    inflate = 1 + 0.18 * (keyframe / BURST_START);
  } else {
    const tt = (keyframe - BURST_START) / (1 - BURST_START);
    // easeOutCubic = 初速が速い = 弾ける感じ
    t = 1 - (1 - tt) ** 3;
    // 弾けた瞬間に一気に元のサイズに戻す
    const shrink = Math.min(1, tt * 4);
    inflate = 1.18 - 0.18 * shrink;
  }
  const p = t;

  // 描画エリア = 中央の cellWidth/2 x cellHeight/2
  // inflate = 中心から膨らむ (溜め→弾け)
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
      const angle = rand(n * 3 + 1) * Math.PI * 2;
      const dist = 0.3 + rand(n * 3 + 2) * 0.7; // 0.3-1.0
      const rotMax = (rand(n * 3 + 3) - 0.5) * Math.PI * 4;

      const dx = Math.cos(angle) * dist * p * cellWidth * 1.0;
      // 重力っぽく下に落ちる分を足す
      const dy = Math.sin(angle) * dist * p * cellHeight * 1.0
        + p * p * cellHeight * 0.35;

      const bx = baseX + ix * pw + pw / 2;
      const by = baseY + iy * ph + ph / 2;
      const cx = centerX + (bx - centerX) * inflate + dx;
      const cy = centerY + (by - centerY) * inflate + dy;
      const rot = rotMax * p;

      const sx = offsetH + ix * sw;
      const sy = offsetV + iy * sh;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      // 弾けてる最中は見せて、後半で消す (ループ時のポップ緩和)
      const fade = p <= 0.4 ? 0 : (p - 0.4) / 0.6;
      ctx.globalAlpha = 1 - fade * 0.9;
      ctx.drawImage(image, sx, sy, sw, sh, -pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
};

export default animationBarabara;
