import { decodeGif, DecodedGifFrame } from "./gifDecode";

export type EditOptions = {
  /** 再生速度の倍率(2なら2倍速) */
  speed: number,
  reverse: boolean,
  /** 往復(行って戻る)にする */
  pingPong: boolean,
  /** 使うコマの範囲(1始まり、両端を含む) */
  start: number,
  end: number,
};

export type EditedGif = {
  blob: Blob,
  frameCount: number,
  durationMs: number,
  width: number,
  height: number,
};

const MIN_DELAY = 20;

/** コマの並びと表示時間を、編集の指定どおりに作り直す(画像そのものは変えない) */
export const applyEdits = (
  frames: DecodedGifFrame[],
  opt: EditOptions,
): { canvas: HTMLCanvasElement, delay: number }[] => {
  const s = Math.max(1, Math.min(opt.start, frames.length));
  const e = Math.max(s, Math.min(opt.end, frames.length));
  let seq = frames.slice(s - 1, e);
  if (opt.reverse) {
    seq = [...seq].reverse();
  }
  if (opt.pingPong && seq.length > 2) {
    // 行きの最後と戻りの最初が同じコマで2回続かないよう、両端を1つずつ除く
    seq = [...seq, ...[...seq].reverse().slice(1, -1)];
  } else if (opt.pingPong && seq.length === 2) {
    seq = [...seq];
  }
  const speed = Math.max(0.1, opt.speed);
  return seq.map((f) => ({
    canvas: f.canvas,
    delay: Math.max(MIN_DELAY, Math.round(f.delay / speed)),
  }));
};

const hasTransparency = (frames: { canvas: HTMLCanvasElement }[]): boolean => {
  for (let i = 0; i < frames.length; i += 1) {
    const { canvas } = frames[i];
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let p = 3; p < data.length; p += 4) {
        if (data[p] < 128) return true;
      }
    }
  }
  return false;
};

const encode = (
  frames: { canvas: HTMLCanvasElement, delay: number }[],
  width: number,
  height: number,
  transparent: boolean,
): Promise<Blob> => new Promise((resolve, reject) => {
  const worker = new Worker("./gifworker.js");
  worker.addEventListener("error", () => {
    worker.terminate();
    reject(new Error("GIFの生成に失敗しました"));
  });
  worker.postMessage({
    initialize: {
      width, height, delay: 100, transparent,
    },
  });
  frames.forEach((f) => {
    const ctx = f.canvas.getContext("2d");
    if (!ctx) return;
    const { data } = ctx.getImageData(0, 0, width, height);
    worker.postMessage({ addFrame: data, frameDelay: f.delay });
  });
  worker.addEventListener("message", (res) => {
    worker.terminate();
    resolve(res.data);
  });
  worker.postMessage({ finish: true });
});

export const editGif = async (
  decoded: { frames: DecodedGifFrame[], width: number, height: number },
  opt: EditOptions,
): Promise<EditedGif> => {
  const seq = applyEdits(decoded.frames, opt);
  const blob = await encode(seq, decoded.width, decoded.height, hasTransparency(seq));
  return {
    blob,
    frameCount: seq.length,
    durationMs: seq.reduce((s, f) => s + f.delay, 0),
    width: decoded.width,
    height: decoded.height,
  };
};

export const loadGifFile = async (file: File) => decodeGif(await file.arrayBuffer());
