/**
 * Runs the article's queries against the imported Pokémon tables.
 *
 *   pnpm --filter @effect_lab/scripts query:pokemon
 */
import { Console, Effect } from "effect"
import { speciesWithForms, statsByType, strongestTypePairs } from "../pokemon/queries.js"
import { runScript } from "../run.js"

const program = Effect.gen(function* () {
  yield* Console.log("Stats moyennes par type")
  yield* Console.table(yield* statsByType)

  yield* Console.log("Meilleures combinaisons de deux types (total moyen)")
  yield* Console.table(yield* strongestTypePairs(10))

  const forms = yield* speciesWithForms
  yield* Console.log(`${forms.length} espèces ont plusieurs formes, par exemple :`)
  yield* Console.table(forms.slice(0, 10).map((s) => ({ "#": s.pokedexNumber, formes: s.forms.join(", ") })))
})

runScript(program)
