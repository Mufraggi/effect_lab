/**
 * Regenerates the Pokémon CSV from Postgres — the exact mirror of
 * `import:pokemon`. The export query streams rows out of a cursor, each
 * `Pokemon` is encoded back through `PokemonCsvRow`, and the bytes go straight
 * into the file: nothing is collected, neither the rows nor the text.
 *
 * `PokemonCsvRow` is bidirectional, so the whole CSV shape comes back for
 * free — the headers from `Schema.encodeKeys` (`#`, `Sp. Atk`, …) in
 * declaration order, the empty cell for a missing `Type 2`, the Python-style
 * `True` / `False`. There is no second schema, and no list of columns here:
 * `Csv.encodeSchema` reads them off the schema.
 *
 * Output goes to `exports/pokemon.csv`:
 *
 *   pnpm --filter @effect_lab/scripts export:pokemon
 */
import { Effect, FileSystem, Path, Ref, Stream } from "effect"
import { Csv } from "effect/encoding"
import { allPokemon } from "../pokemon/queries.js"
import { PokemonCsvRow } from "../pokemon/schema.js"
import { runScript } from "../run.js"

const defaultOutput = "exports/pokemon.csv"

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  yield* fs.makeDirectory(path.dirname(defaultOutput), { recursive: true })

  // `Stream.run` on a file sink returns nothing, so the rows are counted on the
  // way past — before the encoding, where one chunk is no longer one row.
  const written = yield* Ref.make(0)

  yield* allPokemon.pipe(
    Stream.tap(() => Ref.update(written, (n) => n + 1)),
    Stream.pipeThroughChannel(
      Csv.encodeSchema(PokemonCsvRow)({
        headers: true,
        newline: "\n",
        disableCodecs: true
      })
    ),
    Stream.run(fs.sink(defaultOutput))
  )

  yield* Effect.log(`${yield* Ref.get(written)} Pokémon exportés vers ${defaultOutput}`)
})

runScript(program)
