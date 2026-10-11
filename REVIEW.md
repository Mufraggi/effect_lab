# Review — `effect_lab` + notes pour l'article sur les optics

> Contexte : repo à un seul commit (`83989a0`), lab support d'une série d'articles sur Effect v4.
> Pas de range de diff exploitable → review des fichiers tels quels.
> `pnpm typecheck` passe sur les 4 packages. **Aucun** finding de ce document n'est une erreur de type.
>
> Tout ce qui est affirmé ici sur l'API `Optic` a été vérifié contre `effect@4.0.2` installé
> (lecture des `.d.ts` + compilation et exécution des exemples), pas de mémoire.

---

# Partie 1 — L'article : l'exemple actuel est-il le bon ?

**Réponse courte : non, et le problème n'est pas l'exemple, c'est qu'il ne démontre pas ce que ton texte promet.**

## 1.1 Le texte promet une douleur que le code ne montre pas

Ton article fait trois affirmations :

| Affirmation du texte | Ce que l'exemple en montre |
| --- | --- |
| « the original is never mutated » | ✅ mais la version classe le fait **déjà** — ce n'est pas un différenciateur |
| « this pattern gets heavy as nesting grows » | ❌ l'exemple est à **profondeur 2**, là où ça n'est précisément *pas* lourd |
| « you describe the path once and **compose** it » | ❌ `_city` est décrit une fois puis utilisé **une** fois, et ne compose **rien** |

Les deux mots qui portent tout l'argument — *reuse* et *compose* — ne sont exercés par aucune ligne de l'exemple. Le lecteur arrive à la fin de la section avec une comparaison 14 lignes vs 16 lignes, dont une qui ajoute une dépendance. Sa conclusion honnête est l'inverse de la tienne.

## 1.2 L'adversaire choisi est un homme de paille

L'exemple « avant » écrit `withCity` / `withAddress` à la main. Personne n'écrit ça en TypeScript pour de la donnée plate — on écrit :

```ts
const moved = { ...user, address: { ...user.address, city: "Nice" } }
```

Une ligne, zéro dépendance, zéro concept à apprendre. **C'est ça, l'adversaire.** En le comparant aux méthodes `withX`, l'article bat une stratégie que son lecteur n'utilise pas, et ne répond jamais à celle qu'il utilise. Un lecteur qui spread se sent non adressé — et il a raison.

Note au passage : contre le spread, l'argument « ça devient lourd en profondeur » est beaucoup plus faible qu'il n'y paraît. Le spread imbriqué est mécanique et lisible jusqu'à 3 niveaux, et pour les cas pénibles la concurrence s'appelle Immer, pas `withCity`.

## 1.3 Ce qui différencie réellement un optic

Un spread est de la **syntaxe**. Un optic est une **valeur**. Tout le reste en découle, et c'est le seul angle où le spread ne peut pas suivre :

1. **Nommable, passable, stockable, retournable.** Tu peux mettre un optic dans un paramètre de fonction, dans un tableau, dans un `Record`, le retourner. Un spread, non — il n'existe qu'au point d'écriture.
2. **Une déclaration, deux directions.** `_title` te donne `get`, `replace`, `modify`, `getResult`. Un `withCity` n'écrit que. Un spread n'écrit que.
3. **N cibles en une expression** (`Traversal` + `modifyAll`).
4. **La partialité est typée** : `Optional`, `Prism`, `getResult` → `Result`, `.check(Schema…)` pour ne cibler *que* ce qui valide, `optionalKey` où écrire `undefined` **supprime** la clé.
5. **Le même optic feuille se recompose sous une autre racine.** C'est le gain monorepo, et il est strictement impossible avec un spread.

Les points 3 à 5 n'ont pas d'équivalent raisonnable écrit à la main. **C'est là qu'est ton article.**

## 1.4 Ce que je recommande

**Garde le lens `address.city` comme définition** — c'est de la bonne pédagogie, il faut la forme la plus simple possible pour introduire `Optic.id().key()`. Mais change trois choses :

**(a) Compare au spread, pas aux méthodes `withX`.** Montre le spread, admets qu'il gagne sur ce cas, et enchaîne : « voilà pourquoi ça ne reste pas vrai ».

**(b) Le pivot de l'article, c'est qu'un optic est une valeur.** Une seule ligne suffit à faire basculer le lecteur :

```ts
// You cannot pass a spread as an argument. You can pass an optic.
const increment = <S>(optic: Optic.Lens<S, number>) => optic.modify((n) => n + 1)
const addLike = increment(_likes)   // reusable, for any S
```

**(c) Fais porter la démonstration par une traversal.** C'est l'exemple qui n'a pas de contre-argument. Vérifié, compile et tourne :

```ts
import { Optic, Schema } from "effect"

type Author = { readonly name: string; readonly email: string }
type Post = { readonly title: string; readonly likes: number; readonly author: Author }
type Blog = { readonly posts: ReadonlyArray<Post> }

// A leaf optic, described once, on a single Post
const _authorName = Optic.id<Post>().key("author").key("name")

// The SAME optic, now applied across the whole list — nothing rewritten
const _everyAuthorName = Optic.id<Blog>().key("posts").forEach(() => _authorName)

const shout = _everyAuthorName.modifyAll((n) => n.toUpperCase())
```

À comparer honnêtement avec son équivalent à la main :

```ts
const shout = (blog: Blog): Blog => ({
  ...blog,
  posts: blog.posts.map((p) => ({
    ...p,
    author: { ...p.author, name: p.author.name.toUpperCase() }
  }))
})
```

Et le coup de grâce — le **filtre fait partie du chemin**, ce qu'aucun spread ne sait faire :

```ts
// Focus the likes of popular posts only; everything else is left alone
const _popularLikes = Optic.id<Blog>()
  .key("posts")
  .forEach((p) => p.key("likes").check(Schema.isGreaterThan(10)))

const boost = _popularLikes.modifyAll((n) => n * 2)
const allPopular = Optic.getAll(_popularLikes)(blog)   // read, same declaration
```

## 1.5 Un encadré « gotcha » que je te conseille vivement d'ajouter

Ton article dit : *« Optics work on plain immutable data, so we use object types instead of classes »*. C'est vrai, mais la raison donnée est vague — et la réalité est plus intéressante, parce qu'**elle est piégeuse**.

Vérifié en exécutant le code :

```ts
class Address { constructor(readonly city: string, readonly zip: string) {} }
class User { constructor(readonly name: string, readonly address: Address) {} }

const _city = Optic.id<User>().key("address").key("city")

_city.get(user)              // ✅ "Paris" — la lecture marche
_city.replace("Nice", user)  // 💥 jette à l'exécution
// Error: Cannot clone object with non-Object constructor or null prototype
```

Les trois faits qui en font un bon encadré :

1. **`tsc` accepte** (`tsc --noEmit` sort en 0). Le type system ne te protège pas.
2. **La lecture marche, seule la reconstruction est refusée.** Un optic dérivé reconstruit chaque conteneur par spread superficiel, et Effect **jette** plutôt que de te rendre silencieusement un objet plat sans prototype — c'est un bon choix de design, échouer fort.
3. **L'échappatoire existe** : `makeLens`, où tu contrôles la reconstruction. Vérifié, prototypes et méthodes préservés :

```ts
const _city = Optic.makeLens(
  (u: User) => u.address.city,
  (city: string, u: User) => new User(u.name, new Address(city, u.address.zip))
)
const moved = _city.replace("Nice", user)
moved instanceof User          // true
moved.address.shout()          // "NICE" — les méthodes survivent
user.address.city              // "Paris" — l'original intact
```

C'est exactement le genre de détail vérifié qui fait la différence entre un article qui paraphrase la doc et un article qu'on bookmarke.

## 1.6 Pour tes 3 exemples annoncés (front / back / data)

Ton plan « front-end, backend, data » tombe bien : chacun peut porter **un** des arguments de §1.3, au lieu que les trois répètent le même.

| Exemple | Argument porté | Forme |
| --- | --- | --- |
| **Backend** — PATCH partiel | « un optic est une valeur **stockable** » | table `[optic, lecteur]`, cf. §2.3 |
| **Front** — binding de formulaire | « un optic est une valeur **passable** » | `bindField(state, optic)` |
| **Data** — nettoyage de collection | traversal + `check` | `forEach` + `modifyAll` |

Le backend est le meilleur des trois, et tu l'as déjà écrit sous sa forme « avant » (3 `if` successifs dans `applyPatch`). Le « après » est ci-dessous en §2.3 — vérifié, compile et tourne.

Pour le front, la forme qui porte l'argument (vérifiée) :

```ts
const bindField = <S>(state: S, optic: Optic.Lens<S, string>) => ({
  value: optic.get(state),
  update: (next: string) => optic.replace(next, state)
})

const _formTitle = Optic.id<FormState>().key("post").key("title")
const field = bindField(state, _formTitle)   // one helper, any field, any depth
```

## 1.7 Dis aussi quand **ne pas** en mettre

Une section « when a spread is the right answer » (profondeur ≤ 2, un seul site d'usage, pas de réutilisation) te coûte cinq lignes et t'achète la confiance du lecteur. Un article d'optics qui n'admet jamais que le spread gagne parfois se lit comme de la promo.

---

# Partie 2 — Review du code du lab

Axe **Spec : non évalué** — aucune spec, aucune issue référencée, `docs/agents/issue-tracker.md` absent (`/setup-matt-pocock-skills` pour l'activer). Standards documentés du repo : aucun (`AGENTS.md` ne contient que le bloc managé Turborepo). La review s'appuie donc sur la baseline de smells + la correction Effect.

## 2.1 Exemples optics (`packages/exemple/src/optic/`)

- **[majeur] La comparaison ne démontre pas son propos** — voir toute la Partie 1. C'est le finding dont tout le reste découle.
- **[moyen] Rien ne vérifie le claim central.** `console.log(user.address.city) // "Paris" (the original is intact)` : l'immutabilité, qui est *l'argument*, n'est assertée par rien. Un `assert.equal` rend l'exemple auto-vérifiant — et comme c'est du code d'article, une régression silencieuse est un article faux.
- **[mineur] Code mort, mais assumé.** Les deux fichiers ne sont ni exportés depuis `src/index.ts` ni importés nulle part ; ils reposent sur des `console.log` top-level que rien ne déclenche. Pour des snippets d'article c'est défendable — mais rends-les lançables (`tsx src/optic/opticImplem.ts`), sinon ils pourriront sans que personne ne le voie.
- **[mineur] `src/index.ts` n'a aucun rapport avec les optics** *(Divergent Change)* — il expose `decodePost` / `ValidationError`. Un package, deux sujets sans lien.
- **[nit] `classImplem` / `opticImplem`** *(Mysterious Name)* — « Implem » est une abréviation et ne dit pas *quoi*. `nestedUpdate.classes.ts` / `nestedUpdate.optics.ts` nomme le sujet **et** la variante.
- **[nit]** Espace parasite : `console.log(user.address.city )`.

**Correct, ne pas toucher** : `Optic.id<User>().key("address").key("city")` et l'ordre `replace(valeur, sujet)` — vérifié (`readonly replace: (a: A, s: S) => S`). Et ton affirmation « `_city` is a `Lens` » est exacte : `Optic.id<S>()` rend un `Iso<S,S>`, `Iso extends Lens`, et `.key()` sur un `Lens` rend un `Lens`.

## 2.2 Front — atom + optics (`apps/web/src/App.vue`)

**[BUG] Le miroir d'état local est écrasé par son propre refetch.**
`postsQuery` détient déjà l'état serveur ; `stateAtom` en est une copie synchronisée par `watchEffect`. Or `runUpdate(…, reactivityKeys: ["posts"])` invalide `posts` → refetch → le `watchEffect` repasse → `setState({ posts: <données serveur> })` **écrase l'édition optimiste**. Combiné au bug §2.3, l'input revient visuellement à l'ancienne valeur. Même avec un backend correct, ça reste une course entre le refetch et la frappe suivante.
→ Choisis : lire `postsQuery` directement et laisser l'invalidation faire foi (plus d'atom local, plus d'optics côté front), **ou** assumer l'optimistic update et ne pas invalider sur succès. C'est le mélange des deux qui casse.

**[BUG] Les erreurs de mutation sont avalées.** `useAtomSet` en mode par défaut rend `(value) => void` (vérifié). Si le PATCH échoue (404, réseau), rien ne remonte et l'édition reste affichée comme un succès. Le `error` computed ne couvre que `postsQuery`.
→ `{ mode: "promiseExit" }` et traiter l'`Exit`.

**[moyen] `loading` ne couvre que le premier chargement.** `AsyncResult.isInitial` est `false` pendant un refetch. `AsyncResult.isWaiting` existe (vérifié) — c'est lui qu'il faut combiner.

**[moyen] `reactivityKeys: ["posts"]` en dur à 3 endroits.** Si l'une des trois divergeait, l'invalidation s'arrêterait **sans erreur**. Une const partagée.

**[moyen] `editTitle` / `editAuthor` : le même code deux fois** *(Duplicated Code)* — seuls l'optic et la forme du payload changent.

**[mineur] Les optics sont reconstruits à chaque frappe.** `_title = (i) => _posts.at(i).key("title")`, alors que le backend affiche `// Optics — described once, reused everywhere`. En plus `_title` et `_authorName` re-dérivent tous les deux `_posts.at(index)`. Ironiquement, c'est l'endroit du repo où une `Traversal` (§1.4) remplacerait les deux.

**[nits]** `String(postsResult.value.cause)` perd la structure du `Cause` (`Cause.pretty`) ; `($event.target as HTMLInputElement).value` dupliqué dans le template.

**Pas un finding** : `.modify(() => title)` est **correct et bien choisi** — `modify` rend `(s) => S`, qui s'enfile exactement dans le setter d'`useAtom` (`(value: W | ((value: R) => W)) => void`, vérifié). `replace` t'obligerait à passer `state.value` à la main. Seule reste l'asymétrie cosmétique avec le backend.

## 2.3 Backend (`apps/api/`, `packages/shared/`)

**[BUG BLOQUANT] `updatePost` ne persiste rien.**

```ts
updatePost: ({ params, payload }) => {
  const found = posts.find((p) => p.id === params.id)
  return found ? Effect.succeed(applyPatch(found, payload)) : Effect.fail(new NotFound())
}
```

`applyPatch` rend un **nouveau** `Post` — c'est tout le point des optics — mais le tableau `posts` n'est jamais réassigné. Le PATCH répond 200 avec le post patché, le store reste intact, le `GET /posts` suivant rend les données d'origine. **L'endpoint ment à son client**, et c'est ce qui rend le bug front visible. Finding le plus grave du repo.

**[majeur] État mutable au niveau module au lieu d'un service.** `const posts: Array<Post>` partagé entre handlers. Pour un repo qui *enseigne* Effect, c'est exactement ce qu'un `Ref` dans un `Context.Service` résout — la doc embarquée d'Effect 4 est explicite : « Prefer using services to encapsulate behaviour ». Ça rendrait aussi `applyPatch` testable hors du module.

**[majeur — et c'est ton meilleur exemple d'article] `applyPatch` : trois `if` de forme identique.** Le `let updated` + réassignations est impératif alors que le sujet est la composition d'optics : l'implémentation ne montre pas ce qu'elle vend. Le « après », vérifié (compile et tourne) :

```ts
// A patch field is a pair: where to write it, and how to read it off the patch.
// This is only expressible because an optic is a *value*.
const patchFields = [
  { optic: _title,      read: (p: PostPatch) => p.title },
  { optic: _body,       read: (p: PostPatch) => p.body },
  { optic: _authorName, read: (p: PostPatch) => p.author?.name }
] as const

const applyPatch = (post: Post, patch: PostPatch): Post =>
  patchFields.reduce((acc, { optic, read }) => {
    const value = read(patch)
    return value === undefined ? acc : optic.replace(value, acc)
  }, post)
```

Ajouter un champ patchable = **une ligne dans la table**, au lieu d'un `if` de plus. C'est l'argument « un optic est une valeur stockable » rendu concret.

**[moyen] `apps/api/src/api.ts` est un Middle Man.** Le fichier entier est `export { Api, NotFound, PostsApi } from "@effect_lab/shared"`. Et `server.ts` importe `Api, NotFound` via `./api.js` mais `Post, PostPatch` via `@effect_lab/shared` — deux chemins vers la même origine dans le même fichier. Supprime `api.ts`.

**[moyen] Les optics du backend dupliquent ceux du front** *(Shotgun Surgery)*. `_title` / `_authorName` existent des deux côtés sur des racines différentes. Tu as déjà `@effect_lab/shared` pour le contrat : les optics sur `Post` y appartiennent. Aujourd'hui, ajouter un champ éditable = toucher `schemas.ts` + `server.ts` + `App.vue`.
**Corriger ce smell *est* l'argument n°5 de §1.3** — l'optic feuille défini dans `shared`, recomposé sous `Blog` côté back et sous `State` côté front. Le lab démontrerait enfin ce que l'article affirme.

**[mineur]** Le `Schema.Struct({ name: … })` inline dans `PostPatch` redéclare un morceau d'`Author` sans lien avec lui. **[nit]** `HttpApiSchema.status(404)` répété sur chaque endpoint — la classe `NotFound` peut porter son statut.

**[majeur] Aucun test dans le repo.** Effect 4 fournit `HttpApiTest` (client typé en mémoire, sans démarrer de serveur). Le bug bloquant ci-dessus serait tombé au premier test de `updatePost`.

**Correct, ne pas toucher** : `params: { id: Schema.Number }` — j'allais le flaguer, mais la doc embarquée confirme que les path params sont coercés automatiquement depuis leur forme string via `Schema.toCodecStringTree` en Effect 4 ; pas besoin de `NumberFromString`. `HttpRouter.serve` + `Layer.launch` + `NodeRuntime.runMain` : API 4 valide. Le proxy Vite (`/api` → strip → `:3001`) s'aligne correctement avec `baseUrl: "/api"` et `.prefix("/posts")`.

## 2.4 Transverse

**[moyen] `pnpm lint` est un no-op silencieux.** `turbo.json` déclare la tâche `lint`, la racine expose `"lint": "turbo lint"`, mais **aucun** package n'a de script `lint` et aucun linter/formatter n'est installé. La commande sort en succès sans rien vérifier — c'est ce qui laisse passer les nits de formatage.

**[moyen] Le README contredit le code.** Il affirme : « le repo est donc sur le set stable `effect@3.22` / `@effect/platform@0.97` ». En réalité tout est sur `effect@4.0.2`, sans `@effect/platform` — les modules HTTP sont dans le core (`effect/http`, `effect/http-api`, `effect/reactivity`). Note obsolète, et trompeuse sur un repo qui sert de référence à des articles.

---

# Bilan

**Article** — l'exemple actuel est correct mais ne démontre ni *reuse* ni *compose*, et affronte un homme de paille (`withX`) au lieu du spread. Le levier : un optic est une **valeur**, pas de la syntaxe. Garde le lens comme définition, fais porter la preuve par une traversal + `check`, et ajoute l'encadré classes (§1.5) — vérifié, piégeur, et absent de la doc.

**Code** — 20 findings, dont 3 bugs :

- **Pire backend** : `updatePost` ne persiste pas le patch — 200 sur une écriture qui n'a pas eu lieu.
- **Pire front** : `stateAtom` et l'invalidation `reactivityKeys` se battent ; le refetch écrase l'édition optimiste, et les échecs de mutation sont silencieux.
- **Pire exemples** : la comparaison est à une profondeur où les optics ne gagnent pas.

Les deux bugs front/back forment **une seule boucle** : corrige la persistance serveur **et** choisis entre optimistic update et invalidation. Corriger un seul des deux déplace le symptôme sans le supprimer.

Et la convergence qui vaut d'être notée : les deux smells de duplication du lab (optics dupliqués front/back, `applyPatch` à trois `if`) sont *précisément* les deux meilleurs arguments de ton article. Les corriger, c'est écrire la démonstration.
