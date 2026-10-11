import { computed, type ComputedRef } from "vue"
import { Cause } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useAtomValue } from "@effect/atom-vue"
import type { Post, PostPatch } from "@effect_lab/shared"
import {
  POSTS_KEY,
  optimisticPosts,
  patchPost,
  retagPosts,
  updateTitle
} from "./posts.js"
import { useMutation } from "./useMutation.js"

export interface UsePosts {
  readonly posts: ComputedRef<ReadonlyArray<Post>>
  readonly loading: ComputedRef<boolean>
  readonly readError: ComputedRef<string | null>
  readonly writeError: ComputedRef<string | null>
  readonly editTitle: (id: number, title: string) => Promise<unknown>
  readonly savePatch: (id: number, patch: PostPatch) => Promise<unknown>
  readonly retag: (from: string, to: string) => Promise<unknown>
}

/**
 * Everything about posts: reading the optimistic list, and the three writes.
 *
 * The component that uses this holds no data logic — only which post is being
 * edited and what is typed in the retag inputs.
 */
export const usePosts = (): UsePosts => {
  const result = useAtomValue(() => optimisticPosts)

  // `isInitial` alone only covers the very first load; a refetch triggered by
  // an invalidation is a *waiting* success, which it reports as false.
  const loading = computed(() =>
    AsyncResult.isInitial(result.value) || AsyncResult.isWaiting(result.value)
  )

  const posts = computed<ReadonlyArray<Post>>(() =>
    AsyncResult.isSuccess(result.value) ? result.value.value : []
  )

  const readError = computed(() =>
    AsyncResult.isFailure(result.value) ? Cause.pretty(result.value.cause) : null
  )

  const title = useMutation(() => updateTitle)
  const patch = useMutation(() => patchPost)
  const tags = useMutation(() => retagPosts)

  const writeError = computed(() =>
    title.error.value ?? patch.error.value ?? tags.error.value
  )

  return {
    posts,
    loading,
    readError,
    writeError,
    editTitle: (id, value) => title.run({ params: { id }, payload: { title: value } }),
    savePatch: (id, value) => patch.run({ params: { id }, payload: value }),
    retag: (from, to) => tags.run({ payload: { from, to }, reactivityKeys: POSTS_KEY })
  }
}
