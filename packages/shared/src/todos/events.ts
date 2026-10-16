import { Schema } from "effect"
import { type Event, EventGroup, EventLog } from "effect/eventlog"

export const TodoId = Schema.String.pipe(Schema.brand("TodoId"))
export type TodoId = typeof TodoId.Type

/**
 * When the writer made the edit, on its hybrid logical clock (see `clock.ts`):
 * never behind anything the writer had already seen. Optional, because
 * entries written before it existed are kept forever; those fall back to the
 * time in their entry id.
 */
const at = Schema.optionalKey(Schema.Number)

const TodoTitle = Schema.Struct({ id: TodoId, title: Schema.String, at })

export const TodoEvents = EventGroup.empty
  .add({ tag: "TodoAdded", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoRenamed", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoToggled", primaryKey: (p) => p.id, payload: Schema.Struct({ id: TodoId, done: Schema.Boolean, at }) })
  .add({ tag: "TodoDeleted", primaryKey: (p) => p.id, payload: Schema.Struct({ id: TodoId }) })

export const TodoSchema = EventLog.schema(TodoEvents)

export type TodoEvent = Event.TaggedPayload<EventGroup.Events<typeof TodoEvents>>
