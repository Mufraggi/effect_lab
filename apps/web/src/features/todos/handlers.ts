/**
 * The client handlers that keep each user's projection up to date.
 *
 * Two kinds of conflict, two mechanisms:
 *
 *   - same tag, same primary key (rename vs rename): EventLog reports it in
 *     `conflicts` when it replays a remote entry. An entry there is a *newer*
 *     one already in the journal, so ignoring the incoming entry is
 *     last-write-wins on the writer's clock.
 *   - different tags (toggle vs delete): never reported in `conflicts`. The
 *     projection settles it with a tombstone, which only works because
 *     `TodoToggled` carries the target value rather than a flip.
 *
 * `conflicts` is always empty on a local write: it only fills on replay.
 */
import { Effect, SubscriptionRef } from "effect"
import { EventLog } from "effect/eventlog"
import { type TodoEvent, TodoEvents } from "@effect_lab/shared"
import { applyTodoEvent } from "./projection.js"
import { ConflictLog, TodoState } from "./state.js"

const record = (line: string) => ConflictLog.use((log) => SubscriptionRef.update(log, (lines) => [...lines, line]))

const apply = (event: TodoEvent) => TodoState.use((ref) => SubscriptionRef.update(ref, (s) => applyTodoEvent(s, event)))

const isDeleted = (id: string) => TodoState.use((ref) => Effect.map(SubscriptionRef.get(ref), (s) => s.deleted.has(id)))

export const TodoHandlersClient = EventLog.group(TodoEvents, (h) =>
  h
    .handle("TodoAdded", ({ payload }) => apply({ _tag: "TodoAdded", payload }))
    .handle("TodoRenamed", ({ payload, conflicts }) =>
      Effect.gen(function*() {
        if (conflicts.length > 0) {
          const newer = conflicts.map((c) => `"${c.payload.title}"`).join(", ")
          return yield* record(`TodoRenamed(${payload.id}) "${payload.title}" ignoré : plus ancien que ${newer}`)
        }
        yield* apply({ _tag: "TodoRenamed", payload })
      }))
    .handle("TodoToggled", ({ payload, conflicts }) =>
      Effect.gen(function*() {
        if (conflicts.length > 0) {
          return yield* record(`TodoToggled(${payload.id}) done=${payload.done} ignoré : bascule plus récente`)
        }
        if (yield* isDeleted(payload.id)) {
          return yield* record(`TodoToggled(${payload.id}) done=${payload.done} ignoré : la todo est supprimée`)
        }
        yield* apply({ _tag: "TodoToggled", payload })
      }))
    .handle("TodoDeleted", ({ payload }) => apply({ _tag: "TodoDeleted", payload }))
)
