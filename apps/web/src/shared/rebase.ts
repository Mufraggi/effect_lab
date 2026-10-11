import type { Optic } from "effect"

/**
 * Merge an incoming value onto an edited copy of the same shape.
 *
 * - `incoming` — where the outside world has got to.
 * - `edited` — what the user has in hand.
 * - `from` — what `edited` was seeded from.
 *
 * Those three are what let each field decide who wins without asking anyone:
 * `edited === from` means nobody touched it.
 */
export type Rebase<S> = (incoming: S, edited: S, from: S) => S

/**
 * Rebase one field: the incoming value wins when the user has not touched it,
 * the edited value wins when they have.
 *
 * Only the optic varies, so the rule is written once and listed per field —
 * the same reason `patchFields` is a table in the shared package. A spread
 * cannot do this: a spread is syntax, so it cannot be received as the `optic`
 * argument. An optic is a value, so it can.
 *
 * The comparison is `!==`, so the focus must be a primitive. For a collection
 * focus, compose an Iso down to something comparable first (see `_tagsAsText`
 * in `features/posts/postDraft.ts`).
 */
export const rebaseField = <S, A>(optic: Optic.Lens<S, A>): Rebase<S> =>
(incoming, edited, from) =>
  optic.get(edited) === optic.get(from)
    ? incoming
    : optic.replace(optic.get(edited), incoming)

/**
 * Fold a list of field rules into a single rebase.
 *
 * Each rule reads the *original* `edited` and `from`, and writes into the
 * accumulator, so the fields stay independent: a decision taken on one field
 * can never be read by the next.
 */
export const rebaseAll = <S>(fields: ReadonlyArray<Rebase<S>>): Rebase<S> =>
(incoming, edited, from) => fields.reduce((acc, rebase) => rebase(acc, edited, from), incoming)
