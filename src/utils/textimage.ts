import { shrinkCanvas } from "./canvas";

type GradientColorStop = { color: string, pos: number };

/* Create a new canvas and render a single-line text. Returns the cropped canvas object. */
const makeTextImageSingleLine = (
  line: string,
  color: string,
  font: string,
  fontHeight: number,
  outlineColors: string[],
  outlineThickness: number,
  outlineX: number,
  outlineY: number,
  gradient: GradientColorStop[],
): HTMLCanvasElement => {
  // 空行は文字を描画しないため、そのままshrinkCanvasすると高さがほぼ0まで
  // 切り詰められてしまい、改行しても空行として見えなくなってしまう。
  // 他の行と揃うよう、通常の行の高さぶんだけ確保した透明なcanvasを返す。
  if (line === "") {
    const emptyCanvas = document.createElement("canvas");
    emptyCanvas.width = 1;
    emptyCanvas.height = fontHeight;
    return emptyCanvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = fontHeight * (line.length || 1) * 2;
  canvas.height = fontHeight * 2;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get rendering context.");
  }

  ctx.font = font.replace(/([0-9.]+)em/, (_, emHeight) => `${fontHeight * emHeight}px`);
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";

  const margin = fontHeight * 0.1;

  const outlineTotalThickness = outlineThickness * (outlineColors.length - 1);
  for (let i = outlineColors.length - 1; i >= 0; i -= 1) {
    ctx.strokeStyle = outlineColors[i];
    ctx.lineWidth = (i + 1) * outlineThickness;
    ctx.strokeText(
      line,
      margin + outlineX * (outlineTotalThickness - ctx.lineWidth) * 0.5,
      margin + outlineY * (outlineTotalThickness - ctx.lineWidth) * 0.5,
    );
  }

  if (gradient.length) {
    const gradientObj = ctx.createLinearGradient(0, 0, 0, fontHeight + margin * 2);
    gradient.forEach((colorStop) => {
      gradientObj.addColorStop(colorStop.pos / 100, colorStop.color);
    });
    ctx.fillStyle = gradientObj;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fillText(
    line,
    margin + outlineX * outlineTotalThickness * 0.5,
    margin + outlineY * outlineTotalThickness * 0.5,
  );

  return shrinkCanvas(canvas);
};

/* ---- 縦書き ---------------------------------------------------------- */

/** 縦書きでは90度回転して描く文字(長音・括弧・波線など) */
const VERTICAL_ROTATE = new Set(Array.from("ー〜～…‥―—−-=＝「」『』（）()[]［］【】〈〉《》＜＞<>｛｝{}〔〕"));
/** 縦書きでは右上に寄せる句読点 */
const VERTICAL_PUNCT = new Set(Array.from("、。，．,."));
/** 縦書きでは少し右上に寄せる小書きのかな */
const VERTICAL_SMALL = new Set(Array.from("ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ"));

/**
 * 1列ぶん(縦書きの1行)を描く。文字は上から下へ、1文字ずつ正方形のマスに入れる。
 * 戻り値のcanvasはマスの外側に margin ぶんの余白を持つ(縁取りがはみ出しても切れないように)。
 */
const makeVerticalColumn = (
  line: string,
  color: string,
  font: string,
  fontHeight: number,
  outlineColors: string[],
  outlineThickness: number,
  outlineX: number,
  outlineY: number,
  gradient: GradientColorStop[],
): { canvas: HTMLCanvasElement, length: number } => {
  const chars = Array.from(line);
  const cell = fontHeight;
  const margin = fontHeight * 0.5;
  const length = Math.max(chars.length, 1) * cell;

  const make = () => {
    const c = document.createElement("canvas");
    c.width = Math.ceil(cell + margin * 2);
    c.height = Math.ceil(length + margin * 2);
    const x = c.getContext("2d");
    if (!x) {
      throw new Error("Failed to get rendering context.");
    }
    x.font = font.replace(/([0-9.]+)em/, (_, emHeight) => `${fontHeight * emHeight}px`);
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.lineJoin = "round";
    return x;
  };

  const outlineTotalThickness = outlineThickness * (outlineColors.length - 1);

  /** 各文字を、その文字用の位置・回転にして draw を呼ぶ */
  const eachChar = (
    x: CanvasRenderingContext2D,
    draw: (ch: string, offX: number, offY: number) => void,
  ) => {
    chars.forEach((ch, i) => {
      x.save();
      let cx = margin + cell / 2;
      let cy = margin + cell * (i + 0.5);
      if (VERTICAL_PUNCT.has(ch)) {
        cx += fontHeight * 0.35;
        cy -= fontHeight * 0.35;
      } else if (VERTICAL_SMALL.has(ch)) {
        cx += fontHeight * 0.1;
        cy -= fontHeight * 0.1;
      }
      x.translate(cx, cy);
      if (VERTICAL_ROTATE.has(ch)) {
        x.rotate(Math.PI / 2);
      }
      draw(ch, 0, 0);
      x.restore();
    });
  };

  // 縁取り(後ろの層)
  const outlineCtx = make();
  for (let i = outlineColors.length - 1; i >= 0; i -= 1) {
    outlineCtx.strokeStyle = outlineColors[i];
    outlineCtx.lineWidth = (i + 1) * outlineThickness;
    eachChar(outlineCtx, (ch) => {
      outlineCtx.strokeText(
        ch,
        outlineX * (outlineTotalThickness - outlineCtx.lineWidth) * 0.5,
        outlineY * (outlineTotalThickness - outlineCtx.lineWidth) * 0.5,
      );
    });
  }

  // 文字本体: まず塗りつぶしの形だけ描き、その上から色/グラデーションを重ねる
  // (回転した文字でもグラデーションの向きが列全体でそろうように)
  const fillCtx = make();
  fillCtx.fillStyle = "#000";
  eachChar(fillCtx, (ch) => {
    fillCtx.fillText(
      ch,
      outlineX * outlineTotalThickness * 0.5,
      outlineY * outlineTotalThickness * 0.5,
    );
  });
  fillCtx.globalCompositeOperation = "source-in";
  if (gradient.length) {
    const g = fillCtx.createLinearGradient(0, margin, 0, margin + length);
    gradient.forEach((colorStop) => {
      g.addColorStop(colorStop.pos / 100, colorStop.color);
    });
    fillCtx.fillStyle = g;
  } else {
    fillCtx.fillStyle = color;
  }
  fillCtx.fillRect(0, 0, fillCtx.canvas.width, fillCtx.canvas.height);

  outlineCtx.drawImage(fillCtx.canvas, 0, 0);
  return { canvas: outlineCtx.canvas, length };
};

/**
 * 縦書き版。改行ごとに1列とし、列は右から左へ並べる。
 * 揃え: left=上揃え / center=中央 / right=下揃え / stretch=一番短い列に縦を合わせる
 */
const makeVerticalTextImage = (
  text: string,
  color: string,
  font: string,
  fontHeight: number,
  align: string,
  lineSpacing: number,
  outlineColors: string[],
  outlineThickness: number,
  outlineX: number,
  outlineY: number,
  gradient: GradientColorStop[],
  padding: number,
): HTMLCanvasElement => {
  const cell = fontHeight;
  const margin = fontHeight * 0.5;
  const spacing = Math.round(lineSpacing * fontHeight);
  const columns = text.split("\n").map((line) => makeVerticalColumn(
    line,
    color,
    font,
    fontHeight,
    outlineColors,
    outlineThickness,
    outlineX,
    outlineY,
    gradient,
  ));
  const lengths = columns.map((c) => c.length);
  const filled = text.split("\n").map((l, i) => (l === "" ? 0 : lengths[i])).filter((l) => l > 0);
  const maxLen = filled.length ? Math.max(...filled) : cell;
  const minLen = filled.length ? Math.min(...filled) : cell;
  const baseLen = align === "stretch" ? minLen : maxLen;

  const totalWidth = columns.length * cell + (columns.length - 1) * spacing + margin * 2;
  const full = document.createElement("canvas");
  full.width = Math.ceil(totalWidth);
  full.height = Math.ceil(baseLen + margin * 2);
  const ctx = full.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get rendering context.");
  }
  ctx.imageSmoothingQuality = "high";
  columns.forEach((col, k) => {
    // k番目の列は右からk番目
    const originX = totalWidth - margin - (k + 1) * cell - k * spacing - margin;
    ctx.save();
    if (align === "stretch" && col.length > 0) {
      ctx.translate(originX, 0);
      ctx.scale(1, baseLen / col.length);
      ctx.drawImage(col.canvas, 0, 0);
    } else {
      let offY = 0;
      if (align === "center") {
        offY = (baseLen - col.length) / 2;
      } else if (align === "right") {
        offY = baseLen - col.length;
      }
      ctx.drawImage(col.canvas, originX, offY);
    }
    ctx.restore();
  });

  const trimmed = shrinkCanvas(full);
  const padW = trimmed.width * padding;
  const padH = trimmed.height * padding;
  const out = document.createElement("canvas");
  out.width = trimmed.width + padW * 2;
  out.height = trimmed.height + padH * 2;
  const octx = out.getContext("2d");
  if (!octx) {
    throw new Error("Failed to get rendering context.");
  }
  octx.drawImage(trimmed, padW, padH);
  return out;
};

/* Create an image from a (possibly) multi-line text and return as a BlobURL. */
export const makeTextImage = (
  text: string,
  color: string,
  font: string,
  fontHeight: number,
  align: string,
  lineSpacing: number,
  outlineColors: string[],
  outlineThickness: number,
  outlineX: number,
  outlineY: number,
  gradient: GradientColorStop[],
  padding: number,
  vertical = false,
): HTMLCanvasElement => {
  if (vertical) {
    return makeVerticalTextImage(
      text,
      color,
      font,
      fontHeight,
      align,
      lineSpacing,
      outlineColors,
      outlineThickness,
      outlineX,
      outlineY,
      gradient,
      padding,
    );
  }
  const lineSpacingPixels = Math.round(lineSpacing * fontHeight);

  const images = text.split("\n").map((line) => (
    makeTextImageSingleLine(
      line,
      color,
      font,
      fontHeight,
      outlineColors,
      outlineThickness,
      outlineX,
      outlineY,
      gradient,
    )
  ));
  const lineWidths = images.map((canvas) => canvas.width);
  const nonZeroWidths = lineWidths.filter((w) => w > 1);
  const width = nonZeroWidths.length === 0 ? (
    1
    // besides the name "stretch", we actually downscale lines
    // to match the narrowest line (for better quality)
  ) : align === "stretch" ? (
    Math.min.apply(null, nonZeroWidths)
  ) : (
    Math.max.apply(null, nonZeroWidths)
  );
  const totalHeight = lineSpacingPixels * (images.length - 1) + images.reduce((l, r) => (
    l + r.height
  ), 0);

  const canvas = document.createElement("canvas");
  const paddingWidth = width * padding;
  const paddingHeight = totalHeight * padding;
  canvas.width = width + (paddingWidth * 2);
  canvas.height = totalHeight + (paddingHeight * 2);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get rendering context.");
  }
  ctx.imageSmoothingQuality = "high";

  ctx.translate(paddingWidth, paddingHeight);
  images.forEach((image, ix) => {
    ctx.save();

    if (align === "right") {
      ctx.translate(width - lineWidths[ix], 0);
    } else if (align === "center") {
      ctx.translate((width - lineWidths[ix]) / 2, 0);
    } else if (align === "stretch") {
      ctx.transform(width / lineWidths[ix], 0, 0, 1, 0, 0);
    }
    ctx.drawImage(image, 0, 0);

    ctx.restore();
    ctx.translate(0, image.height + lineSpacingPixels);
  });

  return canvas;
};
