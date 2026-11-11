/**
 * Every read of the Pokémon tables, decoded back into the domain's branded
 * types: the analytical queries — questions the flat CSV answers badly — and
 * `allPokemon`, which walks the other way and puts a CSV row back together.
 *
 * Postgres returns `avg` as `numeric` and `count` as `bigint`, both as strings
 * over the wire: the queries cast them (`::float8`, `::int`) so the results
 * decode as plain numbers. The plain columns `allPokemon` reads need no cast —
 * `int` and `boolean` already arrive as numbers and booleans.
 */
import { Effect, Option, Schema, SchemaGetter, Stream } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import {
  Attack,
  Defense,
  Generation,
  Hp,
  IsLegendary,
  PokedexNumber,
  Pokemon,
  PokemonName,
  PokemonType,
  PrimaryType,
  SecondaryType,
  SpecialAttack,
  SpecialDefense,
  Speed,
  StatTotal
} from "./schema.js"

/** Average base stats of every Pokémon having that type (in either slot). */
export const StatsByType = Schema.Struct({
  type: PokemonType,
  count: Schema.Int,
  // Des moyennes SQL (`AVG`) : réelles mais toujours finies, d'où `Finite`
  // plutôt que `Number`.
  hp: Schema.Finite,
  attack: Schema.Finite,
  defense: Schema.Finite,
  specialAttack: Schema.Finite,
  specialDefense: Schema.Finite,
  speed: Schema.Finite,
  total: Schema.Finite
})

export const statsByType = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: StatsByType,
    execute: () => sql`
      SELECT t.type,
             count(*)::int                             AS count,
             round(avg(p.hp), 1)::float8               AS hp,
             round(avg(p.attack), 1)::float8           AS attack,
             round(avg(p.defense), 1)::float8          AS defense,
             round(avg(p.special_attack), 1)::float8   AS "specialAttack",
             round(avg(p.special_defense), 1)::float8  AS "specialDefense",
             round(avg(p.speed), 1)::float8            AS speed,
             round(avg(p.total), 1)::float8            AS total
      FROM pokemon_types t JOIN pokemon p ON p.id = t.pokemon_id
      GROUP BY t.type
      ORDER BY total DESC`
  })(undefined)
})

/** Dual-type combinations ranked by average total (at least 3 Pokémon). */
export const TypePair = Schema.Struct({
  primary: PokemonType,
  secondary: PokemonType,
  count: Schema.Int,
  total: Schema.Finite
})

export const strongestTypePairs = (limit: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* SqlSchema.findAll({
      Request: Schema.Int,
      Result: TypePair,
      execute: (limit) => sql`
      SELECT t1.type AS "primary", t2.type AS secondary,
             count(*)::int                  AS count,
             round(avg(p.total), 1)::float8 AS total
      FROM pokemon p
      JOIN pokemon_types t1 ON t1.pokemon_id = p.id AND t1.slot = 1
      JOIN pokemon_types t2 ON t2.pokemon_id = p.id AND t2.slot = 2
      GROUP BY t1.type, t2.type
      HAVING count(*) >= 3
      ORDER BY total DESC
      LIMIT ${limit}`
    })(limit)
  })

/** Species with several forms (Mega, Primal, …): the reason for two tables. */
export const SpeciesForms = Schema.Struct({
  pokedexNumber: PokedexNumber,
  forms: Schema.Array(PokemonName)
})

export const speciesWithForms = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: SpeciesForms,
    execute: () => sql`
      SELECT s.pokedex_number AS "pokedexNumber",
             array_agg(p.name ORDER BY p.id) AS forms
      FROM pokemon_species s JOIN pokemon p ON p.pokedex_number = s.pokedex_number
      GROUP BY s.pokedex_number
      HAVING count(*) > 1
      ORDER BY s.pokedex_number`
  })(undefined)
})

// ---------------------------------------------------------------------------
// The export read: three tables back into one flat row
// ---------------------------------------------------------------------------

/**
 * `Type 2` absent: the LEFT JOIN gives `null`, the domain wants an `Option`.
 * The `SecondaryTypeCell` of `schema.ts` with `null` in place of the empty
 * cell — and, like it, an unbranded `PokemonType` on the column side: the
 * brand belongs to the decoded value, and asking for it on both sides leaves
 * the encoder with no way to put it back.
 */
const SecondaryTypeColumn = Schema.NullOr(PokemonType).pipe(
  Schema.decodeTo(Schema.Option(SecondaryType), {
    decode: SchemaGetter.transform((type) => (type === null ? Option.none() : Option.some(type))),
    encode: SchemaGetter.transform(Option.getOrNull)
  })
)

/**
 * One row of the export query ⇄ `Pokemon`, the counterpart of `PokemonCsvRow`
 * on the database side: same branded columns, but read from real `int` and
 * `boolean` values rather than from text cells.
 *
 * `decodeTo(Pokemon)` is here for the nominal type, not as an integrity check:
 * `Pokemon`'s "total is the sum of the six stats" filter cannot fail on rows
 * coming from the database, where `total` is a generated column.
 */
const PokemonRow = Schema.Struct({
  pokedexNumber: PokedexNumber,
  name: PokemonName,
  primaryType: PrimaryType,
  secondaryType: SecondaryTypeColumn,
  total: StatTotal,
  hp: Hp,
  attack: Attack,
  defense: Defense,
  specialAttack: SpecialAttack,
  specialDefense: SpecialDefense,
  speed: Speed,
  generation: Generation,
  legendary: IsLegendary
}).pipe(Schema.decodeTo(Pokemon))

const decodeRow = Schema.decodeUnknownEffect(PokemonRow)

/**
 * Every Pokémon as a flat row, streamed: `generation` and `legendary` come
 * from the species, the two types from their slots — slot 2 only for dual-type
 * Pokémon, hence the LEFT JOIN.
 *
 * `.stream` is a Postgres cursor, not a `findAll`: the rows arrive in batches
 * and nothing holds the whole table. `SqlSchema` has no streaming variant, so
 * the decoding is an explicit `Stream.mapEffect`.
 *
 * `ORDER BY p.id`: `pokemon.id` is a `SERIAL` handed out in insert order, which
 * was the CSV's order — so this restores the original row order, each form
 * right after its species. `speciesWithForms` relies on the same property.
 */
export const allPokemon = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return sql`
    SELECT p.pokedex_number AS "pokedexNumber", p.name,
           t1.type AS "primaryType", t2.type AS "secondaryType",
           p.total, p.hp, p.attack, p.defense,
           p.special_attack AS "specialAttack", p.special_defense AS "specialDefense", p.speed,
           s.generation, s.legendary
    FROM pokemon p
    JOIN pokemon_species s ON s.pokedex_number = p.pokedex_number
    JOIN pokemon_types t1 ON t1.pokemon_id = p.id AND t1.slot = 1
    LEFT JOIN pokemon_types t2 ON t2.pokemon_id = p.id AND t2.slot = 2
    ORDER BY p.id`.stream.pipe(
    // Not `mapEffect(decodeRow)`: `mapEffect` passes the element index as a
    // second argument, which `decodeUnknownEffect` would read as its options.
    Stream.mapEffect((row) => decodeRow(row))
  )
}).pipe(Stream.unwrap)
