<script lang="ts">
import { defineComponent } from "vue";
import Fieldset from "../inputs/Fieldset.vue";
import Space from "../global/Space.vue";
import Button from "../inputs/Button.vue";
import Input from "../inputs/Input.vue";

export default defineComponent({
  components: {
    Fieldset, Space, Button, Input,
  },
  emits: ["import"],
  data() {
    return {
      text: "",
      state: "" as "" | "ok" | "error",
    };
  },
  methods: {
    // 結果(成功/失敗)は親から setResult で受け取る
    onSubmit(): void {
      if (!this.text.trim()) return;
      this.$emit("import", this.text.trim());
    },
    setResult(ok: boolean): void {
      this.state = ok ? "ok" : "error";
      if (ok) this.text = "";
    },
  },
});
</script>

<template>
  <Fieldset label="プリセットの読み込み">
    <Space vertical full>
      <p class="tool-hint">
        もらった共有コード、または共有URLを貼り付けると、プリセットに追加します
        (追加したプリセットは「効果をつける」画面のプリセット一覧に出ます)。
      </p>
      <Input
          v-model="text"
          name="共有コードまたはURL"
          block
          :error="state === 'error'"
          placeholder="共有コード、または共有URLを貼り付け" />
      <Button type="text" name="プリセットを追加" :disabled="!text.trim()" @click="onSubmit">
        <template #icon>
          📥
        </template>
        追加
      </Button>
      <p v-if="state === 'ok'" class="tool-msg">
        プリセットに追加しました。「効果をつける」画面の一覧から使えます。
      </p>
      <p v-if="state === 'error'" class="tool-msg tool-msg-error">
        読み取れませんでした。コードやURLが途中で切れていないか確認してください。
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

.tool-msg {
  margin: 0;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.tool-msg-error {
  color: var(--dangerDarker);
}
</style>
