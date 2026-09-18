<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  props: {
    images: { type: Array, required: true },
    rounded: { type: Boolean, required: true },
  },
});
</script>

<template>
  <div v-for="(row, i) in images" :key="i" class="result-raw">
    <img
        v-for="(col, j) in row"
        :key="j"
        :class="`result-cell ${ rounded ? 'mi2' : ''}`"
        :style="{ width: `${100 / row.length}%` }"
        :src="col">
  </div>
</template>

<style scoped>
.result-raw {
  display: flex;
  flex-wrap: nowrap;
  line-height: 0;
}

.result-cell {
  box-sizing: border-box;
  height: auto;
  border: 1px solid #aaa;
}

.result-cell.mi2 {
  border-radius: 30%;
}
</style>
