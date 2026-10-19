<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
  _authorName,
  _body,
  _publishedAt,
  _tags,
  _title,
  _visibility,
  type Post,
  type PostPatch
} from "@effect_lab/shared"
import { opticField } from "../../shared/opticField.js"
import { _tagsAsText, draftPatch, rebaseDraft } from "./postDraft.js"

const props = defineProps<{ post: Post }>()
const emit = defineEmits<{ save: [PostPatch]; cancel: [] }>()

/** What the user is editing. */
const draft = ref<Post>(props.post)

/**
 * The post as it was when the draft was last seeded or rebased.
 *
 * `dirty` is measured against THIS, never against the live prop. The prop comes
 * from the optimistic cache, so it changes identity on every write anywhere in
 * the app — comparing against it would report a field as edited because
 * *something else* moved, and `reset` would reset to a value you never saw.
 */
const base = ref<Post>(props.post)
const pristine = () => base.value

// One helper, five fields, three different depths.
const title = opticField(draft, pristine, _title)
const body = opticField(draft, pristine, _body)
const author = opticField(draft, pristine, _authorName)
const visibility = opticField(draft, pristine, _visibility)
const tags = opticField(draft, pristine, _tagsAsText)

/**
 * The prop is server state, the draft is the user's. When the server moves, the
 * draft is rebased onto it field by field — the rule itself lives in
 * `postDraft.ts` and is asserted in `postDraft.assert.ts`.
 *
 * A different id is a different edit, so it starts clean: no field ever carries
 * over from one post to another.
 */
watch(() => props.post, (next, previous) => {
  if (previous?.id !== next.id) {
    draft.value = next
    base.value = next
    return
  }
  draft.value = rebaseDraft(next, draft.value, base.value)
  base.value = next
})

/**
 * `publishedAt` is derived from `visibility` by `applyPatch`, which drops the
 * key entirely for a draft (an `optionalKey` optic, so `undefined` *removes*
 * rather than blanks). Shown here, not edited — the invariant lives in the
 * shared package so both sides agree on it.
 */
const publishedAt = computed(() => _publishedAt.get(draft.value))

/** Lowercase every tag in one expression — a traversal, not a map + spread. */
const normaliseTags = () => {
  draft.value = _tags.modifyAll((tag) => tag.toLowerCase())(draft.value)
}

/**
 * What would be sent. The button and the payload read the *same* value, so the
 * form cannot offer to save something it then declines to put in the patch.
 */
const patch = computed(() => draftPatch(draft.value, base.value))
const anyDirty = computed(() => Object.keys(patch.value).length > 0)

const save = () => {
  emit("save", patch.value)
}
</script>

<template>
  <!--
    Pas de `<UForm>` : il valide via un Standard Schema, alors que la validité de
    ce formulaire vient de `draftPatch` / `anyDirty`. Les deux mécaniques se
    marcheraient dessus.
  -->
  <form class="max-w-xl" @submit.prevent="save">
    <UCard>
      <template #header>
        <h2 class="font-semibold">Édition — post #{{ post.id }}</h2>
      </template>

      <div class="grid gap-3">
        <UFormField label="Titre">
          <template #hint>
            <UBadge v-if="title.dirty.value" color="warning" variant="subtle" size="sm">modifié</UBadge>
          </template>
          <UFieldGroup class="w-full">
            <UInput v-model="title.model.value" class="flex-1" />
            <UButton
              color="neutral"
              variant="subtle"
              :disabled="!title.dirty.value"
              @click="title.reset()"
            >
              reset
            </UButton>
          </UFieldGroup>
        </UFormField>

        <UFormField label="Corps">
          <template #hint>
            <UBadge v-if="body.dirty.value" color="warning" variant="subtle" size="sm">modifié</UBadge>
          </template>
          <UFieldGroup class="w-full">
            <UTextarea v-model="body.model.value" :rows="3" class="flex-1" />
            <UButton
              color="neutral"
              variant="subtle"
              :disabled="!body.dirty.value"
              @click="body.reset()"
            >
              reset
            </UButton>
          </UFieldGroup>
        </UFormField>

        <UFormField label="Auteur">
          <template #hint>
            <UBadge v-if="author.dirty.value" color="warning" variant="subtle" size="sm">modifié</UBadge>
          </template>
          <UFieldGroup class="w-full">
            <UInput v-model="author.model.value" class="flex-1" />
            <UButton
              color="neutral"
              variant="subtle"
              :disabled="!author.dirty.value"
              @click="author.reset()"
            >
              reset
            </UButton>
          </UFieldGroup>
        </UFormField>

        <UFormField label="Tags">
          <template #hint>
            <UBadge v-if="tags.dirty.value" color="warning" variant="subtle" size="sm">modifié</UBadge>
          </template>
          <UFieldGroup class="w-full">
            <!-- .lazy: the Iso normalises the text, so only run it on change, not per keystroke. -->
            <UInput v-model.lazy="tags.model.value" placeholder="effect, optics" class="flex-1" />
            <UButton color="neutral" variant="subtle" @click="normaliseTags()">
              tout en minuscules
            </UButton>
          </UFieldGroup>
        </UFormField>

        <UFormField label="Visibilité">
          <template #hint>
            <UBadge v-if="visibility.dirty.value" color="warning" variant="subtle" size="sm">modifié</UBadge>
          </template>
          <USelect v-model="visibility.model.value" :items="['draft', 'public']" />
        </UFormField>

        <p class="text-sm text-muted">
          <template v-if="publishedAt">Publié le {{ publishedAt }}</template>
          <template v-else>Brouillon : la clé <code class="font-mono">publishedAt</code> est absente</template>
        </p>
      </div>

      <template #footer>
        <div class="flex gap-2">
          <UButton type="submit" :disabled="!anyDirty">Enregistrer</UButton>
          <UButton color="neutral" variant="ghost" @click="emit('cancel')">Annuler</UButton>
        </div>
      </template>
    </UCard>
  </form>
</template>
