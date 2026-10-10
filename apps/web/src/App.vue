<script setup lang="ts">
import { computed, watchEffect } from "vue"
import { Optic } from "effect"
import { FetchHttpClient } from "effect/http"
import { AsyncResult, AtomHttpApi } from "effect/reactivity"
import { Atom, useAtom, useAtomSet, useAtomValue } from "@effect/atom-vue"
import { Api, type Post } from "@effect_lab/shared"

class PostsHttp extends AtomHttpApi.Service<PostsHttp>()("app/PostsHttp", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  baseUrl: "/api"
}) {}

const postsQuery = PostsHttp.query("posts", "posts", { reactivityKeys: ["posts"] })
const updatePost = PostsHttp.mutation("posts", "updatePost")

// Local writable state, updated immutably with optics
type State = { readonly posts: ReadonlyArray<Post> }
const stateAtom = Atom.make<State>({ posts: [] })
const [state, setState] = useAtom(() => stateAtom)


const _posts = Optic.id<State>().key("posts")
const _title = (index: number) => _posts.at(index).key("title")
const _authorName = (index: number) => _posts.at(index).key("author").key("name")

// Read the query atom and sync its result into the local state
const postsResult = useAtomValue(() => postsQuery)
watchEffect(() => {
  if (AsyncResult.isSuccess(postsResult.value)) {
    setState({ posts: postsResult.value.value })
  }
})

const runUpdate = useAtomSet(() => updatePost)

const editTitle = (index: number, id: number, title: string) => {
  setState(_title(index).modify(() => title))
  runUpdate({ params: { id }, payload: { title }, reactivityKeys: ["posts"] })
}

const editAuthor = (index: number, id: number, name: string) => {
  setState(_authorName(index).modify(() => name))
  runUpdate({ params: { id }, payload: { author: { name } }, reactivityKeys: ["posts"] })
}

const loading = computed(() => AsyncResult.isInitial(postsResult.value))
const error = computed(() =>
  AsyncResult.isFailure(postsResult.value) ? String(postsResult.value.cause) : null
)
</script>

<template>
  <main>
    <h1>Optic + atom-vue + AtomHttpApi</h1>

    <p v-if="loading">Chargement…</p>
    <p v-else-if="error" role="alert">Erreur : {{ error }}</p>

    <ul v-else>
      <li v-for="(post, index) in state.posts" :key="post.id">
        <input :value="post.title" @change="editTitle(index, post.id, ($event.target as HTMLInputElement).value)" />
        <p>{{ post.body }}</p>
        <small>
          par
          <input :value="post.author.name" @change="editAuthor(index, post.id, ($event.target as HTMLInputElement).value)" />
        </small>
      </li>
    </ul>
  </main>
</template>
