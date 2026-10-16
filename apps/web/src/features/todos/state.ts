import { Clock, Context, Effect, Layer, Ref, Result, SubscriptionRef } from "effect"
import { EventJournal } from "effect/eventlog"
import { decodeTodoEntry, stampMillis, type TodoEvent } from "@effect_lab/shared"
import { applyTodoEvent, emptyTodoState, type Rejection, type TodoStateShape } from "./projection.js"

/** The journal's events, decoded, in entry-id order. Unknown tags are skipped. */
const journalEvents = Effect.gen(function*() {
  const journal = yield* EventJournal.EventJournal
  const entries = [...(yield* journal.entries)].sort(EventJournal.Entry.Order)
  const events: Array<readonly [TodoEvent, EventJournal.Entry]> = []
  for (const entry of entries) {
    const event = yield* decodeTodoEntry(entry)
    if (event !== undefined) events.push([event, entry])
  }
  return events
})

/**
 * Nothing replays the local journal into the handlers on startup, so after a
 * page reload the projection would be empty. It is rebuilt here instead, with
 * the same fold as the handlers. Entries go in entry-id order, so a todo is
 * always added before it is renamed or toggled.
 */
export const replayJournal = Effect.map(journalEvents, (events) => {
  let state = emptyTodoState
  for (const [event, entry] of events) {
    state = Result.getOrElse(applyTodoEvent(state, event, entry.id), () => state)
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

/**
 * This client's hybrid logical clock (see `clock.ts` in shared): the wall
 * clock, but never behind the latest stamp seen. It starts from the journal,
 * so a reload does not step back behind what was already written or received.
 */
export class HybridClock extends Context.Service<HybridClock, {
  /** A stamp for a new edit: later than the wall clock and than anything seen. */
  readonly tick: Effect.Effect<number>
  /** Records a stamp written here or received, so the next tick is past it. */
  readonly observe: (at: number) => Effect.Effect<void>
}>()("app/HybridClock") {
  static readonly layer = Layer.effect(
    HybridClock,
    Effect.gen(function*() {
      const events = yield* journalEvents
      const last = yield* Ref.make(
        events.reduce((max, [event, entry]) => Math.max(max, stampMillis(event, entry.id)), 0)
      )
      return HybridClock.of({
        tick: Effect.flatMap(Clock.currentTimeMillis, (now) =>
          Ref.modify(last, (seen) => {
            const at = Math.max(now, seen + 1)
            return [at, at]
          })),
        observe: (at) => Ref.update(last, (seen) => Math.max(seen, at))
      })
    })
  )
}
