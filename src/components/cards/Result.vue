<script lang="ts">
import { defineComponent, PropType } from "vue";
import { saveAs } from "file-saver";
import filenamify from "filenamify/browser";
import { extension, prepareDownloadFile } from "../../utils/file";
import Analytics from "../../utils/analytics";
import RawResult from "../emoji/RawResult.vue";
import Preview from "../emoji/Preview.vue";
import Button from "../inputs/Button.vue";
import Checkbox from "../inputs/Checkbox.vue";
import Space from "../global/Space.vue";
import Card from "../global/Card.vue";
import Effect from "../icons/Effect.vue";
import Back from "../icons/Back.vue";
import Save from "../icons/Save.vue";
import { NODE_ENV } from "../../utils/env";
import {
  checkEmojiSize, formatKiB, SizeWarningLevel,
} from "../../utils/sizeLimits";
import { addToGallery } from "../../utils/gallery";

export default defineComponent({
  components: {
    RawResult, Preview, Checkbox, Card, Space, Button, Effect, Back, Save,
  },
  props: {
    images: { type: Array as PropType<Blob[][]>, required: true },
    name: { type: String, default: null },
    showTarget: { type: Boolean, required: false },
    getSettingsSnapshot: { type: Function as PropType<() => unknown>, default: null },
  },
  emits: [
    "toggleShowTarget",
    "saved",
  ],
  data() {
    return {
      previewMode: false,
      rounded: false,
      isDev: NODE_ENV === "development",
    };
  },
  computed: {
    resultImageUrls(): string[][] {
      return this.images.map((row) => row.map((cell) => URL.createObjectURL(cell)));
    },
    totalSize(): number {
      return this.images.reduce((l, r) => (
        l + r.reduce((ll, rr) => ll + rr.size, 0)
      ), 0);
    },
    maxCellSize(): number {
      return this.images.reduce((max, row) => (
        row.reduce((rowMax, cell) => Math.max(rowMax, cell.size), max)
      ), 0);
    },
    isSplit(): boolean {
      return this.images.length > 1 || this.images[0].length > 1;
    },
    sizeWarning(): SizeWarningLevel {
      return checkEmojiSize(this.maxCellSize);
    },
  },
  methods: {
    formatKiB,
    onDownload(): void {
      const download = prepareDownloadFile(this.images);
      const filename = filenamify(this.name ?? "", { replacement: "" }).normalize() || "megamoji";
      download.then((res) => saveAs(res, `${filename}.${extension(res)}`));
      Analytics.download();
      // 履歴(ギャラリー)にサムネイルと、その時の設定を記録する。先頭のマスの絵を代表として使う
      const firstCell = this.images[0]?.[0];
      const settings = this.getSettingsSnapshot ? this.getSettingsSnapshot() : null;
      if (firstCell) {
        addToGallery(firstCell, filename, settings).then(() => {
          this.$emit("saved");
        });
      }
    },
  },
});
</script>

<template>
  <Space vertical large>
    <Card class="result" title="プレビュー">
      <Space vertical large>
        <RawResult
            v-if="!previewMode"
            :images="resultImageUrls"
            :rounded="rounded" />
        <Preview
            v-if="previewMode"
            :images="resultImageUrls"
            :dark-mode="false"
            :rounded="rounded" />
        <Preview
            v-if="previewMode"
            :images="resultImageUrls"
            :dark-mode="true"
            :rounded="rounded" />
        <div class="size-info">
          <span class="size-text">
            ファイルサイズ: {{ formatKiB(maxCellSize) }}{{ isSplit ? "(1マスあたり最大)" : "" }}
          </span>
          <span v-if="sizeWarning === 'slack'" class="size-warning size-warning-slack">
            ⚠️ Slackの上限(128KB)を超えています(Discordの256KBまでならOK)
          </span>
          <span v-else-if="sizeWarning === 'both'" class="size-warning size-warning-both">
            ⚠️ Slack(128KB)・Discord(256KB)どちらの上限も超えています
          </span>
        </div>
        <Checkbox v-model="previewMode" name="サンプル表示">
          {{ "サンプル表示" }}
        </Checkbox>
        <Checkbox v-model="rounded" name="角丸">
          {{ "角丸プレビュー" }}
        </Checkbox>
      </Space>
    </Card>
    <Space class="buttons">
      <Button
          v-if="showTarget"
          name="効果をつける(戻る)"
          @click="$emit('toggleShowTarget', $event)">
        <template #icon>
          <Back />
        </template>
        もどる
      </Button>
      <Button
          v-else
          name="効果をつける"
          @click="$emit('toggleShowTarget', $event)">
        <template #icon>
          <Effect />
        </template>
        効果をつける
      </Button>
      <Button type="primary" name="保存" @click="onDownload">
        <template #icon>
          <Save />
        </template>
        絵文字を保存
      </Button>
    </Space>
  </Space>
</template>

<style scoped>
.result {
  background-image:
    linear-gradient(
      45deg,
      var(--bg) 25%,
      transparent 25%,
      transparent 75%,
      var(--bg) 75%,
      var(--bg)
    ),
    linear-gradient(
      45deg,
      var(--bg) 25%,
      transparent 25%,
      transparent 75%,
      var(--bg) 75%,
      var(--bg)
    );
  background-position: 0 0, 10px 10px;
  background-size: 20px 20px;
}

.size-info {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingSmall) var(--spacingMedium);
  align-items: center;
}

.size-text {
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  opacity: 0.7;
}

.size-warning {
  font-size: var(--fontSizeMedium);
  font-weight: bold;
}

.size-warning-slack {
  color: var(--primaryDarker, var(--primary));
}

.size-warning-both {
  color: var(--danger);
}
</style>
