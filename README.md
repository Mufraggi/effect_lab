# effect_lab

Lab Effect pour les articles. Monorepo [Turborepo](https://turbo.build) + pnpm.

## Structure

- `apps/api` — backend avec [Effect](https://effect.website) (`@effect/platform` + `HttpApi`)
- `apps/web` — frontend Vite + Vue 3 (proxy `/api` vers le back)
- `packages/shared` — schémas `effect/Schema` partagés entre back et front

## Démarrage

```sh
pnpm install
pnpm dev
```

- Front : http://localhost:5173
- API : http://localhost:3001 (`GET /posts`, `GET /posts/{id}`)

## Scripts

| Commande         | Description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | lance api + web en parallèle (turbo) |
| `pnpm build`     | build tous les packages/apps         |
| `pnpm typecheck` | vérifie les types                    |

> Note : Effect 4 vient de sortir mais `@effect/platform` compatible n'est pas encore publié en stable ; le repo est donc sur le set stable `effect@3.22` / `@effect/platform@0.97`.
