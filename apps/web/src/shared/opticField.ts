import { computed, type Ref, type WritableComputedRef } from "vue"
import type { Optic } from "effect"

export interface OpticField<A> {
  /** Usable directly with `v-model`. */
  readonly model: WritableComputedRef<A>
  readonly dirty: Readonly<Ref<boolean>>
  readonly reset: () => void
}

/**
 * Bind a deeply nested field to `v-model` through an optic.
 *
 * One helper covers every field at every depth, and the dirty check and the
 * reset reuse the *same* optic in the other direction. None of this is
 * expressible with a spread: a spread is syntax, so it cannot be received as
 * an argument — an optic is a value, so it can.
 */
export const opticField = <S, A>(
  state: Ref<S>,
  pristine: () => S,
  optic: Optic.Lens<S, A>
): OpticField<A> => ({
  model: computed({
    get: () => optic.get(state.value),
    set: (next: A) => {
      state.value = optic.replace(next, state.value)
    }
  }),
  dirty: computed(() => optic.get(state.value) !== optic.get(pristine())),
  reset: () => {
    state.value = optic.replace(optic.get(pristine()), state.value)
  }
})
