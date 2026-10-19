import { defineConfig } from "vite-plus"

/**
 * Racine Vite+ : `fmt`, `lint` et `check` pour tout le workspace.
 *
 * Les blocs vivent ici et nulle part ailleurs — Vite+ désactive les configs
 * imbriquées, donc un bloc `fmt` dans un package serait silencieusement ignoré
 * par `vp check`. Pour un réglage par package, utiliser `overrides`.
 *
 * `apps/web/vite.config.ts` reste le config du *build* front : il ne porte
 * aucun de ces blocs.
 */
export default defineConfig({
  fmt: {
    // oxfmt sort compatible Prettier : `semi`, `trailingComma: "all"` et
    // `printWidth: 100` par défaut. Le repo suit le style Effect, donc on
    // recale les trois — sans quoi le formatage réécrivait tout.
    //
    // L'alignement n'est pas total pour autant : Prettier écrit
    // `function* ()` là où Effect (qui utilise dprint) écrit `function*()`,
    // et aucune option ne le règle. L'adoption du formatteur a donc déplacé
    // ces 33 occurrences, une fois pour toutes.
    semi: false,
    trailingComma: "none",
    printWidth: 120,
    // Les manifestes gardent l'ordre de clés choisi par leur auteur.
    sortPackageJson: false,
    ignorePatterns: [
      "**/dist/**",
      "**/.turbo/**",
      "pnpm-lock.yaml",
      // De la prose, pas du code. Et sur les tableaux de `docs/research/`,
      // l'alignement des cellules par padding produit des lignes de 400
      // colonnes, illisibles à l'édition.
      "**/*.md"
    ]
  },
  lint: {
    options: {
      // Le chemin type-aware complet : oxlint seul ne voit pas les types, et
      // `typeCheck` fait porter le type-check des `.ts` par `vp check`.
      typeAware: true,
      typeCheck: true
    },
    ignorePatterns: ["**/dist/**", "**/.turbo/**"]
  }
})
