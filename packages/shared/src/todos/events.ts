import { Schema } from "effect"
import { type Event, EventGroup, EventLog } from "effect/eventlog"

export const TodoId = Schema.String.pipe(Schema.brand("TodoId"))
export type TodoId = typeof TodoId.Type

/**
 * A time on a hybrid logical clock, in epoch milliseconds (see `clock.ts`).
 * Finite and not negative: `NaN` would compare false against everything and
 * poison every clock that saw it.
 */
export const StampMillis = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand("StampMillis"))
export type StampMillis = typeof StampMillis.Type

/**
 * When the writer made the edit: never behind anything it had already seen.
 * Every event carries it, so stamping is one rule for all of them. Optional,
 * because entries written before it existed are kept forever; those fall back
 * to the time in their entry id.
 */
const at = Schema.optionalKey(StampMillis)

const TodoTitle = Schema.Struct({ id: TodoId, title: Schema.String, at })

export const TodoEvents = EventGroup.empty
  .add({ tag: "TodoAdded", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoRenamed", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({
    tag: "TodoToggled",
    primaryKey: (p) => p.id,
    payload: Schema.Struct({ id: TodoId, done: Schema.Boolean, at })
  })
  .add({ tag: "TodoDeleted", primaryKey: (p) => p.id, payload: Schema.Struct({ id: TodoId, at }) })

export const TodoSchema = EventLog.schema(TodoEvents)

export type TodoEvent = Event.TaggedPayload<EventGroup.Events<typeof TodoEvents>>
