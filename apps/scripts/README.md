# @effect_lab/scripts

Scripts ponctuels, lancés à la main contre la base de l'API (`DATABASE_URL`,
lu depuis le `.env` racine).

- `src/run.ts` — `runScript(program)` : fournit la base (`DbLive` de
  `@effect_lab/db`, migrée avant le programme), un client HTTP et les services
  Node (`FileSystem`, `Path`, …), puis lance le programme.
- `src/pokemon/schema.ts` — Schemas du CSV Pokémon : un type brandé par
  colonne, `Pokemon` (domaine) et `PokemonCsvRow` (ligne CSV ⇄ `Pokemon`).
- `src/pokemon/repo.ts` — `insertBatch` : un lot de `Pokemon` dans les tables.
- `src/pokemon/queries.ts` — toutes les lectures, décodées en types brandés :
  les requêtes analytiques et `allPokemon`, le flux qui reconstitue une ligne
  de CSV.
- `src/imports/<nom>.ts` — un fichier par import.
- `src/exports/<nom>.ts` — un fichier par export.
- `src/queries/<nom>.ts` — un fichier par lot de requêtes à afficher.

## Modèle Pokémon

Le CSV est dénormalisé, la base ne l'est pas :

| Table             | Une ligne par…              | Clé naturelle (upsert) |
| ----------------- | --------------------------- | ---------------------- |
| `pokemon_species` | numéro de Pokédex           | `pokedex_number`       |
| `pokemon`         | ligne du CSV (une forme)    | `name`                 |
| `pokemon_types`   | type d'une forme (slot 1/2) | `(pokemon_id, slot)`   |

Les tables viennent de la migration `0002_pokemon` de `packages/db`.
`total` est une colonne générée (somme des six stats), et les types sont un
enum Postgres `pokemon_type`. L'import passe dans une seule transaction, par
lots de 100 (`Stream.grouped` → `Stream.mapEffect(insertBatch)`), et peut être
relancé sans effet.

Pour lire un CSV distant, pas de client maison : le `HttpClient` d'Effect
donne le corps de la réponse en flux d'octets, qu'on fait passer dans le
channel `Csv.decodeSchema` d'`effect/encoding`.

```ts
const pokemons = client
  .get(url)
  .pipe(
    HttpClientResponse.stream,
    Stream.pipeThroughChannel(
      Csv.decodeSchema(PokemonCsvRow)({ headers: true, ignoreEmptyLines: true, disableCodecs: true })
    )
  )
```

`disableCodecs: true` : `PokemonCsvRow` décode déjà depuis des chaînes
("45" → `Hp`, "" → `None`, "True" → `true`), `Csv` ne doit pas ajouter ses
propres conversions.

## Régénérer le CSV depuis la base

`export:pokemon` fait le chemin inverse, et il est court parce que
`PokemonCsvRow` marche déjà dans les deux sens : les en-têtes viennent de son
`Schema.encodeKeys`, les cellules de ses encodeurs (`""` pour un `Type 2`
absent, `True`/`False` pour `Legendary`). Aucun second schéma, et pas de liste
de colonnes — `Csv.encodeSchema` les lit sur le schéma, dans l'ordre de
déclaration.

```ts
allPokemon.pipe(
  Stream.pipeThroughChannel(Csv.encodeSchema(PokemonCsvRow)({ headers: true, newline: "\n", disableCodecs: true })),
  Stream.run(fs.sink(output))
)
```

`newline: "\n"` : `Csv` défaute à CRLF (RFC 4180) et la source est en LF.

Rien n'est mis en mémoire des deux côtés : `allPokemon` lit sur un curseur
Postgres (`sql`…`.stream`), et les octets partent dans `FileSystem.sink` au
fur et à mesure. `ORDER BY p.id` restitue l'ordre du CSV d'origine — `id` est
un `SERIAL` distribué dans l'ordre d'insertion.

D'où une vérification de bout en bout : le fichier régénéré doit être
**identique** à la source, octet pour octet.

```sh
curl -s https://gist.githubusercontent.com/armgilles/194bcff35001e7eb53a2a8b441e8b2c6/raw/pokemon.csv \
  > /tmp/pokemon-source.csv
diff /tmp/pokemon-source.csv exports/pokemon.csv
```

## Lancer

```sh
docker compose up -d postgres   # DATABASE_URL dans le .env racine
pnpm --filter @effect_lab/scripts import:pokemon
pnpm --filter @effect_lab/scripts export:pokemon            # → exports/pokemon.csv
pnpm --filter @effect_lab/scripts export:pokemon /tmp/p.csv # ou ailleurs
pnpm --filter @effect_lab/scripts query:pokemon
# ou n'importe quel fichier :
pnpm --filter @effect_lab/scripts import src/imports/<nom>.ts
```

`exports/` est gitignoré.

## Ajouter un import ou un export

Écrire le programme dans `src/imports/<nom>.ts` ou `src/exports/<nom>.ts`
(avec `runScript` s'il a besoin de la base ou du disque ; ses tables
éventuelles vont dans une migration de `packages/db`), et ajouter un raccourci
`import:<nom>` / `export:<nom>` dans `package.json` si on le relance souvent.
Les requêtes vont dans `src/pokemon/queries.ts` (ou l'équivalent du domaine),
pas dans le script.
