/**
 * Schemas for the Pokémon CSV
 * (https://gist.github.com/armgilles/194bcff35001e7eb53a2a8b441e8b2c6).
 *
 * Two layers:
 *
 * - domain values: one branded type per column (`Hp`, `Attack`, …), so a
 *   `Speed` can never be passed where an `Attack` is expected even though both
 *   are numbers — no primitive obsession. `Pokemon` is the struct of them.
 * - `PokemonCsvRow`: decodes one raw CSV row (every cell a string, keyed by
 *   the original headers `#`, `Type 1`, `Sp. Atk`, …) into a `Pokemon`, and
 *   encodes it back.
 */
import { Option, Schema, SchemaGetter } from "effect"

// ---------------------------------------------------------------------------
// Domain: one branded type per column
// ---------------------------------------------------------------------------

/** An integer in `[minimum, maximum]`; each column brands its own. */
const boundedInt = (minimum: number, maximum: number) => Schema.Int.check(Schema.isBetween({ minimum, maximum }))

/** `#` — National Pokédex number. Shared by a species' forms (Mega, …). */
export const PokedexNumber = boundedInt(1, 1025).pipe(Schema.brand("PokedexNumber"))
export type PokedexNumber = typeof PokedexNumber.Type

/** `Name` — unique per row (forms are spelled out, e.g. "VenusaurMega Venusaur"). */
export const PokemonName = Schema.NonEmptyString.pipe(Schema.brand("PokemonName"))
export type PokemonName = typeof PokemonName.Type

/** The 18 elemental types, shared by `Type 1` and `Type 2`. */
export const PokemonType = Schema.Literals([
  "Bug",
  "Dark",
  "Dragon",
  "Electric",
  "Fairy",
  "Fighting",
  "Fire",
  "Flying",
  "Ghost",
  "Grass",
  "Ground",
  "Ice",
  "Normal",
  "Poison",
  "Psychic",
  "Rock",
  "Steel",
  "Water"
])
export type PokemonType = typeof PokemonType.Type

/** `Type 1` — always present. */
export const PrimaryType = PokemonType.pipe(Schema.brand("PrimaryType"))
export type PrimaryType = typeof PrimaryType.Type

/** `Type 2` — absent for single-type Pokémon. */
export const SecondaryType = PokemonType.pipe(Schema.brand("SecondaryType"))
export type SecondaryType = typeof SecondaryType.Type

/** Base stats: each one its own brand, all within the game's 1–255 range. */
export const Hp = boundedInt(1, 255).pipe(Schema.brand("Hp"))
export type Hp = typeof Hp.Type
export const Attack = boundedInt(1, 255).pipe(Schema.brand("Attack"))
export type Attack = typeof Attack.Type
export const Defense = boundedInt(1, 255).pipe(Schema.brand("Defense"))
export type Defense = typeof Defense.Type
export const SpecialAttack = boundedInt(1, 255).pipe(Schema.brand("SpecialAttack"))
export type SpecialAttack = typeof SpecialAttack.Type
export const SpecialDefense = boundedInt(1, 255).pipe(Schema.brand("SpecialDefense"))
export type SpecialDefense = typeof SpecialDefense.Type
export const Speed = boundedInt(1, 255).pipe(Schema.brand("Speed"))
export type Speed = typeof Speed.Type

/** `Total` — the sum of the six base stats (checked on `Pokemon`). */
export const StatTotal = boundedInt(6, 6 * 255).pipe(Schema.brand("StatTotal"))
export type StatTotal = typeof StatTotal.Type

/** `Generation` — the game generation that introduced the Pokémon. */
export const Generation = boundedInt(1, 9).pipe(Schema.brand("Generation"))
export type Generation = typeof Generation.Type

/** `Legendary`. */
export const IsLegendary = Schema.Boolean.pipe(Schema.brand("IsLegendary"))
export type IsLegendary = typeof IsLegendary.Type

export const Pokemon = Schema.Struct({
  pokedexNumber: PokedexNumber,
  name: PokemonName,
  primaryType: PrimaryType,
  secondaryType: Schema.Option(SecondaryType),
  total: StatTotal,
  hp: Hp,
  attack: Attack,
  defense: Defense,
  specialAttack: SpecialAttack,
  specialDefense: SpecialDefense,
  speed: Speed,
  generation: Generation,
  legendary: IsLegendary
}).check(
  Schema.makeFilter(
    (p) =>
      p.hp + p.attack + p.defense + p.specialAttack + p.specialDefense + p.speed === p.total ||
      `total ${p.total} is not the sum of the base stats`
  )
)
export type Pokemon = typeof Pokemon.Type

// ---------------------------------------------------------------------------
// CSV: string cells, original headers
// ---------------------------------------------------------------------------

/** A numeric cell ("45") decoded into the branded integer `to`. */
const intCell = <S extends Schema.Constraint & { readonly Encoded: number }>(to: S) =>
  Schema.FiniteFromString.pipe(Schema.decodeTo(to))

/** `Type 2`: the empty cell means "no secondary type". */
const SecondaryTypeCell = Schema.Union([Schema.Literal(""), PokemonType]).pipe(
  Schema.decodeTo(Schema.Option(SecondaryType), {
    decode: SchemaGetter.transform((cell) => (cell === "" ? Option.none() : Option.some(cell))),
    encode: SchemaGetter.transform(Option.getOrElse(() => "" as const))
  })
)

/** `Legendary`: Python-style "True" / "False". */
const LegendaryCell = Schema.Literals(["True", "False"]).pipe(
  Schema.decodeTo(IsLegendary, {
    decode: SchemaGetter.transform((cell) => cell === "True"),
    encode: SchemaGetter.transform((legendary) => (legendary ? "True" : "False"))
  })
)

/**
 * One CSV row, as produced by a header-aware CSV parser:
 * `{ "#": "1", "Name": "Bulbasaur", "Type 1": "Grass", … }` ⇄ `Pokemon`.
 */
export const PokemonCsvRow = Schema.Struct({
  pokedexNumber: intCell(PokedexNumber),
  name: PokemonName,
  primaryType: PrimaryType,
  secondaryType: SecondaryTypeCell,
  total: intCell(StatTotal),
  hp: intCell(Hp),
  attack: intCell(Attack),
  defense: intCell(Defense),
  specialAttack: intCell(SpecialAttack),
  specialDefense: intCell(SpecialDefense),
  speed: intCell(Speed),
  generation: intCell(Generation),
  legendary: LegendaryCell
}).pipe(
  Schema.encodeKeys({
    pokedexNumber: "#",
    name: "Name",
    primaryType: "Type 1",
    secondaryType: "Type 2",
    total: "Total",
    hp: "HP",
    attack: "Attack",
    defense: "Defense",
    specialAttack: "Sp. Atk",
    specialDefense: "Sp. Def",
    speed: "Speed",
    generation: "Generation",
    legendary: "Legendary"
  }),
  Schema.decodeTo(Pokemon)
)
export type PokemonCsvRow = typeof PokemonCsvRow.Encoded
