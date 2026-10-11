import { ref, type Ref } from "vue"
import { Cause, Exit } from "effect"
import type { Atom, AsyncResult } from "effect/reactivity"
import { useAtomSet } from "@effect/atom-vue"

export interface Mutation<W, A, E> {
  /** Runs the mutation and reports its failure instead of swallowing it. */
  readonly run: (value: W) => Promise<Exit.Exit<A, E>>
  readonly error: Readonly<Ref<string | null>>
  readonly pending: Readonly<Ref<boolean>>
}

/**
 * Wraps an `AtomResultFn` so failures become observable.
 *
 * The default setter mode returns `void`, which means a rejected request
 * passes silently and the optimistic value looks like a success. `promiseExit`
 * is what makes the failure reachable — this composable just makes sure every
 * call site actually looks at it.
 */
export const useMutation = <A, E, W>(
  atom: () => Atom.Writable<AsyncResult.AsyncResult<A, E>, W>
): Mutation<W, A, E> => {
  const error = ref<string | null>(null)
  const pending = ref(false)
  const set = useAtomSet(atom, { mode: "promiseExit" })

  const run = async (value: W) => {
    error.value = null
    pending.value = true
    try {
      const exit = await set(value)
      if (Exit.isFailure(exit)) {
        const pretty = Cause.pretty(exit.cause)
        // Headline on screen, full cause in the console — a stack is noise in a UI.
        error.value = pretty.split("\n")[0] ?? "mutation failed"
        console.error(pretty)
      }
      return exit
    } finally {
      pending.value = false
    }
  }

  return { run, error, pending }
}
