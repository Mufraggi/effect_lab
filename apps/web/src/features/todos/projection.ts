import { Match, Result } from "effect"
import type { EventJournal } from "effect/eventlog"
import { compareStamps, type Stamp, stampOf, type TodoEvent, type TodoId } from "@effect_lab/shared"

export interface Todo {
  readonly id: TodoId
  readonly title: string
  readonly done: boolean
}

/** The stamp of the last write applied to each field of a todo. */
interface Stamps {
  readonly title: Stamp
  readonly done: Stamp
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
  stamp: Stamp,
  field: K,
  value: Todo[K]
): Result.Result<TodoStateShape, Rejection> => {
  const id = event.payload.id
  if (s.deleted.has(id)) return deleted(event)
  const todo = s.todos.get(id)
  const stamps = s.stamps.get(id)
  if (todo === undefined || stamps === undefined) return Result.succeed(s)
  if (compareStamps(stamp, stamps[field]) <= 0) return stale(event)
  return Result.succeed({
    ...s,
    todos: new Map(s.todos).set(id, { ...todo, [field]: value }),
    stamps: new Map(s.stamps).set(id, { ...stamps, [field]: stamp })
  })
}

/**
 * The fold, and the only place that decides conflicts.
 *
 * Each field is last-write-wins on the writer's hybrid clock (`at`, or the
 * entry id's time for older entries), ties broken by entry id. The result
 * does not depend on the order events arrive in: the live handlers and
 * `replayJournal` reach the same state.
 */
export const applyTodoEvent = (
  s: TodoStateShape,
  event: TodoEvent,
  entryId: EventJournal.EntryId
): Result.Result<TodoStateShape, Rejection> => {
  const stamp = stampOf(event, entryId)
  return Match.valueTags(event, {
    TodoAdded: ({ payload }) => {
      if (s.deleted.has(payload.id)) return deleted(event)
      if (s.todos.has(payload.id)) return Result.succeed(s)
      return Result.succeed({
        ...s,
        todos: new Map(s.todos).set(payload.id, { id: payload.id, title: payload.title, done: false }),
        stamps: new Map(s.stamps).set(payload.id, { title: stamp, done: stamp })
      })
    },
    TodoRenamed: ({ payload }) => writeField(s, event, stamp, "title", payload.title),
    TodoToggled: ({ payload }) => writeField(s, event, stamp, "done", payload.done),
    TodoDeleted: ({ payload }) => {
      const todos = new Map(s.todos)
      const stamps = new Map(s.stamps)
      todos.delete(payload.id)
      stamps.delete(payload.id)
      return Result.succeed({ todos, stamps, deleted: new Set(s.deleted).add(payload.id) })
    }
  })
}

/** An event as read from a journal: what happened, and the entry it came in. */
export interface JournalEvent {
  readonly event: TodoEvent
  readonly entryId: EventJournal.EntryId
}

/**
 * Folds a whole journal, in stamp order. Not entry-id order: with clocks
 * apart, a rename made after seeing an add can carry an older entry id than
 * the add, and folding it first would drop it, since the todo does not exist
 * yet. Stamps put every edit after what its writer had seen.
 */
export const foldTodoEvents = (events: ReadonlyArray<JournalEvent>): TodoStateShape =>
  [...events]
    .map((e) => ({ ...e, stamp: stampOf(e.event, e.entryId) }))
    .sort((a, b) => compareStamps(a.stamp, b.stamp))
    .reduce(
      (state, { event, entryId }) => Result.getOrElse(applyTodoEvent(state, event, entryId), () => state),
      emptyTodoState
    )
