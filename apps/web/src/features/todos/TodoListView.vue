<script setup lang="ts">
import { computed, ref, watch } from "vue"
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

/** La même tripartition que `status`, côté couleur. */
const statusColor = computed(() => {
  const c = connection.value
  if (AsyncResult.isSuccess(c)) return c.value === "online" ? "success" : "neutral"
  if (AsyncResult.isFailure(c)) return "error"
  return "neutral"
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

/**
 * Un conflit s'annonce tout seul — c'est ce que faisait `<details :open>`.
 *
 * `defaultOpen` ne suffirait pas : il n'est lu qu'au montage, or le premier
 * conflit arrive bien après. Le `ref` contrôlé rouvre à chaque nouveau conflit,
 * et laisse quand même refermer entre-temps, ce que l'attribut lié interdisait.
 */
const conflictsOpen = ref(false)
watch(
  () => conflictMessages.value.length,
  (count, previous) => {
    if (count > (previous ?? 0)) conflictsOpen.value = true
  }
)

const title = ref("")
const add = async () => {
  const value = title.value.trim()
  if (value === "") return
  title.value = ""
  await write({ _tag: "TodoAdded", payload: { id: TodoId.make(crypto.randomUUID().slice(0, 8)), title: value } })
}

/** The input that fired a `change` event — `UInput` ré-émet l'event natif. */
const inputOf = (e: Event) => e.target as HTMLInputElement

/** `UCheckbox` donne le booléen directement ; le payload écrit est inchangé. */
const toggle = (todo: Todo, done: boolean) => write({ _tag: "TodoToggled", payload: { id: todo.id, done } })

const rename = (todo: Todo, e: Event) =>
  write({ _tag: "TodoRenamed", payload: { id: todo.id, title: inputOf(e).value } })

const remove = (todo: Todo) => write({ _tag: "TodoDeleted", payload: { id: todo.id } })
</script>

<template>
  <!--
    Hors ligne, la carte passe en trait discontinu : ce que faisait
    `.panel.offline`. `soft` retire l'anneau (qui, lui, ne sait pas être
    discontinu) et `border-accented` est le seul ton de bordure qui se détache
    du fond `bg-elevated` en thème sombre — `border-default` s'y confond.
  -->
  <UCard
    :variant="online ? 'outline' : 'soft'"
    :class="online ? undefined : 'border border-dashed border-accented'"
    :ui="{ body: 'grid gap-3 content-start' }"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <!-- `me-auto` sur un badge qui garde sa largeur de contenu : `flex-1`
             l'étirerait jusqu'à le faire passer pour un champ. -->
        <UBadge :color="statusColor" variant="subtle" class="me-auto">{{ status }}</UBadge>
        <!-- C'est un état qu'on manipule, pas une action : l'interrupteur dit
             mieux ce que fait `client.online`. -->
        <USwitch
          :model-value="online"
          label="En ligne"
          @update:model-value="setOnline($event)"
        />
      </div>
    </template>

    <form @submit.prevent="add">
      <UFieldGroup class="w-full">
        <UInput
          v-model="title"
          placeholder="Nouvelle todo"
          aria-label="nouvelle todo"
          class="flex-1 min-w-0"
        />
        <UButton type="submit" icon="i-lucide-plus">Ajouter</UButton>
      </UFieldGroup>
    </form>

    <ul class="grid gap-1.5">
      <li v-for="todo in todos" :key="todo.id" class="flex items-center gap-2">
        <UCheckbox
          :model-value="todo.done"
          aria-label="faite"
          @update:model-value="toggle(todo, $event as boolean)"
        />
        <UInput
          :model-value="todo.title"
          aria-label="titre"
          class="flex-1 min-w-0"
          :ui="{ base: todo.done ? 'line-through text-muted' : '' }"
          @change="rename(todo, $event)"
        />
        <UBadge color="neutral" variant="subtle" class="font-mono text-xs">{{ todo.id }}</UBadge>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="supprimer"
          @click="remove(todo)"
        />
      </li>
      <li v-if="todos.length === 0" class="text-sm text-dimmed">(vide)</li>
    </ul>

    <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />

    <UCollapsible v-model:open="conflictsOpen">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        block
        trailing-icon="i-lucide-chevron-down"
        :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
        class="group justify-between"
      >
        Conflits résolus ici ({{ conflictMessages.length }})
      </UButton>

      <template #content>
        <ul class="grid gap-1 pt-2">
          <li v-for="(message, i) in conflictMessages" :key="i" class="font-mono text-xs">{{ message }}</li>
        </ul>
      </template>
    </UCollapsible>
  </UCard>
</template>
