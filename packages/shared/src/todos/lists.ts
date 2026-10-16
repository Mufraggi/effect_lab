import { Schema } from "effect"
import { StoreId } from "effect/eventlog/EventLogMessage"

/** A todo-list is one EventLog store: its id is the `StoreId` clients sync with. */
export const TodoList = Schema.Struct({
  id: StoreId,
  name: Schema.String
})
export type TodoList = typeof TodoList.Type

/**
 * A list as its creator gets it back: with the invite code. Whoever holds the
 * code can join, so it is handed out once, at creation, and never listed.
 */
export const CreatedTodoList = Schema.Struct({
  ...TodoList.fields,
  inviteCode: Schema.String
})
export type CreatedTodoList = typeof CreatedTodoList.Type
