import { Context, Effect, Layer, Schema, SubscriptionRef } from "effect"
import { EventJournal } from "effect/eventlog"
import { type TodoEvent, TodoEvents } from "@effect_lab/shared"
import { applyTodoEvent, emptyTodoState, type TodoStateShape } from "./projection.js"

const decodeEntry = (entry: EventJournal.Entry) => {
  const event = TodoEvents.events[entry.event]
  if (event === undefined) return Effect.succeed(undefined)
  return Schema.decodeUnknownEffect(event.payloadSchemaBinary)(entry.payload).pipe(
    Effect.map((payload) => ({ _tag: entry.event, payload }) as TodoEvent)
  )
}

/**
 * Nothing replays the local journal into the handlers on startup, so after a
 * page reload the projection would be empty. It is rebuilt here instead, by
 * folding the journal in entry-id order — the writers' clock order, which is
 * also what the `conflicts` rule decides by, so the result is the same.
 */
export const replayJournal = Effect.gen(function*() {
  const journal = yield* EventJournal.EventJournal
  const entries = [...(yield* journal.entries)].sort(EventJournal.Entry.Order)
  let state = emptyTodoState
  for (const entry of entries) {
    const event = yield* decodeEntry(entry)
    if (event !== undefined) state = applyTodoEvent(state, event)
  }
  return state
})

export class TodoState extends Context.Service<TodoState, SubscriptionRef.SubscriptionRef<TodoStateShape>>()(
  "effect_lab/todos/TodoState"
) {}

/** Starts from the local journal: empty in memory, persisted with IndexedDB. */
export const TodoStateLive = Layer.effect(TodoState, Effect.flatMap(replayJournal, SubscriptionRef.make))

/** What this client decided to drop on replay, and why. */
export class ConflictLog extends Context.Service<ConflictLog, SubscriptionRef.SubscriptionRef<ReadonlyArray<string>>>()(
  "effect_lab/todos/ConflictLog"
) {}

export const ConflictLogLive = Layer.effect(ConflictLog, SubscriptionRef.make<ReadonlyArray<string>>([]))
