/**
 * Traversals over nested arrays: the trap, and the way out.
 *
 * A `Post` has `tags: string[]`, which is a flat array of primitives. The
 * shape where hand-written immutable updates genuinely collapse is an array
 * of objects *inside* an array of objects, so that is what this file uses.
 *
 * The trap: `forEach` does not reach through two array levels, so chaining it
 * gets you nowhere. The way out: build the flattened lens yourself, because a
 * lens onto an array is already a traversal over its elements.
 *
 * Run with `pnpm --filter @effect_lab/exemple test`.
 */
import { Optic } from "effect"

type Step = { readonly id: number; readonly label: string; readonly done: boolean }
type Priority = "low" | "high"
type Todo = {
  readonly id: number
  readonly label: string
  readonly priority: Priority
  readonly steps: ReadonlyArray<Step>
}
type Board = { readonly todos: ReadonlyArray<Todo> }

const board: Board = {
  todos: [
    {
      id: 1,
      label: "Write the article",
      priority: "high",
      steps: [
        { id: 11, label: "pick the opening example", done: true },
        { id: 12, label: "show a traversal", done: false }
      ]
    },
    {
      id: 2,
      label: "Ship it",
      priority: "low",
      steps: [{ id: 21, label: "proofread", done: false }]
    }
  ]
}

const _todos = Optic.id<Board>().key("todos")
const _steps = Optic.id<Todo>().key("steps")

// ---------------------------------------------------------------------------
// The trap: a traversal does NOT flatten two levels of array.
// ---------------------------------------------------------------------------

/**
 * `forEach` on a `Traversal<S, A[]>` hands you the **array**, not the element,
 * so chaining a second `forEach` to "go one level deeper" type-checks and then
 * silently does nothing. This is the shape to avoid:
 *
 * ```ts
 * _todos.forEach(() => _steps).forEach((steps) => steps.forEach((s) => s))
 * // => still Traversal<Board, ReadonlyArray<Step>>
 * // modifyAll receives an array; spreading it produces garbage, in silence.
 * ```
 *
 * The cause is in the signature: `forEach` takes `(iso) => Optional<A, B>`, and
 * an `Optional` has a single focus. There is no `B` for which it returns the
 * elements of an inner array — so no amount of chaining gets you there. See
 * `flatten` below for what does.
 */
const _stepLists = _todos.forEach(() => _steps)

const setDone = (done: boolean) => (steps: ReadonlyArray<Step>) =>
  steps.map((step) => ({ ...step, done }))

/** The obvious form: one traversal over the lists, `map` inside. */
const checkEverything = _stepLists.modifyAll(setDone(true))

// ---------------------------------------------------------------------------
// The way through: build the flattened lens yourself.
//
// `forEach` cannot reach the leaves because its callback must return an optic
// with a *single* focus. But a lens onto an array is already a traversal over
// its elements — that is why `_steps`, a `Lens<Todo, ReadonlyArray<Step>>`,
// accepts `modifyAll((step) => ...)` on one todo. So read every leaf in order
// and write them back into the same slots, and `modifyAll` runs leaf by leaf
// across the whole nesting.
//
// Length-preserving writes only: `modifyAll` maps one leaf to one leaf, so it
// qualifies. A `replace` with a differently-sized array would lose the excess.
// ---------------------------------------------------------------------------

const flatten = <S, T, A>(
  outer: Optic.Lens<S, ReadonlyArray<T>>,
  inner: Optic.Lens<T, ReadonlyArray<A>>
): Optic.Lens<S, ReadonlyArray<A>> =>
  // `Lens` is invariant in its focus, so the read side is annotated rather
  // than inferred as `A[]` from `flatMap`.
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

/** Every step of every todo, as one traversal over the **steps**. */
const _everyStep = flatten(_todos, _steps)

/** The same edit, now without a `map`: the optic reaches the leaf. */
const checkEveryStep = _everyStep.modifyAll((step) => ({ ...step, done: true }))

/** A filter in the path: a low-priority todo cannot be reached, by construction. */
const _urgentStepLists = _todos.forEach((todo) =>
  todo.refine((t): t is Todo => t.priority === "high").key("steps")
)
const checkUrgent = _urgentStepLists.modifyAll(setDone(true))

// The hand-written equivalent of `checkUrgent`, for comparison:
//
//   const checkUrgent = (board: Board): Board => ({
//     ...board,
//     todos: board.todos.map((todo) =>
//       todo.priority !== "high" ? todo : {
//         ...todo,
//         steps: todo.steps.map((step) => ({ ...step, done: true }))
//       })
//   })

// ---------------------------------------------------------------------------

const show = (u: unknown) => JSON.stringify(u)
const assertEqual = (actual: unknown, expected: unknown, note: string) => {
  if (show(actual) !== show(expected)) {
    throw new Error(`${note}: expected ${show(expected)}, got ${show(actual)}`)
  }
}

const doneFlags = (b: Board) => b.todos.map((t) => t.steps.map((s) => s.done))

const tests: Array<[string, () => void]> = [
  ["getAll on a two-level traversal yields the ARRAYS, not the elements", () => {
    const focused = Optic.getAll(_stepLists)(board)
    assertEqual(focused.length, 2, "one entry per todo, not per step")
    assertEqual(Array.isArray(focused[0]), true, "each entry is itself an array")
  }],

  ["one traversal ticks every step of every todo", () => {
    assertEqual(doneFlags(checkEverything(board)), [[true, true], [true]], "all done")
  }],

  ["flatten reaches the leaves, so getAll yields STEPS, not arrays", () => {
    const focused = Optic.getAll(_everyStep)(board)
    assertEqual(focused.length, 3, "one entry per step, across both todos")
    assertEqual(focused.map((s) => s.id), [11, 12, 21], "in order")
  }],

  ["the same edit without a map, through the flattened optic", () => {
    assertEqual(doneFlags(checkEveryStep(board)), [[true, true], [true]], "all done")
  }],

  ["flatten writes each leaf back into the slot it came from", () => {
    const renamed = _everyStep.modifyAll((step) => ({ ...step, label: step.label.toUpperCase() }))(board)
    assertEqual(
      renamed.todos.map((t) => t.steps.map((s) => s.id)),
      [[11, 12], [21]],
      "the shape is preserved, not reshuffled"
    )
  }],

  ["the original is never mutated", () => {
    checkEverything(board)
    checkUrgent(board)
    checkEveryStep(board)
    assertEqual(doneFlags(board), [[true, false], [false]], "original untouched")
  }],

  ["a filter in the path cannot touch what it excludes", () => {
    const next = checkUrgent(board)
    assertEqual(doneFlags(next), [[true, true], [false]], "the low-priority todo is left alone")
  }],

  ["refine addresses one element by id, with no index plumbing", () => {
    const _labelOf = (id: number) =>
      _todos.forEach((todo) => todo.refine((t): t is Todo => t.id === id).key("label"))
    assertEqual(Optic.getAll(_labelOf(2))(board), ["Ship it"], "found by id")
    assertEqual(Optic.getAll(_labelOf(99))(board), [], "an id that matches nothing focuses nothing")
  }]
]

let failed = 0
for (const [name, run] of tests) {
  try {
    run()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL  ${name}`)
    console.error(`      ${(error as Error).message}`)
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`)
if (failed > 0) {
  throw new Error(`${failed} assertion(s) failed`)
}
