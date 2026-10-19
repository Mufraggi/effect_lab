<script setup lang="ts">
import { ref } from "vue"

const emit = defineEmits<{ retag: [from: string, to: string] }>()

const tagFrom = ref("effect")
const tagTo = ref("effect-4")
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Renommer un tag partout</h2>
    </template>

    <!-- One traversal on the server rewrites the tag across every post. -->
    <div class="flex flex-wrap items-center gap-2">
      <UInput v-model="tagFrom" aria-label="tag source" class="flex-1 min-w-0" />
      <UIcon name="i-lucide-arrow-right" class="shrink-0 text-dimmed" />
      <UInput v-model="tagTo" aria-label="tag cible" class="flex-1 min-w-0" />
      <UButton icon="i-lucide-replace" @click="emit('retag', tagFrom, tagTo)">Renommer</UButton>
    </div>
  </UCard>
</template>
