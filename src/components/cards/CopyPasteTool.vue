<script lang="ts">
import { defineComponent } from "vue";
import Fieldset from "../inputs/Fieldset.vue";
import Space from "../global/Space.vue";
import Button from "../inputs/Button.vue";
import NumberInput from "../inputs/Number.vue";
import Input from "../inputs/Input.vue";

export default defineComponent({
  components: {
    Fieldset, Space, Button, NumberInput, Input,
  },
  data() {
    return {
      name: "",
      rows: 2,
      cols: 2,
      copied: false,
    };
  },
  computed: {
    pasteText(): string {
      if (!this.name.trim()) {
        return "";
      }
      const safeName = this.name.trim();
      const lines: string[] = [];
      for (let row = 1; row <= this.rows; row += 1) {
        const cells: string[] = [];
        for (let col = 1; col <= this.cols; col += 1) {
          cells.push(`:${safeName}_${row}_${col}:`);
        }
        lines.push(cells.join(""));
      }
      return lines.join("\n");
    },
  },
  methods: {
    async onCopy(): Promise<void> {
      if (!this.pasteText) {
        return;
      }
      try {
        await navigator.clipboard.writeText(this.pasteText);
        this.copied = true;
        window.setTimeout(() => {
          this.copied = false;
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
  <Fieldset label="分割絵文字コピペツール">
    <Space vertical full>
      <p class="copytool-hint">
        分割して登録した絵文字の縦横のマス数と名前を入力すると、Slackにそのまま貼り付けて並べられる形式のテキストを作ります。
        (このMEGAMOJIで作った「名前_行_列」形式の絵文字専用です)
      </p>
      <div class="copytool-row">
        <Input
            v-model="name"
            name="絵文字名"
            block
            placeholder="絵文字名(例: Claude)" />
      </div>
      <div class="copytool-row">
        <span class="copytool-label">マス数(縦 x 横)</span>
        <NumberInput v-model="rows" :min="1" style="width: 80px;" />
        <span>x</span>
        <NumberInput v-model="cols" :min="1" style="width: 80px;" />
      </div>
      <textarea
          class="copytool-output"
          :value="pasteText"
          readonly
          placeholder="ここに貼り付け用のテキストが表示されます"
          rows="4"></textarea>
      <Button type="text" name="コピー" :disabled="!pasteText" @click="onCopy">
        <template #icon>
          📋
        </template>
        {{ copied ? "コピーしました！" : "コピー" }}
      </Button>
    </Space>
  </Fieldset>
</template>

<style scoped>
.copytool-hint {
  margin: 0;
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.6;
}

.copytool-row {
  display: flex;
  gap: var(--spacingMedium);
  align-items: center;
}

.copytool-label {
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.copytool-output {
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
