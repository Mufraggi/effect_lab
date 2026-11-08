# @effect_lab/scripts

Scripts d'import ponctuels, lancés à la main contre la base de l'API
(`DATABASE_URL`, lu depuis le `.env` racine).

- `src/run.ts` — `runScript(program)` : fournit la base (`DbLive` de
  `@effect_lab/db`, migrée avant le programme) et lance le programme.
- `src/pokemon/schema.ts` — Schemas du CSV Pokémon : un type brandé par
  colonne, `Pokemon` (domaine) et `PokemonCsvRow` (ligne CSV ⇄ `Pokemon`).
- `src/pokemon/repo.ts` — `insertBatch` : un lot de `Pokemon` dans les tables.
- `src/pokemon/queries.ts` — les requêtes de lecture, décodées en types brandés.
- `src/imports/<nom>.ts` — un fichier par import.
- `src/queries/<nom>.ts` — un fichier par lot de requêtes à afficher.

## Modèle Pokémon

Le CSV est dénormalisé, la base ne l'est pas :

| Table             | Une ligne par…              | Clé naturelle (upsert)   |
| ----------------- | --------------------------- | ------------------------ |
| `pokemon_species` | numéro de Pokédex           | `pokedex_number`         |
| `pokemon`         | ligne du CSV (une forme)    | `name`                   |
| `pokemon_types`   | type d'une forme (slot 1/2) | `(pokemon_id, slot)`     |

Les tables viennent de la migration `0002_pokemon` de `packages/db`.
`total` est une colonne générée (somme des six stats), et les types sont un
enum Postgres `pokemon_type`. L'import passe dans une seule transaction, par
lots de 100 (`Stream.grouped` → `Stream.mapEffect(insertBatch)`), et peut être
relancé sans effet.

Pour lire un CSV distant, pas de client maison : le `HttpClient` d'Effect
donne le corps de la réponse en flux d'octets, qu'on fait passer dans le
channel `Csv.decodeSchema` d'`effect/encoding`.

```ts
const pokemons = client.get(url).pipe(
  HttpClientResponse.stream,
  Stream.pipeThroughChannel(
    Csv.decodeSchema(PokemonCsvRow)({ headers: true, ignoreEmptyLines: true, disableCodecs: true })
  )
)
```

`disableCodecs: true` : `PokemonCsvRow` décode déjà depuis des chaînes
("45" → `Hp`, "" → `None`, "True" → `true`), `Csv` ne doit pas ajouter ses
propres conversions.

## Lancer

```sh
docker compose up -d postgres   # DATABASE_URL dans le .env racine
pnpm --filter @effect_lab/scripts import:pokemon
pnpm --filter @effect_lab/scripts query:pokemon
# ou n'importe quel fichier :
pnpm --filter @effect_lab/scripts import src/imports/<nom>.ts
```

## Ajouter un import

Écrire le programme dans `src/imports/<nom>.ts` (avec `runScript` s'il a
besoin de la base ; ses tables éventuelles vont dans une migration de
`packages/db`), et ajouter un raccourci `import:<nom>` dans
`package.json` si on le relance souvent.
