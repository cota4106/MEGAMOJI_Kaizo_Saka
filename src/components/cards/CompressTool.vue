<script lang="ts">
import { defineComponent } from "vue";
import filenamify from "filenamify/browser";
import Fieldset from "../inputs/Fieldset.vue";
import Space from "../global/Space.vue";
import Button from "../inputs/Button.vue";
import Checkbox from "../inputs/Checkbox.vue";
import NumberInput from "../inputs/Number.vue";
import { compressImageFile, CompressOutcome } from "../../utils/compress";
import {
  SLACK_EMOJI_SIZE_LIMIT, DISCORD_EMOJI_SIZE_LIMIT, formatKiB,
} from "../../utils/sizeLimits";

type Preset = "slack" | "discord" | "custom";

export default defineComponent({
  components: {
    Fieldset, Space, Button, Checkbox, NumberInput,
  },
  data() {
    return {
      file: null as File | null,
      previewUrl: "",
      preset: "slack" as Preset,
      customKb: 100,
      lockResolution: false,
      busy: false,
      tried: 0,
      error: "",
      result: null as (CompressOutcome | null),
      resultUrl: "",
      token: 0,
    };
  },
  computed: {
    limitBytes(): number {
      if (this.preset === "slack") return SLACK_EMOJI_SIZE_LIMIT;
      if (this.preset === "discord") return DISCORD_EMOJI_SIZE_LIMIT;
      return Math.max(1, Math.floor(Number(this.customKb) || 1)) * 1024;
    },
    originalText(): string {
      return this.file ? formatKiB(this.file.size) : "";
    },
    resultText(): string {
      return this.result ? formatKiB(this.result.blob.size) : "";
    },
  },
  beforeUnmount() {
    this.revoke();
  },
  methods: {
    revoke(): void {
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
      this.previewUrl = "";
      this.resultUrl = "";
    },
    onPick(): void {
      (this.$refs.input as HTMLInputElement).click();
    },
    onFile(e: Event): void {
      const input = e.target as HTMLInputElement;
      const f = input.files && input.files[0];
      input.value = "";
      if (!f) return;
      this.revoke();
      this.result = null;
      this.error = "";
      this.file = f;
      this.previewUrl = URL.createObjectURL(f);
    },
    async onCompress(): Promise<void> {
      if (!this.file || this.busy) return;
      const myToken = this.token + 1;
      this.token = myToken;
      this.busy = true;
      this.tried = 0;
      this.error = "";
      this.result = null;
      if (this.resultUrl) {
        URL.revokeObjectURL(this.resultUrl);
        this.resultUrl = "";
      }
      try {
        const r = await compressImageFile(
          this.file,
          this.limitBytes,
          this.lockResolution,
          (n) => { this.tried = n; },
        );
        if (myToken !== this.token) return;
        this.result = r;
        this.resultUrl = URL.createObjectURL(r.blob);
      } catch (e) {
        if (myToken !== this.token) return;
        this.error = e instanceof Error ? e.message : "圧縮に失敗しました。";
      } finally {
        if (myToken === this.token) this.busy = false;
      }
    },
    onDownload(): void {
      if (!this.result || !this.file) return;
      const base = this.file.name.replace(/\.[^.]+$/, "") || "emoji";
      const a = document.createElement("a");
      a.href = this.resultUrl;
      a.download = `${filenamify(base)}.${this.result.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    formatKiB,
  },
});
</script>

<template>
  <Fieldset label="絵文字のサイズ圧縮">
    <Space vertical full>
      <p class="tool-hint">
        すでにある画像やGIFを、Slack/Discordの絵文字の容量上限以内に収め直します。
        GIFは画質・コマ数・大きさを少しずつ落として、上限に収まる一番きれいな設定を探します。
      </p>
      <Space>
        <Button type="text" name="圧縮する画像を選ぶ" @click="onPick">
          <template #icon>
            📂
          </template>
          画像・GIFを選ぶ
        </Button>
        <span v-if="file" class="ct-file">{{ file.name }}({{ originalText }})</span>
      </Space>
      <input
          ref="input"
          type="file"
          accept="image/*"
          class="ct-hidden"
          @change="onFile">
      <template v-if="file">
        <div class="ct-previews">
          <figure class="ct-fig">
            <img :src="previewUrl" alt="元の画像" class="ct-img">
            <figcaption>元: {{ originalText }}</figcaption>
          </figure>
          <figure v-if="result" class="ct-fig">
            <img :src="resultUrl" alt="圧縮後" class="ct-img">
            <figcaption>圧縮後: {{ resultText }}</figcaption>
          </figure>
        </div>
        <div class="ct-row">
          <label class="ct-radio">
            <input v-model="preset" type="radio" name="圧縮の上限" value="slack">
            Slack (128KB)
          </label>
          <label class="ct-radio">
            <input v-model="preset" type="radio" name="圧縮の上限" value="discord">
            Discord (256KB)
          </label>
          <label class="ct-radio">
            <input v-model="preset" type="radio" name="圧縮の上限" value="custom">
            自分で指定
          </label>
          <span v-if="preset === 'custom'" class="ct-custom">
            <NumberInput v-model="customKb" :min="1" :max="2048" style="width: 90px;" />
            <span>KB以下</span>
          </span>
        </div>
        <Checkbox v-model="lockResolution" name="解像度を保つ">
          解像度(縦横の大きさ)を変えない(画質とコマ数だけで収める)
        </Checkbox>
        <Button type="text" name="圧縮する" :disabled="busy" @click="onCompress">
          {{ busy ? `圧縮中…(${tried}回試行)` : "圧縮する" }}
        </Button>
        <template v-if="result">
          <p class="ct-msg" :class="{ 'ct-msg-warn': !result.met }">
            <template v-if="result.met">
              ✅ {{ originalText }} → {{ resultText }} に収まりました({{ result.width }}×{{ result.height }}{{ result.animated ? `、${result.frameCount}コマ` : "" }})。
            </template>
            <template v-else>
              ⚠️ 設定を最小まで下げても {{ resultText }} までしか小さくなりませんでした。
              元の画像を小さくするか、上限を変えてお試しください。
            </template>
          </p>
          <p v-if="result.animated" class="ct-note">
            ※ アニメGIFは、透明な部分が白になります。
          </p>
          <Button type="text" name="圧縮した画像を保存" @click="onDownload">
            <template #icon>
              💾
            </template>
            保存
          </Button>
        </template>
        <p v-if="error" class="ct-msg ct-msg-warn">
          {{ error }}
        </p>
      </template>
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

.ct-hidden {
  display: none;
}

.ct-file {
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  word-break: break-all;
}

.ct-previews {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingLarge);
}

.ct-fig {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacingSmall);
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.ct-img {
  max-width: 128px;
  max-height: 128px;
  border: 1px solid var(--border);
  border-radius: var(--borderRadius);
  background: repeating-conic-gradient(#80808022 0% 25%, transparent 0% 50%) 50% / 16px 16px;
}

.ct-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingSmall) var(--spacingLarge);
  align-items: center;
}

.ct-radio {
  display: inline-flex;
  align-items: center;
  gap: var(--spacingSmall);
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.ct-custom {
  display: inline-flex;
  align-items: center;
  gap: var(--spacingSmall);
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.ct-msg {
  margin: 0;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.ct-msg-warn {
  color: var(--dangerDarker);
}

.ct-note {
  margin: 0;
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.6;
}
</style>
