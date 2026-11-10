<script lang="ts">
import { defineComponent } from "vue";
import filenamify from "filenamify/browser";
import Fieldset from "../inputs/Fieldset.vue";
import Space from "../global/Space.vue";
import Button from "../inputs/Button.vue";
import Checkbox from "../inputs/Checkbox.vue";
import NumberInput from "../inputs/Number.vue";
import { editGif, loadGifFile, EditedGif } from "../../utils/gifEdit";
import { DecodedGif } from "../../utils/gifDecode";
import { formatKiB } from "../../utils/sizeLimits";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export default defineComponent({
  components: {
    Fieldset, Space, Button, Checkbox, NumberInput,
  },
  data() {
    return {
      SPEEDS,
      file: null as File | null,
      decoded: null as DecodedGif | null,
      previewUrl: "",
      speed: 1,
      reverse: false,
      pingPong: false,
      start: 1,
      end: 1,
      busy: false,
      error: "",
      result: null as EditedGif | null,
      resultUrl: "",
    };
  },
  computed: {
    totalFrames(): number {
      return this.decoded ? this.decoded.frames.length : 0;
    },
    originalDuration(): string {
      if (!this.decoded) return "";
      const ms = this.decoded.frames.reduce((s, f) => s + f.delay, 0);
      return `${(ms / 1000).toFixed(2)}秒`;
    },
    resultDuration(): string {
      return this.result ? `${(this.result.durationMs / 1000).toFixed(2)}秒` : "";
    },
  },
  beforeUnmount() {
    this.revoke();
  },
  methods: {
    formatKiB,
    revoke(): void {
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
      this.previewUrl = "";
      this.resultUrl = "";
    },
    onPick(): void {
      (this.$refs.input as HTMLInputElement).click();
    },
    async onFile(e: Event): Promise<void> {
      const input = e.target as HTMLInputElement;
      const f = input.files && input.files[0];
      input.value = "";
      if (!f) return;
      this.error = "";
      this.busy = true;
      try {
        const decoded = await loadGifFile(f);
        if (decoded.frames.length < 2) {
          this.error = "アニメーションしないGIF(コマが1枚だけ)のようです。";
          return;
        }
        this.revoke();
        this.result = null;
        this.file = f;
        this.decoded = decoded;
        this.previewUrl = URL.createObjectURL(f);
        this.start = 1;
        this.end = decoded.frames.length;
        this.speed = 1;
        this.reverse = false;
        this.pingPong = false;
      } catch (_) {
        this.error = "GIFとして読み込めませんでした。";
      } finally {
        this.busy = false;
      }
    },
    async onApply(): Promise<void> {
      if (!this.decoded || this.busy) return;
      this.busy = true;
      this.error = "";
      try {
        const r = await editGif(this.decoded, {
          speed: this.speed,
          reverse: this.reverse,
          pingPong: this.pingPong,
          start: Math.floor(Number(this.start) || 1),
          end: Math.floor(Number(this.end) || this.totalFrames),
        });
        if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
        this.result = r;
        this.resultUrl = URL.createObjectURL(r.blob);
      } catch (e) {
        this.error = e instanceof Error ? e.message : "編集に失敗しました。";
      } finally {
        this.busy = false;
      }
    },
    onDownload(): void {
      if (!this.result || !this.file) return;
      const base = this.file.name.replace(/\.[^.]+$/, "") || "emoji";
      const a = document.createElement("a");
      a.href = this.resultUrl;
      a.download = `${filenamify(base)}_edit.gif`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
  },
});
</script>

<template>
  <Fieldset label="GIFの軽い編集">
    <Space vertical full>
      <p class="tool-hint">
        すでにあるGIFの再生速度・向き・使う範囲を変えます(絵そのものは変えません)。
        サイズが大きくなった場合は、上の「絵文字のサイズ圧縮」で収め直せます。
      </p>
      <Space>
        <Button type="text" name="編集するGIFを選ぶ" :disabled="busy" @click="onPick">
          <template #icon>
            📂
          </template>
          GIFを選ぶ
        </Button>
        <span v-if="file" class="ge-file">{{ file.name }}({{ totalFrames }}コマ・{{ originalDuration }})</span>
      </Space>
      <input
          ref="input"
          type="file"
          accept="image/gif"
          class="ge-hidden"
          @change="onFile">
      <template v-if="decoded">
        <div class="ge-previews">
          <figure class="ge-fig">
            <img :src="previewUrl" alt="元のGIF" class="ge-img">
            <figcaption>元: {{ formatKiB(file!.size) }}</figcaption>
          </figure>
          <figure v-if="result" class="ge-fig">
            <img :src="resultUrl" alt="編集後" class="ge-img">
            <figcaption>編集後: {{ formatKiB(result.blob.size) }}</figcaption>
          </figure>
        </div>
        <div class="ge-row">
          <span class="ge-label">再生速度</span>
          <select v-model.number="speed" class="ge-select" name="GIFの再生速度">
            <option v-for="s in SPEEDS" :key="s" :value="s">
              {{ s }}倍{{ s === 1 ? "(そのまま)" : "" }}
            </option>
          </select>
        </div>
        <div class="ge-row">
          <span class="ge-label">使う範囲</span>
          <NumberInput v-model="start" :min="1" :max="totalFrames" style="width: 90px;" />
          <span>〜</span>
          <NumberInput v-model="end" :min="1" :max="totalFrames" style="width: 90px;" />
          <span>コマ目(全{{ totalFrames }}コマ)</span>
        </div>
        <Checkbox v-model="reverse" name="GIFを逆再生">
          逆再生にする
        </Checkbox>
        <Checkbox v-model="pingPong" name="GIFを往復再生">
          往復(行って戻る)にする
        </Checkbox>
        <Button type="text" name="GIFの編集を適用" :disabled="busy" @click="onApply">
          {{ busy ? "処理中…" : "適用してプレビュー" }}
        </Button>
        <template v-if="result">
          <p class="ge-msg">
            ✅ {{ result.frameCount }}コマ・{{ resultDuration }}・{{ result.width }}×{{ result.height }}
          </p>
          <Button type="text" name="編集したGIFを保存" @click="onDownload">
            <template #icon>
              💾
            </template>
            保存
          </Button>
        </template>
      </template>
      <p v-if="error" class="ge-msg ge-msg-error">
        {{ error }}
      </p>
    </Space>
  </Fieldset>
</template>

<style scoped>
.tool-hint {
  margin: 0;
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.6;
}

.ge-hidden {
  display: none;
}

.ge-file {
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  word-break: break-all;
}

.ge-previews {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingLarge);
}

.ge-fig {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacingSmall);
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.ge-img {
  max-width: 128px;
  max-height: 128px;
  border: 1px solid var(--border);
  border-radius: var(--borderRadius);
  background: repeating-conic-gradient(#80808022 0% 25%, transparent 0% 50%) 50% / 16px 16px;
}

.ge-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingSmall) var(--spacingMedium);
  align-items: center;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.ge-label {
  min-width: 5em;
}

.ge-select {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--borderRadius);
  padding: var(--spacingSmall);
}

.ge-msg {
  margin: 0;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.ge-msg-error {
  color: var(--dangerDarker);
}
</style>
