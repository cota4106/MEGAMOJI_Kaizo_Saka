<script lang="ts">
import { defineComponent } from "vue";
import Fieldset from "../inputs/Fieldset.vue";
import Space from "../global/Space.vue";
import Button from "../inputs/Button.vue";
import {
  collectBackup, parseBackup, applyBackup, summarize, BackupFile,
} from "../../utils/backup";

export default defineComponent({
  components: { Fieldset, Space, Button },
  data() {
    return {
      message: "",
      error: false,
      pending: null as BackupFile | null,
    };
  },
  computed: {
    current(): string {
      try {
        const s = summarize(collectBackup().data);
        return `いまのブラウザ: 履歴 ${s.gallery}件 / プリセット ${s.presets}件 / 自分のパーツ ${s.customParts}件`;
      } catch (_) {
        return "";
      }
    },
    pendingSummary(): string {
      if (!this.pending) return "";
      const s = summarize(this.pending.data);
      return `履歴 ${s.gallery}件 / プリセット ${s.presets}件 / 自分のパーツ ${s.customParts}件`;
    },
  },
  methods: {
    onExport(): void {
      try {
        const backup = collectBackup();
        const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        a.href = url;
        a.download = `megamoji-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.error = false;
        this.message = "バックアップファイルを保存しました。";
      } catch (_) {
        this.error = true;
        this.message = "バックアップの作成に失敗しました。";
      }
    },
    onPick(): void {
      (this.$refs.input as HTMLInputElement).click();
    },
    async onFile(e: Event): Promise<void> {
      const input = e.target as HTMLInputElement;
      const file = input.files && input.files[0];
      input.value = "";
      this.pending = null;
      if (!file) return;
      const text = await file.text();
      const parsed = parseBackup(text);
      if (!parsed || Object.keys(parsed.data).length === 0) {
        this.error = true;
        this.message = "このファイルはMEGAMOJIのバックアップとして読み込めませんでした。";
        return;
      }
      this.error = false;
      this.message = "";
      this.pending = parsed;
    },
    onRestore(): void {
      if (!this.pending) return;
      try {
        applyBackup(this.pending);
      } catch (_) {
        this.error = true;
        this.message = "復元に失敗しました(ブラウザの保存容量が足りない可能性があります)。";
        return;
      }
      // 画面側のデータも読み直すため、再読み込みする
      window.location.reload();
    },
    onCancel(): void {
      this.pending = null;
    },
  },
});
</script>

<template>
  <Fieldset label="データのバックアップと復元">
    <Space vertical full>
      <p class="tool-hint">
        履歴・プリセット・自分のパーツ画像は、このブラウザの中にだけ保存されています。
        ブラウザのデータを消したり、別のパソコン/ブラウザに移ったりすると失われるので、
        ファイルに書き出しておけます。
      </p>
      <p v-if="current" class="tool-note">
        {{ current }}
      </p>
      <Space>
        <Button type="text" name="バックアップを書き出す" @click="onExport">
          <template #icon>
            💾
          </template>
          書き出す
        </Button>
        <Button type="text" name="バックアップから復元する" @click="onPick">
          <template #icon>
            📂
          </template>
          ファイルから復元
        </Button>
      </Space>
      <input
          ref="input"
          type="file"
          accept=".json,application/json"
          class="tool-hidden-input"
          @change="onFile">
      <div v-if="pending" class="backup-confirm">
        <p class="backup-confirm-text">
          このファイルの内容({{ pendingSummary }})で、いまのブラウザの設定を置き換えます。
          同じ種類のデータ(履歴など)は上書きされます。よろしいですか?
        </p>
        <Space>
          <Button type="text" danger name="復元を実行" @click="onRestore">
            復元する
          </Button>
          <Button type="text" name="復元をやめる" @click="onCancel">
            やめる
          </Button>
        </Space>
      </div>
      <p v-if="message" class="tool-msg" :class="{ 'tool-msg-error': error }">
        {{ message }}
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

.tool-note {
  margin: 0;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.tool-hidden-input {
  display: none;
}

.tool-msg {
  margin: 0;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.tool-msg-error {
  color: var(--dangerDarker);
}

.backup-confirm {
  border: 1px solid var(--danger);
  border-radius: var(--borderRadius);
  padding: var(--spacingMedium);
}

.backup-confirm-text {
  margin: 0 0 var(--spacingMedium);
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}
</style>
