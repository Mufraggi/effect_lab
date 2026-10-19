<script setup lang="ts">
import { computed, ref } from "vue"
import { Exit } from "effect"
import type { EventLog } from "effect/eventlog"
import type { StoreId } from "effect/eventlog/EventLogMessage"
import { AsyncResult } from "effect/reactivity"
import { useAtomValue } from "@effect/atom-vue"
import type { TodoList } from "@effect_lab/shared"
import { createList, joinList, listsKey, listsQuery } from "./lists.js"
import { makeTodoClient, type TodoClient } from "./todoClient.js"
import TodoListView from "./TodoListView.vue"
import { useMutation } from "../../shared/useMutation.js"

/** `dbPrefix` names this panel's IndexedDB databases; `identity` is who it signs as. */
const props = defineProps<{ name: string; dbPrefix: string; identity: EventLog.Identity["Service"] }>()

const publicKey = props.identity.publicKey
const lists = useAtomValue(() => listsQuery(publicKey))
const create = useMutation(() => createList)
const join = useMutation(() => joinList)

const available = computed<ReadonlyArray<TodoList>>(() => (AsyncResult.isSuccess(lists.value) ? lists.value.value : []))

/** The chosen list, or the first one until something is chosen. */
const selected = ref<StoreId | null>(null)
const current = computed(() => available.value.find((list) => list.id === selected.value) ?? available.value[0])

/**
 * One client per list, kept when switching: each owns a runtime, a socket and
 * an IndexedDB database, and rebuilding them on every switch would replay the
 * journal for nothing.
 */
const clients = new Map<StoreId, TodoClient>()
const clientFor = (storeId: StoreId) => {
  let client = clients.get(storeId)
  if (client === undefined) {
    client = makeTodoClient({ database: `${props.dbPrefix}-${storeId}`, identity: props.identity, storeId })
    clients.set(storeId, client)
  }
  return client
}
const client = computed(() => (current.value === undefined ? undefined : clientFor(current.value.id)))

/**
 * Invite codes of the lists created here. The server hands a code out once,
 * at creation, so it is gone after a reload: share it before then.
 */
const inviteCodes = ref(new Map<StoreId, string>())
const inviteCode = computed(() => (current.value === undefined ? undefined : inviteCodes.value.get(current.value.id)))

const newName = ref("")
const add = async () => {
  const name = newName.value.trim()
  if (name === "") return
  const exit = await create.run({ payload: { name, publicKey }, reactivityKeys: listsKey(publicKey) })
  if (Exit.isSuccess(exit)) {
    newName.value = ""
    inviteCodes.value.set(exit.value.id, exit.value.inviteCode)
    selected.value = exit.value.id
  }
}

const codeToJoin = ref("")
const enter = async () => {
  const code = codeToJoin.value.trim()
  if (code === "") return
  const exit = await join.run({ payload: { inviteCode: code, publicKey }, reactivityKeys: listsKey(publicKey) })
  if (Exit.isSuccess(exit)) {
    codeToJoin.value = ""
    selected.value = exit.value.id
  }
}
</script>

<template>
  <section class="panel">
    <header>
      <h2>{{ name }}</h2>
      <code :title="publicKey">{{ publicKey.slice(0, 8) }}</code>
    </header>

    <label v-if="available.length > 0" class="picker">
      Liste
      <select :value="current?.id" @change="selected = ($event.target as HTMLSelectElement).value as StoreId">
        <option v-for="list in available" :key="list.id" :value="list.id">{{ list.name }}</option>
      </select>
    </label>
    <p v-if="inviteCode" class="invite">
      Code d'invitation : <code>{{ inviteCode }}</code>
    </p>

    <form @submit.prevent="add">
      <input v-model="newName" placeholder="Nouvelle liste" aria-label="nouvelle liste" />
      <button type="submit" :disabled="create.pending.value">Créer</button>
    </form>
    <form @submit.prevent="enter">
      <input v-model="codeToJoin" placeholder="Code d'invitation" aria-label="code d'invitation" />
      <button type="submit" :disabled="join.pending.value">Rejoindre</button>
    </form>

    <p v-if="AsyncResult.isFailure(lists)" class="error" role="alert">Listes indisponibles</p>
    <p v-if="create.error.value" class="error" role="alert">{{ create.error.value }}</p>
    <p v-if="join.error.value" class="error" role="alert">{{ join.error.value }}</p>

    <TodoListView v-if="client && current" :key="current.id" :client="client" />
    <p v-else class="empty">Créez une liste ou rejoignez-en une.</p>
  </section>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 0.6rem;
  align-content: start;
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
code {
  font-size: 0.7rem;
  color: #888;
}
.picker {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.85rem;
}
.picker select {
  flex: 1;
}
.invite {
  margin: 0;
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
.empty {
  color: #888;
  font-size: 0.85rem;
}
.error {
  color: #a00;
  font-size: 0.8rem;
  margin: 0;
}
</style>
