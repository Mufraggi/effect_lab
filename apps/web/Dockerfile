# syntax=docker/dockerfile:1

# Image du front : le bundle Vite servi en statique par nginx, qui proxifie
# `/api` et `/eventlog` vers l'API — exactement ce que fait le proxy de
# `apps/web/vite.config.ts` en développement.
#
# Le front n'a aucune variable de build : l'URL d'API est le relatif `/api` et
# l'URL WebSocket est dérivée de `location.host`. Tout est donc same-origin, et
# ce qui sert le bundle *doit* proxifier les deux routes — d'où nginx.
#
# Le contexte de build est la **racine du monorepo**, pas `apps/web` :
#
#   docker build -f apps/web/Dockerfile .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- manifests -----------------------------------------------------------
# Les manifestes seuls : la couche d'install reste en cache tant que les
# dépendances ne bougent pas. pnpm a besoin de tous ceux du workspace pour
# résoudre le lockfile — ajouter un package se corrige ici.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/exemple/package.json packages/exemple/

# --- build ---------------------------------------------------------------
FROM base AS build
COPY --from=manifests /app ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

# Le script `build` d'`apps/web` est `vue-tsc --noEmit && vite build` : l'image
# ne peut donc pas se construire sur un front qui ne type-check pas.
RUN pnpm turbo build --filter @effect_lab/web

# --- runtime -------------------------------------------------------------
# Un site statique n'a pas besoin de Node : nginx suffit, et l'image livrée ne
# contient aucun JavaScript exécuté côté serveur.
FROM nginx:alpine AS runtime

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# L'entrypoint de `nginx:alpine` passe les fichiers de `templates/` à envsubst
# au démarrage, en ne substituant que les variables **présentes dans
# l'environnement** : `${API_UPSTREAM}` est donc résolu au `docker run`, pas au
# build, et les variables nginx (`$uri`, `$http_upgrade`…) sont laissées
# intactes puisqu'aucune variable d'environnement ne porte ces noms.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template

# Surchargeables : `docker run -e API_UPSTREAM=mon-api:3001`.
# `DNS_RESOLVER` est le résolveur interne de Docker ; sous Kubernetes, le
# pointer sur le DNS du cluster.
ENV API_UPSTREAM=api:3001
ENV DNS_RESOLVER=127.0.0.11

EXPOSE 80
