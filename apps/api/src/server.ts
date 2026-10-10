import { HttpApiBuilder } from "effect/http-api"
import { HttpRouter } from "effect/http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Optic } from "effect"
import { createServer } from "node:http"
import { Api, NotFound } from "./api.js"
import { Post, PostPatch } from "@effect_lab/shared"

const posts: Array<Post> = [
  {
    id: 1,
    title: "Effect, une intro",
    body: "Pourquoi Effect change la façon d'écrire du TypeScript.",
    author: { name: "Hugo", email: "hugo@example.com" }
  },
  {
    id: 2,
    title: "HttpApi de bout en bout",
    body: "Un seul contrat partagé entre le back et le front.",
    author: { name: "Hugo", email: "hugo@example.com" }
  }
]

// Optics — described once, reused everywhere
const _title = Optic.id<Post>().key("title")
const _body = Optic.id<Post>().key("body")
const _authorName = Optic.id<Post>().key("author").key("name")

const applyPatch = (post: Post, patch: PostPatch): Post => {
  let updated = post
  if (patch.title !== undefined) updated = _title.replace(patch.title, updated)
  if (patch.body !== undefined) updated = _body.replace(patch.body, updated)
  if (patch.author?.name !== undefined) updated = _authorName.replace(patch.author.name, updated)
  return updated
}

const PostsLive = HttpApiBuilder.group(Api, "posts", (handlers) =>
  handlers.handleAll({
    posts: () => Effect.succeed(posts),
    post: ({ params }) => {
      const found = posts.find((p) => p.id === params.id)
      return found ? Effect.succeed(found) : Effect.fail(new NotFound())
    },
    updatePost: ({ params, payload }) => {
      const found = posts.find((p) => p.id === params.id)
      return found ? Effect.succeed(applyPatch(found, payload)) : Effect.fail(new NotFound())
    }
  })
)

const ApiRoutes = HttpApiBuilder.layer(Api).pipe(Layer.provide(PostsLive))

HttpRouter.serve(ApiRoutes).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  Layer.launch,
  NodeRuntime.runMain
)
