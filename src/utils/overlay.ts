/**
 * パーツ重ね(オーバーレイ)機能の共通処理。
 *
 * テキスト/画像ファイルモードで作った元画像(canvas)の上にパーツを重ねた
 * 「合成済みcanvas」を作る。合成は Target(エフェクト) に渡す前に行うため、
 * Canvas2D/WebGLエフェクト・分割・履歴・プリセット・ギャラリーは
 * 通常の元画像と全く同じ経路で動く。
 */

export type OverlayItem = {
  id: string;
  /** 画像URL(パーツのsvg、またはアップロード画像のdata URL) */
  src: string;
  /** 表示名 */
  label: string;
  /** 中心位置(元画像の幅/高さに対する%, 0-100) */
  x: number;
  y: number;
  /** 大きさ(元画像の短辺に対する%) */
  size: number;
  /** 回転(度) */
  rotation: number;
  flipX: boolean;
  /** 不透明度(%) */
  opacity: number;
};

/** スナップショットに保存する際の型(OverlayItemと同じ。JSON化可能) */
export type OverlaySnapshot = OverlayItem[];

type Trimmed = { canvas: HTMLCanvasElement };

const cache = new Map<string, Promise<Trimmed>>();

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("パーツ画像の読み込みに失敗しました"));
  img.src = src;
});

const RASTER_SIZE = 512;

/**
 * 画像を読み込み、透明な余白を切り取ったcanvasにして返す(結果はキャッシュ)。
 * 36x36のsvgパーツは余白が多いため、切り取ることで「手」そのものの位置を
 * 直感的に動かせるようになる。
 */
export const loadTrimmed = (src: string): Promise<Trimmed> => {
  const hit = cache.get(src);
  if (hit) return hit;
  const p = (async (): Promise<Trimmed> => {
    const img = await loadImage(src);
    const nw = img.naturalWidth || RASTER_SIZE;
    const nh = img.naturalHeight || RASTER_SIZE;
    // 大きすぎる画像は縮小(メモリ節約)、小さいsvgは拡大して鮮明に
    const scale = RASTER_SIZE / Math.max(nw, nh);
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const full = document.createElement("canvas");
    full.width = w;
    full.height = h;
    const fctx = full.getContext("2d");
    if (!fctx) throw new Error("Failed to get rendering context.");
    fctx.drawImage(img, 0, 0, w, h);
    const data = fctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      return { canvas: full };
    }
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d")!.drawImage(full, minX, minY, cw, ch, 0, 0, cw, ch);
    return { canvas: out };
  })();
  cache.set(src, p);
  p.catch(() => cache.delete(src));
  return p;
};

/** 元画像canvasにパーツを重ね描きする(元canvasは変更しない) */
export const compositeOverlays = async (
  source: HTMLCanvasElement,
  items: OverlayItem[],
): Promise<HTMLCanvasElement> => {
  if (items.length === 0) {
    return source;
  }
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Failed to get rendering context.");
  ctx.drawImage(source, 0, 0);
  const base = Math.min(source.width, source.height);
  for (const item of items) {
    let trimmed: Trimmed;
    try {
      trimmed = await loadTrimmed(item.src);
    } catch (_) {
      continue; // 読み込めないパーツは飛ばす(エフェクト処理は止めない)
    }
    const c = trimmed.canvas;
    const longSide = Math.max(c.width, c.height);
    const k = (base * item.size / 100) / longSide;
    const dw = c.width * k;
    const dh = c.height * k;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, item.opacity / 100));
    ctx.translate(source.width * item.x / 100, source.height * item.y / 100);
    ctx.rotate(item.rotation * Math.PI / 180);
    if (item.flipX) ctx.scale(-1, 1);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(c, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  return out;
};

export const newOverlayId = (): string => `ov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** JSON由来の値を安全なOverlayItem[]に整える(古い/壊れたスナップショット対策) */
export const sanitizeOverlays = (raw: unknown): OverlayItem[] => {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown, d: number, lo: number, hi: number): number => {
    const n = typeof v === "number" && globalThis.isFinite(v) ? v : d;
    return Math.min(hi, Math.max(lo, n));
  };
  return raw
    .filter((r) => r && typeof r === "object" && typeof (r as OverlayItem).src === "string")
    .map((r: any) => ({
      id: typeof r.id === "string" ? r.id : newOverlayId(),
      src: r.src,
      label: typeof r.label === "string" ? r.label : "パーツ",
      x: num(r.x, 50, -50, 150),
      y: num(r.y, 50, -50, 150),
      size: num(r.size, 50, 1, 300),
      rotation: num(r.rotation, 0, -180, 180),
      flipX: !!r.flipX,
      opacity: num(r.opacity, 100, 0, 100),
    }));
};
