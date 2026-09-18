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
import Input from "../inputs/Input.vue";
import { NODE_ENV } from "../../utils/env";
import {
  checkEmojiSize, formatKiB, SizeWarningLevel,
} from "../../utils/sizeLimits";
import { addToGallery } from "../../utils/gallery";

export default defineComponent({
  components: {
    RawResult, Preview, Checkbox, Card, Space, Button, Effect, Back, Save, Input,
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
      emojiName: "",
      pasteTextCopied: false,
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
    // 分割時の「絵文字名」欄が空なら、分割前から設定されていた名前を使う
    effectiveEmojiName(): string {
      return this.emojiName.trim() || (this.name ?? "").trim();
    },
    splitCols(): number {
      return this.images[0]?.length ?? 0;
    },
    splitRows(): number {
      return this.images.length;
    },
    // 分割時、Slackにそのまま貼り付けて並べられる形式のテキスト
    pasteText(): string {
      if (!this.isSplit || !this.effectiveEmojiName) {
        return "";
      }
      const safeName = filenamify(this.effectiveEmojiName, { replacement: "" }).normalize();
      if (!safeName) {
        return "";
      }
      const lines: string[] = [];
      for (let row = 1; row <= this.splitRows; row += 1) {
        const cells: string[] = [];
        for (let col = 1; col <= this.splitCols; col += 1) {
          cells.push(`:${safeName}_${row}_${col}:`);
        }
        lines.push(cells.join(""));
      }
      return lines.join("\n");
    },
  },
  methods: {
    formatKiB,
    onDownload(): void {
      // 分割時は「名前_行_列」形式のファイル名にする(Slackへの絵文字登録名としてそのまま使いやすいように)
      // 名前が未入力なら、分割前から設定されていた名前を使う
      const namePrefix = this.isSplit && this.effectiveEmojiName
        ? filenamify(this.effectiveEmojiName, { replacement: "" }).normalize()
        : undefined;
      const download = prepareDownloadFile(this.images, namePrefix);
      const filename = namePrefix
        || filenamify(this.name ?? "", { replacement: "" }).normalize()
        || "megamoji";
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
    async onCopyPasteText(): Promise<void> {
      if (!this.pasteText) {
        return;
      }
      try {
        await navigator.clipboard.writeText(this.pasteText);
        this.pasteTextCopied = true;
        window.setTimeout(() => {
          this.pasteTextCopied = false;
        }, 2000);
      } catch (e) {
        // クリップボードAPIが使えない場合は手動コピー用に表示する
        // eslint-disable-next-line no-alert
        window.prompt("このテキストをコピーしてください:", this.pasteText);
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
        <Input
            v-if="isSplit"
            v-model="emojiName"
            name="絵文字名"
            block
            :placeholder="`絵文字名(例: Claude)。未入力なら「${name || '(自動の名前)'}」を使います`" />
        <div v-if="isSplit && pasteText" class="paste-text-block">
          <span class="paste-text-label">Slack貼り付け用テキスト(横{{ splitCols }} x 縦{{ splitRows }})</span>
          <textarea
              class="paste-text-output"
              :value="pasteText"
              readonly
              rows="3"></textarea>
          <Button type="text" name="コピー" @click="onCopyPasteText">
            <template #icon>
              📋
            </template>
            {{ pasteTextCopied ? "コピーしました！" : "コピー" }}
          </Button>
        </div>
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

.paste-text-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacingSmall);
}

.paste-text-label {
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  opacity: 0.7;
}

.paste-text-output {
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
</style>
