/**
 * Dev command: applies the pending migrations, then dumps the resulting schema
 * to `schema/_schema.sql` (via `pg_dump`) so schema changes show up in diffs.
 * The dump is only rewritten when a migration was applied.
 *
 *   pnpm --filter @effect_lab/db db:migrate
 *
 * Production does not need this: the API runs `migrate` on startup, without
 * the dump (no `pg_dump` in the image).
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { PgMigrator } from "@effect/sql-pg"
import { Effect, FileSystem, Layer } from "effect"
import { SqlLive } from "../client.js"
import { loader } from "../migrate.js"

const schemaDirectory = "schema"
const schemaFile = `${schemaDirectory}/_schema.sql`

/**
 * pg_dump ≥ 17.6 wraps its output in `\restrict <random key>` /
 * `\unrestrict <key>`: a new key on every dump, i.e. a diff on every run.
 */
const stripRestrictKeys = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const dump = yield* fs.readFileString(schemaFile)
  yield* fs.writeFileString(schemaFile, dump.replace(/^\\(un)?restrict .*\n?/gm, ""))
})

const program = Effect.gen(function* () {
  const applied = yield* PgMigrator.run({ loader, schemaDirectory })
  if (applied.length === 0) return yield* Effect.log("database up to date")
  yield* stripRestrictKeys
  yield* Effect.log(`applied migrations: ${applied.map(([id, name]) => `${id}_${name}`).join(", ")}`)
})

program.pipe(Effect.provide(Layer.mergeAll(SqlLive, NodeServices.layer)), NodeRuntime.runMain)
