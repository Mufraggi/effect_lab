import { Optic } from "effect"
import type { Meta, Post, PostPatch, Visibility } from "./schemas.js"

// ---------------------------------------------------------------------------
// Leaf optics — described once, on a single Post.
//
// These live in the shared package on purpose: the back end composes them
// under its store, the front end composes them under the cached list. The
// path is written here and nowhere else.
// ---------------------------------------------------------------------------

export const _title = Optic.id<Post>().key("title")
export const _body = Optic.id<Post>().key("body")
export const _authorName = Optic.id<Post>().key("author").key("name")

/** `tags` is a `ReadonlyArray<string>`, so this lens is already a Traversal. */
export const _tags = Optic.id<Post>().key("tags")

export const _visibility = Optic.id<Post>().key("meta").key("visibility")

/**
 * Writing `undefined` through an `optionalKey` optic *removes* the key rather
 * than setting it to undefined — so this is how a post gets unpublished.
 */
export const _publishedAt = Optic.id<Post>().key("meta").optionalKey("publishedAt")

// ---------------------------------------------------------------------------
// A patch table.
//
// Each entry pairs an optic (WHERE to write) with a reader (WHAT the patch
// carries). This is only expressible because an optic is a *value*: you
// cannot put a spread in an array. Adding a patchable field is one line.
// ---------------------------------------------------------------------------

const patchable = <A>(
  optic: Optic.Lens<Post, A>,
  read: (patch: PostPatch) => A | undefined
) =>
(patch: PostPatch): ((post: Post) => Post) | undefined => {
  const value = read(patch)
  // `modify` returns `(post: Post) => Post`, which is exactly the edit we want.
  return value === undefined ? undefined : optic.modify(() => value)
}

export const patchFields = [
  patchable(_title, (p) => p.title),
  patchable(_body, (p) => p.body),
  patchable(_authorName, (p) => p.author?.name),
  patchable(_tags, (p) => p.tags),
  patchable<Visibility>(_visibility, (p) => p.visibility)
] as const

/**
 * Keep `publishedAt` consistent with `visibility`.
 *
 * A draft carries no publication date at all — and because `_publishedAt` is
 * an `optionalKey` optic, writing `undefined` through it *removes* the key
 * rather than leaving a `publishedAt: undefined` behind.
 */
const reconcilePublication = (post: Post, now: () => string): Post => {
  const published = _publishedAt.get(post)
  if (_visibility.get(post) === "draft") {
    return published === undefined ? post : _publishedAt.replace(undefined, post)
  }
  return published === undefined ? _publishedAt.replace(now(), post) : post
}

/** Apply a partial patch by folding the table. The original is never touched. */
export const applyPatch = (
  post: Post,
  patch: PostPatch,
  now: () => string = () => new Date().toISOString().slice(0, 10)
): Post =>
  reconcilePublication(
    patchFields.reduce((acc, field) => {
      const edit = field(patch)
      return edit === undefined ? acc : edit(acc)
    }, post),
    now
  )

// ---------------------------------------------------------------------------
// Collection optics — the same leaves, recomposed under a new root.
// ---------------------------------------------------------------------------

export const _posts = Optic.id<ReadonlyArray<Post>>()

/**
 * Focus the post carrying this id — zero or one element. `refine` narrows a
 * traversal, so no index plumbing is needed: the id *is* the path.
 */
export const _postById = (id: number) =>
  _posts.forEach((post) => post.refine((p): p is Post => p.id === id))

/** The same leaf optic, now addressed by id inside the collection. */
export const _titleById = (id: number) =>
  _posts.forEach((post) => post.refine((p): p is Post => p.id === id).key("title"))

/** Every tag array in the collection — one expression, any number of posts. */
export const _everyTags = _posts.forEach(() => _tags)

/**
 * Only the visibility of drafts: the filter is part of the path, so a write
 * through this optic cannot touch an already-public post.
 *
 * Note the `refine` sits on `meta`, not on `meta.visibility`. Refining the
 * field itself would narrow the focus to `"draft"` in *both* directions and
 * make the write we want (`"public"`) a type error — `refine` is not a
 * read-only filter.
 */
export const _draftVisibility = _posts.forEach((post) =>
  post.key("meta").refine((m): m is Meta => m.visibility === "draft").key("visibility")
)
