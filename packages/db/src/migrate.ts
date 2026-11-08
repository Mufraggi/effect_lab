/**
 * Migrations with `effect/sql/Migrator`.
 *
 * - `loader`: every migration, by `<id>_<name>`. Static imports, so the
 *   compiled `dist` is all there is to ship — nothing is read from disk.
 * - `migrate`: applies the pending ones, in one transaction, after a
 *   `LOCK TABLE effect_sql_migrations` (two API instances starting together
 *   don't migrate twice). Needs nothing but `SqlClient`.
 * - `DbLive`: `SqlClient`, handed out only once the database is migrated.
 *
 * Adding a migration: `src/migrations/<next id>_<name>.ts` with an `Effect` as
 * default export, then one line in `loader`. Never edit an applied one.
 */
import { Effect, Layer } from "effect"
import { Migrator } from "effect/sql"
import { SqlLive } from "./client.js"
import todoLists from "./migrations/0001_todo_lists.js"
import pokemon from "./migrations/0002_pokemon.js"

export const loader = Migrator.fromRecord({
  "0001_todo_lists": todoLists,
  "0002_pokemon": pokemon
})

const run = Migrator.make({})

export const migrate = run({ loader }).pipe(
  Effect.tap((applied) =>
    applied.length === 0
      ? Effect.logDebug("database up to date")
      : Effect.log(`applied migrations: ${applied.map(([id, name]) => `${id}_${name}`).join(", ")}`)
  )
)

export const DbLive = Layer.effectDiscard(migrate).pipe(Layer.provideMerge(SqlLive))
