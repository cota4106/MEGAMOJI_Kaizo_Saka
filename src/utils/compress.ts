import { decodeGif } from "./gifDecode";
import {
  Extracted, optimizeToSize, scaleCanvas, EncodeResult,
} from "./videoGif";

export type CompressOutcome = {
  blob: Blob,
  /** 拡張子(gif / png) */
  ext: string,
  width: number,
  height: number,
  animated: boolean,
  frameCount: number,
  met: boolean,
};

const flattenOnWhite = (src: HTMLCanvasElement): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Failed to get rendering context.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  return c;
};

const canvasToPng = (c: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNGの生成に失敗しました"))), "image/png");
});

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    resolve(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("画像を読み込めませんでした"));
  };
  img.src = url;
});

const SCALES = [1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2];

/** 静止画: 透明を保ったまま、PNGのまま縮小して上限以下を探す */
const compressStatic = async (
  file: File,
  maxBytes: number,
  lockResolution: boolean,
): Promise<CompressOutcome> => {
  const img = await loadImage(file);
  const base = document.createElement("canvas");
  base.width = img.naturalWidth;
  base.height = img.naturalHeight;
  const bctx = base.getContext("2d");
  if (!bctx) throw new Error("Failed to get rendering context.");
  bctx.drawImage(img, 0, 0);
  let last: { blob: Blob, w: number, h: number } | null = null;
  const scales = lockResolution ? [1] : SCALES;
  for (let i = 0; i < scales.length; i += 1) {
    const w = Math.max(16, Math.round(base.width * scales[i]));
    const h = Math.max(16, Math.round(base.height * scales[i]));
    const c = scales[i] === 1 ? base : scaleCanvas(base, w, h);
    // eslint-disable-next-line no-await-in-loop
    const blob = await canvasToPng(c);
    last = { blob, w, h };
    if (blob.size <= maxBytes) {
      return {
        blob, ext: "png", width: w, height: h, animated: false, frameCount: 1, met: true,
      };
    }
  }
  const l = last as { blob: Blob, w: number, h: number };
  return {
    blob: l.blob, ext: "png", width: l.w, height: l.h, animated: false, frameCount: 1, met: false,
  };
};

/** アニメGIF: 画質・コマ数・大きさを段階的に落として上限以下を探す */
const compressAnimated = async (
  file: File,
  maxBytes: number,
  lockResolution: boolean,
  onTry?: (n: number) => void,
): Promise<CompressOutcome> => {
  const buffer = await file.arrayBuffer();
  const decoded = await decodeGif(buffer);
  const avgDelay = decoded.frames.reduce((s, f) => s + f.delay, 0) / decoded.frames.length;
  const ex: Extracted = {
    frames: decoded.frames.map((f) => flattenOnWhite(f.canvas)),
    fps: 1000 / Math.max(avgDelay, 20),
    width: decoded.width,
    height: decoded.height,
  };
  const outcome = await optimizeToSize(ex, maxBytes, lockResolution, onTry);
  const r: EncodeResult = outcome.result;
  return {
    blob: r.blob,
    ext: "gif",
    width: r.width,
    height: r.height,
    animated: true,
    frameCount: r.frameCount,
    met: outcome.met,
  };
};

export const isAnimatedGifFile = async (file: File): Promise<boolean> => {
  if (file.type !== "image/gif") return false;
  try {
    const decoded = await decodeGif(await file.arrayBuffer());
    return decoded.frames.length > 1;
  } catch (_) {
    return false;
  }
};

export const compressImageFile = async (
  file: File,
  maxBytes: number,
  lockResolution: boolean,
  onTry?: (n: number) => void,
): Promise<CompressOutcome> => {
  if (await isAnimatedGifFile(file)) {
    return compressAnimated(file, maxBytes, lockResolution, onTry);
  }
  return compressStatic(file, maxBytes, lockResolution);
};
