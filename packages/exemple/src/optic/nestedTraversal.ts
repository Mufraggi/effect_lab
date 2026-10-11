/**
 * Traversals over nested arrays — and the one trap worth knowing.
 *
 * A `Post` has `tags: string[]`, which is a flat array of primitives. The
 * shape where hand-written immutable updates genuinely collapse is an array
 * of objects *inside* an array of objects, so that is what this file uses.
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
 */
const _stepLists = _todos.forEach(() => _steps)

const setDone = (done: boolean) => (steps: ReadonlyArray<Step>) =>
  steps.map((step) => ({ ...step, done }))

/** The working form: one traversal over the lists, `map` inside. */
const checkEverything = _stepLists.modifyAll(setDone(true))

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

  ["the original is never mutated", () => {
    checkEverything(board)
    checkUrgent(board)
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
