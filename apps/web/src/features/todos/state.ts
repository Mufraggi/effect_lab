import { Context, Effect, Layer, Result, Schema, SubscriptionRef } from "effect"
import { EventJournal } from "effect/eventlog"
import { type TodoEvent, TodoEvents } from "@effect_lab/shared"
import { applyTodoEvent, emptyTodoState, type Rejection, type TodoStateShape } from "./projection.js"

/**
 * `TodoEvents.events` is a record keyed by string, so the link between a tag
 * and its payload type is lost on lookup. EventLog casts the same way when it
 * decodes entries for its own handlers.
 */
const decodeEntry = Effect.fnUntraced(function*(entry: EventJournal.Entry) {
  const event = TodoEvents.events[entry.event]
  if (event === undefined) return undefined
  const payload = yield* Schema.decodeUnknownEffect(event.payloadSchemaBinary)(entry.payload)
  return { _tag: entry.event, payload } as TodoEvent
})

/**
 * Nothing replays the local journal into the handlers on startup, so after a
 * page reload the projection would be empty. It is rebuilt here instead, with
 * the same fold as the handlers. Entries go in entry-id order, so a todo is
 * always added before it is renamed or toggled.
 */
export const replayJournal = Effect.gen(function*() {
  const journal = yield* EventJournal.EventJournal
  const entries = [...(yield* journal.entries)].sort(EventJournal.Entry.Order)
  let state = emptyTodoState
  for (const entry of entries) {
    const event = yield* decodeEntry(entry)
    if (event !== undefined) state = Result.getOrElse(applyTodoEvent(state, event, entry.id), () => state)
  }
  return state
})

export class TodoState extends Context.Service<TodoState, SubscriptionRef.SubscriptionRef<TodoStateShape>>()(
  "app/TodoState"
) {
  /** Starts from the local journal: empty in memory, persisted with IndexedDB. */
  static readonly layer = Layer.effect(TodoState, Effect.flatMap(replayJournal, SubscriptionRef.make))
}

/** What this client decided to drop, and why. */
export class ConflictLog extends Context.Service<ConflictLog, SubscriptionRef.SubscriptionRef<ReadonlyArray<Rejection>>>()(
  "app/ConflictLog"
) {
  static readonly layer = Layer.effect(ConflictLog, SubscriptionRef.make<ReadonlyArray<Rejection>>([]))
}
