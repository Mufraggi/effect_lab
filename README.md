# effect_lab

Lab Effect pour les articles. Monorepo [Turborepo](https://turbo.build) + pnpm, sur **Effect 4**.

Le premier article de la série porte sur `Optic`. Ce repo en est la démonstration exécutable : chaque affirmation de l'article correspond à du code qui tourne et à une assertion qui le vérifie.

## Structure

- `packages/shared` — le domaine partagé : schémas `effect/Schema`, contrat `HttpApi`, **et les optics**
- `apps/api` — backend Effect (`effect/http-api`), état dans un `Ref` au sein d'un service
- `apps/web` — frontend Vite + Vue 3 (`@effect/atom-vue`, proxy `/api` vers le back)
- `packages/exemple` — snippets isolés pour l'article

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
| Une traversal qui réécrit un tag sur toute la collection | `apps/api/src/repo.ts` (`retag`) |
| Le filtre **dans le chemin** (`_draftVisibility`) | `optics.ts` |
| `optionalKey` : écrire `undefined` **supprime** la clé | `optics.ts` (`reconcilePublication`) |
| L'optic comme **reducer optimiste** — il décrit où l'édition atterrit dans le cache | `apps/web/src/posts.ts` |
| L'optic passé en **paramètre** : un helper, tous les champs, toutes les profondeurs | `apps/web/src/opticField.ts` |

## Scripts

| Commande         | Description                                  |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | lance api + web en parallèle (turbo)         |
| `pnpm build`     | build tous les packages/apps                 |
| `pnpm typecheck` | vérifie les types (dont les `.vue`)          |
| `pnpm test`      | assertions optics + tests HTTP in-memory     |

Les tests ne dépendent d'aucun runner : `packages/shared` assère le comportement des optics avec du Node nu, `apps/api` monte l'API en mémoire via `HttpApiTest` (pas de socket ouverte).

> Pas de linter ni de formatter configuré pour l'instant. La tâche `lint` a été retirée de `turbo.json` : elle existait sans qu'aucun package ne définisse de script, donc `pnpm lint` sortait en succès sans rien vérifier.
