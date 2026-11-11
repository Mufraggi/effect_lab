/**
 * Streams the Pokémon CSV straight from the gist into Postgres: the HTTP
 * response body piped through the CSV channel, one `Pokemon` per row as it
 * arrives (no temp file), written 100 rows at a time.
 *
 * The whole import is one transaction: a non-2xx response or one that never
 * arrives (`HttpClientError`), a bad row (`SchemaError` naming the column), a
 * rejected insert (`SqlError`) or the ceiling below (`TimeoutError`) rolls
 * everything back. Re-running it is a no-op (every insert is an upsert).
 *
 * Both bounds are written here because nothing underneath provides one:
 * `makeUndici` disables undici's own timeouts and leaves them to Effect.
 * `HttpClient.timeout` bounds each attempt and ends when the response headers
 * arrive; `Effect.timeout` is a ceiling on the whole import, and the only
 * thing covering the body. Hitting it interrupts the fiber, and
 * `withTransaction` rolls back on interruption exactly as it does on failure,
 * so a cut import never commits half a CSV.
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
    HttpClient.timeout("30 seconds"),
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
    sql.withTransaction,
    Effect.timeout("5 minutes")
  )

  yield* Effect.log(`${imported} Pokémon importés`)
})

runScript(program)
