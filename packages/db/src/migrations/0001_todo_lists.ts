/**
 * Todo-lists and their members (see `apps/api/src/features/lists/repo.ts`).
 *
 * `IF NOT EXISTS`: these tables used to be created by the API on startup, so
 * databases from before the migrator already have them.
 */
import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
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
})
