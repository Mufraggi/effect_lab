/**
 * The API's Postgres client, configured by `DATABASE_URL`. It provides
 * `SqlClient`, which the EventLog server stores its journal in.
 */
import { Config } from "effect"
import { PgClient } from "@effect/sql-pg"

export const SqlLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL")
})
