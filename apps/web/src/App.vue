<script setup lang="ts">
import { computed, ref } from "vue"
import { Cause, Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useAtomSet, useAtomValue } from "@effect/atom-vue"
import type { Post, PostPatch } from "@effect_lab/shared"
import { POSTS_KEY, optimisticPosts, patchPost, retag, updateTitle } from "./posts.js"
import PostForm from "./PostForm.vue"

const result = useAtomValue(() => optimisticPosts)

// `isInitial` alone only covers the very first load; a refetch triggered by an
// invalidation is a *waiting* success, which it reports as false.
const loading = computed(() =>
  AsyncResult.isInitial(result.value) || AsyncResult.isWaiting(result.value)
)

const posts = computed<ReadonlyArray<Post>>(() =>
  AsyncResult.isSuccess(result.value) ? result.value.value : []
)

const queryError = computed(() =>
  AsyncResult.isFailure(result.value) ? Cause.pretty(result.value.cause) : null
)

// `promiseExit` is what makes a failed mutation observable. Without it the
// setter returns void and a rejected PATCH passes silently.
const runUpdateTitle = useAtomSet(() => updateTitle, { mode: "promiseExit" })
const runPatch = useAtomSet(() => patchPost, { mode: "promiseExit" })
const runRetag = useAtomSet(() => retag, { mode: "promiseExit" })

const mutationError = ref<string | null>(null)

const report = async (run: Promise<Exit.Exit<unknown, unknown>>) => {
  mutationError.value = null
  const exit = await run
  if (Exit.isFailure(exit)) {
    const pretty = Cause.pretty(exit.cause)
    // Headline on screen, full cause in the console — the stack is noise in a UI.
    mutationError.value = pretty.split("\n")[0] ?? "mutation failed"
    console.error(pretty)
  }
}

const editTitle = (id: number, title: string) =>
  report(runUpdateTitle({ params: { id }, payload: { title } }))

const editing = ref<number | null>(null)
const editingPost = computed(() => posts.value.find((p) => p.id === editing.value) ?? null)

const savePatch = async (patch: PostPatch) => {
  const id = editing.value
  if (id === null) return
  await report(runPatch({ params: { id }, payload: patch }))
  editing.value = null
}

const tagFrom = ref("effect")
const tagTo = ref("effect-4")
const applyRetag = () =>
  report(runRetag({ payload: { from: tagFrom.value, to: tagTo.value }, reactivityKeys: POSTS_KEY }))
</script>

<template>
  <main>
    <h1>Optics + atom-vue + AtomHttpApi</h1>

    <p v-if="loading" class="status">Chargement…</p>
    <p v-if="queryError" class="error" role="alert">Erreur de lecture : {{ queryError }}</p>
    <p v-if="mutationError" class="error" role="alert">Écriture refusée : {{ mutationError }}</p>

    <section class="bulk">
      <h2>Renommer un tag partout</h2>
      <!-- One traversal on the server rewrites the tag across every post. -->
      <input v-model="tagFrom" aria-label="tag source" />
      <span>→</span>
      <input v-model="tagTo" aria-label="tag cible" />
      <button @click="applyRetag()">Renommer</button>
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
      @save="savePatch"
      @cancel="editing = null"
    />
  </main>
</template>

<style scoped>
main {
  font-family: system-ui, sans-serif;
  max-width: 44rem;
  margin: 2rem auto;
  padding: 0 1rem;
  display: grid;
  gap: 1.5rem;
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
