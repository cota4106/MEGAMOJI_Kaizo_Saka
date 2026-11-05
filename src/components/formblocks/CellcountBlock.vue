<script lang="ts">
import { defineComponent, PropType } from "vue";
import Fieldset from "../inputs/Fieldset.vue";
import Number from "../inputs/Number.vue";
import Space from "../global/Space.vue";
import { suggestCellGrids, cellDistortion, CellSuggestion } from "../../utils/cellSuggestion";

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
      if (!this.aspect || !globalThis.Number.isFinite(this.aspect) || this.aspect <= 0) {
        return [];
      }
      return suggestCellGrids(this.aspect);
    },
    currentDistortionPercent(): number | null {
      if (!this.aspect || !globalThis.Number.isFinite(this.aspect) || this.aspect <= 0) {
        return null;
      }
      const [h, v] = this.modelValue;
      if (!h || !v || h * v <= 1) {
        return null;
      }
      return Math.round(cellDistortion(this.aspect, h, v) * 100);
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
      <span class="order-hint">(横 x 縦)</span>
      <span v-if="modelValue[0] * modelValue[1] > 1" class="order-hint">
        分割したマスはすべて正方形になります(元画像の比率と合わない分割数だと、その分引き伸ばされます)。
      </span>
      <span
          v-if="currentDistortionPercent !== null"
          :class="['distortion', { warn: currentDistortionPercent > 15 }]">
        今の分割の引き伸ばし: 約{{ currentDistortionPercent }}%{{ currentDistortionPercent > 15 ? '(おすすめの分割数だと小さくなります)' : '' }}
      </span>
      <details v-if="suggestions.length > 0" class="suggestions-details">
        <summary class="suggestions-summary">
          歪みが出にくいおすすめを見る{{ isCurrentSuggested ? "(適用中)" : "" }}
        </summary>
        <div class="suggestions">
          <button
              v-for="s in suggestions"
              :key="`${s.h}x${s.v}`"
              type="button"
              class="suggestion-chip"
              :class="{ active: s.h === modelValue[0] && s.v === modelValue[1] }"
              :title="`引き伸ばし 約${Math.round(s.distortion * 100)}%`"
              @click="applySuggestion(s)">
            {{ s.h }}x{{ s.v }}
          </button>
        </div>
      </details>
    </Space>
  </Fieldset>
</template>

<style scoped>
.order-hint {
  margin-top: calc(var(--spacingSmall) * -1);
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  color: var(--fg);
  opacity: 0.5;
}

.suggestions-details {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
}

.suggestions-summary {
  color: var(--primary);
  cursor: pointer;
  user-select: none;
}

.distortion {
  font-size: var(--fontSizeSmall, var(--fontSizeMedium));
  opacity: 0.8;
}

.distortion.warn {
  color: #f9a825;
  opacity: 1;
}

.suggestions {
  max-height: 9em;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingSmall);
  align-items: center;
  margin-top: var(--spacingSmall);
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
