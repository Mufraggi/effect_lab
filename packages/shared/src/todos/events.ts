import { Schema } from "effect"
import { type Event, EventGroup, EventLog } from "effect/eventlog"
import { StoreId } from "effect/eventlog/EventLogMessage"

export const TodoId = Schema.String.pipe(Schema.brand("TodoId"))
export type TodoId = typeof TodoId.Type

const TodoTitle = Schema.Struct({ id: TodoId, title: Schema.String })

export const TodoEvents = EventGroup.empty
  .add({ tag: "TodoAdded", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoRenamed", primaryKey: (p) => p.id, payload: TodoTitle })
  .add({ tag: "TodoToggled", primaryKey: (p) => p.id, payload: Schema.Struct({ id: TodoId, done: Schema.Boolean }) })
  .add({ tag: "TodoDeleted", primaryKey: (p) => p.id, payload: Schema.Struct({ id: TodoId }) })

export const TodoSchema = EventLog.schema(TodoEvents)

/** The one store the server accepts: every client writes to the same list. */
export const TodoStoreId = StoreId.make("demo")

export type TodoEvent = Event.TaggedPayload<EventGroup.Events<typeof TodoEvents>>
