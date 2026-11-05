<script lang="ts">
import { defineComponent } from "vue";
import { saveAs } from "file-saver";
import filenamify from "filenamify/browser";
import { imgToCanvas } from "../../utils/canvas";
import { decodeGif, DecodedGifFrame } from "../../utils/gifDecode";
import { splitGifIntoCells } from "../../utils/gifSplit";
import { loadFileAsArrayBuffer, prepareDownloadFile, extension } from "../../utils/file";
import { suggestCellGrids, cellDistortion, CellSuggestion } from "../../utils/cellSuggestion";
import Card from "../global/Card.vue";
import FileSelect from "../inputs/FileSelect.vue";
import Select from "../inputs/Select.vue";
import NumberInput from "../inputs/Number.vue";
import Fieldset from "../inputs/Fieldset.vue";
import Space from "../global/Space.vue";
import Button from "../inputs/Button.vue";
import Image from "../icons/Image.vue";
import { Filter } from "../../types";
import filters from "../../constants/filters";

type FilterOption = { label: string, value: Filter };
type GifStatus = "idle" | "loading" | "splitting" | "error";

export default defineComponent({
  components: {
    FileSelect, Select, Image, Card, Fieldset, Space, NumberInput, Button,
  },
  props: {
    show: { type: Boolean, required: true },
  },
  emits: [
    "render",
  ],
  data() {
    return {
      FILTER_OPTIONS: filters,
      gifPasteTextCopied: false,
      conf: {
        img: null as (HTMLImageElement | null),
        filter: null as (FilterOption | null),
      },
      /* GIF分割ツール(エフェクトなし・独立機能) */
      gif: {
        fileName: null as (string | null),
        frames: [] as DecodedGifFrame[],
        width: 0,
        height: 0,
        cells: [2, 2] as [number, number],
        emojiName: "",
        limitKB: "" as string, // 分割後の1つ1つの最大サイズ(KB)。空欄なら制限なし
        lockResolution: false,
        resultNote: "" as string,
        sourceUrl: null as (string | null), // 元GIFのプレビュー用URL
        result: null as null | {
          images: Blob[][],
          urls: string[][],
          cells: [number, number],
          namePrefix: string | undefined,
          baseName: string,
        },
        resultWarn: false,
        status: "idle" as GifStatus,
        progress: null as ({ done: number, total: number } | null),
        errorMessage: "",
      },
    };
  },
  watch: {
    conf: {
      handler(): void {
        this.render();
      },
      deep: true,
    },
  },
  computed: {
    gifCellSuggestions(): CellSuggestion[] {
      if (!this.gif.width || !this.gif.height) {
        return [];
      }
      return suggestCellGrids(this.gif.width / this.gif.height);
    },
    gifGridStyle(): Record<string, string> {
      const [h, v] = this.gif.cells;
      const line = "rgba(255, 64, 64, 0.9)";
      return {
        backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), `
          + `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        backgroundSize: `${100 / Math.max(1, h)}% 100%, 100% ${100 / Math.max(1, v)}%`,
      };
    },
    resultIsStale(): boolean {
      if (!this.gif.result) return false;
      return this.gif.result.cells[0] !== this.gif.cells[0] || this.gif.result.cells[1] !== this.gif.cells[1];
    },
    gifDistortionPercent(): number | null {
      const [h, v] = this.gif.cells;
      if (!this.gif.width || !this.gif.height || !h || !v || h * v <= 1) {
        return null;
      }
      return Math.round(cellDistortion(this.gif.width / this.gif.height, h, v) * 100);
    },
    gifPasteText(): string {
      if (this.gif.frames.length === 0 || !this.gif.emojiName.trim()) {
        return "";
      }
      const safeName = filenamify(this.gif.emojiName.trim(), { replacement: "" }).normalize();
      if (!safeName) {
        return "";
      }
      const [hCells, vCells] = this.gif.cells;
      const lines: string[] = [];
      for (let row = 1; row <= vCells; row += 1) {
        const cells: string[] = [];
        for (let col = 1; col <= hCells; col += 1) {
          cells.push(`:${safeName}_${row}_${col}:`);
        }
        lines.push(cells.join(""));
      }
      return lines.join("\n");
    },
  },
  beforeUnmount() {
    this.clearGifResult();
    if (this.gif.sourceUrl) URL.revokeObjectURL(this.gif.sourceUrl);
  },
  methods: {
    clearGifResult(): void {
      if (this.gif.result) {
        this.gif.result.urls.forEach((row) => row.forEach((u) => URL.revokeObjectURL(u)));
        this.gif.result = null;
      }
      this.gif.resultNote = "";
    },
    applyGifCellSuggestion(s: CellSuggestion): void {
      this.gif.cells = [s.h, s.v];
    },
    async onCopyGifPasteText(): Promise<void> {
      if (!this.gifPasteText) {
        return;
      }
      try {
        await navigator.clipboard.writeText(this.gifPasteText);
        this.gifPasteTextCopied = true;
        window.setTimeout(() => {
          this.gifPasteTextCopied = false;
        }, 2000);
      } catch (e) {
        // eslint-disable-next-line no-alert
        window.prompt("このテキストをコピーしてください:", this.gifPasteText);
      }
    },
    render(): void {
      if (this.conf.img) {
        if (this.conf.filter) {
          this.$emit("render", this.conf.filter.value(this.conf.img), null);
        } else {
          this.$emit("render", imgToCanvas(this.conf.img), null);
        }
      }
    },
    // --- GIF分割ツール ---------------------------------------------
    async onGifFileChange(e: { target: { files: FileList, value: string } }): Promise<void> {
      const file = e.target.files[0];
      // eslint-disable-next-line no-param-reassign
      e.target.value = "";
      if (!file) {
        return;
      }
      this.gif.status = "loading";
      this.gif.errorMessage = "";
      this.gif.frames = [];
      try {
        const buffer = await loadFileAsArrayBuffer(file);
        const decoded = await decodeGif(buffer);
        if (decoded.frames.length < 2) {
          this.gif.status = "error";
          this.gif.errorMessage = "アニメーションしないGIF(コマが1枚だけ)のようです。通常のファイルアップロードをお使いください。";
          return;
        }
        if (this.gif.sourceUrl) URL.revokeObjectURL(this.gif.sourceUrl);
        this.gif.sourceUrl = URL.createObjectURL(file);
        this.clearGifResult();
        this.gif.fileName = file.name;
        this.gif.frames = decoded.frames;
        this.gif.width = decoded.width;
        this.gif.height = decoded.height;
        this.gif.status = "idle";
      } catch (err) {
        this.gif.status = "error";
        this.gif.errorMessage = "GIFの読み込みに失敗しました。ファイルが壊れていないか確認してください。";
      }
    },
    async onDownloadSplit(): Promise<void> {
      const r = this.gif.result;
      if (!r) return;
      const download = await prepareDownloadFile(r.images, r.namePrefix);
      saveAs(download, `${r.baseName}-split.${extension(download)}`);
    },
    async onSplitGifDownload(): Promise<void> {
      if (this.gif.frames.length === 0) {
        return;
      }
      const [hCells, vCells] = this.gif.cells;
      if (hCells < 1 || vCells < 1) {
        return;
      }
      this.gif.status = "splitting";
      this.gif.progress = { done: 0, total: this.gif.frames.length };
      try {
        const limitKb = Number(this.gif.limitKB);
        const maxPieceBytes = this.gif.limitKB !== "" && globalThis.isFinite(limitKb) && limitKb > 0
          ? Math.floor(limitKb * 1024)
          : null;
        this.gif.resultNote = "";
        const { images, info } = await splitGifIntoCells(
          this.gif.frames,
          this.gif.width,
          this.gif.height,
          hCells,
          vCells,
          (done, total) => {
            this.gif.progress = { done, total };
          },
          { maxPieceBytes, lockResolution: this.gif.lockResolution },
        );
        const largest = `${(info.largestBytes / 1024).toFixed(1)} KB`;
        const detail = `${info.size}x${info.size}px / ${info.colors}色 / ${info.frameCount}コマ`;
        if (maxPieceBytes) {
          this.gif.resultWarn = !info.met;
          this.gif.resultNote = info.met
            ? `最大のピースは ${largest}(上限 ${(maxPieceBytes / 1024).toFixed(0)} KB に収まりました)。設定: ${detail}`
            : `設定を最小まで下げても、最大のピースが ${largest} で上限に収まりませんでした。`
              + "マスの数を増やすか、元のGIFの秒数を短くしてお試しください。";
        } else {
          this.gif.resultWarn = false;
          this.gif.resultNote = `最大のピースは ${largest}。設定: ${detail}`;
        }
        const namePrefix = this.gif.emojiName.trim()
          ? filenamify(this.gif.emojiName.trim(), { replacement: "" }).normalize()
          : undefined;
        const baseName = namePrefix || filenamify(
          (this.gif.fileName ?? "gif").replace(/\.gif$/i, ""),
          { replacement: "" },
        ).normalize() || "megamoji-gif";
        const prevNote = this.gif.resultNote;
        const prevWarn = this.gif.resultWarn;
        this.clearGifResult();
        this.gif.resultNote = prevNote;
        this.gif.resultWarn = prevWarn;
        this.gif.result = {
          images,
          urls: images.map((row) => row.map((blob) => URL.createObjectURL(blob))),
          cells: [hCells, vCells],
          namePrefix,
          baseName,
        };
        this.gif.status = "idle";
        this.gif.progress = null;
      } catch (err) {
        this.gif.status = "error";
        this.gif.errorMessage = "分割処理に失敗しました。マスの数を減らして試してみてください。";
        this.gif.progress = null;
      }
    },
  },
});
</script>

<template>
  <Card v-if="show">
    <Space vertical xlarge full>
      <Fieldset label="ファイル">
        <FileSelect type="img" name="ファイルを選ぶ" @load="conf.img = $event">
          <Image /> ファイルを選ぶ
        </FileSelect>
      </Fieldset>
      <Fieldset label="前処理">
        <Select v-model="conf.filter" name="前処理" nullable :options="FILTER_OPTIONS" />
      </Fieldset>
    </Space>
  </Card>
  <Card v-if="show">
    <details class="gif-menu">
      <summary class="gif-summary">GIFを分割(動きそのまま・エフェクトなし)</summary>
      <div class="gif-menu-body">
        <Space vertical full>
          <p class="gif-hint">
            アップロードしたGIFの動きをそのまま保ったまま、複数マスに分割してダウンロードします
            (Slackなどで大きい絵文字として使う用)。ここでは絵文字の効果はかかりません。
          </p>
          <input
              ref="gifInput"
              type="file"
              accept="image/gif"
              style="display: none;"
              @change="onGifFileChange">
          <Button type="dashed" name="分割用GIFを選ぶ" @click="($refs.gifInput as HTMLInputElement).click()">
            <Image /> 分割用GIFを選ぶ
          </Button>
          <span v-if="gif.fileName" class="gif-filename">
            {{ gif.fileName }} ({{ gif.frames.length }}コマ)
          </span>
          <span v-if="gif.status === 'loading'" class="gif-status">
            読み込み中...
          </span>
          <span v-if="gif.status === 'error'" class="gif-status gif-status-error">
            {{ gif.errorMessage }}
          </span>
          <div v-if="gif.sourceUrl && gif.frames.length > 0" class="gif-source-preview">
            <img :src="gif.sourceUrl" class="gif-source-img">
            <div class="gif-grid-overlay" :style="gifGridStyle"></div>
          </div>
          <span v-if="gif.sourceUrl && gif.frames.length > 0" class="gif-order-hint">
            ↑ 元のGIF(赤い線が分割位置)
          </span>
          <template v-if="gif.frames.length > 0">
            <div class="gif-cells-row">
              <NumberInput v-model="gif.cells[0]" :min="1" style="width: 80px;" />
              <span>x</span>
              <NumberInput v-model="gif.cells[1]" :min="1" style="width: 80px;" />
            </div>
            <span class="gif-order-hint">(横 x 縦)</span>
            <span v-if="gif.cells[0] * gif.cells[1] > 1" class="gif-order-hint">
              分割したマスはすべて正方形になります(元のGIFの比率と合わない分割数だと、その分引き伸ばされます)。
            </span>
            <span
                v-if="gifDistortionPercent !== null"
                :class="['gif-distortion', { warn: gifDistortionPercent > 15 }]">
              今の分割の引き伸ばし: 約{{ gifDistortionPercent }}%{{ gifDistortionPercent > 15 ? '(おすすめの分割数だと小さくなります)' : '' }}
            </span>
            <details v-if="gifCellSuggestions.length > 0" class="gif-suggestions-details">
              <summary class="gif-suggestions-summary">歪みが出にくいおすすめを見る</summary>
              <div class="gif-suggestions">
                <button
                    v-for="s in gifCellSuggestions"
                    :key="`${s.h}x${s.v}`"
                    type="button"
                    class="gif-suggestion-chip"
                    :class="{ active: s.h === gif.cells[0] && s.v === gif.cells[1] }"
                    :title="`引き伸ばし 約${Math.round(s.distortion * 100)}%`"
                    @click="applyGifCellSuggestion(s)">
                  {{ s.h }}x{{ s.v }}
                </button>
              </div>
            </details>
            <div class="gif-limit-row">
              <label class="gif-limit-label">1つ1つの最大サイズ(KB)</label>
              <input
                  v-model="gif.limitKB"
                  type="number"
                  min="1"
                  class="gif-limit-input"
                  placeholder="なし">
              <button type="button" class="gif-limit-chip" @click="gif.limitKB = '128'">Slack 128KB</button>
              <button type="button" class="gif-limit-chip" @click="gif.limitKB = '256'">Discord 256KB</button>
              <button type="button" class="gif-limit-chip" @click="gif.limitKB = ''">なし</button>
            </div>
            <label v-if="gif.limitKB !== ''" class="gif-limit-lock">
              <input v-model="gif.lockResolution" type="checkbox">
              解像度は下げない(色数とFPSだけで調整する)
            </label>
            <span v-if="gif.limitKB !== ''" class="gif-order-hint">
              分割したすべてのピースが上限に収まるよう、色数・FPS(・解像度)を自動で下げます(全ピース同じ設定で、動きはそろいます)。
            </span>
            <input
                v-model="gif.emojiName"
                type="text"
                class="gif-emoji-name"
                placeholder="絵文字名(例: Claude)。ファイル名が 名前_行_列 になります">
            <Button
                type="text"
                name="分割する"
                :disabled="gif.status === 'splitting'"
                @click="onSplitGifDownload">
              <template #icon>
                ✂️
              </template>
              {{ gif.status === 'splitting'
                ? `処理中... (${gif.limitKB !== '' ? 'サイズ調整 ' : ''}${gif.progress ? gif.progress.done : 0}/${gif.progress ? gif.progress.total : 0}${gif.limitKB !== '' ? '回目' : 'コマ'})`
                : "分割する(プレビュー)" }}
            </Button>
            <span v-if="gif.resultNote" :class="['gif-result-note', { warn: gif.resultWarn }]">
              {{ gif.resultNote }}
            </span>
            <div v-if="gif.result" class="gif-result-block">
              <span class="gif-order-hint">
                分割結果のプレビュー(Slackに並べたときの見え方)
                {{ resultIsStale ? ' ※マス数を変えたので、もう一度「分割する」を押してください' : '' }}
              </span>
              <div
                  class="gif-result-grid"
                  :style="{ gridTemplateColumns: `repeat(${gif.result.cells[0]}, 1fr)` }">
                <template v-for="(row, y) in gif.result.urls" :key="y">
                  <img
                      v-for="(url, x) in row"
                      :key="`${y}-${x}`"
                      :src="url"
                      class="gif-result-cell">
                </template>
              </div>
              <Button type="text" name="ダウンロード" @click="onDownloadSplit">
                <template #icon>
                  💾
                </template>
                ダウンロード
              </Button>
            </div>
            <div v-if="gifPasteText" class="gif-paste-text-block">
              <span class="gif-paste-text-label">
                Slack貼り付け用テキスト(横{{ gif.cells[0] }} x 縦{{ gif.cells[1] }})
              </span>
              <textarea
                  class="gif-paste-text-output"
                  :value="gifPasteText"
                  readonly
                  rows="3"></textarea>
              <Button type="text" name="コピー" @click="onCopyGifPasteText">
                <template #icon>
                  📋
                </template>
                {{ gifPasteTextCopied ? "コピーしました！" : "コピー" }}
              </Button>
            </div>
          </template>
        </Space>
      </div>
    </details>
  </Card>
</template>

<style scoped>
.gif-summary {
  font-weight: bold;
  cursor: pointer;
}

.gif-menu-body {
  margin-top: var(--spacingLarge, 12px);
}

.gif-source-preview {
  position: relative;
  display: inline-block;
  max-width: 360px;
  line-height: 0;
}

.gif-source-img {
  display: block;
  max-width: 100%;
  max-height: 260px;
}

.gif-grid-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  outline: 1px solid rgba(255, 64, 64, 0.9);
  outline-offset: -1px;
}

.gif-result-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacingSmall);
  align-items: flex-start;
}

.gif-result-grid {
  display: grid;
  gap: 0;
  width: 100%;
  max-width: 360px;
  background-color: #fff;
  border: 1px solid var(--border);
  line-height: 0;
}

.gif-result-cell {
  display: block;
  width: 100%;
  aspect-ratio: 1;
}

.gif-hint {
  margin: 0;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  opacity: 0.7;
}

.gif-filename,
.gif-status {
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.gif-limit-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingSmall);
  align-items: center;
}

.gif-limit-label,
.gif-limit-lock {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
}

.gif-limit-input {
  width: 6em;
}

.gif-limit-chip {
  padding: 2px 10px;
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  cursor: pointer;
  background-color: var(--accentBg);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.gif-limit-chip:hover {
  border-color: var(--primary);
}

.gif-result-note {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: #43a047;
}

.gif-result-note.warn {
  color: #f9a825;
}

.gif-status-error {
  color: var(--danger);
}

.gif-cells-row {
  display: flex;
  gap: var(--spacingMedium);
  align-items: center;
}

.gif-distortion {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  opacity: 0.8;
}

.gif-distortion.warn {
  color: #f9a825;
  opacity: 1;
}

.gif-suggestions {
  max-height: 9em;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingSmall);
  align-items: center;
}

.gif-suggestions-label {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.6;
}

.gif-suggestion-chip {
  padding: 2px 10px;
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  cursor: pointer;
  background-color: var(--accentBg);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.gif-suggestion-chip:hover {
  border-color: var(--primary);
}

.gif-suggestion-chip.active {
  color: var(--bg);
  background-color: var(--primary);
  border-color: var(--primary);
}

.gif-order-hint {
  margin-top: calc(var(--spacingSmall) * -1);
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.5;
}

.gif-suggestions-details {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
}

.gif-suggestions-summary {
  color: var(--primary);
  cursor: pointer;
  user-select: none;
}

.gif-paste-text-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacingSmall);
}

.gif-paste-text-label {
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  opacity: 0.7;
}

.gif-paste-text-output {
  box-sizing: border-box;
  width: 100%;
  padding: var(--spacingSmall) var(--spacingInlineSmall);
  font-family: monospace;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--borderRadiusSmall, 6px);
  resize: vertical;
}

.gif-emoji-name {
  box-sizing: border-box;
  width: 100%;
  padding: var(--spacingSmall) var(--spacingInlineSmall);
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--borderRadiusSmall, 6px);
  outline: none;
}

.gif-emoji-name:hover {
  border-color: var(--primary);
}

.gif-emoji-name:focus {
  border-color: var(--primary);
  box-shadow: var(--primaryShadow);
}
</style>
