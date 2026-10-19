<script setup lang="ts">
import { ref } from "vue"

const emit = defineEmits<{ retag: [from: string, to: string] }>()

const tagFrom = ref("effect")
const tagTo = ref("effect-4")
</script>

<template>
  <section class="bulk">
    <h2>Renommer un tag partout</h2>
    <!-- One traversal on the server rewrites the tag across every post. -->
    <input v-model="tagFrom" aria-label="tag source" />
    <span>→</span>
    <input v-model="tagTo" aria-label="tag cible" />
    <button type="button" @click="emit('retag', tagFrom, tagTo)">Renommer</button>
  </section>
</template>

<style scoped>
.bulk {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.bulk h2 {
  font-size: 1rem;
  margin: 0;
  flex: 1 0 100%;
}
</style>
