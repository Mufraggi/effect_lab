import { Optic } from "effect"
import {
  _authorName,
  _body,
  _tags,
  _title,
  _visibility,
  type Post,
  type PostPatch
} from "@effect_lab/shared"
import { rebaseAll, rebaseField } from "../../shared/rebase.js"

/**
 * Tags are edited as text, so the collection optic is composed with an Iso that
 * converts between the array and its comma-separated form.
 *
 * It lives here rather than in the component so that the field list below is
 * the single place that says which fields the form owns.
 */
export const _tagsAsText = _tags.compose(
  Optic.makeIso<ReadonlyArray<string>, string>(
    (tags) => tags.join(", "),
    (text) => text.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
  )
)

/**
 * The editable fields, and nothing else. Adding one is one line here, one line
 * in `patchFields` below, and one `opticField` in the component.
 *
 * Every focus is a primitive — tags pass through the Iso, so they are a
 * `string` here — which is what makes `rebaseField`'s `!==` the right
 * comparison. Add a non-primitive focus and the dirty check breaks silently.
 */
export const rebaseFields = [
  rebaseField(_title),
  rebaseField(_body),
  rebaseField(_authorName),
  rebaseField(_visibility),
  rebaseField(_tagsAsText)
] as const

/**
 * Rebase a draft onto a newer server value, field by field.
 *
 * The prop a form receives is server state; the draft is the user's. When the
 * server moves, the draft is rebased onto it rather than replaced (which would
 * wipe the user's typing) or ignored (which would show a stale value and push
 * it back on save, silently reverting whatever moved the server).
 *
 * Asserted in `postDraft.assert.ts`.
 */
export const rebaseDraft = rebaseAll<Post>(rebaseFields)

// ---------------------------------------------------------------------------
// The other direction: a draft, minus its seed, becomes a patch.
// ---------------------------------------------------------------------------

/**
 * One field of an outgoing patch.
 *
 * `optic` decides *whether* the field is edited — the same optic and the same
 * `!==` as the rebase, so "edited" cannot mean two different things on the way
 * in and on the way out. `into` decides *what the payload carries*, which is a
 * separate function because `PostPatch` is not shaped like a `Post`:
 * `author.name` sits under a partial `author`, and tags are compared as text
 * but sent as an array.
 */
const patchField = <A>(optic: Optic.Lens<Post, A>, into: (draft: Post) => PostPatch) =>
(draft: Post, from: Post): PostPatch | undefined =>
  optic.get(draft) === optic.get(from) ? undefined : into(draft)

export const patchFields = [
  patchField(_title, (draft) => ({ title: _title.get(draft) })),
  patchField(_body, (draft) => ({ body: _body.get(draft) })),
  patchField(_authorName, (draft) => ({ author: { name: _authorName.get(draft) } })),
  patchField(_visibility, (draft) => ({ visibility: _visibility.get(draft) })),
  // Compared as text, so re-typing an identical list is not an edit. Sent as
  // the array the API expects, read back through the leaf optic.
  patchField(_tagsAsText, (draft) => ({ tags: _tags.get(draft) }))
] as const

/**
 * Build a patch carrying only what the user actually changed.
 *
 * That is what a PATCH is for, and every key of `PostPatch` is optional.
 * Sending every field would overwrite whatever moved on the server while the
 * form was open — the same regression the rebase above exists to prevent, at
 * the other end of the round trip.
 *
 * This fold mirrors `applyPatch` in the shared package: the server folds a
 * table of optics to *apply* a patch, the form folds a table to *build* one.
 */
export const draftPatch = (draft: Post, from: Post): PostPatch =>
  patchFields.reduce<PostPatch>((patch, field) => {
    const part = field(draft, from)
    // biome-ignore lint/performance/noAccumulatingSpread: `patchFields` a une entrée par champ de `Post` — une borne fixe à un chiffre, pas une collection. Le spread est ce qui garde le fold immuable, ce que la table d'optics vient démontrer.
    return part === undefined ? patch : { ...patch, ...part }
  }, {})
