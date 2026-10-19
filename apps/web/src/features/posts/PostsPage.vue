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
  <section class="grid gap-6">
    <UPageHeader title="Posts">
      <template #description>
        L'état serveur, édité par optics : le reducer optimiste décrit
        <em>où</em> l'édition atterrit dans le cache.
      </template>
    </UPageHeader>

    <!-- `loading` est `AsyncResult.isInitial` — « rien à montrer encore »,
         exactement le cas d'un squelette. -->
    <div v-if="loading" class="grid gap-4">
      <USkeleton v-for="n in 3" :key="n" class="h-28" />
    </div>

    <UAlert
      v-if="readError"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Erreur de lecture"
      role="alert"
    >
      <!-- C'est un `Cause.pretty` : le monospace et les retours à la ligne portent le sens. -->
      <template #description>
        <span class="font-mono text-xs whitespace-pre-wrap">{{ readError }}</span>
      </template>
    </UAlert>

    <UAlert
      v-if="writeError"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Écriture refusée"
      role="alert"
    >
      <template #description>
        <span class="font-mono text-xs whitespace-pre-wrap">{{ writeError }}</span>
      </template>
    </UAlert>

    <RetagForm @retag="retag" />

    <ul class="grid gap-4">
      <PostCard
        v-for="post in posts"
        :key="post.id"
        :post="post"
        @edit-title="editTitle(post.id, $event)"
        @edit="editing = post.id"
      />
    </ul>

    <PostForm
      v-if="editingPost"
      :post="editingPost"
      @save="save"
      @cancel="editing = null"
    />
  </section>
</template>
