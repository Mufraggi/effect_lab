/**
 * The Postgres client, configured by `DATABASE_URL`. Shared by the API and the
 * scripts: one database, one client config.
 */
import { PgClient } from "@effect/sql-pg"
import { Config } from "effect"

export const SqlLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL")
})
