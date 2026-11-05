import { DecodedGifFrame } from "./gifDecode";
import { QUALITY_STEPS, Step } from "./videoGif";

export type SplitOptions = {
  /** 分割後の「1つ1つ」の最大ファイルサイズ(バイト)。省略/null なら制限なし */
  maxPieceBytes?: number | null,
  /** true: 解像度は下げず、色数とFPSだけで調整する */
  lockResolution?: boolean,
};

export type SplitInfo = {
  /** 最も大きいピースのサイズ(バイト) */
  largestBytes: number,
  /** 上限に収まったか(上限指定がないときは常にtrue) */
  met: boolean,
  size: number, // 1ピースの縦横(px)
  colors: number,
  frameCount: number,
  tried: number,
};

export type SplitResult = { images: Blob[][], info: SplitInfo };

/**
 * デコード済みGIFのコマを hCells x vCells のマスに分割し、
 * マスごとに元の動き(表示時間含む)をそのまま保ったGIFを生成する。
 * エフェクトは一切かけない、素の分割専用処理。
 *
 * 各マスは元の画像の比率に関係なく正方形で出力する。
 * maxPieceBytes を指定すると、すべてのピースが上限以下になるまで
 * 色数・FPS(・解像度)を段階的に下げる(全ピース共通の設定で、動きがずれないようにする)。
 */
export async function splitGifIntoCells(
  frames: DecodedGifFrame[],
  width: number,
  height: number,
  hCells: number,
  vCells: number,
  onProgress?: (done: number, total: number) => void,
  options: SplitOptions = {},
): Promise<SplitResult> {
  const cellWidth = Math.floor(width / hCells);
  const cellHeight = Math.floor(height / vCells);
  // 出力は元の画像の比率に関係なく、各マスを正方形にする
  // (Slack/Discordは正方形のマスに表示するため、長方形だと隙間ができる)。
  // 1マスの面積を保つ大きさにし、マスの縦横比が違う場合はその分引き伸ばす。
  const baseSize = Math.max(1, Math.min(256, Math.round(Math.sqrt(cellWidth * cellHeight))));

  const encodeStep = async (step: Step, stepIx: number, attempt: number, attempts: number): Promise<SplitResult> => {
    const outSize = options.lockResolution ? baseSize : Math.max(8, Math.round(baseSize * step.scale));

    // コマの間引き(元のコマ数に対して fpsFactor 倍になるよう等間隔に選ぶ)
    const f = Math.min(1, step.fpsFactor);
    const n = frames.length;
    const outCount = Math.max(1, Math.floor((n - 1) * f) + 1);
    const idxs: number[] = [];
    for (let k = 0; k < outCount; k += 1) {
      const ix = Math.min(n - 1, Math.round(k / f));
      if (idxs.length === 0 || ix > idxs[idxs.length - 1]) idxs.push(ix);
    }
    const delays = idxs.map((ix, k) => {
      const next = k + 1 < idxs.length ? idxs[k + 1] : n;
      let sum = 0;
      for (let j = ix; j < next; j += 1) sum += frames[j].delay;
      return Math.max(20, sum);
    });

    const encoders: Worker[][] = [];
    for (let y = 0; y < vCells; y += 1) {
      const row: Worker[] = [];
      for (let x = 0; x < hCells; x += 1) {
        const worker = new Worker("./gifworker.js");
        worker.postMessage({
          initialize: {
            width: outSize,
            height: outSize,
            delay: 100, // フォールバック値。実際はコマごとにframeDelayを指定する
            transparent: true,
            colors: step.colors,
          },
        });
        row.push(worker);
      }
      encoders.push(row);
    }

    const cutoutCanvas = document.createElement("canvas");
    cutoutCanvas.width = outSize;
    cutoutCanvas.height = outSize;
    const cutoutCtx = cutoutCanvas.getContext("2d");
    if (!cutoutCtx) {
      throw new Error("Failed to get rendering context.");
    }
    cutoutCtx.imageSmoothingQuality = "high";

    idxs.forEach((frameIx, k) => {
      const frame = frames[frameIx];
      for (let y = 0; y < vCells; y += 1) {
        for (let x = 0; x < hCells; x += 1) {
          cutoutCtx.clearRect(0, 0, outSize, outSize);
          cutoutCtx.drawImage(
            frame.canvas,
            x * cellWidth,
            y * cellHeight,
            cellWidth,
            cellHeight,
            0,
            0,
            outSize,
            outSize,
          );
          const { data } = cutoutCtx.getImageData(0, 0, outSize, outSize);
          encoders[y][x].postMessage({
            addFrame: data,
            frameDelay: delays[k],
          });
        }
      }
      if (onProgress && attempts === 1) {
        onProgress(k + 1, idxs.length);
      }
    });
    if (onProgress && attempts > 1) {
      onProgress(attempt, attempts);
    }

    const images = await Promise.all<Blob[]>(
      encoders.map((row) => Promise.all<Blob>(
        row.map((worker) => (
          new Promise((resolve) => {
            worker.addEventListener("message", (res) => {
              worker.terminate();
              resolve(res.data);
            });
            worker.postMessage({ finish: true });
          })
        )),
      )),
    );
    const largest = Math.max(...images.map((row) => Math.max(...row.map((b) => b.size))));
    return {
      images,
      info: {
        largestBytes: largest,
        met: true,
        size: outSize,
        colors: step.colors,
        frameCount: idxs.length,
        tried: stepIx,
      },
    };
  };

  const limit = options.maxPieceBytes && options.maxPieceBytes > 0 ? options.maxPieceBytes : null;
  if (!limit) {
    return encodeStep(QUALITY_STEPS[0], 0, 1, 1);
  }

  // 上限に収まる最も画質の高い段階を二分探索する(全ピースの最大サイズで判定)
  const cache = new Map<number, SplitResult>();
  let tried = 0;
  const lastIx = QUALITY_STEPS.length - 1;
  const expectedTries = 2 + Math.ceil(Math.log2(QUALITY_STEPS.length));
  const run = async (i: number): Promise<SplitResult> => {
    const hit = cache.get(i);
    if (hit) return hit;
    tried += 1;
    const r = await encodeStep(QUALITY_STEPS[i], i, tried, expectedTries);
    r.info.tried = tried;
    cache.set(i, r);
    return r;
  };
  const finish = (r: SplitResult, met: boolean): SplitResult => ({
    images: r.images,
    info: { ...r.info, met, tried },
  });

  const first = await run(0);
  if (first.info.largestBytes <= limit) return finish(first, true);
  const last = await run(lastIx);
  if (last.info.largestBytes > limit) return finish(last, false);
  let lo = 1;
  let hi = lastIx;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    // eslint-disable-next-line no-await-in-loop
    const r = await run(mid);
    if (r.info.largestBytes <= limit) hi = mid; else lo = mid + 1;
  }
  return finish(await run(hi), true);
}
