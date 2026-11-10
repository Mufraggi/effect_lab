/**
 * `runScript(program)`: runs a script with everything it may need — the
 * Postgres client (`DbLive`: `DATABASE_URL`, migrated first), an HTTP client
 * and the Node platform services (`FileSystem`, `Path`, …) — and reports
 * failures through `NodeRuntime.runMain`.
 */
import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import type { HttpClient } from "effect/http"
import type { SqlClient } from "effect/sql"
import { DbLive } from "@effect_lab/db"

const ScriptLive = Layer.mergeAll(DbLive, NodeHttpClient.layerUndici, NodeServices.layer)

export const runScript = <A, E>(
  program: Effect.Effect<A, E, SqlClient.SqlClient | HttpClient.HttpClient | NodeServices.NodeServices>
) => program.pipe(Effect.provide(ScriptLive), NodeRuntime.runMain)
