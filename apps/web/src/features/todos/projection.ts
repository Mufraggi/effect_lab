import { Match, Result } from "effect"
import { EventJournal } from "effect/eventlog"
import type { TodoEvent, TodoId } from "@effect_lab/shared"

export interface Todo {
  readonly id: TodoId
  readonly title: string
  readonly done: boolean
}

/** The entry id of the last write applied to each field of a todo. */
interface Stamps {
  readonly title: EventJournal.EntryId
  readonly done: EventJournal.EntryId
}

export interface TodoStateShape {
  readonly todos: ReadonlyMap<TodoId, Todo>
  readonly stamps: ReadonlyMap<TodoId, Stamps>
  /** Tombstones: a deleted id stays deleted, whatever arrives after. */
  readonly deleted: ReadonlySet<TodoId>
}

export const emptyTodoState: TodoStateShape = { todos: new Map(), stamps: new Map(), deleted: new Set() }

/** Why an event left the state unchanged. */
export type Rejection =
  | { readonly _tag: "Stale"; readonly event: TodoEvent }
  | { readonly _tag: "Deleted"; readonly event: TodoEvent }

const stale = (event: TodoEvent) => Result.fail<Rejection>({ _tag: "Stale", event })
const deleted = (event: TodoEvent) => Result.fail<Rejection>({ _tag: "Deleted", event })

const writeField = <K extends keyof Stamps>(
  s: TodoStateShape,
  event: TodoEvent,
  at: EventJournal.EntryId,
  field: K,
  value: Todo[K]
): Result.Result<TodoStateShape, Rejection> => {
  const id = event.payload.id
  if (s.deleted.has(id)) return deleted(event)
  const todo = s.todos.get(id)
  const stamps = s.stamps.get(id)
  if (todo === undefined || stamps === undefined) return Result.succeed(s)
  if (EventJournal.EntryIdOrder(at, stamps[field]) <= 0) return stale(event)
  return Result.succeed({
    ...s,
    todos: new Map(s.todos).set(id, { ...todo, [field]: value }),
    stamps: new Map(s.stamps).set(id, { ...stamps, [field]: at })
  })
}

/**
 * The fold, and the only place that decides conflicts.
 *
 * Each field is last-write-wins on the entry id (the writer's UUIDv7 clock),
 * so the result does not depend on the order events arrive in: the live
 * handlers and `replayJournal` reach the same state.
 */
export const applyTodoEvent = (
  s: TodoStateShape,
  event: TodoEvent,
  at: EventJournal.EntryId
): Result.Result<TodoStateShape, Rejection> =>
  Match.valueTags(event, {
    TodoAdded: ({ payload }) => {
      if (s.deleted.has(payload.id)) return deleted(event)
      if (s.todos.has(payload.id)) return Result.succeed(s)
      return Result.succeed({
        ...s,
        todos: new Map(s.todos).set(payload.id, { id: payload.id, title: payload.title, done: false }),
        stamps: new Map(s.stamps).set(payload.id, { title: at, done: at })
      })
    },
    TodoRenamed: ({ payload }) => writeField(s, event, at, "title", payload.title),
    TodoToggled: ({ payload }) => writeField(s, event, at, "done", payload.done),
    TodoDeleted: ({ payload }) => {
      const todos = new Map(s.todos)
      const stamps = new Map(s.stamps)
      todos.delete(payload.id)
      stamps.delete(payload.id)
      return Result.succeed({ todos, stamps, deleted: new Set(s.deleted).add(payload.id) })
    }
  })
