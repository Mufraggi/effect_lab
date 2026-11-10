/**
 * What the normalized tables buy us: questions the flat CSV answers badly,
 * answered in SQL and decoded back into the domain's branded types.
 *
 * Postgres returns `avg` as `numeric` and `count` as `bigint`, both as strings
 * over the wire: the queries cast them (`::float8`, `::int`) so the results
 * decode as plain numbers.
 */
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { PokedexNumber, PokemonName, PokemonType } from "./schema.js"

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
