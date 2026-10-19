<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Lint et format : Biome

Biome est la seule source de vérité pour le lint **et** le format. La config
tient dans `biome.jsonc` à la racine, et nulle part ailleurs — pas de config
par package, pas de tâche `lint` dans `turbo.json` (Biome parcourt le
workspace lui-même, et la tâche recréerait le no-op qui avait justifié son
retrait).

- `pnpm check` corrige lint + format sur place.
- `pnpm biome ci .` est exactement ce que lance la CI : format, lint **et**
  actions d'assist, sans écrire. `biome format` et `biome lint` pris
  séparément ne couvrent pas l'assist — une passe verte sur les deux peut
  donc encore échouer en CI.

Ne pas relever la version de Biome sans intention : elle est épinglée exacte
(pas de `^`) parce que la sortie du formatteur peut changer en minor, et un
bump silencieux repeindrait le repo au prochain `pnpm install`.

Trois désactivations sont délibérées, chacune commentée sur place. Ne pas les
retirer sans lire le commentaire :

- `useIterableCallbackReturn` (`biome.jsonc`) — `Optic.forEach` n'est pas
  `Array#forEach`.
- `organizeImports` (`biome.jsonc`) — l'ordre des imports est sémantique, et
  l'organiseur trie jusqu'aux `export *` du barrel de `packages/shared`.
- `// biome-ignore format` sur les sept tables de tests — le formatteur éclate
  chaque `["ce que ça prouve", () => { … }]` sur cinq lignes.

# Build avant typecheck

Les packages exposent leurs types via leur `dist` (`exports` →
`./dist/index.d.ts`) et il n'y a aucun project reference. Sur un clone neuf,
un type-check lancé avant le build ne résout pas `@effect_lab/shared` et sort
une centaine de TS2339. C'est invisible en local, où `dist/` traîne — donc à
vérifier dans un clone vierge, pas dans le dossier de travail.

# Images Docker

Le contexte de build des deux Dockerfiles est la **racine du monorepo**, pas
le dossier de l'app : `docker build -f apps/api/Dockerfile .`. Ajouter un
package au workspace veut dire ajouter son `package.json` à l'étage
`manifests` des deux Dockerfiles, sans quoi pnpm ne résout plus le lockfile.
