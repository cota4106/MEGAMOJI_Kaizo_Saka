<script lang="ts">
import { defineComponent } from "vue";
import ToggleButton from "../inputs/ToggleButton.vue";
import Fieldset from "../inputs/Fieldset.vue";
import Space from "../global/Space.vue";
import Card from "../global/Card.vue";
import OverlayEditor from "./OverlayEditor.vue";
import { mergeImages } from "../../utils/canvas";
import { OverlayItem, compositeOverlays, sanitizeOverlays } from "../../utils/overlay";
import * as parts from "../../constants/parts";
import { EMOJI_SIZE } from "../../constants/emoji";
import empty from "../../parts/void.svg";

// 目・口・飾り・その他は「重ねるパーツ」として自由に配置する(ベースだけは1つ選ぶ方式)
const OVERLAY_CATEGORIES = ["textures", "mouths", "eyes", "others"];

export default defineComponent({
  components: {
    ToggleButton, Fieldset, Card, Space, OverlayEditor,
  },
  props: {
    show: { type: Boolean, required: true },
    emojiSize: { type: Number, default: null },
  },
  emits: [
    "render",
  ],
  data() {
    return {
      parts,
      overlayCategories: OVERLAY_CATEGORIES,
      baseCanvas: null as (HTMLCanvasElement | null),
      conf: {
        base: empty,
      },
      overlays: [] as OverlayItem[],
      token: 0,
    };
  },
  watch: {
    conf: {
      handler(): void {
        this.render();
      },
      deep: true,
    },
    overlays: {
      handler(): void {
        this.render();
      },
      deep: true,
    },
    emojiSize(): void {
      this.render();
    },
  },
  mounted() {
    this.renderBase();
  },
  methods: {
    size(): number {
      return this.emojiSize || EMOJI_SIZE;
    },
    async renderBase(): Promise<HTMLCanvasElement> {
      const base = await mergeImages(this.size(), this.size(), [this.conf.base]);
      this.baseCanvas = base;
      return base;
    },
    /**
     * ベース + 重ねたパーツ を合成して通常の元画像として渡す。
     * エフェクト側は他のモードと同じ canvas を受け取るので、全体にエフェクトがかかる。
     */
    async render(): Promise<void> {
      const token = ++this.token;
      const base = await this.renderBase();
      let img = base;
      let top: HTMLCanvasElement | null = null;
      try {
        img = (await compositeOverlays(base, this.overlays, "effect")) || base;
        top = await compositeOverlays(base, this.overlays, "top");
      } catch (_) {
        img = base;
      }
      if (token !== this.token) {
        return;
      }
      this.$emit("render", img, null, top);
    },
    getSnapshot(): unknown {
      return {
        base: this.conf.base,
        overlays: this.overlays.map((o) => ({ ...o })),
      };
    },
    applySnapshot(snapshot: unknown): void {
      const s = snapshot as { base?: unknown, overlays?: unknown } | null;
      if (!s) return;
      // 保存時のsvg URLがビルドで変わっていても、今あるベースだけを受け付ける
      const base = parts.base.find((b) => b === s.base);
      this.conf.base = base || empty;
      this.overlays = sanitizeOverlays(s.overlays);
    },
  },
});
</script>

<template>
  <Card v-if="show">
    <Space vertical large full>
      <Fieldset label="ベース(1つ選ぶ)">
        <Space small>
          <ToggleButton
              v-for="p in parts.base"
              :key="p"
              v-model="conf.base"
              name="パーツ"
              size="part"
              :value="p">
            <img class="img" :src="p">
          </ToggleButton>
        </Space>
      </Fieldset>
      <OverlayEditor
          v-model="overlays"
          embedded
          natural
          show
          :source="baseCanvas"
          :categories="overlayCategories"
          :insert-order="overlayCategories" />
    </Space>
  </Card>
</template>

<style scoped>
.img {
  height: 1em;
  background-color: #fff;
}
</style>
