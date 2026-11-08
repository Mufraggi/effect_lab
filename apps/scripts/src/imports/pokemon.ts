/**
 * Streams the Pokémon CSV straight from the gist into Postgres: the HTTP
 * response body piped through the CSV channel, one `Pokemon` per row as it
 * arrives (no temp file), written 100 rows at a time.
 *
 * The whole import is one transaction: a non-2xx response (`HttpClientError`),
 * a bad row (`SchemaError` naming the column) or a rejected insert (`SqlError`)
 * rolls everything back. Re-running it is a no-op (every insert is an upsert).
 *
 *   pnpm --filter @effect_lab/scripts import:pokemon
 */
import { Effect, Schedule, Stream } from "effect"
import { Csv } from "effect/encoding"
import { HttpClient, HttpClientResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import { insertBatch } from "../pokemon/repo.js"
import { PokemonCsvRow } from "../pokemon/schema.js"
import { runScript } from "../run.js"

const url = "https://gist.githubusercontent.com/armgilles/194bcff35001e7eb53a2a8b441e8b2c6/raw/pokemon.csv"

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.filterStatusOk,
    HttpClient.retryTransient({ times: 3, schedule: Schedule.exponential("500 millis") })
  )

  const imported = yield* client.get(url).pipe(
    HttpClientResponse.stream,
    Stream.pipeThroughChannel(
      Csv.decodeSchema(PokemonCsvRow)({
        headers: true,
        ignoreEmptyLines: true,
        disableCodecs: true
      })
    ),
    Stream.grouped(100),
    Stream.mapEffect(insertBatch),
    Stream.runFold(
      () => 0,
      (total, n) => total + n
    ),
    sql.withTransaction
  )

  yield* Effect.log(`${imported} Pokémon importés`)
})

runScript(program)
