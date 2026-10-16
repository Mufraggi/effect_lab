import { Schema } from "effect"
import { type Event, EventGroup, EventLog } from "effect/eventlog"

export const TodoId = Schema.String.pipe(Schema.brand("TodoId"))
export type TodoId = typeof TodoId.Type

const TodoTitle = Schema.Struct({ id: TodoId, title: Schema.String })

export const TodoEvents = EventGroup.empty
  .add({ tag: "TodoAdded", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoRenamed", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoToggled", primaryKey: (p) => p.id, payload: Schema.Struct({ id: TodoId, done: Schema.Boolean }) })
  .add({ tag: "TodoDeleted", primaryKey: (p) => p.id, payload: Schema.Struct({ id: TodoId }) })

export const TodoSchema = EventLog.schema(TodoEvents)

export type TodoEvent = Event.TaggedPayload<EventGroup.Events<typeof TodoEvents>>
