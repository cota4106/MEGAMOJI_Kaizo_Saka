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
  // 0-0.15はそのまま表示、0.15-1.0で散る
  // 1フレーム目 = ちゃんとした絵、というMEGAMOJIのお約束を守るため
  const raw = (keyframe - 0.15) / 0.85;
  const p = raw <= 0 ? 0 : raw ** 1.5;

  // 描画エリア = 中央の cellWidth/2 x cellHeight/2
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

      const dx = Math.cos(angle) * dist * p * cellWidth * 0.8;
      // 重力っぽく下に落ちる分を足す
      const dy = Math.sin(angle) * dist * p * cellHeight * 0.8
        + p * p * cellHeight * 0.3;

      const cx = baseX + ix * pw + pw / 2 + dx;
      const cy = baseY + iy * ph + ph / 2 + dy;
      const rot = rotMax * p;

      const sx = offsetH + ix * sw;
      const sy = offsetV + iy * sh;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      // 最後はほぼ透明にしてループ時のポップを和らげる
      ctx.globalAlpha = 1 - p * 0.9;
      ctx.drawImage(image, sx, sy, sw, sh, -pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
};

export default animationBarabara;
