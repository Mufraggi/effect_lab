<script setup lang="ts">
import type { Post } from "@effect_lab/shared"

defineProps<{ post: Post }>()
const emit = defineEmits<{ editTitle: [title: string]; edit: [] }>()
</script>

<template>
  <li class="card">
    <input
      :value="post.title"
      aria-label="titre"
      @change="emit('editTitle', ($event.target as HTMLInputElement).value)"
    />
    <p class="body">{{ post.body }}</p>
    <p class="meta">
      par {{ post.author.name }} · <span :class="post.meta.visibility">{{ post.meta.visibility }}</span> ·
      <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
    </p>
    <button @click="emit('edit')">Éditer</button>
  </li>
</template>

<style scoped>
.card {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.75rem;
}
.card input {
  width: 100%;
  font-size: 1rem;
}
.body {
  margin: 0.4rem 0;
}
.meta {
  font-size: 0.8rem;
  color: #555;
  margin: 0 0 0.5rem;
}
.tag {
  background: #eef;
  border-radius: 3px;
  padding: 0 0.3rem;
  margin-right: 0.2rem;
}
.draft {
  color: #b35c00;
}
.public {
  color: #0a7;
}
</style>
