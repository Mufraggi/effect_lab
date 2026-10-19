<script setup lang="ts">
import type { Post } from "@effect_lab/shared"

defineProps<{ post: Post }>()
const emit = defineEmits<{ editTitle: [title: string]; edit: [] }>()
</script>

<template>
  <!-- `as="li"` : le parent est une `<ul>`, la carte garde son rôle d'item. -->
  <UCard as="li">
    <!-- `post.title` est une prop, donc `:model-value` + `@change` et pas de
         `v-model` : la valeur revient par l'event, jamais par mutation. -->
    <!-- `ghost` : le titre se lit comme un titre au repos, et se révèle
         éditable au survol et au focus. -->
    <UInput
      :model-value="post.title"
      variant="ghost"
      aria-label="titre"
      class="w-full"
      :ui="{ base: 'text-base font-medium' }"
      @change="emit('editTitle', ($event.target as HTMLInputElement).value)"
    />
    <p class="my-2">{{ post.body }}</p>
    <div class="flex flex-wrap items-center gap-1.5 text-sm text-muted">
      <span>par {{ post.author.name }}</span>
      <UBadge
        variant="subtle"
        :color="post.meta.visibility === 'public' ? 'success' : 'warning'"
      >
        {{ post.meta.visibility }}
      </UBadge>
      <UBadge v-for="tag in post.tags" :key="tag" color="neutral" variant="subtle">{{ tag }}</UBadge>
    </div>

    <template #footer>
      <UButton icon="i-lucide-pencil" variant="subtle" size="sm" @click="emit('edit')">
        Éditer
      </UButton>
    </template>
  </UCard>
</template>
