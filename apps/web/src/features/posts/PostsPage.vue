<script setup lang="ts">
import { computed, ref } from "vue"
import type { PostPatch } from "@effect_lab/shared"
import { usePosts } from "./usePosts.js"
import PostForm from "./PostForm.vue"

const { posts, loading, readError, writeError, editTitle, savePatch, retag } = usePosts()

// All this component owns is view state: which post is open, and what is
// typed in the retag inputs.
const editing = ref<number | null>(null)
const editingPost = computed(() => posts.value.find((p) => p.id === editing.value) ?? null)

const save = async (patch: PostPatch) => {
  const id = editing.value
  if (id === null) return
  await savePatch(id, patch)
  editing.value = null
}

const tagFrom = ref("effect")
const tagTo = ref("effect-4")
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

    <section class="bulk">
      <h2>Renommer un tag partout</h2>
      <!-- One traversal on the server rewrites the tag across every post. -->
      <input v-model="tagFrom" aria-label="tag source" />
      <span>→</span>
      <input v-model="tagTo" aria-label="tag cible" />
      <button @click="retag(tagFrom, tagTo)">Renommer</button>
    </section>

    <ul class="posts">
      <li v-for="post in posts" :key="post.id">
        <input
          :value="post.title"
          aria-label="titre"
          @change="editTitle(post.id, ($event.target as HTMLInputElement).value)"
        />
        <p class="body">{{ post.body }}</p>
        <p class="meta">
          par {{ post.author.name }}
          · <span :class="post.meta.visibility">{{ post.meta.visibility }}</span>
          · <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
        </p>
        <button @click="editing = post.id">Éditer</button>
      </li>
    </ul>

    <PostForm
      v-if="editingPost"
      :post="editingPost"
      @save="save"
      @cancel="editing = null"
    />
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
.posts {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 1rem;
}
.posts li {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.75rem;
}
.posts input {
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
