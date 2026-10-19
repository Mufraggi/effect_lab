import { Clock, Context, Effect, Layer, Ref, SubscriptionRef } from "effect"
import { EventJournal } from "effect/eventlog"
import { decodeTodoEntry, StampMillis, stampOf } from "@effect_lab/shared"
import { foldTodoEvents, type JournalEvent, type Rejection, type TodoStateShape } from "./projection.js"

/** The journal's events, decoded. Unknown tags are skipped. */
const journalEvents = Effect.gen(function* () {
  const journal = yield* EventJournal.EventJournal
  const events: Array<JournalEvent> = []
  for (const entry of yield* journal.entries) {
    const event = yield* decodeTodoEntry(entry)
    if (event !== undefined) events.push({ event, entryId: entry.id })
  }
  return events
})

/**
 * Nothing replays the local journal into the handlers on startup, so after a
 * page reload the projection would be empty. It is rebuilt here instead, with
 * the same fold as the handlers, in stamp order (see `foldTodoEvents`).
 */
export const replayJournal = Effect.map(journalEvents, foldTodoEvents)

export class TodoState extends Context.Service<TodoState, SubscriptionRef.SubscriptionRef<TodoStateShape>>()(
  "app/TodoState"
) {
  /** Starts from the local journal: empty in memory, persisted with IndexedDB. */
  static readonly layer = Layer.effect(TodoState, Effect.flatMap(replayJournal, SubscriptionRef.make))
}

/** What this client decided to drop, and why. */
export class ConflictLog extends Context.Service<
  ConflictLog,
  SubscriptionRef.SubscriptionRef<ReadonlyArray<Rejection>>
>()("app/ConflictLog") {
  static readonly layer = Layer.effect(ConflictLog, SubscriptionRef.make<ReadonlyArray<Rejection>>([]))
}

/**
 * This client's hybrid logical clock (see `clock.ts` in shared): the wall
 * clock, but never behind the latest stamp seen. It starts from the journal,
 * so a reload does not step back behind what was already written or received.
 */
export class HybridClock extends Context.Service<
  HybridClock,
  {
    /** A stamp for a new edit: later than the wall clock and than anything seen. */
    readonly tick: Effect.Effect<StampMillis>
    /** Records a stamp written here or received, so the next tick is past it. */
    readonly observe: (at: StampMillis) => Effect.Effect<void>
  }
>()("app/HybridClock") {
  static readonly layer = Layer.effect(
    HybridClock,
    Effect.gen(function* () {
      const events = yield* journalEvents
      const last = yield* Ref.make(
        events.reduce((max, { event, entryId }) => Math.max(max, stampOf(event, entryId).at), 0)
      )
      return HybridClock.of({
        tick: Effect.flatMap(Clock.currentTimeMillis, (now) =>
          Ref.modify(last, (seen) => {
            const at = StampMillis.make(Math.max(now, seen + 1))
            return [at, at]
          })
        ),
        observe: (at) => Ref.update(last, (seen) => Math.max(seen, at))
      })
    })
  )
}
