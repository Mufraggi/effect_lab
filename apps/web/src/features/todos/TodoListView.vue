<script setup lang="ts">
import { computed, ref } from "vue"
import { Match } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useAtom, useAtomValue } from "@effect/atom-vue"
import { TodoId } from "@effect_lab/shared"
import type { Rejection, Todo } from "./projection.js"
import type { TodoClient } from "./todoClient.js"
import { useMutation } from "../../shared/useMutation.js"

const props = defineProps<{ client: TodoClient }>()

const [online, setOnline] = useAtom(() => props.client.online)
const connection = useAtomValue(() => props.client.connection)
const projection = useAtomValue(() => props.client.todos)
const conflicts = useAtomValue(() => props.client.conflicts)
const { run: write, error } = useMutation(() => props.client.write)

const status = computed(() => {
  const c = connection.value
  if (AsyncResult.isSuccess(c)) return c.value === "online" ? "en ligne" : "hors ligne"
  if (AsyncResult.isFailure(c)) return "serveur injoignable"
  return "connexion…"
})

const todos = computed<ReadonlyArray<Todo>>(() =>
  AsyncResult.isSuccess(projection.value) ? [...projection.value.value.todos.values()] : []
)

const describe = ({ _tag, event }: Rejection): string => {
  const what = Match.valueTags(event, {
    TodoAdded: ({ payload }) => `TodoAdded(${payload.id}) "${payload.title}"`,
    TodoRenamed: ({ payload }) => `TodoRenamed(${payload.id}) "${payload.title}"`,
    TodoToggled: ({ payload }) => `TodoToggled(${payload.id}) done=${payload.done}`,
    TodoDeleted: ({ payload }) => `TodoDeleted(${payload.id})`
  })
  return _tag === "Stale"
    ? `${what} ignoré : une écriture plus récente est déjà appliquée`
    : `${what} ignoré : la todo est supprimée`
}

const conflictMessages = computed<ReadonlyArray<string>>(() =>
  AsyncResult.isSuccess(conflicts.value) ? conflicts.value.value.map(describe) : []
)

const title = ref("")
const add = async () => {
  const value = title.value.trim()
  if (value === "") return
  title.value = ""
  await write({ _tag: "TodoAdded", payload: { id: TodoId.make(crypto.randomUUID().slice(0, 8)), title: value } })
}

/** The input that fired a `change` event. */
const inputOf = (e: Event) => e.target as HTMLInputElement

const toggle = (todo: Todo, e: Event) =>
  write({ _tag: "TodoToggled", payload: { id: todo.id, done: inputOf(e).checked } })

const rename = (todo: Todo, e: Event) =>
  write({ _tag: "TodoRenamed", payload: { id: todo.id, title: inputOf(e).value } })

const remove = (todo: Todo) => write({ _tag: "TodoDeleted", payload: { id: todo.id } })
</script>

<template>
  <section class="panel" :class="{ offline: !online }">
    <header>
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
        <input type="checkbox" :checked="todo.done" aria-label="faite" @change="toggle(todo, $event)" />
        <input
          class="title"
          :class="{ done: todo.done }"
          :value="todo.title"
          aria-label="titre"
          @change="rename(todo, $event)"
        />
        <code>{{ todo.id }}</code>
        <button aria-label="supprimer" @click="remove(todo)">×</button>
      </li>
      <li v-if="todos.length === 0" class="empty">(vide)</li>
    </ul>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <details :open="conflictMessages.length > 0">
      <summary>Conflits résolus ici ({{ conflictMessages.length }})</summary>
      <ul class="conflicts">
        <li v-for="(message, i) in conflictMessages" :key="i">{{ message }}</li>
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
