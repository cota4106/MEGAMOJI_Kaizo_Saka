<script lang="ts">
import { defineComponent, PropType } from "vue";
import TabButton from "../inputs/TabButton.vue";
import TabGroup from "../inputs/TabGroup.vue";
import ToggleButton from "../inputs/ToggleButton.vue";
import Fieldset from "../inputs/Fieldset.vue";
import Slider from "../inputs/Slider.vue";
import Space from "../global/Space.vue";
import Card from "../global/Card.vue";
import * as parts from "../../constants/parts";
import fonts from "../../constants/fonts";
import empty from "../../parts/void.svg";
import {
  OverlayItem, TextOverlayConf, DEFAULT_TEXT_CONF, compositeOverlays, loadTrimmed, loadItemImage, newOverlayId,
} from "../../utils/overlay";

type Row = { key: "x" | "y" | "size" | "rotation" | "opacity", label: string, min: number, max: number, step: number };

const ROWS: Row[] = [
  { key: "x", label: "横位置", min: -20, max: 120, step: 0.5 },
  { key: "y", label: "縦位置", min: -20, max: 120, step: 0.5 },
  { key: "size", label: "大きさ", min: 5, max: 250, step: 1 },
  { key: "rotation", label: "回転", min: -180, max: 180, step: 1 },
  { key: "opacity", label: "不透明度", min: 0, max: 100, step: 1 },
];

const UPLOAD_MAX = 192;
const CUSTOM_KEY = "megamoji_custom_parts_v1";
const SNAP_KEY = "megamoji_overlay_snap_v1";
/** 吸着する距離(元画像の幅/高さに対する%) */
const SNAP_THRESHOLD = 2.5;

const ALIGN_OPTIONS = [
  { value: "center", label: "中央揃え" },
  { value: "left", label: "左揃え" },
  { value: "right", label: "右揃え" },
  { value: "stretch", label: "両端揃え" },
];

const loadSnapSetting = (): boolean => {
  try {
    return window.localStorage.getItem(SNAP_KEY) !== "off";
  } catch (_) {
    return true;
  }
};
const CUSTOM_LIMIT = 12;

type CustomPart = { src: string, label: string };

const loadCustom = (): CustomPart[] => {
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((a) => a && typeof a.src === "string" && a.src.startsWith("data:image/")).slice(0, CUSTOM_LIMIT)
      : [];
  } catch (_) {
    return [];
  }
};
const saveCustom = (list: CustomPart[]): void => {
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch (_) { /* 容量不足などは無視(今回のセッションでは使える) */ }
};

export default defineComponent({
  components: {
    TabButton, TabGroup, ToggleButton, Fieldset, Slider, Space, Card,
  },
  props: {
    show: { type: Boolean, required: true },
    /** 重ねる前の元画像(テキスト/画像ファイルモードで作られたcanvas) */
    source: { type: Object as PropType<HTMLCanvasElement | null>, default: null },
    modelValue: { type: Array as PropType<OverlayItem[]>, required: true },
    /** true: Cardと折りたたみ無しで、親カードの中に直接表示する(パーツモード用) */
    embedded: { type: Boolean, default: false },
    /** 選べるカテゴリ(未指定なら全部) */
    categories: { type: Array as PropType<string[]>, default: () => [] },
    /** true: 追加時にパーツ本来の位置・大きさで置く(目や口など、位置が決まっているパーツ向け) */
    natural: { type: Boolean, default: false },
    /** 重なり順の既定(奥→手前)。追加時にこの順になるよう差し込む */
    insertOrder: { type: Array as PropType<string[]>, default: () => [] },
  },
  emits: ["update:modelValue"],
  data(props) {
    return {
      parts,
      empty,
      rows: ROWS,
      // 先頭のタブ(表示順)を最初に選ぶ。制限がなければ「飾り(others)」
      tab: (props.categories && props.categories.length
        ? (parts.categories.find((c) => props.categories.includes(c.value)) || parts.categories[0]).value
        : "others"),
      open: false,
      selectedId: null as string | null,
      dims: {} as Record<string, { w: number, h: number }>,
      drag: null as null | { id: string, dx: number, dy: number },
      fontGroups: fonts,
      alignOptions: ALIGN_OPTIONS,
      /* 吸着(スナップ)。設定はブラウザに覚えておく */
      snapOn: true,
      guides: { x: null, y: null } as { x: number | null, y: number | null },
      uploadError: "",
      customParts: [] as CustomPart[],
      renderToken: 0,
    };
  },
  computed: {
    visibleCategories(): { value: string, label: string }[] {
      return parts.categories.filter((c) => (
        this.categories.length === 0 || this.categories.includes(c.value)
      ));
    },
    categoryLabels(): Record<string, string> {
      const m: Record<string, string> = {};
      parts.categories.forEach((c) => { m[c.value] = c.label; });
      return m;
    },
    selected(): OverlayItem | null {
      return this.modelValue.find((o) => o.id === this.selectedId) || null;
    },
  },
  watch: {
    source() { this.drawStage(); },
    modelValue: { handler() { this.drawStage(); }, deep: true },
    selectedId() { this.drawStage(); },
    guides: { handler() { this.drawStage(); }, deep: true },
    open(v: boolean) { if (v) this.$nextTick(() => this.drawStage()); },
    show(v: boolean) { if (v) this.$nextTick(() => this.drawStage()); },
  },
  mounted() {
    this.customParts = loadCustom();
    this.snapOn = loadSnapSetting();
    this.drawStage();
  },
  methods: {
    update(items: OverlayItem[]): void {
      this.$emit("update:modelValue", items);
    },
    /** 寸法キャッシュのキー(テキストは内容が変わると大きさも変わるので設定ごと) */
    dimKey(o: OverlayItem): string {
      return o.text ? `text:${JSON.stringify(o.text)}` : o.src;
    },
    setSnap(v: boolean): void {
      this.snapOn = v;
      if (!v) this.guides = { x: null, y: null };
      try {
        window.localStorage.setItem(SNAP_KEY, v ? "on" : "off");
      } catch (_) { /* 保存できなくても動作には影響しない */ }
    },
    async addText(): Promise<void> {
      const text: TextOverlayConf = { ...DEFAULT_TEXT_CONF };
      const item: OverlayItem = {
        id: newOverlayId(),
        src: "text:",
        label: "テキスト",
        text,
        x: 50,
        y: 50,
        size: 70,
        rotation: 0,
        flipX: false,
        opacity: 100,
      };
      this.update([...this.modelValue, item]);
      this.selectedId = item.id;
      this.open = true;
    },
    patchText(id: string, p: Partial<TextOverlayConf>): void {
      const o = this.modelValue.find((v) => v.id === id);
      if (!o || !o.text) return;
      const text = { ...o.text, ...p };
      const label = text.content.trim().split("\n")[0].slice(0, 8) || "テキスト";
      this.patch(id, { text, label });
    },
    onTextInput(id: string, key: keyof TextOverlayConf, e: Event): void {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      this.patchText(id, { [key]: t.value } as Partial<TextOverlayConf>);
    },
    onTextCheck(id: string, key: keyof TextOverlayConf, e: Event): void {
      this.patchText(id, { [key]: (e.target as HTMLInputElement).checked } as Partial<TextOverlayConf>);
    },
    async addPart(src: string, label: string, category?: string): Promise<void> {
      if (src === empty) return;
      let pos = { x: 50, y: 50, size: 50 };
      try {
        const t = await loadTrimmed(src);
        this.dims[src] = { w: t.canvas.width, h: t.canvas.height };
        if (this.natural && category) pos = t.natural;
      } catch (e) {
        this.uploadError = (e as Error).message;
        return;
      }
      const item: OverlayItem = {
        id: newOverlayId(), src, label, category, ...pos, rotation: 0, flipX: false, opacity: 100,
      };
      const list = [...this.modelValue];
      const rank = (c?: string): number => (c ? this.insertOrder.indexOf(c) : -1);
      let at = list.length;
      if (rank(category) >= 0) {
        // 同じ/より手前のカテゴリの後ろ、より手前に描くカテゴリの前に入れる
        while (at > 0 && rank(list[at - 1].category) > rank(category)) at--;
      }
      list.splice(at, 0, item);
      this.update(list);
      this.selectedId = item.id;
      this.open = true;
    },
    patch(id: string, p: Partial<OverlayItem>): void {
      this.update(this.modelValue.map((o) => (o.id === id ? { ...o, ...p } : o)));
    },
    setRow(row: Row, value: number): void {
      if (!this.selected || !globalThis.isFinite(value)) return;
      const v = Math.min(row.max, Math.max(row.min, value));
      this.patch(this.selected.id, { [row.key]: v });
    },
    onNumber(row: Row, e: Event): void {
      const raw = (e.target as HTMLInputElement).value;
      if (raw === "") return;
      this.setRow(row, Number(raw));
    },
    remove(id: string): void {
      this.update(this.modelValue.filter((o) => o.id !== id));
      if (this.selectedId === id) this.selectedId = null;
    },
    clearAll(): void {
      this.update([]);
      this.selectedId = null;
    },
    move(id: string, dir: 1 | -1): void {
      const list = [...this.modelValue];
      const i = list.findIndex((o) => o.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      this.update(list);
    },
    duplicate(id: string): void {
      const o = this.modelValue.find((v) => v.id === id);
      if (!o) return;
      const copy = { ...o, id: newOverlayId(), x: Math.min(120, o.x + 5), y: Math.min(120, o.y + 5) };
      this.update([...this.modelValue, copy]);
      this.selectedId = copy.id;
    },
    async reset(id: string): Promise<void> {
      const o = this.modelValue.find((v) => v.id === id);
      let pos = { x: 50, y: 50, size: 50 };
      if (o && this.natural && o.category) {
        try { pos = (await loadTrimmed(o.src)).natural; } catch (_) { /* 既定値のまま */ }
      }
      if (o && o.text) {
        pos = { x: 50, y: 50, size: 70 };
      }
      this.patch(id, { ...pos, rotation: 0, flipX: false, opacity: 100 });
    },
    async onUpload(e: Event): Promise<void> {
      const input = e.target as HTMLInputElement;
      const files = Array.from(input.files || []);
      input.value = "";
      this.uploadError = "";
      for (const file of files) {
        try {
          const url = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => reject(new Error("画像を読み込めませんでした"));
            fr.readAsDataURL(file);
          });
          // 履歴(localStorage)の容量を食わないよう小さく縮小して保存する
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error(`「${file.name}」は画像として読み込めませんでした`));
            im.src = url;
          });
          const k = Math.min(1, UPLOAD_MAX / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
          const src = c.toDataURL("image/png");
          const label = file.name.replace(/\.[^.]+$/, "") || "画像";
          this.customParts = [{ src, label }, ...this.customParts.filter((p) => p.src !== src)].slice(0, CUSTOM_LIMIT);
          saveCustom(this.customParts);
          await this.addPart(src, label);
        } catch (err) {
          this.uploadError = (err as Error).message;
        }
      }
    },
    removeCustom(src: string): void {
      this.customParts = this.customParts.filter((p) => p.src !== src);
      saveCustom(this.customParts);
    },
    /* ---- stage ---- */
    async ensureDims(): Promise<void> {
      for (const o of this.modelValue) {
        const key = this.dimKey(o);
        if (!this.dims[key]) {
          try {
            const t = await loadItemImage(o);
            if (t) this.dims[key] = { w: t.canvas.width, h: t.canvas.height };
          } catch (_) { /* ignore */ }
        }
      }
    },
    async drawStage(): Promise<void> {
      const stage = this.$refs.stage as HTMLCanvasElement | undefined;
      if (!stage || !this.source) return;
      const token = ++this.renderToken;
      await this.ensureDims();
      const comp = await compositeOverlays(this.source, this.modelValue, "all") || this.source;
      if (token !== this.renderToken) return;
      stage.width = comp.width;
      stage.height = comp.height;
      const ctx = stage.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, stage.width, stage.height);
      ctx.drawImage(comp, 0, 0);
      const sel = this.selected;
      if (sel && this.dims[this.dimKey(sel)]) {
        const box = this.boxOf(sel);
        ctx.save();
        ctx.translate(this.source.width * sel.x / 100, this.source.height * sel.y / 100);
        ctx.rotate(sel.rotation * Math.PI / 180);
        const lw = Math.max(1, Math.min(stage.width, stage.height) / 80);
        ctx.lineWidth = lw;
        ctx.strokeStyle = "#1a73e8";
        ctx.setLineDash([lw * 3, lw * 2]);
        ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
        ctx.restore();
      }
      // 吸着ガイド線(プレビュー上だけに描く。出力画像には入らない)
      if (this.guides.x !== null || this.guides.y !== null) {
        const lw = Math.max(1, Math.min(stage.width, stage.height) / 120);
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = "#e91e63";
        ctx.setLineDash([lw * 4, lw * 3]);
        if (this.guides.x !== null) {
          const gx = stage.width * this.guides.x / 100;
          ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, stage.height); ctx.stroke();
        }
        if (this.guides.y !== null) {
          const gy = stage.height * this.guides.y / 100;
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(stage.width, gy); ctx.stroke();
        }
        ctx.restore();
      }
    },
    /** 回転を考慮した、パーツの外接する四角の半分の幅・高さ(元画像のpx) */
    halfExtent(o: OverlayItem): { w: number, h: number } {
      const b = this.boxOf(o);
      const a = o.rotation * Math.PI / 180;
      const c = Math.abs(Math.cos(a));
      const s = Math.abs(Math.sin(a));
      return { w: (b.w * c + b.h * s) / 2, h: (b.w * s + b.h * c) / 2 };
    },
    /**
     * 吸着: 中央(50%)・元画像の端・他のパーツの中心/端に、近ければぴったり合わせる。
     * 戻り値は吸着後の位置(%)と、表示するガイド線(%)。
     */
    snap(o: OverlayItem, x: number, y: number): { x: number, y: number, gx: number | null, gy: number | null } {
      const W = this.source!.width;
      const H = this.source!.height;
      const half = this.halfExtent(o);
      const hx = half.w / W * 100;
      const hy = half.h / H * 100;
      const candX: { pos: number, guide: number }[] = [
        { pos: 50, guide: 50 },
        { pos: hx, guide: 0 },
        { pos: 100 - hx, guide: 100 },
      ];
      const candY: { pos: number, guide: number }[] = [
        { pos: 50, guide: 50 },
        { pos: hy, guide: 0 },
        { pos: 100 - hy, guide: 100 },
      ];
      this.modelValue.forEach((other) => {
        if (other.id === o.id) return;
        const oh = this.halfExtent(other);
        const ohx = oh.w / W * 100;
        const ohy = oh.h / H * 100;
        candX.push({ pos: other.x, guide: other.x });
        candX.push({ pos: other.x - ohx + hx, guide: other.x - ohx }); // 左端をそろえる
        candX.push({ pos: other.x + ohx - hx, guide: other.x + ohx }); // 右端をそろえる
        candY.push({ pos: other.y, guide: other.y });
        candY.push({ pos: other.y - ohy + hy, guide: other.y - ohy }); // 上端をそろえる
        candY.push({ pos: other.y + ohy - hy, guide: other.y + ohy }); // 下端をそろえる
      });
      const pick = (v: number, cands: { pos: number, guide: number }[]) => {
        let best: { pos: number, guide: number } | null = null;
        let bestD = SNAP_THRESHOLD;
        cands.forEach((c) => {
          const d = Math.abs(v - c.pos);
          if (d <= bestD) { best = c; bestD = d; }
        });
        return best as { pos: number, guide: number } | null;
      };
      const bx = pick(x, candX);
      const by = pick(y, candY);
      return {
        x: bx ? bx.pos : x,
        y: by ? by.pos : y,
        gx: bx ? bx.guide : null,
        gy: by ? by.guide : null,
      };
    },
    boxOf(o: OverlayItem): { w: number, h: number } {
      const d = this.dims[this.dimKey(o)];
      const base = Math.min(this.source!.width, this.source!.height);
      const long = base * o.size / 100;
      if (!d) return { w: long, h: long };
      const k = long / Math.max(d.w, d.h);
      return { w: d.w * k, h: d.h * k };
    },
    hit(o: OverlayItem, px: number, py: number): boolean {
      if (!this.source) return false;
      const box = this.boxOf(o);
      const pad = Math.min(this.source.width, this.source.height) * 0.04;
      const cx = this.source.width * o.x / 100;
      const cy = this.source.height * o.y / 100;
      const a = -o.rotation * Math.PI / 180;
      const dx = px - cx;
      const dy = py - cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      return Math.abs(lx) <= box.w / 2 + pad && Math.abs(ly) <= box.h / 2 + pad;
    },
    toLocal(e: PointerEvent): { x: number, y: number } {
      const stage = this.$refs.stage as HTMLCanvasElement;
      const r = stage.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width * stage.width,
        y: (e.clientY - r.top) / r.height * stage.height,
      };
    },
    onPointerDown(e: PointerEvent): void {
      if (!this.source) return;
      const p = this.toLocal(e);
      // 選択中のパーツを優先し、なければ手前(後に追加したもの)から探す
      let target: OverlayItem | undefined;
      if (this.selected && this.hit(this.selected, p.x, p.y)) {
        target = this.selected;
      } else {
        for (let i = this.modelValue.length - 1; i >= 0; i--) {
          if (this.hit(this.modelValue[i], p.x, p.y)) { target = this.modelValue[i]; break; }
        }
      }
      if (!target) {
        this.selectedId = null;
        return;
      }
      this.selectedId = target.id;
      this.drag = {
        id: target.id,
        dx: p.x - this.source.width * target.x / 100,
        dy: p.y - this.source.height * target.y / 100,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove(e: PointerEvent): void {
      if (!this.drag || !this.source) return;
      const p = this.toLocal(e);
      let x = (p.x - this.drag.dx) / this.source.width * 100;
      let y = (p.y - this.drag.dy) / this.source.height * 100;
      const item = this.modelValue.find((o) => o.id === this.drag!.id);
      if (this.snapOn && !e.altKey && item) {
        // Altキーを押しながらドラッグすると、その間だけ吸着しない
        const r = this.snap(item, x, y);
        x = r.x;
        y = r.y;
        this.guides = { x: r.gx, y: r.gy };
      } else if (this.guides.x !== null || this.guides.y !== null) {
        this.guides = { x: null, y: null };
      }
      this.patch(this.drag.id, {
        x: Math.round(Math.min(120, Math.max(-20, x)) * 10) / 10,
        y: Math.round(Math.min(120, Math.max(-20, y)) * 10) / 10,
      });
    },
    onPointerUp(): void {
      this.drag = null;
      this.guides = { x: null, y: null };
    },
    nudge(dx: number, dy: number): void {
      if (!this.selected) return;
      this.patch(this.selected.id, {
        x: Math.round((this.selected.x + dx) * 10) / 10,
        y: Math.round((this.selected.y + dy) * 10) / 10,
      });
    },
  },
});
</script>

<template>
  <component :is="embedded ? 'div' : 'Card'" v-if="show">
    <component
        :is="embedded ? 'div' : 'details'"
        class="ov"
        :open="embedded ? undefined : open"
        @toggle="!embedded && (open = ($event.target as HTMLDetailsElement).open)">
      <summary v-if="!embedded" class="ov-summary">
        パーツを重ねる(手・飾りなど)<span v-if="modelValue.length" class="ov-count">{{ modelValue.length }}個</span>
      </summary>
      <Space vertical large full>
        <p v-if="!embedded" class="ov-note">
          ※重ねたパーツは元画像と一体になるので、エフェクトもそのまま全体にかかります。
        </p>

        <Fieldset :label="embedded ? 'パーツを追加(クリックで追加・何個でも置けます)' : 'パーツを選ぶ(クリックで追加)'">
          <Space vertical large>
            <TabGroup>
              <TabButton
                  v-for="category in visibleCategories"
                  :key="category.value"
                  v-model="tab"
                  name="重ねパーツのカテゴリ"
                  :value="category.value">
                {{ category.label }}
              </TabButton>
            </TabGroup>
            <div class="ov-parts">
              <button
                  v-for="p in (parts as any)[tab].filter((v: string) => v !== empty)"
                  :key="p"
                  type="button"
                  class="ov-part"
                  :title="'追加'"
                  @click="addPart(p, categoryLabels[tab] || 'パーツ', tab)">
                <img :src="p" class="ov-part-img">
              </button>
            </div>
            <div class="ov-custom">
              <div class="ov-custom-title">テキストをパーツにする</div>
              <button type="button" class="ov-mini ov-text-add" name="テキストパーツを追加" @click="addText">＋ テキストを追加</button>
            </div>
            <div class="ov-custom">
              <div class="ov-custom-title">自分の画像をパーツにする</div>
              <label class="ov-upload ov-file-btn">
                📁 画像ファイルを選ぶ(複数可)
                <input type="file" accept="image/*" multiple class="ov-file-input" @change="onUpload">
              </label>
              <div v-if="customParts.length" class="ov-parts">
                <span v-for="c in customParts" :key="c.src" class="ov-custom-item">
                  <button type="button" class="ov-part" :title="c.label + ' を追加'" @click="addPart(c.src, c.label)">
                    <img :src="c.src" class="ov-part-img">
                  </button>
                  <button type="button" class="ov-custom-x" title="この画像を一覧から消す" @click="removeCustom(c.src)">×</button>
                </span>
              </div>
              <p class="ov-note">PNG(背景透明)がおすすめです。追加した画像は一覧に残り、次回も使えます(ブラウザ内に保存)。</p>
            </div>
            <p v-if="uploadError" class="ov-error">{{ uploadError }}</p>
          </Space>
        </Fieldset>

        <Fieldset v-if="modelValue.length" label="位置を調整(ドラッグでも動かせます)">
          <Space vertical large full>
            <label class="ov-snap">
              <input type="checkbox" name="パーツの吸着" :checked="snapOn" @change="setSnap(($event.target as HTMLInputElement).checked)">
              吸着(スナップ):中央・端・他のパーツにぴったり合わせる<span class="ov-snap-hint">(Altキーを押しながらで一時的に解除)</span>
            </label>
            <canvas
                ref="stage"
                class="ov-stage"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp" />

            <div class="ov-list">
              <div
                  v-for="(o, i) in modelValue"
                  :key="o.id"
                  :class="['ov-item', { sel: o.id === selectedId }]"
                  @click="selectedId = o.id">
                <span v-if="o.text" class="ov-item-img ov-item-t">T</span>
                <img v-else :src="o.src" class="ov-item-img">
                <span class="ov-item-label">{{ i + 1 }}. {{ o.label }}<span v-if="o.effect === false" class="ov-item-tag">効果なし</span></span>
                <button type="button" class="ov-mini" title="手前に" @click.stop="move(o.id, 1)">↑</button>
                <button type="button" class="ov-mini" title="奥に" @click.stop="move(o.id, -1)">↓</button>
                <button type="button" class="ov-mini" title="複製" @click.stop="duplicate(o.id)">複製</button>
                <button type="button" class="ov-mini" title="削除" @click.stop="remove(o.id)">削除</button>
              </div>
            </div>

            <div v-if="selected" class="ov-controls">
              <div v-if="selected.text" class="ov-text-panel">
                <textarea
                    class="ov-text-input"
                    name="パーツのテキスト"
                    rows="2"
                    placeholder="テキストを入力(改行できます)"
                    :value="selected.text.content"
                    @input="onTextInput(selected.id, 'content', $event)" />
                <div class="ov-text-row">
                  <span class="ov-row-label">フォント</span>
                  <select class="ov-select ov-text-grow" name="パーツのフォント" :value="selected.text.font" @change="onTextInput(selected.id, 'font', $event)">
                    <optgroup v-for="g in fontGroups" :key="g.label" :label="g.label">
                      <option v-for="f in g.fonts" :key="f.value" :value="f.value">{{ f.label }}</option>
                    </optgroup>
                  </select>
                </div>
                <div class="ov-text-row">
                  <span class="ov-row-label">文字色</span>
                  <input type="color" class="ov-color" name="パーツの文字色" :value="selected.text.color" @input="onTextInput(selected.id, 'color', $event)">
                  <span class="ov-row-label">揃え</span>
                  <select class="ov-select ov-text-grow" name="パーツの揃え" :value="selected.text.align" @change="onTextInput(selected.id, 'align', $event)">
                    <option v-for="a in alignOptions" :key="a.value" :value="a.value">{{ a.label }}</option>
                  </select>
                </div>
                <div class="ov-text-row">
                  <label class="ov-flip">
                    <input type="checkbox" name="パーツの縦書き" :checked="!!selected.text.vertical" @change="onTextCheck(selected.id, 'vertical', $event)">
                    縦書き
                  </label>
                </div>
                <div class="ov-text-row">
                  <label class="ov-flip">
                    <input type="checkbox" name="パーツの縁取り" :checked="selected.text.outlineOn" @change="onTextCheck(selected.id, 'outlineOn', $event)">
                    縁取り
                  </label>
                  <input v-if="selected.text.outlineOn" type="color" class="ov-color" name="パーツの縁取り色" :value="selected.text.outlineColor" @input="onTextInput(selected.id, 'outlineColor', $event)">
                </div>
                <div v-if="selected.text.outlineOn" class="ov-row">
                  <span class="ov-row-label">縁の太さ</span>
                  <Slider class="ov-row-slider" :model-value="selected.text.outlineThickness" :min="0" :max="3" :step="0.1" block
                          @update:model-value="patchText(selected.id, { outlineThickness: $event as number })" />
                </div>
                <div class="ov-row">
                  <span class="ov-row-label">行間</span>
                  <Slider class="ov-row-slider" :model-value="selected.text.lineSpacing" :min="-0.2" :max="0.5" :step="0.01" block
                          @update:model-value="patchText(selected.id, { lineSpacing: $event as number })" />
                </div>
              </div>
              <div v-for="row in rows" :key="row.key" class="ov-row">
                <span class="ov-row-label">{{ row.label }}</span>
                <Slider
                    class="ov-row-slider"
                    :model-value="selected[row.key]"
                    :min="row.min"
                    :max="row.max"
                    :step="row.step"
                    block
                    @update:model-value="setRow(row, $event as number)" />
                <input
                    class="ov-row-number"
                    type="number"
                    :data-ov="row.key"
                    :value="selected[row.key]"
                    :min="row.min"
                    :max="row.max"
                    :step="row.step"
                    @change="onNumber(row, $event)">
              </div>
              <div class="ov-effect-row">
                <label class="ov-flip">
                  <input
                      type="checkbox"
                      name="パーツにエフェクトをかける"
                      :checked="selected.effect !== false"
                      @change="patch(selected.id, { effect: ($event.target as HTMLInputElement).checked ? undefined : false })">
                  このパーツにエフェクトをかける
                </label>
                <span class="ov-effect-hint">
                  {{ selected.effect === false ? "エフェクトをかけた絵の上に、そのまま重ねます" : "他の絵と一緒にエフェクトがかかります" }}
                </span>
              </div>
              <div class="ov-actions">
                <label class="ov-flip">
                  <input
                      type="checkbox"
                      :checked="selected.flipX"
                      @change="patch(selected.id, { flipX: ($event.target as HTMLInputElement).checked })">
                  左右反転
                </label>
                <button type="button" class="ov-mini" @click="nudge(-0.5, 0)">←</button>
                <button type="button" class="ov-mini" @click="nudge(0.5, 0)">→</button>
                <button type="button" class="ov-mini" @click="nudge(0, -0.5)">↑</button>
                <button type="button" class="ov-mini" @click="nudge(0, 0.5)">↓</button>
                <button type="button" class="ov-mini" @click="reset(selected.id)">この子を初期位置に戻す</button>
              </div>
            </div>
            <p v-else class="ov-note">一覧かプレビュー上のパーツをクリックすると調整できます。</p>

            <button type="button" class="ov-mini ov-clear" @click="clearAll">パーツをすべて外す</button>
          </Space>
        </Fieldset>
      </Space>
    </component>
  </component>
</template>

<style scoped>
.ov-summary { cursor: pointer; font-weight: bold; }
.ov-count {
  margin-left: .6em; font-size: .8em; padding: 0 .6em; border-radius: 999px;
  background: var(--primary, #f0a800); color: #1f1f1f;
}
.ov-note { font-size: .85em; opacity: .75; margin: .4em 0; }
.ov-error { color: #c62828; font-size: .85em; }
.ov-parts { display: flex; flex-wrap: wrap; gap: 6px; max-height: 180px; overflow: auto; }
.ov-part { border: 1px solid #ccc; background: #fff; color: #222; border-radius: 6px; padding: 2px; cursor: pointer; }
.ov-part:hover { border-color: #1a73e8; }
.ov-part-img { width: 36px; height: 36px; display: block; }
.ov-stage {
  width: 100%; max-width: 360px; touch-action: none; cursor: grab; border: 1px solid #ccc; border-radius: 6px;
  background-color: #fff;
  background-image: linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%),
    linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%);
  background-size: 16px 16px; background-position: 0 0, 8px 8px;
}
.ov-list { display: flex; flex-direction: column; gap: 4px; }
.ov-item { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; }
.ov-item.sel { border-color: #1a73e8; background: rgba(26, 115, 232, .08); }
.ov-item-img { width: 24px; height: 24px; object-fit: contain; }
.ov-item-label { flex: 1; font-size: .85em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-mini { font-size: .8em; padding: 2px 8px; border: 1px solid #bbb; background: #fff; color: #222; border-radius: 5px; cursor: pointer; white-space: nowrap; }
.ov-mini:hover { border-color: #1a73e8; }
.ov-controls { display: flex; flex-direction: column; gap: 6px; }
.ov-row { display: flex; align-items: center; gap: 8px; }
.ov-row-label { width: 4.5em; font-size: .85em; flex: none; }
.ov-row-slider { flex: 1; min-width: 0; }
.ov-row-number { width: 4.5em; flex: none; background: #fff; color: #222; border: 1px solid #bbb; border-radius: 5px; padding: 2px 4px; }
.ov-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ov-effect-row { display: flex; flex-direction: column; gap: 2px; }
.ov-effect-hint { font-size: .75em; opacity: .65; }
.ov-item-tag { margin-left: 6px; font-size: .75em; padding: 0 5px; border: 1px solid currentColor; border-radius: 8px; opacity: .7; }
.ov-flip { font-size: .85em; display: flex; align-items: center; gap: 4px; }
.ov-clear { align-self: flex-start; }
.ov-text-add { align-self: flex-start; padding: 4px 12px; }
.ov-snap { font-size: .85em; display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
.ov-snap-hint { opacity: .65; font-size: .9em; }
.ov-item-t { display: inline-flex; align-items: center; justify-content: center; font-weight: bold; border: 1px solid #888; border-radius: 4px; flex: none; }
.ov-text-panel { display: flex; flex-direction: column; gap: 6px; }
.ov-text-input { width: 100%; box-sizing: border-box; background: #fff; color: #222; border: 1px solid #bbb; border-radius: 5px; padding: 4px 6px; font: inherit; resize: vertical; }
.ov-text-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ov-text-grow { flex: 1; min-width: 0; }
.ov-select { background: #fff; color: #222; border: 1px solid #bbb; border-radius: 5px; padding: 3px 4px; max-width: 100%; }
.ov-color { width: 36px; height: 28px; padding: 0; border: 1px solid #bbb; border-radius: 5px; background: #fff; flex: none; }
.ov-upload { font-size: .85em; }
.ov-file-btn {
  align-self: flex-start; padding: 4px 12px; border: 1px dashed #888; border-radius: 6px; cursor: pointer;
}
.ov-file-btn:hover { border-color: #1a73e8; }
.ov-file-input { display: none; }
.ov-custom { display: flex; flex-direction: column; gap: 6px; }
.ov-custom-title { font-size: .85em; font-weight: bold; }
.ov-custom-item { position: relative; display: inline-block; }
.ov-custom-x {
  position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; line-height: 14px; padding: 0;
  font-size: 11px; border-radius: 50%; border: 1px solid #888; background: #fff; color: #222; cursor: pointer;
}
</style>
