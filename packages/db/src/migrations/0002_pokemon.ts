/**
 * The Pokémon tables filled by `apps/scripts` (`import:pokemon`).
 *
 * The CSV is denormalized; the database is not:
 *
 * - `pokemon_species` — one row per Pokédex number (generation, legendary).
 * - `pokemon` — one row per CSV row (a form); `total` is generated.
 * - `pokemon_types` — `Type 1` / `Type 2` as rows (`slot` 1 or 2).
 *
 * A migration is frozen once applied: the 18 types are spelled out here rather
 * than imported from the scripts' Schema, which may change later.
 *
 * `IF NOT EXISTS` (and `duplicate_object` for the enum): the import script
 * created these itself before the migrator.
 */
import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    DO $$ BEGIN
      CREATE TYPE pokemon_type AS ENUM (
        'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost',
        'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`

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
