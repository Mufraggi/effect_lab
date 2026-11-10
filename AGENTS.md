<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Lint et format : Oxlint et oxfmt

Biome a été retiré. Deux binaires le remplacent, parce qu'Oxlint ne formate
pas :

- **lint** — Oxlint, config dans `.oxlintrc.json`. Il porte à la fois le lint
  généraliste (ce que faisait Biome) et les règles type-aware d'Effect, via
  le plugin `effecttsgo`.
- **format** — oxfmt, config dans `.oxfmtrc.json`.

Les deux configs tiennent à la racine et nulle part ailleurs : pas de config
par package, pas de tâche `lint` dans `turbo.json` (les deux parcourent le
workspace eux-mêmes, et la tâche recréerait le no-op qui avait justifié son
retrait).

- `pnpm lint` / `pnpm format` séparément, `pnpm check` corrige les deux sur
  place.
- `pnpm format:check` est la vérification de format sans écriture, celle que
  la CI lance en premier.

Attention à l'ordre : **le lint est type-aware**, donc il a besoin du `dist/`
des packages, exactement comme `pnpm typecheck` (voir « Build avant typecheck
— et avant le lint » plus bas). En local ça ne se voit pas, `dist/` traîne.
En CI le lint vient après le build, et il ne faut pas le remonter.

Le lint passe par `effect-tsgo oxlint`, **jamais** par `oxlint` nu : le
plugin `effecttsgo` n'existe que dans le binding patché que fournit
`effect-tsgo`, et un `oxlint` nu sort en erreur sur `.oxlintrc.json` (code 1,
"Unknown plugin"). Ça vaut aussi pour une extension d'éditeur qui lancerait
le binaire d'origine ; pour ce cas il existe `effect-tsgo patch`, qui réécrit
`node_modules` et n'est pas appliqué ici.

Les versions d'oxfmt, d'Oxlint, d'`oxlint-tsgolint` et de `@effect/tsgo` sont
épinglées **exactes**, pour deux raisons distinctes. Celle d'oxfmt parce que
la sortie d'un formatteur peut changer en minor et repeindre le repo au
prochain `pnpm install` — d'autant qu'oxfmt est en 0.x. Celles des trois
autres parce que `@effect/tsgo` déclare une liste fermée de versions qu'il
sait patcher (ici Oxlint 1.88→1.92, tsgolint 7.0.2004→7.0.2006) ; monter
l'une des trois veut dire vérifier le tableau du README de `@effect/tsgo`.

Les désactivations délibérées, chacune commentée sur place. Ne pas les
retirer sans lire le commentaire :

- Les catégories `suspicious`, `pedantic` et `style` (`.oxlintrc.json`) —
  `suspicious` active `no-underscore-dangle`, frontalement incompatible avec
  `_tag` (le discriminant d'Effect) et avec la convention de nommage des
  optics. Elle produisait 18 signalements, tous faux.
- `effecttsgo/any-unknown-in-error-context` (`.oxlintrc.json`) — les
  catégories d'Oxlint ne distinguent pas les plugins, donc `correctness`
  promeut aussi des règles Effect que le preset `recommended` laissait de
  côté. Remise où le preset la mettait.
- `effecttsgo/unstable-api-usage` et `experimental-api-usage` — presque tout
  `effect/http-api`, `effect/eventlog` et `effect/sql` est marqué instable en
  v4 : ~70 signalements sur du code normal.
- `// oxfmt-ignore` sur les sept tables de tests — le formatteur éclate
  chaque `["ce que ça prouve", () => { … }]` sur cinq lignes. C'est l'ancien
  `// biome-ignore format` ; oxfmt ne comprend pas cette forme-là, et les
  renommer est ce qui a ramené le repaint de la bascule de ~1850 lignes à
  ~270.

Ce qu'oxfmt ne couvre pas, et que Biome couvrait : `apps/web/index.html` et
`apps/web/src/assets/css/main.css`. Ces deux fichiers ne sont plus formatés
par personne.

# Le LSP Effect, et les règles Effect via Oxlint

Deux outils, parce qu'ils ne tournent pas au même moment et qu'aucun ne
couvre ce que fait l'autre.

**Dans l'éditeur** : `@effect/language-service`, déclaré une seule fois dans
`tsconfig.lsp.json` à la racine, que les six `tsconfig.json` `extends`. Ce
fichier n'est pas une base commune — le front est en `bundler`/`noEmit` et le
reste en `NodeNext` avec émission, ils n'ont rien à partager — il ne porte
que le plugin, pour que la config LSP tienne à un endroit. Il apporte aussi
les refactors (async → `Effect.gen`, Layer Magic, pipe ↔ datafirst) que la
ligne de commande ne donne pas.

Le piège commun à tous les éditeurs : un tsserver qui n'est pas celui du
projet ne résout pas `@effect/language-service` et ignore le bloc `plugins`
**en silence** — pas de diagnostic, et rien qui dise que ça ne marche pas.
Il faut donc dans tous les cas le TypeScript du workspace.

- **Zed** : déjà fait, `.zed/settings.json` pose
  `vtsls.autoUseWorkspaceTsdk`. Rien à toucher.
- **JetBrains** : manuel, Settings → Languages & Frameworks → TypeScript,
  choisir la version du workspace. Non commitable, ça vit dans `.idea/` qui
  est gitignoré.
- **VS Code** : « TypeScript: Select TypeScript Version » → « Use workspace
  version ».

`tsc` non plus ne charge pas les plugins : aucun de ces diagnostics
n'apparaît dans `pnpm typecheck` ni en CI — c'est `pnpm lint` qui les porte
là-bas.

**En ligne de commande** : `pnpm lint`, qui est le même Oxlint que pour le
reste du lint — les règles Effect y sont un plugin parmi les autres. Jeu de
règles et configuration dans `.oxlintrc.json`.

Pourquoi un second package (`@effect/tsgo`) à côté du LSP : son jeu de règles
est nettement en avance. Les 16 règles de réécriture de novembre 2026
(`mapBoth`, `fromResult`, `catchNoSuchElement`, `failSync`, `isSuccess`…)
sont dans `@effect/tsgo` et absentes de `@effect/language-service@0.87.5`.
`@effect/tsgo` vise TypeScript 7, mais il embarque ses propres builds
patchés : rien n'oblige à migrer le repo, qui reste en TS 5.9.

Le repo est **à zéro signalement**, Effect compris. Les règles généralistes
(`correctness`, `perf`) sont en `error` et font échouer la CI ; les règles
Effect sont en `warning` et ne la font pas échouer. Maintenant que le compte
est à zéro, `--deny-warnings` rendrait les secondes bloquantes elles aussi —
le pas restant pour que la CI tienne le zéro plutôt que de le constater.

# Build avant typecheck — et avant le lint

Les packages exposent leurs types via leur `dist` (`exports` →
`./dist/index.d.ts`) et il n'y a aucun project reference. Sur un clone neuf,
un type-check lancé avant le build ne résout pas `@effect_lab/shared` et sort
une centaine de TS2339. C'est invisible en local, où `dist/` traîne — donc à
vérifier dans un clone vierge, pas dans le dossier de travail.

**Le lint tombe dans le même piège depuis le passage à Oxlint.** Il est
type-aware : il fait tourner le checker, donc un `dist/` absent lui fait
inventer des diagnostics qui n'existent pas — `missing-effect-context` sur
du code correct, et des `'X' is an 'error' type that acts as 'any'`. Du temps
de Biome le lint était purement syntaxique et pouvait passer en premier ;
ce n'est plus vrai, et la CI l'a appris à ses dépens. Pour reproduire :
`rm -rf packages/*/dist apps/*/dist` puis lancer le lint, qui doit sortir
neuf erreurs. Seul `pnpm format:check` peut rester avant le build.

Le front a sa propre version du même piège, d'où son `build` qui lance
`vite build` **avant** `vue-tsc` et non l'inverse : le plugin Vite de Nuxt UI
écrit `auto-imports.d.ts` et `components.d.ts` pendant le build, et sans eux les
composants `U*` des templates ne sont pas typés. Un `pnpm typecheck` seul sur un
clone vierge ne les type-checke donc pas — la CI lance `pnpm build` avant
`pnpm typecheck`, dans cet ordre, pour cette raison. Contrepartie assumée : une
erreur de types laisse désormais un `dist/` construit. Le script sort quand même
non-zéro, donc la CI échoue et l'image Docker ne se construit pas.

# Images Docker

Le contexte de build des deux Dockerfiles est la **racine du monorepo**, pas
le dossier de l'app : `docker build -f apps/api/Dockerfile .`. Ajouter un
package au workspace veut dire ajouter son `package.json` à l'étage
`manifests` des deux Dockerfiles, sans quoi pnpm ne résout plus le lockfile.
