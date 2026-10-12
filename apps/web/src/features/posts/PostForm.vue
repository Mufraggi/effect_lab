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
  <form class="form" @submit.prevent="save">
    <h2>Édition — post #{{ post.id }}</h2>

    <label>
      <span>Titre <em v-if="title.dirty.value">modifié</em></span>
      <input v-model="title.model.value" />
      <button type="button" :disabled="!title.dirty.value" @click="title.reset()">reset</button>
    </label>

    <label>
      <span>Corps <em v-if="body.dirty.value">modifié</em></span>
      <textarea v-model="body.model.value" rows="3" />
      <button type="button" :disabled="!body.dirty.value" @click="body.reset()">reset</button>
    </label>

    <label>
      <span>Auteur <em v-if="author.dirty.value">modifié</em></span>
      <input v-model="author.model.value" />
      <button type="button" :disabled="!author.dirty.value" @click="author.reset()">reset</button>
    </label>

    <label>
      <span>Tags <em v-if="tags.dirty.value">modifié</em></span>
      <!-- .lazy: the Iso normalises the text, so only run it on change, not per keystroke. -->
      <input v-model.lazy="tags.model.value" placeholder="effect, optics" />
      <button type="button" @click="normaliseTags()">tout en minuscules</button>
    </label>

    <label>
      <span>Visibilité <em v-if="visibility.dirty.value">modifié</em></span>
      <select v-model="visibility.model.value">
        <option value="draft">draft</option>
        <option value="public">public</option>
      </select>
    </label>

    <p class="published">
      <template v-if="publishedAt">Publié le {{ publishedAt }}</template>
      <template v-else>Brouillon : la clé <code>publishedAt</code> est absente</template>
    </p>

    <footer>
      <button type="submit" :disabled="!anyDirty">Enregistrer</button>
      <button type="button" @click="emit('cancel')">Annuler</button>
    </footer>
  </form>
</template>

<style scoped>
.form {
  display: grid;
  gap: 0.75rem;
  border: 1px solid #ccc;
  padding: 1rem;
  border-radius: 6px;
  max-width: 34rem;
}
label {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem 0.5rem;
}
label > span {
  grid-column: 1 / -1;
  font-size: 0.85rem;
}
em {
  color: #b35c00;
  font-style: normal;
}
.published {
  font-size: 0.85rem;
  margin: 0;
}
footer {
  display: flex;
  gap: 0.5rem;
}
</style>
