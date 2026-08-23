<script lang="ts">
import { defineComponent, PropType } from "vue";
import Fieldset from "../inputs/Fieldset.vue";
import Number from "../inputs/Number.vue";
import Space from "../global/Space.vue";
import { suggestCellGrids, CellSuggestion } from "../../utils/cellSuggestion";

export default defineComponent({
  components: {
    Fieldset, Space, Number,
  },
  props: {
    modelValue: { type: Array as PropType<number[]>, required: true },
    // 分割対象になる画像の縦横比(横 / 縦)。指定があれば「おすすめの分割数」を出す
    aspect: { type: Number, default: null },
  },
  emits: [
    "update:modelValue",
  ],
  computed: {
    suggestions(): CellSuggestion[] {
      if (!this.aspect || !Number.isFinite(this.aspect) || this.aspect <= 0) {
        return [];
      }
      return suggestCellGrids(this.aspect);
    },
    isCurrentSuggested(): boolean {
      return this.suggestions.some(
        (s) => s.h === this.modelValue[0] && s.v === this.modelValue[1],
      );
    },
  },
  methods: {
    applySuggestion(s: CellSuggestion): void {
      this.$emit("update:modelValue", [s.h, s.v]);
    },
  },
});
</script>

<template>
  <Fieldset label="分割">
    <Space vertical full>
      <Space>
        <Number
            :model-value="modelValue[0]"
            :min="1"
            style="width: 100px;"
            @update:model-value="$emit('update:modelValue', [$event, modelValue[1]])" />
        <span>x</span>
        <Number
            :model-value="modelValue[1]"
            :min="1"
            style="width: 100px;"
            @update:model-value="$emit('update:modelValue', [modelValue[0], $event])" />
      </Space>
      <div v-if="suggestions.length > 0" class="suggestions">
        <span class="suggestions-label">歪みが出にくいおすすめ:</span>
        <button
            v-for="s in suggestions"
            :key="`${s.h}x${s.v}`"
            type="button"
            class="suggestion-chip"
            :class="{ active: s.h === modelValue[0] && s.v === modelValue[1] }"
            @click="applySuggestion(s)">
          {{ s.h }}x{{ s.v }}
        </button>
      </div>
    </Space>
  </Fieldset>
</template>

<style scoped>
.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingSmall);
  align-items: center;
}

.suggestions-label {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.6;
}

.suggestion-chip {
  padding: 2px 10px;
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  cursor: pointer;
  background-color: var(--accentBg);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.suggestion-chip:hover {
  border-color: var(--primary);
}

.suggestion-chip.active {
  color: var(--bg);
  background-color: var(--primary);
  border-color: var(--primary);
}
</style>
