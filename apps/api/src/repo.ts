import { Context, Effect, Layer, Optic, Ref } from "effect"
import {
  _everyTags,
  _postById,
  applyPatch,
  NotFound,
  type Post,
  type PostPatch
} from "@effect_lab/shared"

const seed: ReadonlyArray<Post> = [
  {
    id: 1,
    title: "Effect, une intro",
    body: "Pourquoi Effect change la façon d'écrire du TypeScript.",
    author: { name: "Hugo", email: "hugo@example.com" },
    tags: ["effect", "typescript"],
    meta: { visibility: "public", publishedAt: "2026-09-30" }
  },
  {
    id: 2,
    title: "HttpApi de bout en bout",
    body: "Un seul contrat partagé entre le back et le front.",
    author: { name: "Hugo", email: "hugo@example.com" },
    tags: ["effect", "http"],
    meta: { visibility: "public", publishedAt: "2026-10-05" }
  },
  {
    id: 3,
    title: "Optics, brouillon",
    body: "Pas encore publié.",
    author: { name: "Hugo", email: "hugo@example.com" },
    tags: ["optics"],
    meta: { visibility: "draft" }
  }
]

/**
 * The store lives in a `Ref` inside a service rather than in a module-level
 * array. That is what makes a write actually persist: the handler hands the
 * new value back to the `Ref` instead of dropping it on the floor.
 */
export class PostsRepo extends Context.Service<PostsRepo, {
  readonly all: Effect.Effect<ReadonlyArray<Post>>
  readonly byId: (id: number) => Effect.Effect<Post, NotFound>
  readonly patch: (id: number, patch: PostPatch) => Effect.Effect<Post, NotFound>
  readonly retag: (from: string, to: string) => Effect.Effect<ReadonlyArray<Post>>
}>()("api/PostsRepo") {
  static readonly layer = Layer.effect(
    PostsRepo,
    Effect.gen(function*() {
      const ref = yield* Ref.make(seed)

      const byId = (id: number) =>
        Effect.flatMap(Ref.get(ref), (posts) => {
          // `_postById` focuses zero or one element, so reading it is also the
          // existence check — no `find` and no separate predicate.
          const found = Optic.getAll(_postById(id))(posts)
          return found.length === 0 ? Effect.fail(new NotFound()) : Effect.succeed(found[0]!)
        })

      const patch = (id: number, patch: PostPatch) =>
        Effect.flatMap(
          Ref.modify(ref, (posts) => {
            const next = _postById(id).modifyAll((post) => applyPatch(post, patch))(posts)
            return [Optic.getAll(_postById(id))(next), next] as const
          }),
          (found) => found.length === 0 ? Effect.fail(new NotFound()) : Effect.succeed(found[0]!)
        )

      // One traversal renames a tag across every post, at any list length.
      const retag = (from: string, to: string) =>
        Ref.modify(ref, (posts) => {
          const next = _everyTags.modifyAll(
            (tags) => tags.map((tag) => (tag === from ? to : tag))
          )(posts)
          return [next, next] as const
        })

      return PostsRepo.of({
        all: Ref.get(ref),
        byId,
        patch,
        retag
      })
    })
  )
}
