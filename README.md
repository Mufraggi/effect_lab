# effect_lab

Lab Effect pour les articles. Monorepo [Turborepo](https://turbo.build) + pnpm, sur **Effect 4**.

Le premier article de la série porte sur `Optic`. Ce repo en est la démonstration exécutable : chaque affirmation de l'article correspond à du code qui tourne et à une assertion qui le vérifie.

## Structure

- `packages/shared` — le domaine partagé : schémas `effect/Schema`, contrat `HttpApi`, **et les optics**
- `apps/api` — backend Effect (`effect/http-api`), état dans un `Ref` au sein d'un service
- `apps/web` — frontend Vite + Vue 3 (`@effect/atom-vue`, proxy `/api` vers le back)
- `packages/exemple` — snippets isolés pour l'article

Le front est organisé en **vertical slices** : une route = un dossier autonome.
Ajouter un exemple = un dossier sous `features/` et une entrée dans le router.

```
apps/web/src/
  app/                  shell + router
  features/
    posts/              optics sur l'état serveur (atom, optimiste)
  shared/               helpers transverses (opticField, useMutation)
```

Les routes sont chargées à la demande, donc la frontière de slice est aussi
celle du bundle : une slice ne coûte que ce qu'elle vaut à qui y navigue.

## Démarrage

```sh
pnpm install
cp .env.example .env    # DATABASE_URL du serveur EventLog
docker compose up -d    # Postgres
pnpm dev
```

- Front : http://localhost:5173
- API : http://localhost:3001
- Serveur EventLog (WebSocket) : ws://localhost:3001/eventlog, sur le même serveur que l'API, proxifié par Vite sous `/eventlog`

## EventLog : la todo-list hors ligne

La page `/todos` fait tourner deux clients EventLog complets, Alice et Bob : chacun a son identité, son journal IndexedDB et son WebSocket. Le bouton « Passer hors ligne » ferme le scope qui tient la connexion, et la reconnexion envoie ce qui a été écrit entre-temps.

| Ce que ça montre | Où |
| --- | --- |
| Les events, la projection, la résolution des conflits (dernier écrivain gagne par champ, comparé sur l'id d'entrée, et marqueurs de suppression) | `packages/shared/src/todos/` (contrat) et `apps/web/src/features/todos/` (projection, handlers) |
| Le serveur de synchro, persistant dans Postgres (une seule instance), monté sur le routeur HTTP de l'API | `apps/api/src/features/todos/eventlog.ts` |
| En ligne = un atom qui tient le remote ; une factory d'atoms par utilisateur | `apps/web/src/features/todos/todoClient.ts` |
| La recherche, sourcée dans le code d'effect 4.0.2 | `docs/research/effect-v4-eventlog.md` |

## Les optics, et où les regarder

Les optics feuilles vivent dans `packages/shared/src/optics.ts` et **nulle part ailleurs**. Le back les compose sous son store, le front sous la liste en cache. C'est le point de l'article : un optic est une valeur, donc il se transporte et se recompose.

| Ce que ça montre | Où |
| --- | --- |
| Une table `[optic, lecteur]` qui applique un patch partiel — ajouter un champ = une ligne | `packages/shared/src/optics.ts` (`patchFields`) |
| `refine` pour adresser un post **par id**, sans index | `optics.ts` (`_postById`, `_titleById`) |
| Une traversal qui réécrit un tag sur toute la collection, **tag par tag** | `apps/api/src/features/posts/repo.ts` (`retag`) |
| `flatten` : franchir **deux niveaux de tableau**, que `forEach` ne traverse pas | `optics.ts` (`flatten`, `_everyTag`) |
| `optionalKey` : écrire `undefined` **supprime** la clé | `optics.ts` (`reconcilePublication`) |
| L'optic comme **reducer optimiste** — il décrit où l'édition atterrit dans le cache | `apps/web/src/features/posts/posts.ts` |
| L'optic passé en **paramètre** : un helper, tous les champs, toutes les profondeurs | `apps/web/src/shared/opticField.ts` |
| Une table `[optic]` qui **rebase** un brouillon sur l'état serveur, champ par champ | `apps/web/src/shared/rebase.ts` + `features/posts/postDraft.ts` |
| Traversal sur **deux niveaux de tableau** imbriqués, et le filtre dans le chemin | `packages/exemple/src/optic/nestedTraversal.ts` |
| Un optic qui **échoue à focaliser** : `check`, `getResult`, et l'`Issue` partagée avec `Schema` | `packages/exemple/src/optic/validated.ts` |

> **`forEach` n'aplatit pas deux niveaux de tableau.** Sur un
> `Traversal<S, A[]>` il te redonne le tableau, pas l'élément : un `forEach`
> imbriqué compile et ne fait silencieusement rien. La cause est dans la
> signature — `forEach` prend `(iso) => Optional<A, B>`, et un `Optional` n'a
> qu'un seul focus. Aucun chaînage n'en sortira.
>
> **Un optic peut échouer à focaliser, et l'échec est une valeur `Schema`.**
> C'est ce qui distingue `Optic` de Monocle : `getResult` renvoie un
> `Result<A, SchemaIssue.Issue>`, et cette `Issue` est exactement celle qu'un
> décodage `Schema` raté produit — même type, même formatter. Attention au
> piège : la moitié agréable de l'API (`get`, `replace`) avale l'échec.
> `replace` à travers un optic qui ne focalise pas te **rend l'original, sans
> un mot**. Démontré dans `packages/exemple/src/optic/validated.ts`.

> Mais ce n'est pas un mur : **un lens vers un tableau *est* une traversal sur
> ses éléments** (c'est pourquoi `_tags`, un `Lens<Post, ReadonlyArray<string>>`,
> accepte `modifyAll((tag) => …)`). Il suffit donc de construire ce lens à la
> main — lire les feuilles dans l'ordre, les réécrire dans les mêmes
> emplacements. C'est `flatten` dans `optics.ts`, générique sur deux optics,
> valable pour les écritures qui préservent la longueur (ce que `modifyAll`
> fait). Les deux faces sont assertées : `optics.assert.ts` et
> `packages/exemple/src/optic/nestedTraversal.ts`.

## Scripts

| Commande             | Description                                       |
| -------------------- | ------------------------------------------------- |
| `pnpm dev`           | lance api + web en parallèle (turbo)              |
| `pnpm build`         | build tous les packages/apps                      |
| `pnpm typecheck`     | vérifie les types (dont les `.vue`)               |
| `pnpm test`          | assertions optics + tests HTTP in-memory          |
| `pnpm check`         | format + lint + types des `.ts` — ce que lance la CI |
| `pnpm lint`          | lint seul (oxlint)                                   |
| `pnpm format`        | reformate (oxfmt)                                    |
| `pnpm format:check`  | vérifie le format sans écrire, sans lint ni types    |

Les tests ne dépendent d'aucun runner : `packages/shared` assère le comportement des optics avec du Node nu, `apps/api` monte l'API en mémoire via `HttpApiTest` (pas de socket ouverte), `apps/web` assère la logique de rebase du brouillon — extraite des composants exprès pour être testable sans DOM.

## Lint, format et types

Le repo passe par [Vite+](https://viteplus.dev) (`vp`, installé en
devDependency) pour le lint et le format. `vp check` enchaîne oxfmt, oxlint et
le type-check des `.ts` en une passe. Toute la configuration tient dans le
bloc `fmt` / `lint` de `vite.config.ts` à la racine — Vite+ **ignore** les
configs imbriquées, donc un bloc dans un package ne serait pas appliqué.

Deux choix méritent leur explication :

- **`vue-tsc` reste la référence sur `apps/web`.** Le type-check de `vp check`
  passe par tsgolint, qui ne lit pas les SFC `.vue`. Sans la tâche
  `turbo typecheck`, les composants ne seraient vérifiés par personne. La CI
  lance donc les deux.
- **Les tables d'assertions portent un `// prettier-ignore`.** Le formateur
  éclate `["nom", () => {…}]` en quatre lignes, ce qui triple la hauteur des
  tables `[optic, lecteur]` qui sont le propos de ce repo. L'ignore est posé
  sur la déclaration entière : le reste du fichier est formaté normalement.
  Sans lui, l'adoption du formateur réécrivait ~1900 lignes au lieu de ~420.

Le markdown est exclu du formatage : sur les tableaux de `docs/research/`,
l'alignement des cellules par padding produit des lignes de 400 colonnes.

## CI et images Docker

`.github/workflows/ci.yml`, sur chaque PR et chaque push sur `main` :

1. `vp check` — format, lint, types des `.ts`
2. `vp run typecheck` — `vue-tsc`, pour les `.vue`
3. `vp run build` puis `vp run test`
4. deux images Docker, construites puis poussées sur ghcr.io

L'installation passe par l'action officielle `voidzero-dev/setup-vp`, qui
apporte vp, le Node de `.node-version`, le pnpm de `packageManager` et le
cache du store — elle remplace `setup-node` et `pnpm/action-setup`.

| Image | Contenu |
| --- | --- |
| `ghcr.io/<owner>/effect_lab-api` | l'API Effect + le serveur de synchro EventLog, port 3001 |
| `ghcr.io/<owner>/effect_lab-web` | le bundle Vite servi par nginx, port 80 |

Les deux se construisent **depuis la racine du monorepo**, pas depuis leur
dossier : elles ont besoin du lockfile et de `packages/shared`.

```sh
docker build -f apps/api/Dockerfile -t effect_lab-api .
docker build -f apps/web/Dockerfile -t effect_lab-web .
```

L'image web reproduit le proxy de développement : `/api` est transmis à l'API
sans son préfixe, et `/eventlog` tel quel, avec l'`Upgrade` WebSocket.
L'upstream se règle à l'exécution — `-e API_UPSTREAM=mon-api:3001`. La
résolution DNS est volontairement différée à la requête : nginx démarre et
sert le SPA même quand l'API est absente, au lieu de refuser de démarrer.

Les deux images câblées ensemble, avec Postgres :

```sh
OWNER=<ton-compte> docker compose -f docker-compose.prod.yml up -d
# http://localhost:8080
```

`docker-compose.yml` (sans suffixe) reste le Postgres seul, pour le dev.

> Sur une pull request les images sont construites mais **pas** publiées :
> le Dockerfile est validé, et seul `main` écrit dans le registre.
