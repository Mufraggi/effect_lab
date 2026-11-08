# @effect_lab/db

La base Postgres de tout le repo : le client (`SqlLive`, depuis `DATABASE_URL`)
et les migrations, avec `effect/sql/Migrator`. L'API et `apps/scripts` en
dépendent.

- `src/client.ts` — `SqlLive`.
- `src/migrations/<id>_<nom>.ts` — une migration = un module dont l'export par
  défaut est un `Effect` qui demande `SqlClient`.
- `src/migrate.ts` — `loader` (`Migrator.fromRecord`), `migrate` et `DbLive`.
- `src/bin/migrate.ts` — la commande de dev `db:migrate`.
- `schema/_schema.sql` — le schéma complet après migration (généré, commité).

## Au démarrage

`DbLive` = `SqlLive` + `migrate`. Qui dépend de `DbLive` n'obtient `SqlClient`
qu'une fois les migrations en attente appliquées. Les migrations passent dans une
transaction, après un `LOCK TABLE effect_sql_migrations` : deux instances de
l'API qui démarrent ensemble ne migrent pas en double. L'historique est dans
`effect_sql_migrations`.

Les tables du journal EventLog (`effect_events*`, `effect_remote_id`) ne
passent pas par ici : `SqlEventLogServerUnencrypted.layerStorage()` les crée
lui-même.

## En dev

```sh
pnpm --filter @effect_lab/db db:migrate
```

`PgMigrator.run` avec `schemaDirectory` : il applique les migrations, puis
réécrit `schema/_schema.sql` via `pg_dump` (seulement si une migration a été
appliquée). Il faut donc `pg_dump` installé, dans une version ≥ celle du serveur
(17). Les lignes `\restrict <clé aléatoire>` que pg_dump ≥ 17.6 ajoute à chaque
dump sont retirées, pour que le fichier ne change pas d'un dump à l'autre.

## Ajouter une migration

1. `src/migrations/0003_<nom>.ts`, avec un `Effect` en export par défaut.
2. Une ligne dans `loader` (`src/migrate.ts`).
3. `db:migrate`, puis commiter `schema/_schema.sql` avec la migration.

Une migration appliquée ne se modifie plus : on corrige avec la suivante.
0001 et 0002 gardent leurs `IF NOT EXISTS`, parce qu'elles reprennent des
tables que l'API et le script d'import créaient eux-mêmes avant le Migrator.
