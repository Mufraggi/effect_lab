/**
 * The Pokémon tables, and how one batch of `Pokemon` lands in them.
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
import { type Pokemon, PokemonType } from "./schema.js"

/** Creates the tables if they are missing (same approach as the API's repos). */
export const migrate = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // `CREATE TYPE` has no `IF NOT EXISTS`.
  const typeLabels = PokemonType.literals.map((t) => `'${t}'`).join(", ")
  yield* sql.unsafe(`
    DO $$ BEGIN
      CREATE TYPE pokemon_type AS ENUM (${typeLabels});
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`)

  yield* sql`
    CREATE TABLE IF NOT EXISTS pokemon_species (
      pokedex_number INT PRIMARY KEY CHECK (pokedex_number BETWEEN 1 AND 1025),
      generation     INT NOT NULL CHECK (generation BETWEEN 1 AND 9),
      legendary      BOOLEAN NOT NULL
    )`

  yield* sql`
    CREATE TABLE IF NOT EXISTS pokemon (
      id              SERIAL PRIMARY KEY,
      name            TEXT NOT NULL UNIQUE,
      pokedex_number  INT NOT NULL REFERENCES pokemon_species,
      hp              INT NOT NULL CHECK (hp BETWEEN 1 AND 255),
      attack          INT NOT NULL CHECK (attack BETWEEN 1 AND 255),
      defense         INT NOT NULL CHECK (defense BETWEEN 1 AND 255),
      special_attack  INT NOT NULL CHECK (special_attack BETWEEN 1 AND 255),
      special_defense INT NOT NULL CHECK (special_defense BETWEEN 1 AND 255),
      speed           INT NOT NULL CHECK (speed BETWEEN 1 AND 255),
      total           INT GENERATED ALWAYS AS
                        (hp + attack + defense + special_attack + special_defense + speed) STORED
    )`

  yield* sql`
    CREATE TABLE IF NOT EXISTS pokemon_types (
      pokemon_id INT NOT NULL REFERENCES pokemon ON DELETE CASCADE,
      slot       SMALLINT NOT NULL CHECK (slot IN (1, 2)),
      type       pokemon_type NOT NULL,
      PRIMARY KEY (pokemon_id, slot),
      UNIQUE (pokemon_id, type)
    )`
})

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
