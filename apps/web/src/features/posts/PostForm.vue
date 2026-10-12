<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { Optic } from "effect"
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

const props = defineProps<{ post: Post }>()
const emit = defineEmits<{ save: [PostPatch]; cancel: [] }>()

// The draft is seeded ONCE, on purpose. It is not a mirror of server state —
// nothing syncs into it behind your back, so nothing can overwrite your typing.
const draft = ref<Post>(props.post)
watch(() => props.post.id, () => {
  draft.value = props.post
})

const pristine = () => props.post

// One helper, five fields, three different depths.
const title = opticField(draft, pristine, _title)
const body = opticField(draft, pristine, _body)
const author = opticField(draft, pristine, _authorName)
const visibility = opticField(draft, pristine, _visibility)

// Tags are edited as text, so the optic is composed with an Iso that converts
// between the array and its comma-separated form.
const _tagsAsText = _tags.compose(
  Optic.makeIso<ReadonlyArray<string>, string>(
    (tags) => tags.join(", "),
    (text) => text.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
  )
)
const tags = opticField(draft, pristine, _tagsAsText)

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

const anyDirty = computed(() =>
  title.dirty.value || body.dirty.value || author.dirty.value ||
  visibility.dirty.value || tags.dirty.value
)

const save = () => {
  emit("save", {
    title: title.model.value,
    body: body.model.value,
    author: { name: author.model.value },
    tags: Optic.get(draft.value, _tags),
    visibility: visibility.model.value
  })
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
