/**
 * 動画 → GIF 変換の処理。
 * 動画から指定範囲のコマを取り出し(extractFrames)、gifworkerでGIF化(encodeGif)し、
 * サイズ上限が指定されたときは画質・FPS・解像度を段階的に落として収める(optimizeToSize)。
 */

export const MAX_FRAMES = 300;
export const MAX_OUTPUT_SIZE = 512;

/** src(canvas)を w x h に縮小/拡大する。縮小は半分ずつ行って荒れを抑える */
export const scaleCanvas = (src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement => {
  let cur = src;
  while (cur.width / 2 >= w && cur.height / 2 >= h) {
    const half = document.createElement("canvas");
    half.width = Math.floor(cur.width / 2);
    half.height = Math.floor(cur.height / 2);
    const hctx = half.getContext("2d");
    if (!hctx) throw new Error("Failed to get rendering context.");
    hctx.imageSmoothingQuality = "high";
    hctx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Failed to get rendering context.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, w, h);
  return out;
};

const seekTo = (video: HTMLVideoElement, t: number): Promise<void> => new Promise((resolve, reject) => {
  const onSeeked = () => {
    window.clearTimeout(timer);
    video.removeEventListener("seeked", onSeeked);
    resolve();
  };
  const timer = window.setTimeout(() => {
    video.removeEventListener("seeked", onSeeked);
    reject(new Error("動画のシークがタイムアウトしました"));
  }, 8000);
  video.addEventListener("seeked", onSeeked);
  video.currentTime = t;
});

export type Extracted = { frames: HTMLCanvasElement[], fps: number, width: number, height: number };

/** 動画の [start, end] 秒から fps 間隔でコマを取り出し、width x height にして返す */
export const extractFrames = async (
  video: HTMLVideoElement,
  start: number,
  end: number,
  fps: number,
  width: number,
  height: number,
  onProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<Extracted> => {
  const total = Math.max(1, Math.floor((end - start) * fps));
  const native = document.createElement("canvas");
  native.width = video.videoWidth;
  native.height = video.videoHeight;
  const nctx = native.getContext("2d", { willReadFrequently: true });
  if (!nctx) throw new Error("Failed to get rendering context.");
  const frames: HTMLCanvasElement[] = [];
  video.pause();
  for (let i = 0; i < total; i += 1) {
    if (isCancelled && isCancelled()) throw new Error("cancelled");
    // 末尾ちょうどだとシークに失敗する動画があるので、わずかに内側を指す
    const t = Math.min(start + i / fps, Math.max(0, video.duration - 0.001));
    // eslint-disable-next-line no-await-in-loop
    await seekTo(video, t);
    nctx.fillStyle = "#ffffff"; // 透明部分があっても白で埋める(GIFは動画なので不透明で扱う)
    nctx.fillRect(0, 0, native.width, native.height);
    nctx.drawImage(video, 0, 0, native.width, native.height);
    frames.push(scaleCanvas(native, width, height));
    if (onProgress) onProgress(i + 1, total);
  }
  return { frames, fps, width, height };
};

/** コマ列をGIFにする。colors=パレット色数、delayMs=1コマの表示時間 */
export const encodeGif = (
  frames: HTMLCanvasElement[],
  width: number,
  height: number,
  delayMs: number,
  colors: number,
): Promise<Blob> => new Promise((resolve, reject) => {
  const worker = new Worker("./gifworker.js");
  worker.addEventListener("error", () => {
    worker.terminate();
    reject(new Error("GIFの生成に失敗しました"));
  });
  worker.postMessage({
    initialize: {
      width, height, delay: delayMs, transparent: false, colors,
    },
  });
  frames.forEach((f) => {
    const ctx = f.getContext("2d");
    if (!ctx) return;
    const { data } = ctx.getImageData(0, 0, width, height);
    worker.postMessage({ addFrame: data, frameDelay: delayMs });
  });
  worker.addEventListener("message", (res) => {
    worker.terminate();
    resolve(res.data);
  });
  worker.postMessage({ finish: true });
});

export type Step = { scale: number, colors: number, fpsFactor: number };

/** 画質の高い順。後ろほどファイルサイズが小さくなる */
export const QUALITY_STEPS: Step[] = [
  { scale: 1, colors: 256, fpsFactor: 1 },
  { scale: 1, colors: 128, fpsFactor: 1 },
  { scale: 1, colors: 64, fpsFactor: 1 },
  { scale: 1, colors: 64, fpsFactor: 0.75 },
  { scale: 0.85, colors: 64, fpsFactor: 0.75 },
  { scale: 0.85, colors: 48, fpsFactor: 0.75 },
  { scale: 0.7, colors: 48, fpsFactor: 0.75 },
  { scale: 0.7, colors: 32, fpsFactor: 0.6 },
  { scale: 0.55, colors: 32, fpsFactor: 0.6 },
  { scale: 0.55, colors: 32, fpsFactor: 0.5 },
  { scale: 0.4, colors: 32, fpsFactor: 0.5 },
  { scale: 0.3, colors: 32, fpsFactor: 0.4 },
];

export type EncodeResult = {
  blob: Blob,
  width: number,
  height: number,
  fps: number,
  colors: number,
  frameCount: number,
};

export const encodeWithStep = async (
  ex: Extracted,
  step: Step,
  lockResolution: boolean,
): Promise<EncodeResult> => {
  const scale = lockResolution ? 1 : step.scale;
  const w = Math.max(16, Math.round(ex.width * scale));
  const h = Math.max(16, Math.round(ex.height * scale));
  // コマの間引き: 元(ex.fps)から fpsFactor 倍のFPSになるよう等間隔に選ぶ
  const f = Math.min(1, step.fpsFactor);
  const n = ex.frames.length;
  const outCount = Math.max(1, Math.floor((n - 1) * f) + 1);
  const picked: HTMLCanvasElement[] = [];
  for (let k = 0; k < outCount; k += 1) {
    const src = ex.frames[Math.min(n - 1, Math.round(k / f))];
    picked.push(scale === 1 ? src : scaleCanvas(src, w, h));
  }
  const fps = ex.fps * f;
  const delayMs = Math.max(20, Math.round(1000 / fps));
  const blob = await encodeGif(picked, w, h, delayMs, step.colors);
  return {
    blob, width: w, height: h, fps: Math.round(fps * 10) / 10, colors: step.colors, frameCount: picked.length,
  };
};

export type OptimizeOutcome = { result: EncodeResult, met: boolean, tried: number };

/**
 * maxBytes 以下になる最も画質の高い設定を探す(段階を二分探索)。
 * 最後の段階でも収まらなければ、最も小さい結果と met=false を返す。
 */
export const optimizeToSize = async (
  ex: Extracted,
  maxBytes: number,
  lockResolution: boolean,
  onTry?: (n: number) => void,
  isCancelled?: () => boolean,
): Promise<OptimizeOutcome> => {
  const cache = new Map<number, EncodeResult>();
  let tried = 0;
  const run = async (i: number): Promise<EncodeResult> => {
    const hit = cache.get(i);
    if (hit) return hit;
    if (isCancelled && isCancelled()) throw new Error("cancelled");
    const r = await encodeWithStep(ex, QUALITY_STEPS[i], lockResolution);
    tried += 1;
    if (onTry) onTry(tried);
    cache.set(i, r);
    return r;
  };
  const first = await run(0);
  if (first.blob.size <= maxBytes) return { result: first, met: true, tried };
  const lastIx = QUALITY_STEPS.length - 1;
  const last = await run(lastIx);
  if (last.blob.size > maxBytes) return { result: last, met: false, tried };
  let lo = 1;
  let hi = lastIx; // hi は条件を満たす
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    // eslint-disable-next-line no-await-in-loop
    const r = await run(mid);
    if (r.blob.size <= maxBytes) hi = mid; else lo = mid + 1;
  }
  return { result: await run(hi), met: true, tried };
};
