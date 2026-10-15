import { Schema } from "effect"
import { type Event, EventGroup, EventLog } from "effect/eventlog"

const TodoTitle = Schema.Struct({ id: Schema.String, title: Schema.String })

export const TodoEvents = EventGroup.empty
  .add({ tag: "TodoAdded", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoRenamed", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoToggled", primaryKey: (p) => p.id, payload: Schema.Struct({ id: Schema.String, done: Schema.Boolean }) })
  .add({ tag: "TodoDeleted", primaryKey: (p) => p.id, payload: Schema.Struct({ id: Schema.String }) })

export const TodoSchema = EventLog.schema(TodoEvents)

export type TodoEvent = Event.TaggedPayload<EventGroup.Events<typeof TodoEvents>>
