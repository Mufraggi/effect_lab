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

const available = computed<ReadonlyArray<TodoList>>(() =>
  AsyncResult.isSuccess(lists.value) ? lists.value.value : []
)

/** `USelect` veut `{ label, value }` ; la source reste `available`. */
const listItems = computed(() => available.value.map((list) => ({ label: list.name, value: list.id })))

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
  <UCard :ui="{ body: 'grid gap-3 content-start' }">
    <template #header>
      <div class="flex items-baseline gap-2">
        <h2 class="flex-1 font-semibold">{{ name }}</h2>
        <UBadge color="neutral" variant="subtle" class="font-mono" :title="publicKey">
          {{ publicKey.slice(0, 8) }}
        </UBadge>
      </div>
    </template>

    <UFormField v-if="available.length > 0" label="Liste">
      <USelect
        :items="listItems"
        :model-value="current?.id"
        class="w-full"
        @update:model-value="selected = $event as StoreId"
      />
    </UFormField>

    <!-- Le serveur ne donne le code qu'une fois, à la création : il disparaît au
         rechargement, donc à partager avant. -->
    <UAlert v-if="inviteCode" color="info" variant="subtle" icon="i-lucide-key-round">
      <template #description>
        Code d'invitation : <span class="font-mono">{{ inviteCode }}</span>
      </template>
    </UAlert>

    <form @submit.prevent="add">
      <UFieldGroup class="w-full">
        <UInput
          v-model="newName"
          placeholder="Nouvelle liste"
          aria-label="nouvelle liste"
          class="flex-1 min-w-0"
        />
        <!-- `loading` désactive aussi le bouton : l'invariant du `disabled` est tenu. -->
        <UButton type="submit" :loading="create.pending.value">Créer</UButton>
      </UFieldGroup>
    </form>
    <form @submit.prevent="enter">
      <UFieldGroup class="w-full">
        <UInput
          v-model="codeToJoin"
          placeholder="Code d'invitation"
          aria-label="code d'invitation"
          class="flex-1 min-w-0"
        />
        <UButton type="submit" color="neutral" variant="subtle" :loading="join.pending.value">
          Rejoindre
        </UButton>
      </UFieldGroup>
    </form>

    <UAlert
      v-if="AsyncResult.isFailure(lists)"
      color="error"
      variant="subtle"
      title="Listes indisponibles"
      role="alert"
    />
    <UAlert
      v-if="create.error.value"
      color="error"
      variant="subtle"
      :description="create.error.value"
      role="alert"
    />
    <UAlert
      v-if="join.error.value"
      color="error"
      variant="subtle"
      :description="join.error.value"
      role="alert"
    />

    <TodoListView v-if="client && current" :key="current.id" :client="client" />
    <UEmpty
      v-else
      icon="i-lucide-list-todo"
      title="Aucune liste"
      description="Créez une liste ou rejoignez-en une."
    />
  </UCard>
</template>
