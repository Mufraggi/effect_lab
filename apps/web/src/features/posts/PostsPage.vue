<script setup lang="ts">
import { computed, ref } from "vue"
import type { PostPatch } from "@effect_lab/shared"
import { usePosts } from "./usePosts.js"
import PostCard from "./PostCard.vue"
import PostForm from "./PostForm.vue"
import RetagForm from "./RetagForm.vue"

const { posts, loading, readError, writeError, editTitle, savePatch, retag } = usePosts()

// All this component owns is view state: which post is open.
const editing = ref<number | null>(null)
const editingPost = computed(() => posts.value.find((p) => p.id === editing.value) ?? null)

const save = async (patch: PostPatch) => {
  const id = editing.value
  if (id === null) return
  await savePatch(id, patch)
  editing.value = null
}
</script>

<template>
  <section class="page">
    <header>
      <h1>Posts</h1>
      <p class="lead">
        L'état serveur, édité par optics : le reducer optimiste décrit
        <em>où</em> l'édition atterrit dans le cache.
      </p>
    </header>

    <p v-if="loading" class="status">Chargement…</p>
    <p v-if="readError" class="error" role="alert">Erreur de lecture : {{ readError }}</p>
    <p v-if="writeError" class="error" role="alert">Écriture refusée : {{ writeError }}</p>

    <RetagForm @retag="retag" />

    <ul class="posts">
      <PostCard
        v-for="post in posts"
        :key="post.id"
        :post="post"
        @edit-title="editTitle(post.id, $event)"
        @edit="editing = post.id"
      />
    </ul>

    <PostForm v-if="editingPost" :post="editingPost" @save="save" @cancel="editing = null" />
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 1.5rem;
}
.lead {
  color: #555;
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}
h1 {
  margin: 0;
}
.status {
  color: #666;
}
.error {
  color: #a00;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
}
.posts {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 1rem;
}
</style>
