/**
 * パーツ重ね(オーバーレイ)機能の共通処理。
 *
 * テキスト/画像ファイルモードで作った元画像(canvas)の上にパーツを重ねた
 * 「合成済みcanvas」を作る。合成は Target(エフェクト) に渡す前に行うため、
 * Canvas2D/WebGLエフェクト・分割・履歴・プリセット・ギャラリーは
 * 通常の元画像と全く同じ経路で動く。
 */

import { makeTextImage } from "./textimage";
import fonts, { fontStatusWatcher } from "../constants/fonts";
import { OUTLINE_THICKNESS } from "../constants/emoji";

/** 重ねるテキストの設定(テキストモードの主な設定に準拠) */
export type TextOverlayConf = {
  content: string;
  /** フォント(constants/fonts の value。例: "normal 1em 'Mplus1Bold'") */
  font: string;
  color: string;
  align: "stretch" | "center" | "left" | "right";
  outlineOn: boolean;
  outlineColor: string;
  /** テキストモードと同じ単位(1.0 = 標準) */
  outlineThickness: number;
  /** 行間(文字分) */
  lineSpacing: number;
  /** 縦書き(省略時は横書き) */
  vertical?: boolean;
};

export const DEFAULT_TEXT_CONF: TextOverlayConf = {
  content: "テキスト",
  font: fonts[0].fonts[0].value,
  color: "#ffb700",
  align: "center",
  outlineOn: false,
  outlineColor: "#ffffff",
  outlineThickness: 1,
  lineSpacing: 0.05,
};

export type OverlayItem = {
  id: string;
  /** 画像URL(パーツのsvg、またはアップロード画像のdata URL) */
  src: string;
  /** 表示名 */
  label: string;
  /** テキストパーツのとき設定が入る(このときsrcは使わない) */
  text?: TextOverlayConf;
  /** パーツのカテゴリ(パーツモードで重なり順の初期位置を決めるのに使う) */
  category?: string;
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
  /** false のとき、エフェクトをかけず、エフェクト後の絵の上にそのまま重ねる(省略時はかける) */
  effect?: boolean;
};

/** スナップショットに保存する際の型(OverlayItemと同じ。JSON化可能) */
export type OverlaySnapshot = OverlayItem[];

type Trimmed = {
  canvas: HTMLCanvasElement,
  /** 元の画像の中でこのパーツが元々あった位置/大きさ(%)。パーツモードの初期値に使う */
  natural: { x: number, y: number, size: number },
};

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
      return { canvas: full, natural: { x: 50, y: 50, size: 100 } };
    }
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d")!.drawImage(full, minX, minY, cw, ch, 0, 0, cw, ch);
    const longFull = Math.max(w, h);
    return {
      canvas: out,
      natural: {
        x: Math.round((minX + cw / 2) / w * 1000) / 10,
        y: Math.round((minY + ch / 2) / h * 1000) / 10,
        size: Math.round(Math.max(cw, ch) / longFull * 1000) / 10,
      },
    };
  })();
  cache.set(src, p);
  p.catch(() => cache.delete(src));
  return p;
};

const FONT_PX = 192; // 重ねテキストを描くときの基準の高さ(大きく描いて縮小して使う)
const textCache = new Map<string, Promise<Trimmed | null>>();

const waitFontLoaded = (fontValue: string): Promise<void> => new Promise((resolve) => {
  const entry = fonts.flatMap((g) => g.fonts).find((f) => f.value === fontValue);
  if (!entry || entry.loaded) {
    resolve();
    return;
  }
  const timer = window.setTimeout(() => {
    fontStatusWatcher.off("load", onLoad); // eslint-disable-line @typescript-eslint/no-use-before-define
    resolve();
  }, 4000);
  const onLoad = () => {
    if (entry.loaded) {
      window.clearTimeout(timer);
      fontStatusWatcher.off("load", onLoad);
      resolve();
    }
  };
  fontStatusWatcher.on("load", onLoad);
});

/** テキストの設定をcanvasにする(結果はキャッシュ)。空文字ならnull */
export const renderTextOverlay = (conf: TextOverlayConf): Promise<Trimmed | null> => {
  if (!conf.content.trim()) return Promise.resolve(null);
  const key = JSON.stringify(conf);
  const hit = textCache.get(key);
  if (hit) return hit;
  const p = (async (): Promise<Trimmed | null> => {
    await waitFontLoaded(conf.font);
    const canvas = makeTextImage(
      conf.content,
      conf.color,
      conf.font,
      FONT_PX,
      conf.align,
      conf.lineSpacing,
      conf.outlineOn ? [conf.outlineColor] : [],
      conf.outlineThickness * OUTLINE_THICKNESS * (FONT_PX / 1.5),
      0,
      0,
      [],
      0.02,
      !!conf.vertical,
    );
    return { canvas, natural: { x: 50, y: 50, size: 70 } };
  })();
  textCache.set(key, p);
  if (textCache.size > 60) {
    const first = textCache.keys().next().value;
    if (first !== undefined) textCache.delete(first);
  }
  p.catch(() => textCache.delete(key));
  return p;
};

/** パーツ1つ分の画像(テキストパーツならテキストを描いたcanvas)を返す。描くものがなければnull */
export const loadItemImage = (item: OverlayItem): Promise<Trimmed | null> => (
  item.text ? renderTextOverlay(item.text) : loadTrimmed(item.src)
);

/** 元画像canvasにパーツを重ね描きする(元canvasは変更しない) */
/** エフェクトをかけないパーツか */
export const isTopOverlay = (o: OverlayItem): boolean => o.effect === false;

/**
 * パーツを重ねる。
 * mode "effect": エフェクトをかけるパーツだけを source に重ねた絵を返す(エフェクトの前に使う)。
 * mode "top": エフェクトをかけないパーツだけを透明な絵に描いて返す(エフェクトの後に重ねる用。無ければ null)。
 * mode "all": すべてのパーツを重ねる(編集画面のプレビュー用)。
 */
export const compositeOverlays = async (
  source: HTMLCanvasElement,
  allItems: OverlayItem[],
  mode: "effect" | "top" | "all" = "effect",
): Promise<HTMLCanvasElement | null> => {
  let items = allItems;
  if (mode === "top") items = allItems.filter(isTopOverlay);
  else if (mode === "effect") items = allItems.filter((o) => !isTopOverlay(o));
  if (items.length === 0) {
    return mode === "top" ? null : source;
  }
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Failed to get rendering context.");
  if (mode !== "top") {
    ctx.drawImage(source, 0, 0);
  }
  const base = Math.min(source.width, source.height);
  for (const item of items) {
    let trimmed: Trimmed | null;
    try {
      trimmed = await loadItemImage(item);
    } catch (_) {
      continue; // 読み込めないパーツは飛ばす(エフェクト処理は止めない)
    }
    if (!trimmed) continue;
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

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const KNOWN_FONTS = fonts.flatMap((g) => g.fonts.map((f) => f.value));

const sanitizeText = (raw: unknown): TextOverlayConf | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const t = raw as Partial<TextOverlayConf>;
  const d = DEFAULT_TEXT_CONF;
  const num = (v: unknown, def: number, lo: number, hi: number): number => {
    const n = typeof v === "number" && globalThis.isFinite(v) ? v : def;
    return Math.min(hi, Math.max(lo, n));
  };
  return {
    content: typeof t.content === "string" ? t.content.slice(0, 200) : d.content,
    font: typeof t.font === "string" && KNOWN_FONTS.includes(t.font) ? t.font : d.font,
    color: typeof t.color === "string" && COLOR_RE.test(t.color) ? t.color : d.color,
    align: (["stretch", "center", "left", "right"] as const).find((a) => a === t.align) || d.align,
    outlineOn: !!t.outlineOn,
    outlineColor: typeof t.outlineColor === "string" && COLOR_RE.test(t.outlineColor) ? t.outlineColor : d.outlineColor,
    outlineThickness: num(t.outlineThickness, d.outlineThickness, 0.1, 3),
    lineSpacing: num(t.lineSpacing, d.lineSpacing, 0, 1),
    vertical: t.vertical === true,
  };
};

/** JSON由来の値を安全なOverlayItem[]に整える(古い/壊れたスナップショット対策) */
export const sanitizeOverlays = (raw: unknown): OverlayItem[] => {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown, d: number, lo: number, hi: number): number => {
    const n = typeof v === "number" && globalThis.isFinite(v) ? v : d;
    return Math.min(hi, Math.max(lo, n));
  };
  return raw
    .filter((r) => r && typeof r === "object" && (
      typeof (r as OverlayItem).src === "string" || (r as OverlayItem).text
    ))
    .map((r: any) => ({
      id: typeof r.id === "string" ? r.id : newOverlayId(),
      src: typeof r.src === "string" ? r.src : "text:",
      text: sanitizeText(r.text),
      label: typeof r.label === "string" ? r.label : "パーツ",
      category: typeof r.category === "string" ? r.category : undefined,
      x: num(r.x, 50, -50, 150),
      y: num(r.y, 50, -50, 150),
      size: num(r.size, 50, 1, 300),
      rotation: num(r.rotation, 0, -180, 180),
      flipX: !!r.flipX,
      opacity: num(r.opacity, 100, 0, 100),
      effect: r.effect === false ? false : undefined,
    }));
};
