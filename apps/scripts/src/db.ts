/**
 * The scripts' Postgres client, configured by `DATABASE_URL` — the same
 * database as the API. It provides `SqlClient` to every import script.
 */
import { Config } from "effect"
import { PgClient } from "@effect/sql-pg"

export const SqlLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL")
})
