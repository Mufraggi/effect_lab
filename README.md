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
pnpm dev
```

- Front : http://localhost:5173
- API : http://localhost:3001

## Les optics, et où les regarder

Les optics feuilles vivent dans `packages/shared/src/optics.ts` et **nulle part ailleurs**. Le back les compose sous son store, le front sous la liste en cache. C'est le point de l'article : un optic est une valeur, donc il se transporte et se recompose.

| Ce que ça montre | Où |
| --- | --- |
| Une table `[optic, lecteur]` qui applique un patch partiel — ajouter un champ = une ligne | `packages/shared/src/optics.ts` (`patchFields`) |
| `refine` pour adresser un post **par id**, sans index | `optics.ts` (`_postById`, `_titleById`) |
| Une traversal qui réécrit un tag sur toute la collection, **tag par tag** | `apps/api/src/repo.ts` (`retag`) |
| `flatten` : franchir **deux niveaux de tableau**, que `forEach` ne traverse pas | `optics.ts` (`flatten`, `_everyTag`) |
| `optionalKey` : écrire `undefined` **supprime** la clé | `optics.ts` (`reconcilePublication`) |
| L'optic comme **reducer optimiste** — il décrit où l'édition atterrit dans le cache | `apps/web/src/features/posts/posts.ts` |
| L'optic passé en **paramètre** : un helper, tous les champs, toutes les profondeurs | `apps/web/src/shared/opticField.ts` |
| Une table `[optic]` qui **rebase** un brouillon sur l'état serveur, champ par champ | `apps/web/src/shared/rebase.ts` + `features/posts/postDraft.ts` |
| Traversal sur **deux niveaux de tableau** imbriqués, et le filtre dans le chemin | `packages/exemple/src/optic/nestedTraversal.ts` |

> **`forEach` n'aplatit pas deux niveaux de tableau.** Sur un
> `Traversal<S, A[]>` il te redonne le tableau, pas l'élément : un `forEach`
> imbriqué compile et ne fait silencieusement rien. La cause est dans la
> signature — `forEach` prend `(iso) => Optional<A, B>`, et un `Optional` n'a
> qu'un seul focus. Aucun chaînage n'en sortira.
>
> Mais ce n'est pas un mur : **un lens vers un tableau *est* une traversal sur
> ses éléments** (c'est pourquoi `_tags`, un `Lens<Post, ReadonlyArray<string>>`,
> accepte `modifyAll((tag) => …)`). Il suffit donc de construire ce lens à la
> main — lire les feuilles dans l'ordre, les réécrire dans les mêmes
> emplacements. C'est `flatten` dans `optics.ts`, générique sur deux optics,
> valable pour les écritures qui préservent la longueur (ce que `modifyAll`
> fait). Les deux faces sont assertées : `optics.assert.ts` et
> `packages/exemple/src/optic/nestedTraversal.ts`.

## Scripts

| Commande         | Description                                  |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | lance api + web en parallèle (turbo)         |
| `pnpm build`     | build tous les packages/apps                 |
| `pnpm typecheck` | vérifie les types (dont les `.vue`)          |
| `pnpm test`      | assertions optics + tests HTTP in-memory     |

Les tests ne dépendent d'aucun runner : `packages/shared` assère le comportement des optics avec du Node nu, `apps/api` monte l'API en mémoire via `HttpApiTest` (pas de socket ouverte), `apps/web` assère la logique de rebase du brouillon — extraite des composants exprès pour être testable sans DOM.

> Pas de linter ni de formatter configuré pour l'instant. La tâche `lint` a été retirée de `turbo.json` : elle existait sans qu'aucun package ne définisse de script, donc `pnpm lint` sortait en succès sans rien vérifier.
