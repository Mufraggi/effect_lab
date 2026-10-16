import { Context, Effect, Layer, Option, Schema } from "effect"
import { StoreId } from "effect/eventlog/EventLogMessage"
import { SqlClient, SqlSchema } from "effect/sql"
import { CreatedTodoList, NotFound, TodoList } from "@effect_lab/shared"

/** One key's membership of one list: what the sync server asks about. */
export const Membership = Schema.Struct({ storeId: StoreId, publicKey: Schema.String })
export type Membership = typeof Membership.Type

/**
 * Todo-lists and their members, in Postgres next to the EventLog journal.
 *
 * A list's id is the EventLog store id. Membership is by `publicKey`: the
 * sync server reads it to decide who may read and write a store.
 *
 * SQL and decoding failures are defects: a list query that cannot reach the
 * database, or reads back a row it did not write, has nothing better to tell
 * the client than a 500.
 */
export class TodoLists extends Context.Service<TodoLists, {
  readonly listFor: (publicKey: string) => Effect.Effect<ReadonlyArray<TodoList>>
  readonly create: (name: string, publicKey: string) => Effect.Effect<CreatedTodoList>
  readonly join: (inviteCode: string, publicKey: string) => Effect.Effect<TodoList, NotFound>
  readonly exists: (storeId: StoreId) => Effect.Effect<boolean>
  readonly isMember: (membership: Membership) => Effect.Effect<boolean>
}>()("api/TodoLists") {
  static readonly layer = Layer.effect(
    TodoLists,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      yield* sql`
        CREATE TABLE IF NOT EXISTS todo_lists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          invite_code TEXT NOT NULL UNIQUE
        )`
      yield* sql`
        CREATE TABLE IF NOT EXISTS todo_list_members (
          list_id TEXT NOT NULL REFERENCES todo_lists (id),
          public_key TEXT NOT NULL,
          PRIMARY KEY (list_id, public_key)
        )`

      const findListsFor = SqlSchema.findAll({
        Request: Schema.String,
        Result: TodoList,
        execute: (publicKey) =>
          sql`
            SELECT l.id, l.name
            FROM todo_lists l JOIN todo_list_members m ON m.list_id = l.id
            WHERE m.public_key = ${publicKey}
            ORDER BY l.name`
      })

      const findByInviteCode = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: TodoList,
        execute: (inviteCode) => sql`SELECT id, name FROM todo_lists WHERE invite_code = ${inviteCode}`
      })

      const findById = SqlSchema.findOneOption({
        Request: StoreId,
        Result: TodoList,
        execute: (id) => sql`SELECT id, name FROM todo_lists WHERE id = ${id}`
      })

      const findMembership = SqlSchema.findOneOption({
        Request: Membership,
        Result: Membership,
        execute: ({ publicKey, storeId }) =>
          sql`
            SELECT list_id AS "storeId", public_key AS "publicKey"
            FROM todo_list_members
            WHERE list_id = ${storeId} AND public_key = ${publicKey}`
      })

      const insertList = SqlSchema.void({
        Request: CreatedTodoList,
        execute: ({ id, name, inviteCode }) =>
          sql`INSERT INTO todo_lists (id, name, invite_code) VALUES (${id}, ${name}, ${inviteCode})`
      })

      /** Joining twice is a no-op, not an error. */
      const insertMembership = SqlSchema.void({
        Request: Membership,
        execute: ({ publicKey, storeId }) =>
          sql`
            INSERT INTO todo_list_members (list_id, public_key) VALUES (${storeId}, ${publicKey})
            ON CONFLICT DO NOTHING`
      })

      const create = (name: string, publicKey: string) =>
        Effect.gen(function*() {
          const list: CreatedTodoList = {
            id: StoreId.make(crypto.randomUUID()),
            name,
            inviteCode: crypto.randomUUID()
          }
          yield* insertList(list)
          yield* insertMembership({ storeId: list.id, publicKey })
          return list
        }).pipe(sql.withTransaction, Effect.orDie)

      const join = (inviteCode: string, publicKey: string) =>
        Effect.gen(function*() {
          const list = yield* findByInviteCode(inviteCode).pipe(Effect.orDie)
          if (Option.isNone(list)) return yield* new NotFound()
          yield* insertMembership({ storeId: list.value.id, publicKey }).pipe(Effect.orDie)
          return list.value
        })

      return TodoLists.of({
        listFor: (publicKey) => findListsFor(publicKey).pipe(Effect.orDie),
        create,
        join,
        exists: (storeId) => findById(storeId).pipe(Effect.map(Option.isSome), Effect.orDie),
        isMember: (membership) => findMembership(membership).pipe(Effect.map(Option.isSome), Effect.orDie)
      })
    })
  )
}
