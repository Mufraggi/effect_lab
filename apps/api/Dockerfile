# syntax=docker/dockerfile:1

# Image de l'API : le serveur HTTP (`effect/http-api`) et le serveur de synchro
# EventLog (WebSocket, `/eventlog`), tous deux sur le port 3001.
#
# Le contexte de build est la **racine du monorepo**, pas `apps/api` : l'API
# dépend de `packages/shared`, et pnpm a besoin du lockfile et du
# `pnpm-workspace.yaml` de la racine pour résoudre quoi que ce soit.
#
#   docker build -f apps/api/Dockerfile .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Corepack lit le champ `packageManager` du manifeste : la version de pnpm
# n'est donc pas répétée ici, elle ne peut pas diverger de celle du repo.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- manifests -----------------------------------------------------------
# Les seuls manifestes, isolés dans leur propre étage pour être repris par
# `build` et `deps` sans dupliquer la liste. pnpm résout le lockfile à partir
# de *tous* ceux du workspace, pas seulement celui de la racine — ajouter un
# package se corrige donc ici, à un seul endroit.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/exemple/package.json packages/exemple/

# --- build ---------------------------------------------------------------
FROM base AS build

# Les manifestes d'abord : cette couche d'install est réutilisée tant que les
# dépendances ne changent pas, quel que soit le nombre de commits sur la source.
COPY --from=manifests /app ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

# Le build passe par turbo, filtré sur l'API : son `dependsOn: ["^build"]`
# construit `packages/shared` avant elle.
RUN pnpm turbo build --filter @effect_lab/api

# --- deps ----------------------------------------------------------------
# Un install `--prod` **neuf**, dans son propre étage. Relancer `--prod`
# par-dessus l'install complet ci-dessus ne purgerait pas les devDependencies
# déjà posées : turbo et typescript finiraient dans l'image livrée. Le `...`
# prend l'API *et ses dépendances*, ce qui écarte `vue` & co. d'`apps/web` et
# tout `packages/exemple`.
FROM base AS deps
COPY --from=manifests /app ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter "@effect_lab/api..."

# --- runtime -------------------------------------------------------------
# Node seul : ni pnpm, ni turbo, ni toolchain.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# L'arborescence pnpm est recopiée telle quelle. Ses liens symboliques sont
# relatifs et internes à `/app` — `apps/api/node_modules/effect` pointe vers
# `node_modules/.pnpm/…`, et `@effect_lab/shared` vers `packages/shared`.
# Conserver la structure fait que la résolution se comporte à l'identique du
# build ; l'aplatir casserait les deux.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=build /app/package.json ./
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
# `@effect_lab/shared` est un lien vers ce dossier : son `dist` doit suivre,
# sinon l'import se résout sur un `exports` qui ne pointe sur rien.
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

USER node
EXPOSE 3001

# `DATABASE_URL` est attendu dans l'environnement (voir `.env.example`) : c'est
# le Postgres du serveur EventLog. Le `Config.Redacted` d'`apps/api/src/db.ts`
# fait échouer la construction des layers s'il manque — le process ne sert
# jamais une requête avec une base absente.
CMD ["node", "apps/api/dist/server.js"]
