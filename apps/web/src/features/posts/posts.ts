import { FetchHttpClient } from "effect/http"
import { Atom, AsyncResult, AtomHttpApi } from "effect/reactivity"
import { Api, _titleById, _postById, applyPatch } from "@effect_lab/shared"

/** One shared key, so an invalidation can never silently stop matching. */
export const POSTS_KEY = ["posts"] as const

export class PostsHttp extends AtomHttpApi.Service<PostsHttp>()("app/PostsHttp", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  baseUrl: "/api"
}) {}

export const postsQuery = PostsHttp.query("posts", "posts", {
  reactivityKeys: POSTS_KEY
})

/**
 * The optimistic list.
 *
 * `Atom.optimistic` shows a provisional value while a mutation is in flight,
 * rolls back to the server value if it fails, and refreshes on success. That
 * is why there is no local mirror atom here — the cache *is* the state, so
 * there is nothing for a refetch to overwrite.
 */
const optimisticPosts = Atom.optimistic(postsQuery)

/**
 * Rename a post's title.
 *
 * The reducer is where the optic earns its place: it describes *where* in the
 * cached list the edit lands, addressed by id rather than by index. Written by
 * hand this is a `map` with an index comparison and two levels of spread.
 */
export const updateTitle = Atom.optimisticFn(optimisticPosts, {
  reducer: (
    current,
    request: { readonly params: { readonly id: number }; readonly payload: { readonly title: string } }
  ) =>
    AsyncResult.map(
      current,
      _titleById(request.params.id).modifyAll(() => request.payload.title)
    ),
  fn: PostsHttp.mutation("posts", "updatePost")
})

/**
 * Patch any subset of a post. Reuses the shared `applyPatch` — the same table
 * of optics the server folds over, so front and back cannot drift apart.
 */
export const patchPost = Atom.optimisticFn(optimisticPosts, {
  reducer: (
    current,
    request: {
      readonly params: { readonly id: number }
      readonly payload: Parameters<typeof applyPatch>[1]
    }
  ) =>
    AsyncResult.map(
      current,
      _postById(request.params.id).modifyAll((post) => applyPatch(post, request.payload))
    ),
  fn: PostsHttp.mutation("posts", "updatePost")
})

export const retagPosts = PostsHttp.mutation("posts", "retag")

export { optimisticPosts }
