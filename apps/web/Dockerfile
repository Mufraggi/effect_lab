# syntax=docker/dockerfile:1

# Image du front : le bundle Vite servi en statique par nginx, qui proxifie
# `/api` et `/eventlog` vers l'API — exactement ce que fait le proxy de
# `vite.config.ts` en développement.
#
# Le contexte de build est la **racine du monorepo**, pas `apps/web` :
#   docker build -f apps/web/Dockerfile .

# --- build ---------------------------------------------------------------
FROM ghcr.io/voidzero-dev/vite-plus:latest AS manifests
WORKDIR /app
# Les manifestes seuls : la couche d'install reste en cache tant que les
# dépendances ne bougent pas. pnpm a besoin de tous ceux du workspace pour
# résoudre le lockfile — ajouter un package se corrige ici.
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version* ./
COPY --chown=vp:vp apps/api/package.json apps/api/
COPY --chown=vp:vp apps/web/package.json apps/web/
COPY --chown=vp:vp packages/shared/package.json packages/shared/
COPY --chown=vp:vp packages/exemple/package.json packages/exemple/

FROM ghcr.io/voidzero-dev/vite-plus:latest AS build
WORKDIR /app
COPY --from=manifests --chown=vp:vp /app ./
RUN vp install --frozen-lockfile

COPY --chown=vp:vp . .

# Le script `build` d'`apps/web` est `vue-tsc --noEmit && vite build` : l'image
# ne peut donc pas se construire sur un front qui ne type-check pas.
RUN vp exec turbo build --filter @effect_lab/web

# --- runtime -------------------------------------------------------------
# Un site statique n'a pas besoin de Node : nginx suffit, et l'image livrée
# ne contient aucun JavaScript exécuté côté serveur.
FROM nginx:alpine AS runtime

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# L'entrypoint de `nginx:alpine` passe les fichiers de `templates/` à envsubst
# au démarrage : `${API_UPSTREAM}` est donc résolu au `docker run`, pas au
# build. Les variables nginx (`$uri`, `$http_upgrade`…) ne sont pas dans
# l'environnement, donc envsubst ne les touche pas.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template

# Surchargeables : `docker run -e API_UPSTREAM=mon-api:3001`.
# `DNS_RESOLVER` est le résolveur interne de Docker ; sous Kubernetes, le
# pointer sur le DNS du cluster.
ENV API_UPSTREAM=api:3001
ENV DNS_RESOLVER=127.0.0.11

EXPOSE 80
