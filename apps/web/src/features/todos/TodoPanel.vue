<script setup lang="ts">
import { computed, ref } from "vue"
import { AsyncResult } from "effect/reactivity"
import { useAtom, useAtomValue } from "@effect/atom-vue"
import type { Todo } from "@effect_lab/shared"
import type { TodoClient } from "./todoClient.js"
import { useMutation } from "../../shared/useMutation.js"

const props = defineProps<{ name: string; client: TodoClient }>()

const [online, setOnline] = useAtom(() => props.client.online)
const connection = useAtomValue(() => props.client.connection)
const state = useAtomValue(() => props.client.todos)
const conflicts = useAtomValue(() => props.client.conflicts)
const { run: write, error } = useMutation(() => props.client.write)

const status = computed(() => {
  const c = connection.value
  if (AsyncResult.isSuccess(c)) return c.value === "online" ? "en ligne" : "hors ligne"
  if (AsyncResult.isFailure(c)) return "serveur injoignable"
  return "connexion…"
})

const todos = computed<ReadonlyArray<Todo>>(() =>
  AsyncResult.isSuccess(state.value) ? [...state.value.value.todos.values()] : []
)

const lines = computed<ReadonlyArray<string>>(() =>
  AsyncResult.isSuccess(conflicts.value) ? conflicts.value.value : []
)

const title = ref("")
const add = async () => {
  const value = title.value.trim()
  if (value === "") return
  title.value = ""
  await write({ _tag: "TodoAdded", payload: { id: crypto.randomUUID().slice(0, 8), title: value } })
}
</script>

<template>
  <section class="panel" :class="{ offline: !online }">
    <header>
      <h2>{{ name }}</h2>
      <span class="status">{{ status }}</span>
      <button @click="setOnline(!online)">
        {{ online ? "Passer hors ligne" : "Revenir en ligne" }}
      </button>
    </header>

    <form @submit.prevent="add">
      <input v-model="title" placeholder="Nouvelle todo" aria-label="nouvelle todo" />
      <button type="submit">Ajouter</button>
    </form>

    <ul class="todos">
      <li v-for="todo in todos" :key="todo.id">
        <input
          type="checkbox"
          :checked="todo.done"
          aria-label="faite"
          @change="write({ _tag: 'TodoToggled', payload: { id: todo.id, done: ($event.target as HTMLInputElement).checked } })"
        />
        <input
          class="title"
          :class="{ done: todo.done }"
          :value="todo.title"
          aria-label="titre"
          @change="write({ _tag: 'TodoRenamed', payload: { id: todo.id, title: ($event.target as HTMLInputElement).value } })"
        />
        <code>{{ todo.id }}</code>
        <button aria-label="supprimer" @click="write({ _tag: 'TodoDeleted', payload: { id: todo.id } })">×</button>
      </li>
      <li v-if="todos.length === 0" class="empty">(vide)</li>
    </ul>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <details :open="lines.length > 0">
      <summary>Conflits résolus ici ({{ lines.length }})</summary>
      <ul class="conflicts">
        <li v-for="(line, i) in lines" :key="i">{{ line }}</li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.75rem;
  display: grid;
  gap: 0.75rem;
  align-content: start;
}
.panel.offline {
  border-style: dashed;
  background: #fafafa;
}
header {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}
h2 {
  margin: 0;
  font-size: 1.1rem;
}
.status {
  margin-right: auto;
  font-size: 0.8rem;
  color: #555;
}
form {
  display: flex;
  gap: 0.5rem;
}
form input {
  flex: 1;
  min-width: 0;
}
.todos,
.conflicts {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.35rem;
}
.todos li {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.title {
  flex: 1;
  min-width: 0;
}
.title.done {
  text-decoration: line-through;
  color: #777;
}
code {
  font-size: 0.7rem;
  color: #888;
}
.empty {
  color: #888;
  font-size: 0.85rem;
}
.conflicts li {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
}
summary {
  font-size: 0.85rem;
  cursor: pointer;
}
.error {
  color: #a00;
  font-size: 0.8rem;
}
</style>
