import { Match } from "effect"
import type { TodoEvent } from "@effect_lab/shared"

export interface Todo {
  readonly id: string
  readonly title: string
  readonly done: boolean
}

export interface TodoStateShape {
  readonly todos: ReadonlyMap<string, Todo>
  /** Tombstones: a deleted id stays deleted, whatever arrives after. */
  readonly deleted: ReadonlySet<string>
}

export const emptyTodoState: TodoStateShape = { todos: new Map(), deleted: new Set() }

const updateTodo = (s: TodoStateShape, id: string, f: (t: Todo) => Todo): TodoStateShape => {
  const todo = s.todos.get(id)
  if (todo === undefined || s.deleted.has(id)) return s
  return { ...s, todos: new Map(s.todos).set(id, f(todo)) }
}

/** The fold. Same-tag conflicts are filtered before it, by the handlers. */
export const applyTodoEvent = (s: TodoStateShape, event: TodoEvent): TodoStateShape =>
  Match.valueTags(event, {
    TodoAdded: ({ payload }) =>
      s.deleted.has(payload.id) || s.todos.has(payload.id)
        ? s
        : { ...s, todos: new Map(s.todos).set(payload.id, { id: payload.id, title: payload.title, done: false }) },
    TodoRenamed: ({ payload }) => updateTodo(s, payload.id, (t) => ({ ...t, title: payload.title })),
    TodoToggled: ({ payload }) => updateTodo(s, payload.id, (t) => ({ ...t, done: payload.done })),
    TodoDeleted: ({ payload }) => {
      const todos = new Map(s.todos)
      todos.delete(payload.id)
      return { todos, deleted: new Set(s.deleted).add(payload.id) }
    }
  })
