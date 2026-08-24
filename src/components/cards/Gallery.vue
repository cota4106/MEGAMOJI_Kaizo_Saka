<script lang="ts">
import { defineComponent, PropType } from "vue";
import Fieldset from "../inputs/Fieldset.vue";
import Space from "../global/Space.vue";
import Button from "../inputs/Button.vue";
import NumberInput from "../inputs/Number.vue";
import { GalleryEntry } from "../../utils/gallery";

export default defineComponent({
  components: {
    Fieldset, Space, Button, NumberInput,
  },
  props: {
    entries: { type: Array as PropType<GalleryEntry[]>, required: true },
    limit: { type: Number, required: true },
  },
  emits: [
    "load",
    "remove",
    "clear",
    "changeLimit",
  ],
  methods: {
    onLoad(entry: GalleryEntry): void {
      if (!entry.settings) {
        return;
      }
      this.$emit("load", entry.settings);
    },
    onClear(): void {
      // eslint-disable-next-line no-alert
      if (!window.confirm("履歴を全部削除しますか？")) {
        return;
      }
      this.$emit("clear");
    },
    formatDate(timestamp: number): string {
      const d = new Date(timestamp);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    },
  },
});
</script>

<template>
  <Fieldset label="作った絵文字の履歴">
    <Space vertical full>
      <p class="gallery-hint">
        「絵文字を保存」を押すたびに、見た目のサムネイルとその時の設定を記録します(元のファイルそのものはブラウザに保存されません)。
      </p>
      <div class="gallery-limit-row">
        <span class="gallery-limit-label">保存する件数(上限)</span>
        <NumberInput
            :model-value="limit"
            :min="1"
            :max="100"
            style="width: 80px;"
            @update:model-value="$emit('changeLimit', $event)" />
      </div>
      <p v-if="entries.length === 0" class="gallery-empty">
        まだ履歴はありません。絵文字を作って「絵文字を保存」を押すと、ここに記録されていきます。
      </p>
      <template v-else>
        <div class="gallery-grid">
          <div v-for="entry in entries" :key="entry.id" class="gallery-item">
            <button
                type="button"
                class="gallery-thumb-button"
                :disabled="!entry.settings"
                :title="entry.settings ? '設定を読み込む' : '設定が記録されていません(このバージョンの履歴機能を使う前に作られたものです)'"
                @click="onLoad(entry)">
              <img
                  :src="entry.thumbnail"
                  :alt="entry.name"
                  class="gallery-thumb"
                  :class="{ 'gallery-thumb-disabled': !entry.settings }">
              <span v-if="!entry.settings" class="gallery-no-settings-badge">設定未記録</span>
            </button>
            <span class="gallery-name">{{ entry.name }}</span>
            <span class="gallery-date">{{ formatDate(entry.createdAt) }}</span>
            <button
                type="button"
                class="gallery-remove"
                title="この履歴を削除"
                @click="$emit('remove', entry.id)">
              ×
            </button>
          </div>
        </div>
        <Button type="text" danger name="履歴を全部削除" @click="onClear">
          履歴を全部削除
        </Button>
      </template>
    </Space>
  </Fieldset>
</template>

<style scoped>
.gallery-hint {
  margin: 0;
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.6;
}

.gallery-limit-row {
  display: flex;
  gap: var(--spacingMedium);
  align-items: center;
}

.gallery-limit-label {
  font-size: var(--fontSizeMedium);
  color: var(--fg);
}

.gallery-empty {
  margin: 0;
  font-size: var(--fontSizeMedium);
  color: var(--fg);
  opacity: 0.6;
}

.gallery-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingMedium);
}

.gallery-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 80px;
  gap: 2px;
}

.gallery-thumb-button {
  position: relative;
  padding: 0;
  cursor: pointer;
  background: none;
  border: none;
}

.gallery-thumb-button:disabled {
  cursor: default;
}

.gallery-thumb-button:not(:disabled):hover .gallery-thumb {
  border-color: var(--primary);
}

.gallery-thumb-disabled {
  opacity: 0.4;
  filter: grayscale(60%);
}

.gallery-no-settings-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 1px 0;
  font-size: 9px;
  line-height: 1.4;
  color: var(--bg);
  text-align: center;
  background-color: rgba(0, 0, 0, 0.6);
  border-radius: 0 0 var(--borderRadiusSmall, 6px) var(--borderRadiusSmall, 6px);
}

.gallery-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  background-image:
    linear-gradient(45deg, var(--accentBg) 25%, transparent 25%, transparent 75%, var(--accentBg) 75%, var(--accentBg)),
    linear-gradient(45deg, var(--accentBg) 25%, transparent 25%, transparent 75%, var(--accentBg) 75%, var(--accentBg));
  background-position: 0 0, 6px 6px;
  background-size: 12px 12px;
  border: 1px solid var(--border);
  border-radius: var(--borderRadiusSmall, 6px);
}

.gallery-name {
  overflow: hidden;
  width: 100%;
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-date {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.5;
}

.gallery-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 12px;
  line-height: 1;
  color: var(--bg);
  cursor: pointer;
  background-color: var(--danger);
  border: none;
  border-radius: 50%;
}
</style>
