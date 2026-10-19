<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Lint et format : Vite+

Le lint et le format passent par [Vite+](https://viteplus.dev) (`vp`, en
devDependency — `pnpm exec vp`, ou via les scripts). Docs hors ligne dans
`node_modules/vite-plus/docs`, à la version installée.

- `vp check` enchaîne oxfmt, oxlint et le type-check des `.ts`.
- La config tient dans les blocs `fmt` / `lint` de `vite.config.ts` **à la
  racine**. Vite+ ignore les configs imbriquées : un bloc posé dans un
  package ne s'appliquerait pas. Utiliser `overrides` pour un cas par package.
- `apps/web/vite.config.ts` est le config du *build* front, pas celui du lint.

Cette section est écrite à la main : elle n'est **pas** dans les marqueurs
`<!--VITE PLUS START/END-->`, pour que `vp migrate --full`, qui réécrit cette
région, ne l'efface pas. Si un jour un bloc managé apparaît, le laisser à côté.

Trois pièges propres à ce repo :

- **`vp check` ne type-check pas les `.vue`** (tsgolint ne lit pas les SFC).
  `turbo typecheck` et son `vue-tsc` restent la référence sur `apps/web` — ne
  pas le retirer en croyant que `vp check` le couvre.

- **Les tables d'assertions portent un `// prettier-ignore`** sur leur
  déclaration, pour garder la forme compacte `["nom", () => {…}]`. Le
  marqueur doit rester *exactement* `// prettier-ignore` : y accoler du texte
  l'invalide silencieusement.

- **L'override `vite@*` de la doc Vite+ n'est volontairement pas posé.**
  `node_modules/vite-plus/docs/guide/local-cli.md` demande, en installation
  manuelle, d'aliaser `vite` vers `@voidzero-dev/vite-plus-core`. C'est
  nécessaire quand Vite+ pilote le bundler (`vp dev`, `vp build`, `vp test`),
  pour que les plugins partagent une seule instance de Vite. Ici Vite+ ne sert
  qu'à oxfmt / oxlint / tsgolint : `apps/web` est construit par turbo avec son
  propre `vite@7` et `@vitejs/plugin-vue`. Poser l'alias **remplacerait le
  bundler du front** par celui de Vite+ — un changement bien plus large que ce
  que couvre ce repo. Ne l'ajouter qu'en migrant aussi le build, et en
  revalidant `apps/web` à ce moment-là. Le pin `vitest` ne s'applique pas : il
  n'y a aucune dépendance à vitest.

## Lancer les vérifications

`vp check` ne couvre pas tout : la commande complète est

```sh
pnpm check && pnpm typecheck && pnpm build && pnpm test
```

C'est exactement la séquence de `.github/workflows/ci.yml`.
