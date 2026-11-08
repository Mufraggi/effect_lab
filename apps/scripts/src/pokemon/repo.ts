/**
 * How one batch of `Pokemon` lands in the Pokémon tables (created by the
 * `@effect_lab/db` migration 0002_pokemon).
 *
 * The CSV is denormalized; the database is not:
 *
 * - `pokemon_species` — one row per Pokédex number (generation, legendary).
 *   Several CSV rows share a number: "Venusaur" and "VenusaurMega Venusaur".
 * - `pokemon` — one row per CSV row (a form), with its base stats. `total` is
 *   a generated column: the database computes it, nobody can store a wrong one.
 * - `pokemon_types` — `Type 1` / `Type 2` as rows (`slot` 1 or 2) of the
 *   `pokemon_type` enum, instead of two columns, one of them nullable.
 *
 * Every insert is an upsert keyed by a natural key (number, name, slot), so
 * re-running the import is a no-op.
 */
import { Array as Arr, Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import type { Pokemon, PokemonType } from "./schema.js"

/**
 * Writes one batch: species first (the forms reference them), then the forms,
 * whose generated ids key their types.
 */
export const insertBatch = (batch: Arr.NonEmptyReadonlyArray<Pokemon>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // A species' forms may sit in the same batch: one row per number.
    const species = Arr.map(
      Arr.dedupeWith(batch, (a, b) => a.pokedexNumber === b.pokedexNumber),
      (p) => ({ pokedex_number: p.pokedexNumber, generation: p.generation, legendary: p.legendary })
    )
    yield* sql`
      INSERT INTO pokemon_species ${sql.insert(species)}
      ON CONFLICT (pokedex_number) DO NOTHING`

    const forms = Arr.map(batch, (p) => ({
      name: p.name,
      pokedex_number: p.pokedexNumber,
      hp: p.hp,
      attack: p.attack,
      defense: p.defense,
      special_attack: p.specialAttack,
      special_defense: p.specialDefense,
      speed: p.speed
    }))
    const ids = yield* sql<{ id: number; name: string }>`
      INSERT INTO pokemon ${sql.insert(forms)}
      ON CONFLICT (name) DO UPDATE SET
        pokedex_number  = EXCLUDED.pokedex_number,
        hp              = EXCLUDED.hp,
        attack          = EXCLUDED.attack,
        defense         = EXCLUDED.defense,
        special_attack  = EXCLUDED.special_attack,
        special_defense = EXCLUDED.special_defense,
        speed           = EXCLUDED.speed
      RETURNING id, name`
    // `RETURNING` gives back every row (inserted or updated), keyed by name.
    const idByName = new Map(ids.map((row) => [row.name, row.id]))
    const idOf = (name: string) =>
      Option.getOrThrowWith(Option.fromNullishOr(idByName.get(name)), () => new Error(`no id returned for ${name}`))

    // Slot 1 is always there, slot 2 only for dual-type Pokémon.
    const types = Arr.flatMap(batch, (p) => {
      const pokemon_id = idOf(p.name)
      return Arr.prepend(
        Option.match(p.secondaryType, {
          onNone: () => [],
          onSome: (type) => [{ pokemon_id, slot: 2, type: type as PokemonType }]
        }),
        { pokemon_id, slot: 1, type: p.primaryType as PokemonType }
      )
    })
    yield* sql`
      INSERT INTO pokemon_types ${sql.insert(types)}
      ON CONFLICT (pokemon_id, slot) DO UPDATE SET type = EXCLUDED.type`

    return batch.length
  })
