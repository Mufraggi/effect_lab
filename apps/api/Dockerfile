# syntax=docker/dockerfile:1

# Image de l'API : le serveur HTTP (`effect/http-api`) et le serveur de synchro
# EventLog (WebSocket, `/eventlog`), tous deux sur le port 3001.
#
# Le contexte de build est la **racine du monorepo**, pas `apps/api` : l'API
# dépend de `packages/shared`, et pnpm a besoin du lockfile et du
# `pnpm-workspace.yaml` de la racine pour résoudre quoi que ce soit.
#   docker build -f apps/api/Dockerfile .

# --- manifests -----------------------------------------------------------
# Les seuls manifestes, isolés dans leur propre étage pour être repris par
# `build` et `deps` sans dupliquer la liste. pnpm résout le lockfile à partir
# de *tous* ceux du workspace, pas seulement celui de la racine — ajouter un
# package se corrige donc ici, à un seul endroit.
#
# L'image officielle Vite+ provisionne elle-même le Node de `.node-version`,
# d'où l'absence de tag versionné par Node.
FROM ghcr.io/voidzero-dev/vite-plus:latest AS manifests
WORKDIR /app
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version* ./
COPY --chown=vp:vp apps/api/package.json apps/api/
COPY --chown=vp:vp apps/web/package.json apps/web/
COPY --chown=vp:vp packages/shared/package.json packages/shared/
COPY --chown=vp:vp packages/exemple/package.json packages/exemple/

# --- build ---------------------------------------------------------------
FROM ghcr.io/voidzero-dev/vite-plus:latest AS build
WORKDIR /app

# Les manifestes d'abord : cette couche d'install est réutilisée tant que les
# dépendances ne changent pas, quel que soit le nombre de commits sur la source.
COPY --from=manifests --chown=vp:vp /app ./
RUN vp install --frozen-lockfile

COPY --chown=vp:vp . .

# `vp build` lancerait le built-in (vite build) : ce n'est pas ce que veut ce
# repo. Le build du monorepo passe par turbo, filtré sur l'API — son
# `dependsOn: ["^build"]` construit `packages/shared` avant elle.
RUN vp exec turbo build --filter @effect_lab/api

# Le binaire Node exact résolu depuis `.node-version`, pour l'étage runtime.
RUN cp "$(vp env which node | head -1)" /tmp/node

# --- deps ----------------------------------------------------------------
# Un install `--prod` **neuf**, dans son propre étage. Relancer `--prod`
# par-dessus l'install complet ci-dessus ne purgerait pas les
# devDependencies déjà posées : la toolchain vite-plus finirait dans l'image
# livrée. Le filtre limite l'arbre à l'API et à `shared`, ce qui écarte
# `vue` & co. de `apps/web`.
FROM ghcr.io/voidzero-dev/vite-plus:latest AS deps
WORKDIR /app
COPY --from=manifests --chown=vp:vp /app ./
RUN vp install --frozen-lockfile --prod \
  --filter @effect_lab/api \
  --filter @effect_lab/shared

# --- runtime -------------------------------------------------------------
# Node seul : ni vp, ni gestionnaire de paquets, ni toolchain.
FROM debian:bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Le Node officiel (build signé) résolu au moment du build.
COPY --from=build /tmp/node /usr/local/bin/node

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

USER nobody
EXPOSE 3001

# `DATABASE_URL` est attendu dans l'environnement (voir `.env.example`) :
# c'est le Postgres du serveur EventLog.
CMD ["node", "apps/api/dist/server.js"]
