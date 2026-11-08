/**
 * `runScript(program)`: runs an import script with everything it may need —
 * the Postgres client (`DbLive`: `DATABASE_URL`, migrated first) and an HTTP client —
 * and reports failures through `NodeRuntime.runMain`.
 */
import { NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import type { HttpClient } from "effect/http"
import type { SqlClient } from "effect/sql"
import { DbLive } from "@effect_lab/db"

const ScriptLive = Layer.mergeAll(DbLive, NodeHttpClient.layerUndici)

export const runScript = <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient | HttpClient.HttpClient>) =>
  program.pipe(Effect.provide(ScriptLive), NodeRuntime.runMain)
