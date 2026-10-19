import { Optic } from "effect"
import type { Post, PostPatch, Visibility } from "./schemas.js"

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

const patchable =
  <A>(optic: Optic.Lens<Post, A>, read: (patch: PostPatch) => A | undefined) =>
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
export const _postById = (id: number) => _posts.forEach((post) => post.refine((p): p is Post => p.id === id))

/** The same leaf optic, now addressed by id inside the collection. */
export const _titleById = (id: number) =>
  _posts.forEach((post) => post.refine((p): p is Post => p.id === id).key("title"))

/** Every tag array in the collection — one expression, any number of posts. */
export const _everyTags = _posts.forEach(() => _tags)

// ---------------------------------------------------------------------------
// Two array levels, flattened.
//
// `forEach` cannot do this. Its callback must return an optic with a *single*
// focus, so the deepest it reaches is the inner array: `_everyTags` above is a
// `Traversal<_, ReadonlyArray<string>>`, not a traversal over the strings.
// Chaining a second `forEach` to "go one level deeper" type-checks and hands
// you the same arrays back (asserted in `packages/exemple`).
//
// The way through is that a *lens onto an array is already a traversal over
// its elements* — that is why `_tags`, a `Lens<Post, ReadonlyArray<string>>`,
// accepts `modifyAll((tag) => ...)` element by element. So the flattened
// traversal is reachable by building that lens by hand.
// ---------------------------------------------------------------------------

/**
 * Turn a two-level nesting into one traversal over the leaves.
 *
 * `outer` reaches the array of containers, `inner` reaches each container's
 * array of leaves. The result reads every leaf in order and writes them back
 * into the same slots, which is what makes it usable as a
 * `Traversal<S, A>` — so `modifyAll` runs leaf by leaf, with no `map` left in
 * the caller.
 *
 * It is a lens only for **length-preserving** writes. `modifyAll` maps one
 * leaf to one leaf, so it qualifies; handing `replace` a differently-sized
 * array would redistribute it against the old slot sizes and lose the excess.
 */
export const flatten = <S, T, A>(
  outer: Optic.Lens<S, ReadonlyArray<T>>,
  inner: Optic.Lens<T, ReadonlyArray<A>>
): Optic.Lens<S, ReadonlyArray<A>> =>
  // `Lens` is invariant in its focus, so the read side has to be typed as
  // `ReadonlyArray<A>` rather than inferred as `A[]` from `flatMap`.
  Optic.makeLens<S, ReadonlyArray<A>>(
    (s) => outer.get(s).flatMap((t) => inner.get(t)),
    (leaves, s) => {
      let from = 0
      return outer.replace(
        outer.get(s).map((t) => {
          const slot = inner.get(t).length
          const next = leaves.slice(from, from + slot)
          from += slot
          return inner.replace(next, t)
        }),
        s
      )
    }
  )

/**
 * Every tag of every post, as one traversal over the **strings**.
 *
 * This is what `_everyTags` cannot be. Renaming a tag across the whole
 * collection is now `modifyAll((tag) => ...)`: no index, no `map`, no spread,
 * and the empty tag list of a draft is simply never visited.
 */
export const _everyTag = flatten(_posts, _tags)
