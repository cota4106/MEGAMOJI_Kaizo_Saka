<script lang="ts">
import { defineComponent } from "vue";
import Card from "../global/Card.vue";
import {
  MAX_FRAMES, MAX_OUTPUT_SIZE, extractFrames, encodeWithStep, optimizeToSize, QUALITY_STEPS, EncodeResult,
} from "../../utils/videoGif";
import { SLACK_EMOJI_SIZE_LIMIT, DISCORD_EMOJI_SIZE_LIMIT, formatKiB } from "../../utils/sizeLimits";

type Status = "idle" | "loading" | "working" | "error";

const RES_PRESETS = [64, 96, 128, 256];

export default defineComponent({
  components: { Card },
  props: {
    show: { type: Boolean, required: true },
  },
  data() {
    return {
      resPresets: RES_PRESETS,
      maxOutput: MAX_OUTPUT_SIZE,
      maxFrames: MAX_FRAMES,
      status: "idle" as Status,
      errorMessage: "",
      fileName: "",
      videoUrl: null as string | null,
      duration: 0,
      videoW: 0,
      videoH: 0,
      conf: {
        start: 0,
        end: 3,
        fps: 12,
        width: 128,
        height: 128,
        lockAspect: true,
        lockResolution: false,
        limitKB: "" as string,
      },
      progress: "",
      cancelled: false,
      result: null as null | (EncodeResult & { url: string, met: boolean, limit: number | null }),
    };
  },
  computed: {
    frameCount(): number {
      return Math.floor(Math.max(0, this.conf.end - this.conf.start) * this.conf.fps);
    },
    limitBytes(): number | null {
      const kb = Number(this.conf.limitKB);
      return this.conf.limitKB !== "" && globalThis.isFinite(kb) && kb > 0 ? Math.floor(kb * 1024) : null;
    },
    problem(): string {
      if (!this.videoUrl) return "";
      if (this.conf.end <= this.conf.start) return "終了位置は開始位置より後にしてください";
      if (this.frameCount < 1) return "範囲が短すぎます";
      if (this.frameCount > this.maxFrames) {
        return `コマ数が多すぎます(${this.frameCount}コマ / 最大${this.maxFrames}コマ)。秒数かFPSを減らしてください`;
      }
      if (this.conf.width < 16 || this.conf.height < 16) return "解像度は16px以上にしてください";
      if (this.conf.width > this.maxOutput || this.conf.height > this.maxOutput) {
        return `解像度は${this.maxOutput}px以下にしてください`;
      }
      return "";
    },
    upscaleWarning(): string {
      if (this.videoW && (this.conf.width > this.videoW || this.conf.height > this.videoH)) {
        return "元の動画より大きくしても画質は上がらず、ファイルサイズだけ増えます";
      }
      return "";
    },
    aspectWarning(): string {
      if (this.conf.width !== this.conf.height) {
        return "縦横が同じでない(正方形でない)GIFは、Slack/Discordでは正方形のマスの中に表示され、上下か左右に隙間ができます";
      }
      return "";
    },
  },
  beforeUnmount() {
    this.revoke();
  },
  methods: {
    formatKiB,
    revoke(): void {
      if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
      if (this.result) URL.revokeObjectURL(this.result.url);
    },
    async onFile(e: Event): Promise<void> {
      const input = e.target as HTMLInputElement;
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      this.revoke();
      this.result = null;
      this.videoUrl = null;
      this.status = "loading";
      this.errorMessage = "";
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("decode"));
          video.src = url;
        });
        if (!globalThis.isFinite(video.duration) || video.videoWidth === 0) {
          throw new Error("decode");
        }
      } catch (_) {
        URL.revokeObjectURL(url);
        this.status = "error";
        this.errorMessage = "この動画は読み込めませんでした。mp4(H.264)かwebmで試してください。"
          + "iPhoneのHEVC(.mov)はお使いのブラウザでは再生できないことがあります。";
        return;
      }
      this.videoUrl = url;
      this.fileName = file.name;
      this.duration = video.duration;
      this.videoW = video.videoWidth;
      this.videoH = video.videoHeight;
      this.conf.start = 0;
      this.conf.end = Math.round(Math.min(video.duration, 3) * 10) / 10;
      this.setWidth(Math.min(128, video.videoWidth));
      this.status = "idle";
    },
    setWidth(w: number): void {
      if (!globalThis.isFinite(w) || w <= 0) return;
      this.conf.width = Math.round(w);
      if (this.conf.lockAspect && this.videoW) {
        this.conf.height = Math.max(1, Math.round(w * this.videoH / this.videoW));
      }
    },
    setHeight(h: number): void {
      if (!globalThis.isFinite(h) || h <= 0) return;
      this.conf.height = Math.round(h);
      if (this.conf.lockAspect && this.videoH) {
        this.conf.width = Math.max(1, Math.round(h * this.videoW / this.videoH));
      }
    },
    useOriginalRes(): void {
      const k = Math.min(1, this.maxOutput / Math.max(this.videoW, this.videoH));
      this.conf.lockAspect = true;
      this.conf.width = Math.round(this.videoW * k);
      this.conf.height = Math.round(this.videoH * k);
    },
    squareRes(n: number): void {
      this.conf.lockAspect = false;
      this.conf.width = n;
      this.conf.height = n;
    },
    onNum(key: "start" | "end" | "fps", e: Event): void {
      const v = Number((e.target as HTMLInputElement).value);
      if (!globalThis.isFinite(v)) return;
      if (key === "fps") this.conf.fps = Math.min(30, Math.max(1, Math.round(v)));
      else this.conf[key] = Math.min(this.duration, Math.max(0, Math.round(v * 10) / 10));
    },
    onSize(key: "width" | "height", e: Event): void {
      const v = Number((e.target as HTMLInputElement).value);
      if (key === "width") this.setWidth(v); else this.setHeight(v);
    },
    cancel(): void {
      this.cancelled = true;
    },
    async makeVideoElement(): Promise<HTMLVideoElement> {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("decode"));
        video.src = this.videoUrl as string;
      });
      return video;
    },
    async convert(): Promise<void> {
      if (!this.videoUrl || this.problem || this.status === "working") return;
      this.status = "working";
      this.errorMessage = "";
      this.cancelled = false;
      if (this.result) { URL.revokeObjectURL(this.result.url); this.result = null; }
      const limit = this.limitBytes;
      try {
        const video = await this.makeVideoElement();
        const ex = await extractFrames(
          video, this.conf.start, this.conf.end, this.conf.fps, this.conf.width, this.conf.height,
          (d, t) => { this.progress = `コマを取り出し中... ${d}/${t}`; },
          () => this.cancelled,
        );
        let blobResult: EncodeResult;
        let met = true;
        if (limit) {
          this.progress = "サイズに合わせて最適化中...";
          const out = await optimizeToSize(
            ex, limit, this.conf.lockResolution,
            (n) => { this.progress = `サイズに合わせて最適化中... (${n}回目の試行)`; },
            () => this.cancelled,
          );
          blobResult = out.result;
          met = out.met;
        } else {
          this.progress = "GIFを作成中...";
          blobResult = await encodeWithStep(ex, QUALITY_STEPS[0], true);
        }
        this.result = { ...blobResult, url: URL.createObjectURL(blobResult.blob), met, limit };
        this.status = "idle";
      } catch (err) {
        if ((err as Error).message === "cancelled") {
          this.status = "idle";
        } else {
          this.status = "error";
          this.errorMessage = "変換に失敗しました。秒数・FPS・解像度を下げて試してください。";
        }
      }
      this.progress = "";
    },
    download(): void {
      if (!this.result) return;
      const a = document.createElement("a");
      a.href = this.result.url;
      const base = this.fileName.replace(/\.[^.]+$/, "") || "video";
      a.download = `${base}.gif`;
      a.click();
    },
    setLimit(bytes: number | null): void {
      this.conf.limitKB = bytes ? String(Math.floor(bytes / 1024)) : "";
    },
    markStart(): void {
      const v = this.$refs.player as HTMLVideoElement | undefined;
      if (v) this.conf.start = Math.round(v.currentTime * 10) / 10;
    },
    markEnd(): void {
      const v = this.$refs.player as HTMLVideoElement | undefined;
      if (v) this.conf.end = Math.round(v.currentTime * 10) / 10;
    },
    SLACK: () => SLACK_EMOJI_SIZE_LIMIT,
    DISCORD: () => DISCORD_EMOJI_SIZE_LIMIT,
  },
});
</script>

<template>
  <Card v-if="show">
    <details class="vg">
      <summary class="vg-summary">動画をGIFに変換(秒数・FPS・解像度・サイズ上限を指定)</summary>
      <div class="vg-body">
        <p class="vg-note">
          動画から指定した範囲をGIFにしてダウンロードします。ここでは絵文字の効果(エフェクト)はかかりません。
        </p>
        <label class="vg-file vg-file-btn">
          🎞️ 動画ファイルを選ぶ
          <input type="file" accept="video/*" class="vg-file-input" @change="onFile">
        </label>
        <p v-if="status === 'loading'" class="vg-note">読み込み中...</p>
        <p v-if="status === 'error'" class="vg-error">{{ errorMessage }}</p>

        <template v-if="videoUrl">
          <p class="vg-note">
            {{ fileName }}({{ duration.toFixed(1) }}秒 / {{ videoW }}x{{ videoH }})
          </p>
          <video
              ref="player"
              class="vg-player"
              :src="videoUrl"
              controls
              muted
              playsinline />

          <div class="vg-grid">
            <span class="vg-label">開始(秒)</span>
            <input class="vg-num" type="number" min="0" step="0.1" :max="duration" :value="conf.start" @change="onNum('start', $event)">
            <button type="button" class="vg-btn" @click="markStart">再生位置を開始に</button>

            <span class="vg-label">終了(秒)</span>
            <input class="vg-num" type="number" min="0" step="0.1" :max="duration" :value="conf.end" @change="onNum('end', $event)">
            <button type="button" class="vg-btn" @click="markEnd">再生位置を終了に</button>

            <span class="vg-label">FPS</span>
            <input class="vg-num" type="number" min="1" max="30" step="1" :value="conf.fps" @change="onNum('fps', $event)">
            <span class="vg-note">{{ frameCount }}コマ(最大{{ maxFrames }})</span>

            <span class="vg-label">解像度</span>
            <span class="vg-res">
              <input class="vg-num" type="number" min="16" :max="maxOutput" :value="conf.width" @change="onSize('width', $event)">
              ×
              <input class="vg-num" type="number" min="16" :max="maxOutput" :value="conf.height" @change="onSize('height', $event)">
              px
            </span>
            <label class="vg-check"><input v-model="conf.lockAspect" type="checkbox">縦横比を固定</label>
          </div>

          <div class="vg-chips">
            <button v-for="n in resPresets" :key="n" type="button" class="vg-btn" @click="squareRes(n)">{{ n }}x{{ n }}</button>
            <button type="button" class="vg-btn" @click="useOriginalRes">元の比率</button>
          </div>
          <p v-if="upscaleWarning" class="vg-warn">{{ upscaleWarning }}</p>
          <p v-if="aspectWarning" class="vg-note">{{ aspectWarning }}</p>

          <div class="vg-grid">
            <span class="vg-label">サイズ上限(KB)</span>
            <input
                v-model="conf.limitKB"
                class="vg-num"
                type="number"
                min="1"
                placeholder="なし">
            <span class="vg-chips">
              <button type="button" class="vg-btn" @click="setLimit(SLACK())">Slack 128KB</button>
              <button type="button" class="vg-btn" @click="setLimit(DISCORD())">Discord 256KB</button>
              <button type="button" class="vg-btn" @click="setLimit(null)">なし</button>
            </span>
          </div>
          <label v-if="limitBytes" class="vg-check">
            <input v-model="conf.lockResolution" type="checkbox">
            解像度は下げない(色数とFPSだけで調整する)
          </label>
          <p v-if="limitBytes" class="vg-note">
            上限に収まるよう、色数・FPS(・解像度)を自動で下げます。画質の高い設定を優先して探します。
          </p>

          <p v-if="problem" class="vg-error">{{ problem }}</p>

          <div class="vg-actions">
            <button type="button" class="vg-btn vg-primary" :disabled="!!problem || status === 'working'" @click="convert">
              {{ status === 'working' ? '変換中...' : 'GIFに変換' }}
            </button>
            <button v-if="status === 'working'" type="button" class="vg-btn" @click="cancel">中止</button>
            <span v-if="progress" class="vg-note">{{ progress }}</span>
          </div>
        </template>

        <div v-if="result" class="vg-result">
          <img :src="result.url" class="vg-preview" :width="result.width" :height="result.height">
          <p class="vg-note">
            {{ result.width }}x{{ result.height }}px / {{ result.fps }}FPS / {{ result.frameCount }}コマ /
            {{ result.colors }}色 / <b>{{ formatKiB(result.blob.size) }}</b>
          </p>
          <p v-if="result.limit && result.met" class="vg-ok">
            上限({{ formatKiB(result.limit) }})に収まりました。
          </p>
          <p v-if="result.limit && !result.met" class="vg-warn">
            設定を最小まで下げても上限({{ formatKiB(result.limit) }})に収まりませんでした。
            秒数を短くするか、解像度を下げて、もう一度お試しください。
          </p>
          <button type="button" class="vg-btn vg-primary" @click="download">💾 GIFをダウンロード</button>
        </div>
      </div>
    </details>
  </Card>
</template>

<style scoped>
.vg-summary { cursor: pointer; font-weight: bold; }
.vg-body { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.vg-note { font-size: .85em; opacity: .8; margin: 0; }
.vg-error { font-size: .85em; color: #e53935; margin: 0; }
.vg-warn { font-size: .85em; color: #f9a825; margin: 0; }
.vg-ok { font-size: .85em; color: #43a047; margin: 0; }
.vg-file { font-size: .9em; }
.vg-file-btn {
  align-self: flex-start; padding: 4px 12px; border: 1px dashed #888; border-radius: 6px; cursor: pointer;
}
.vg-file-btn:hover { border-color: #1a73e8; }
.vg-file-input { display: none; }
.vg-player { width: 100%; max-width: 360px; border-radius: 6px; background: #000; }
.vg-grid { display: grid; grid-template-columns: auto auto 1fr; gap: 6px 10px; align-items: center; }
.vg-label { font-size: .85em; }
.vg-res { display: flex; align-items: center; gap: 4px; }
.vg-num {
  width: 5.5em; padding: 2px 4px; background: #fff; color: #222; border: 1px solid #bbb; border-radius: 5px;
}
.vg-check { font-size: .85em; display: flex; align-items: center; gap: 4px; }
.vg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.vg-btn {
  font-size: .8em; padding: 3px 10px; border: 1px solid #bbb; background: #fff; color: #222;
  border-radius: 5px; cursor: pointer; white-space: nowrap;
}
.vg-btn:hover:not(:disabled) { border-color: #1a73e8; }
.vg-btn:disabled { opacity: .5; cursor: default; }
.vg-primary { background: #f0a800; border-color: #d89500; font-weight: bold; font-size: .9em; padding: 5px 14px; }
.vg-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.vg-result { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.vg-preview {
  max-width: 100%; border: 1px solid #ccc; border-radius: 6px; background-color: #fff;
  background-image: linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%),
    linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%);
  background-size: 12px 12px; background-position: 0 0, 6px 6px;
}
</style>
