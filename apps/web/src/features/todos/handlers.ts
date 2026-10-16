/**
 * The client handlers that keep each user's projection up to date.
 *
 * They do not read EventLog's `conflicts`. It only lists *newer entries
 * already in the journal*, and a batch of remote entries is checked before any
 * of it is inserted: two renames of the same todo arriving together never see
 * each other, and the older one would win. So the projection decides instead,
 * per field, by comparing entry ids (see `applyTodoEvent`).
 *
 * Two kinds of conflict, one mechanism each:
 *
 *   - same field (rename vs rename, toggle vs toggle): last-write-wins on the
 *     writer's hybrid clock, which every event seen here moves forward.
 *   - toggle or rename vs delete: settled by a tombstone, which only works
 *     because `TodoToggled` carries the target value rather than a flip.
 */
import { Effect, Result, SubscriptionRef } from "effect"
import { EventJournal, EventLog } from "effect/eventlog"
import { stampMillis, type TodoEvent, TodoEvents } from "@effect_lab/shared"
import { applyTodoEvent } from "./projection.js"
import { ConflictLog, HybridClock, TodoState } from "./state.js"

const apply = Effect.fnUntraced(function*(event: TodoEvent, entry: EventJournal.Entry) {
  yield* HybridClock.use((clock) => clock.observe(stampMillis(event, entry.id)))
  const state = yield* TodoState
  const result = yield* SubscriptionRef.modify(state, (s) => {
    const next = applyTodoEvent(s, event, entry.id)
    return [next, Result.getOrElse(next, () => s)]
  })
  if (Result.isFailure(result)) {
    const conflicts = yield* ConflictLog
    yield* SubscriptionRef.update(conflicts, (rejections) => [...rejections, result.failure])
  }
})

export const TodoHandlersClient = EventLog.group(TodoEvents, (h) =>
  h
    .handle("TodoAdded", ({ payload, entry }) => apply({ _tag: "TodoAdded", payload }, entry))
    .handle("TodoRenamed", ({ payload, entry }) => apply({ _tag: "TodoRenamed", payload }, entry))
    .handle("TodoToggled", ({ payload, entry }) => apply({ _tag: "TodoToggled", payload }, entry))
    .handle("TodoDeleted", ({ payload, entry }) => apply({ _tag: "TodoDeleted", payload }, entry))
)
