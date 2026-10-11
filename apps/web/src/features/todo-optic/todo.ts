import { Optic } from "effect"

/**
 * A deliberately nested shape: a board holds todos, and each todo holds its
 * own list of steps. Two levels of array is where hand-written immutable
 * updates stop being mechanical and start being a pyramid.
 */
export type Step = {
  readonly id: number
  readonly label: string
  readonly done: boolean
}

export type Priority = "low" | "high"

export type Todo = {
  readonly id: number
  readonly label: string
  readonly priority: Priority
  readonly steps: ReadonlyArray<Step>
}

export type Board = { readonly todos: ReadonlyArray<Todo> }

// --- Leaf optics, on a single Todo ----------------------------------------

export const _label = Optic.id<Todo>().key("label")
export const _priority = Optic.id<Todo>().key("priority")
export const _steps = Optic.id<Todo>().key("steps")

// --- Collection optics, composing those leaves ----------------------------

export const _todos = Optic.id<Board>().key("todos")

/** Focus the todo carrying this id — zero or one, no index plumbing. */
export const _todoById = (id: number) =>
  _todos.forEach((todo) => todo.refine((t): t is Todo => t.id === id))

/** The label of one todo, addressed by id. */
export const _labelById = (id: number) =>
  _todos.forEach((todo) => todo.refine((t): t is Todo => t.id === id).key("label"))

/**
 * The step lists of every todo.
 *
 * Note this focuses the step **arrays**, not the individual steps: a traversal
 * does not flatten two levels of array. `forEach` on a `Traversal<S, A[]>`
 * still hands you the array, so the element-level work happens in the `map`
 * inside `modifyAll`. Worth knowing before you reach for a nested `forEach`
 * that silently does nothing.
 */
export const _everyStepList = _todos.forEach(() => _steps)

/** The step lists of the high-priority todos only — the filter is in the path. */
export const _urgentStepLists = _todos.forEach((todo) =>
  todo.refine((t): t is Todo => t.priority === "high").key("steps")
)

/** The steps of one todo, addressed by id. */
export const _stepsById = (id: number) =>
  _todos.forEach((todo) => todo.refine((t): t is Todo => t.id === id).key("steps"))

// --- Operations expressed through those optics ----------------------------

const setDone = (done: boolean) => (steps: ReadonlyArray<Step>) =>
  steps.map((step) => ({ ...step, done }))

/** Tick every step of every todo, in one expression. */
export const checkEverything = _everyStepList.modifyAll(setDone(true))

/** Tick only what belongs to a high-priority todo. */
export const checkUrgent = _urgentStepLists.modifyAll(setDone(true))

export const clearEverything = _everyStepList.modifyAll(setDone(false))

export const renameTodo = (id: number, label: string) =>
  _labelById(id).modifyAll(() => label)

export const toggleStep = (todoId: number, stepId: number) =>
  _stepsById(todoId).modifyAll((steps) =>
    steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step))
  )

export const togglePriority = (id: number) =>
  _todoById(id).modifyAll((todo) => ({
    ...todo,
    priority: todo.priority === "high" ? ("low" as const) : ("high" as const)
  }))

/** Read through the same optics used to write. */
export const countSteps = (board: Board) => {
  const lists = Optic.getAll(_everyStepList)(board)
  const all = lists.flat()
  return { total: all.length, done: all.filter((s) => s.done).length }
}

export const seed: Board = {
  todos: [
    {
      id: 1,
      label: "Écrire l'article sur les optics",
      priority: "high",
      steps: [
        { id: 11, label: "Choisir l'exemple d'ouverture", done: true },
        { id: 12, label: "Montrer une traversal", done: false },
        { id: 13, label: "Encadré sur les classes", done: false }
      ]
    },
    {
      id: 2,
      label: "Relire le lab",
      priority: "high",
      steps: [
        { id: 21, label: "Vérifier que tout compile", done: true },
        { id: 22, label: "Relancer les tests", done: false }
      ]
    },
    {
      id: 3,
      label: "Publier",
      priority: "low",
      steps: [
        { id: 31, label: "Relecture orthographe", done: false },
        { id: 32, label: "Programmer la publication", done: false }
      ]
    }
  ]
}
